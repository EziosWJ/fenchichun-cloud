package weighbridge

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"mime"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// RegisterDistillerGrainsRoutes exposes the dedicated distiller grains report
// used by the standalone 酒糟统计 menu.
func RegisterDistillerGrainsRoutes(authenticated gin.IRouter, handler *Handler) {
	authenticated.GET("/distiller-grains/stats", handler.distillerGrainsStats)
	authenticated.GET("/distiller-grains/export", handler.distillerGrainsExport)
}

func distillerGrainsQuery(c *gin.Context) (DistillerGrainsQuery, error) {
	query := DistillerGrainsQuery{CustomerCode: strings.TrimSpace(c.Query("customerCode"))}
	period := strings.TrimSpace(c.Query("period"))
	if period == "range" {
		fromText := strings.TrimSpace(c.Query("from"))
		toText := strings.TrimSpace(c.Query("to"))
		if fromText == "" || toText == "" {
			return query, ErrInvalid
		}
		from, err := time.ParseInLocation("2006-01-02", fromText, statementZone)
		if err != nil {
			return query, ErrInvalid
		}
		to, err := time.ParseInLocation("2006-01-02", toText, statementZone)
		if err != nil || to.Before(from) {
			return query, ErrInvalid
		}
		if to.Sub(from) > distillerGrainsMaxRangeDays*24*time.Hour {
			return query, ErrInvalid
		}
		query.From, query.To, query.IncludeRecords = from, to, true
		return query, nil
	}
	from, to, ok := DistillerGrainsRange(time.Now(), period)
	if !ok {
		return query, ErrInvalid
	}
	query.From, query.To = from, to
	query.IncludeRecords = period == "today" || period == "yesterday"
	return query, nil
}

// distillerGrainsStats godoc
// @Summary 酒糟出库统计
// @Description 按客户筛选酒糟出厂净重，支持本日、本周、本月与任意时间段。
// @Tags 酒糟统计
// @Security BearerAuth
// @Param period query string true "today/yesterday/week/last-week/month/last-month/range"
// @Param from query string false "开始日期，period=range 时必填"
// @Param to query string false "结束日期，period=range 时必填"
// @Param customerCode query string false "客户编码"
// @Success 200 {object} ApiEnvelope
// @Router /api/v1/distiller-grains/stats [get]
func (h *Handler) distillerGrainsStats(c *gin.Context) {
	query, err := distillerGrainsQuery(c)
	if err != nil {
		managementResult(c, nil, ErrInvalid)
		return
	}
	value, err := h.service.DistillerGrainsStats(c.Request.Context(), query)
	managementResult(c, value, err)
}

func formatDistillerTonnes(value int64) string {
	rounded := (value + 5) / 10
	return fmt.Sprintf("%d.%02d", rounded/100, rounded%100)
}

// distillerGrainsExport godoc
// @Summary 导出酒糟出库明细（CSV，Excel 可直接打开）
// @Tags 酒糟统计
// @Security BearerAuth
// @Produce text/csv
// @Router /api/v1/distiller-grains/export [get]
func (h *Handler) distillerGrainsExport(c *gin.Context) {
	query, err := distillerGrainsQuery(c)
	if err != nil {
		managementResult(c, nil, ErrInvalid)
		return
	}
	query.IncludeRecords = true
	value, err := h.service.DistillerGrainsStats(c.Request.Context(), query)
	if err != nil {
		managementResult(c, nil, err)
		return
	}
	rows := [][]string{{"日期", "时间", "车牌", "客户", "净重(吨)"}}
	for _, record := range value.Records {
		issuedAt := record.IssuedAt.In(statementZone)
		rows = append(rows, []string{
			issuedAt.Format("2006-01-02"),
			issuedAt.Format("15:04"),
			record.Plate,
			record.PartyName,
			formatDistillerTonnes(record.NetMilliTonne),
		})
	}
	rows = append(rows, []string{"合计", strconv.FormatInt(value.TicketCount, 10) + " 车", "", "", formatDistillerTonnes(value.TotalNetMilliTonne)})
	customer := ""
	if query.CustomerCode != "" {
		for _, item := range value.Customers {
			if item.Code == query.CustomerCode {
				customer = item.Name
				break
			}
		}
	}
	name := "酒糟统计"
	if customer != "" {
		name += "-" + customer
	}
	filename := fmt.Sprintf("%s-%s至%s.csv", name, value.From, value.To)
	var buffer bytes.Buffer
	buffer.Write([]byte{0xef, 0xbb, 0xbf})
	writer := csv.NewWriter(&buffer)
	if err := writer.WriteAll(rows); err != nil {
		managementResult(c, nil, err)
		return
	}
	c.Header("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": filename}))
	c.Data(http.StatusOK, "text/csv; charset=utf-8", buffer.Bytes())
}
