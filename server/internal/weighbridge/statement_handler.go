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

func statementQuery(c *gin.Context, detail bool) (StatementQuery, error) {
	q := StatementQuery{
		Page: 1, PageSize: 20,
		SiteCode: strings.TrimSpace(c.Query("siteCode")), Direction: strings.TrimSpace(c.Query("direction")),
		PartyCode: strings.TrimSpace(c.Query("partyCode")), PartyKeyword: strings.TrimSpace(c.Query("keyword")),
		MaterialCode: strings.TrimSpace(c.Query("materialCode")),
	}
	if value := c.Query("page"); value != "" {
		n, err := strconv.Atoi(value)
		if err != nil {
			return q, ErrInvalid
		}
		q.Page = n
	}
	if value := c.Query("pageSize"); value != "" {
		n, err := strconv.Atoi(value)
		if err != nil {
			return q, ErrInvalid
		}
		q.PageSize = n
	}
	zone := time.FixedZone("Asia/Shanghai", 8*60*60)
	if value := c.Query("from"); value != "" {
		t, err := time.ParseInLocation("2006-01-02", value, zone)
		if err != nil {
			return q, ErrInvalid
		}
		q.From = &t
	}
	if value := c.Query("to"); value != "" {
		t, err := time.ParseInLocation("2006-01-02", value, zone)
		if err != nil {
			return q, ErrInvalid
		}
		t = t.AddDate(0, 0, 1)
		q.Until = &t
	}
	if q.Page < 1 || q.PageSize < 1 || q.PageSize > 100 || (q.From != nil && q.Until != nil && !q.From.Before(*q.Until)) {
		return q, ErrInvalid
	}
	if q.Direction != "inbound" && q.Direction != "outbound" {
		return q, ErrInvalid
	}
	if detail && (strings.TrimSpace(q.SiteCode) == "" || strings.TrimSpace(q.PartyCode) == "") {
		return q, ErrInvalid
	}
	return q, nil
}

// statementParties godoc
// @Summary 客户对账往来方汇总
// @Tags 统计与分析
// @Security BearerAuth
// @Param direction query string true "inbound/outbound"
// @Param siteCode query string false "厂区编码"
// @Param keyword query string false "往来方名称或编码"
// @Param materialCode query string false "物料编码"
// @Param from query string false "开始日期 YYYY-MM-DD（北京时间）"
// @Param to query string false "结束日期 YYYY-MM-DD（北京时间，包含当天）"
// @Param page query int false "页码"
// @Param pageSize query int false "每页条数，1-100"
// @Success 200 {object} ApiEnvelope
// @Router /api/v1/weighbridge/statements/parties [get]
func (h *Handler) statementParties(c *gin.Context) {
	q, err := statementQuery(c, false)
	if err != nil {
		managementResult(c, nil, err)
		return
	}
	value, err := h.service.StatementParties(c.Request.Context(), q)
	managementResult(c, value, err)
}

// statementDetail godoc
// @Summary 单个厂区与往来方的对账单汇总
// @Tags 统计与分析
// @Security BearerAuth
// @Param direction query string true "inbound/outbound"
// @Param siteCode query string true "厂区编码"
// @Param partyCode query string true "往来方编码"
// @Param materialCode query string false "物料编码"
// @Param from query string false "开始日期 YYYY-MM-DD（北京时间）"
// @Param to query string false "结束日期 YYYY-MM-DD（北京时间，包含当天）"
// @Success 200 {object} ApiEnvelope
// @Router /api/v1/weighbridge/statements/parties/detail [get]
func (h *Handler) statementDetail(c *gin.Context) {
	q, err := statementQuery(c, true)
	if err != nil {
		managementResult(c, nil, err)
		return
	}
	value, err := h.service.StatementDetail(c.Request.Context(), q)
	managementResult(c, value, err)
}

// statementPartiesExport godoc
// @Summary 导出客户对账往来方汇总 CSV
// @Tags 统计与分析
// @Security BearerAuth
// @Produce text/csv
// @Success 200 {file} file
// @Router /api/v1/weighbridge/statements/parties/export [get]
func (h *Handler) statementPartiesExport(c *gin.Context) {
	q, err := statementQuery(c, false)
	if err != nil {
		managementResult(c, nil, err)
		return
	}
	parties, summary, err := h.service.StatementPartiesAll(c.Request.Context(), q)
	if err != nil {
		managementResult(c, nil, err)
		return
	}
	data, err := statementSummaryCSV(parties, summary, q.Direction)
	if err != nil {
		managementResult(c, nil, err)
		return
	}
	filename := fmt.Sprintf("客户对账-%s-%s.csv", statementDirectionLabel(q.Direction), statementPeriodLabel(q))
	c.Header("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": filename}))
	c.Data(http.StatusOK, "text/csv; charset=utf-8", data)
}

// statementDetailExport godoc
// @Summary 导出单个往来方对账单明细 CSV
// @Tags 统计与分析
// @Security BearerAuth
// @Produce text/csv
// @Success 200 {file} file
// @Router /api/v1/weighbridge/statements/parties/detail/export [get]
func (h *Handler) statementDetailExport(c *gin.Context) {
	q, err := statementQuery(c, true)
	if err != nil {
		managementResult(c, nil, err)
		return
	}
	detail, err := h.service.StatementDetail(c.Request.Context(), q)
	if err != nil {
		managementResult(c, nil, err)
		return
	}
	tickets, err := h.service.StatementTickets(c.Request.Context(), q)
	if err != nil {
		managementResult(c, nil, err)
		return
	}
	data, err := statementDetailCSV(detail, tickets)
	if err != nil {
		managementResult(c, nil, err)
		return
	}
	filename := fmt.Sprintf("对账单-%s-%s-%s.csv", q.SiteCode, q.PartyCode, statementPeriodLabel(q))
	c.Header("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": filename}))
	c.Data(http.StatusOK, "text/csv; charset=utf-8", data)
}

func statementSummaryCSV(parties []StatementParty, summary StatementPageSummary, direction string) ([]byte, error) {
	rows := [][]string{{
		"厂区编码", "厂区名称", "往来方编码", "往来方名称", "方向", "有效车次",
		"毛重(吨)", "皮重(吨)", "净重调整(吨)", "最终净重(吨)", "首次出单时间", "最后出单时间",
	}}
	for _, party := range parties {
		rows = append(rows, []string{
			statementCSVText(party.SiteCode), statementCSVText(party.SiteName),
			statementCSVText(party.PartyCode), statementCSVText(party.PartyName),
			statementDirectionLabel(direction), strconv.FormatInt(party.TicketCount, 10),
			FormatMilliTonne(party.GrossMilliTonne), FormatMilliTonne(party.TareMilliTonne),
			FormatMilliTonne(party.NetAdjustmentMilliTonne), FormatMilliTonne(party.NetMilliTonne),
			statementDate(party.FirstIssuedAt), statementDate(party.LastIssuedAt),
		})
	}
	rows = append(rows, []string{
		"合计", "", "", "", statementDirectionLabel(direction), strconv.FormatInt(summary.TicketCount, 10),
		FormatMilliTonne(summary.GrossMilliTonne), FormatMilliTonne(summary.TareMilliTonne),
		FormatMilliTonne(summary.NetAdjustmentMilliTonne), FormatMilliTonne(summary.NetMilliTonne), "", "",
	})
	return encodeStatementCSV(rows)
}

func statementDetailCSV(detail StatementDetail, tickets []StatementTicket) ([]byte, error) {
	rows := [][]string{{
		"厂区编码", "厂区名称", "往来方编码", "往来方名称", "方向", "出单时间", "单号", "车牌",
		"物料编码", "物料名称", "规格", "毛重(吨)", "皮重(吨)", "净重调整(吨)", "最终净重(吨)", "状态",
	}}
	for _, ticket := range tickets {
		rows = append(rows, []string{
			statementCSVText(ticket.SiteCode), statementCSVText(ticket.SiteName),
			statementCSVText(ticket.PartyCode), statementCSVText(ticket.PartyName),
			statementDirectionLabel(ticket.Direction), statementDate(ticket.IssuedAt),
			statementCSVText(ticket.TicketNo), statementCSVText(ticket.Plate),
			statementCSVText(ticket.MaterialCode), statementCSVText(ticket.MaterialName), statementCSVText(ticket.MaterialSpec),
			FormatMilliTonne(ticket.GrossMilliTonne), FormatMilliTonne(ticket.TareMilliTonne),
			FormatMilliTonne(ticket.NetAdjustmentMilliTonne), FormatMilliTonne(ticket.NetMilliTonne), ticket.Status,
		})
	}
	rows = append(rows, []string{
		"合计", statementCSVText(detail.SiteName), statementCSVText(detail.PartyCode), statementCSVText(detail.PartyName),
		statementDirectionLabel(detail.Direction), "", "", "", "", "", "",
		FormatMilliTonne(detail.GrossMilliTonne), FormatMilliTonne(detail.TareMilliTonne),
		FormatMilliTonne(detail.NetAdjustmentMilliTonne), FormatMilliTonne(detail.NetMilliTonne), "",
	})
	return encodeStatementCSV(rows)
}

func encodeStatementCSV(rows [][]string) ([]byte, error) {
	var buffer bytes.Buffer
	buffer.Write([]byte{0xef, 0xbb, 0xbf})
	writer := csv.NewWriter(&buffer)
	if err := writer.WriteAll(rows); err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

func statementDirectionLabel(direction string) string {
	if direction == "inbound" {
		return "采购供应商（入厂卸货）"
	}
	return "销售客户（出厂装货）"
}

func statementPeriodLabel(q StatementQuery) string {
	from, to := "全部", "全部"
	if q.From != nil {
		from = q.From.In(statementZone).Format("2006-01-02")
	}
	if q.Until != nil {
		to = q.Until.AddDate(0, 0, -1).In(statementZone).Format("2006-01-02")
	}
	return from + "至" + to
}
