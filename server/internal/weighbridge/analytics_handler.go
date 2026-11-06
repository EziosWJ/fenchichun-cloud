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

func RegisterAnalyticsRoutes(authenticated gin.IRouter, handler *Handler) {
	authenticated.GET("/weighbridge/analytics/overview", handler.analyticsOverview)
	authenticated.GET("/weighbridge/analytics/flow", handler.analyticsFlow)
	authenticated.GET("/weighbridge/analytics/materials", handler.analyticsMaterials)
	authenticated.GET("/weighbridge/analytics/materials/supplier-quality", handler.analyticsSupplierQuality)
	authenticated.GET("/weighbridge/analytics/materials/byproduct-flow", handler.analyticsByproductFlow)
	authenticated.GET("/weighbridge/analytics/parties", handler.analyticsParties)
	authenticated.GET("/weighbridge/analytics/parties/detail", handler.analyticsPartyDetail)
	authenticated.GET("/weighbridge/analytics/quality", handler.analyticsQuality)
	authenticated.GET("/weighbridge/analytics/flow/export", handler.analyticsFlowExport)
	authenticated.GET("/weighbridge/analytics/materials/export", handler.analyticsMaterialsExport)
	authenticated.GET("/weighbridge/analytics/parties/export", handler.analyticsPartiesExport)
	authenticated.GET("/weighbridge/analytics/quality/export", handler.analyticsQualityExport)
}

func analyticsQuery(c *gin.Context) (AnalyticsQuery, error) {
	now := time.Now().In(statementZone)
	from := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, statementZone)
	until := from.AddDate(0, 1, 0)
	if value := strings.TrimSpace(c.Query("from")); value != "" {
		parsed, err := time.ParseInLocation("2006-01-02", value, statementZone)
		if err != nil {
			return AnalyticsQuery{}, ErrInvalid
		}
		from = parsed
	}
	if value := strings.TrimSpace(c.Query("to")); value != "" {
		parsed, err := time.ParseInLocation("2006-01-02", value, statementZone)
		if err != nil {
			return AnalyticsQuery{}, ErrInvalid
		}
		until = parsed.AddDate(0, 0, 1)
	}
	if !from.Before(until) || from.AddDate(5, 0, 0).Before(until) {
		return AnalyticsQuery{}, ErrInvalid
	}
	q := AnalyticsQuery{
		From: from, Until: until, Page: 1, PageSize: 20, TopN: 10,
		SiteCode: strings.TrimSpace(c.Query("siteCode")), Direction: strings.TrimSpace(c.Query("direction")),
		MaterialCode: strings.TrimSpace(c.Query("materialCode")), CategoryCode: strings.TrimSpace(c.Query("categoryCode")),
		PartyCode: strings.TrimSpace(c.Query("partyCode")), IssuerName: strings.TrimSpace(c.Query("issuerName")),
		Keyword: strings.TrimSpace(c.Query("keyword")), Granularity: strings.TrimSpace(c.Query("granularity")),
		Compare: strings.TrimSpace(c.Query("compare")), SortBy: strings.TrimSpace(c.Query("sortBy")),
		SortOrder: strings.TrimSpace(c.Query("sortOrder")),
	}
	if q.Direction != "" && q.Direction != "inbound" && q.Direction != "outbound" {
		return AnalyticsQuery{}, ErrInvalid
	}
	if q.Granularity == "" || q.Granularity == "auto" {
		q.Granularity = autoGranularity(from, until)
	}
	if q.Granularity != "day" && q.Granularity != "week" && q.Granularity != "month" && q.Granularity != "quarter" && q.Granularity != "year" {
		return AnalyticsQuery{}, ErrInvalid
	}
	if q.Compare == "" {
		q.Compare = "previous"
	}
	if q.Compare != "none" && q.Compare != "previous" && q.Compare != "year" {
		return AnalyticsQuery{}, ErrInvalid
	}
	if value := strings.TrimSpace(c.Query("topN")); value != "" {
		n, err := strconv.Atoi(value)
		if err != nil || n < 1 || n > 50 {
			return AnalyticsQuery{}, ErrInvalid
		}
		q.TopN = n
	}
	if value := strings.TrimSpace(c.Query("page")); value != "" {
		n, err := strconv.Atoi(value)
		if err != nil || n < 1 {
			return AnalyticsQuery{}, ErrInvalid
		}
		q.Page = n
	}
	if value := strings.TrimSpace(c.Query("pageSize")); value != "" {
		n, err := strconv.Atoi(value)
		if err != nil || n < 1 || n > 50000 {
			return AnalyticsQuery{}, ErrInvalid
		}
		q.PageSize = n
	}
	if q.SortBy == "" {
		q.SortBy = "net"
	}
	switch q.SortBy {
	case "net", "tickets", "avg", "adjustment", "void", "lastIssuedAt":
	default:
		return AnalyticsQuery{}, ErrInvalid
	}
	if q.SortOrder == "" {
		q.SortOrder = "desc"
	}
	if q.SortOrder != "asc" && q.SortOrder != "desc" {
		return AnalyticsQuery{}, ErrInvalid
	}
	return q, nil
}

func autoGranularity(from, until time.Time) string {
	days := int(until.Sub(from).Hours() / 24)
	switch {
	case days <= 31:
		return "day"
	case days <= 180:
		return "week"
	case days <= 730:
		return "month"
	case days <= 1825:
		return "quarter"
	default:
		return "year"
	}
}

// analyticsOverview godoc
// @Summary 经营总览
// @Tags 统计与分析
// @Security BearerAuth
// @Router /api/v1/weighbridge/analytics/overview [get]
func (h *Handler) analyticsOverview(c *gin.Context) {
	q, err := analyticsQuery(c)
	if err != nil {
		managementResult(c, nil, err)
		return
	}
	value, err := h.service.AnalyticsOverview(c.Request.Context(), q)
	managementResult(c, value, err)
}

// analyticsFlow godoc
// @Summary 进出厂分析
// @Tags 统计与分析
// @Security BearerAuth
// @Router /api/v1/weighbridge/analytics/flow [get]
func (h *Handler) analyticsFlow(c *gin.Context) {
	q, err := analyticsQuery(c)
	if err != nil {
		managementResult(c, nil, err)
		return
	}
	value, err := h.service.AnalyticsFlow(c.Request.Context(), q)
	managementResult(c, value, err)
}

// analyticsMaterials godoc
// @Summary 物料分析
// @Tags 统计与分析
// @Security BearerAuth
// @Router /api/v1/weighbridge/analytics/materials [get]
func (h *Handler) analyticsMaterials(c *gin.Context) {
	q, err := analyticsQuery(c)
	if err != nil {
		managementResult(c, nil, err)
		return
	}
	value, err := h.service.AnalyticsMaterials(c.Request.Context(), q)
	managementResult(c, value, err)
}

// analyticsSupplierQuality godoc
// @Summary 核心原料供应商扣量稳定性
// @Tags 统计与分析
// @Security BearerAuth
// @Router /api/v1/weighbridge/analytics/materials/supplier-quality [get]
func (h *Handler) analyticsSupplierQuality(c *gin.Context) {
	q, err := analyticsQuery(c)
	if err != nil {
		managementResult(c, nil, err)
		return
	}
	value, err := h.service.AnalyticsSupplierQuality(c.Request.Context(), q)
	managementResult(c, value, err)
}

// analyticsByproductFlow godoc
// @Summary 副产品出库流向
// @Tags 统计与分析
// @Security BearerAuth
// @Router /api/v1/weighbridge/analytics/materials/byproduct-flow [get]
func (h *Handler) analyticsByproductFlow(c *gin.Context) {
	q, err := analyticsQuery(c)
	if err != nil {
		managementResult(c, nil, err)
		return
	}
	value, err := h.service.AnalyticsByproductFlow(c.Request.Context(), q)
	managementResult(c, value, err)
}

// analyticsParties godoc
// @Summary 供收方分析
// @Tags 统计与分析
// @Security BearerAuth
// @Router /api/v1/weighbridge/analytics/parties [get]
func (h *Handler) analyticsParties(c *gin.Context) {
	q, err := analyticsQuery(c)
	if err != nil || q.Direction == "" {
		managementResult(c, nil, ErrInvalid)
		return
	}
	value, err := h.service.AnalyticsParties(c.Request.Context(), q)
	managementResult(c, value, err)
}

// analyticsPartyDetail godoc
// @Summary 供收方详情
// @Tags 统计与分析
// @Security BearerAuth
// @Router /api/v1/weighbridge/analytics/parties/detail [get]
func (h *Handler) analyticsPartyDetail(c *gin.Context) {
	q, err := analyticsQuery(c)
	if err != nil || q.Direction == "" || q.PartyCode == "" {
		managementResult(c, nil, ErrInvalid)
		return
	}
	value, err := h.service.AnalyticsPartyDetail(c.Request.Context(), q)
	managementResult(c, value, err)
}

// analyticsQuality godoc
// @Summary 数据质量
// @Tags 统计与分析
// @Security BearerAuth
// @Router /api/v1/weighbridge/analytics/quality [get]
func (h *Handler) analyticsQuality(c *gin.Context) {
	q, err := analyticsQuery(c)
	if err != nil {
		managementResult(c, nil, err)
		return
	}
	value, err := h.service.AnalyticsQuality(c.Request.Context(), q)
	managementResult(c, value, err)
}

// analyticsFlowExport godoc
// @Summary 导出进出厂分析 CSV
// @Tags 统计与分析
// @Security BearerAuth
// @Router /api/v1/weighbridge/analytics/flow/export [get]
func (h *Handler) analyticsFlowExport(c *gin.Context) {
	q, err := analyticsQuery(c)
	if err != nil {
		managementResult(c, nil, err)
		return
	}
	value, err := h.service.AnalyticsFlow(c.Request.Context(), q)
	if err != nil {
		managementResult(c, nil, err)
		return
	}
	rows := [][]string{{"周期", "入厂车次", "入厂净重(吨)", "出厂车次", "出厂净重(吨)", "过磅净流入(吨)", "平均单次(吨)", "作废车次", "作废率"}}
	for _, point := range value.Trend.Points {
		rows = append(rows, []string{
			point.Period, strconv.FormatInt(point.InboundTickets, 10), FormatMilliTonne(point.InboundNetMilliTonne),
			strconv.FormatInt(point.OutboundTickets, 10), FormatMilliTonne(point.OutboundNetMilliTonne),
			FormatMilliTonne(point.NetFlowMilliTonne), formatNullableMilliTonne(point.AvgNetPerTicketMilliTonne),
			strconv.FormatInt(point.VoidTickets, 10), formatBp(point.VoidRateBp),
		})
	}
	writeAnalyticsCSV(c, "进出厂分析", q, rows)
}

// analyticsMaterialsExport godoc
// @Summary 导出物料分析 CSV
// @Tags 统计与分析
// @Security BearerAuth
// @Router /api/v1/weighbridge/analytics/materials/export [get]
func (h *Handler) analyticsMaterialsExport(c *gin.Context) {
	q, err := analyticsQuery(c)
	if err != nil {
		managementResult(c, nil, err)
		return
	}
	q.Page, q.PageSize = 1, 50000
	value, err := h.service.AnalyticsMaterials(c.Request.Context(), q)
	if err != nil {
		managementResult(c, nil, err)
		return
	}
	if value.Total > 50000 {
		managementResult(c, nil, ErrInvalid)
		return
	}
	rows := [][]string{{"物料编码", "物料名称", "规格", "分类", "入厂车次", "入厂净重(吨)", "出厂车次", "出厂净重(吨)", "合计车次", "合计净重(吨)", "平均单次(吨)", "占比", "调整车次", "净重调整(吨)", "扣量率", "调整覆盖率", "最后过磅时间"}}
	for _, item := range value.Records {
		rows = append(rows, []string{
			item.MaterialCode, item.MaterialName, item.MaterialSpec, item.CategoryName,
			strconv.FormatInt(item.InboundTickets, 10), FormatMilliTonne(item.InboundNetMilliTonne),
			strconv.FormatInt(item.OutboundTickets, 10), FormatMilliTonne(item.OutboundNetMilliTonne),
			strconv.FormatInt(item.TotalTickets, 10), FormatMilliTonne(item.TotalNetMilliTonne),
			formatNullableMilliTonne(item.AvgNetPerTicketMilliTonne), formatBp(item.ShareBp),
			strconv.FormatInt(item.AdjustedTickets, 10), FormatMilliTonne(item.AdjustmentNetMilliTonne),
			formatBp(item.AdjustmentWeightRateBp), formatBp(item.AdjustmentCoverageBp), formatNullableTime(item.LastIssuedAt),
		})
	}
	writeAnalyticsCSV(c, "物料分析", q, rows)
}

// analyticsPartiesExport godoc
// @Summary 导出供收方分析 CSV
// @Tags 统计与分析
// @Security BearerAuth
// @Router /api/v1/weighbridge/analytics/parties/export [get]
func (h *Handler) analyticsPartiesExport(c *gin.Context) {
	q, err := analyticsQuery(c)
	if err != nil || q.Direction == "" {
		managementResult(c, nil, ErrInvalid)
		return
	}
	q.Page, q.PageSize = 1, 50000
	value, err := h.service.AnalyticsParties(c.Request.Context(), q)
	if err != nil {
		managementResult(c, nil, err)
		return
	}
	if value.Total > 50000 {
		managementResult(c, nil, ErrInvalid)
		return
	}
	rows := [][]string{{"方向", "供收方编码", "名称", "车次", "净重(吨)", "平均单次(吨)", "占比", "首次过磅", "最后过磅", "调整车次", "净重调整(吨)", "扣量率", "调整覆盖率", "作废车次", "作废率"}}
	for _, item := range value.Records {
		rows = append(rows, []string{
			analyticsDirectionLabel(item.Direction), item.PartyCode, item.PartyName,
			strconv.FormatInt(item.TicketCount, 10), FormatMilliTonne(item.NetMilliTonne),
			formatNullableMilliTonne(item.AvgNetPerTicketMilliTonne), formatBp(item.ShareBp),
			formatNullableTime(item.FirstIssuedAt), formatNullableTime(item.LastIssuedAt),
			strconv.FormatInt(item.AdjustedTickets, 10), FormatMilliTonne(item.AdjustmentNetMilliTonne),
			formatBp(item.AdjustmentWeightRateBp), formatBp(item.AdjustmentCoverageBp),
			strconv.FormatInt(item.VoidTickets, 10), formatBp(item.VoidRateBp),
		})
	}
	writeAnalyticsCSV(c, "供收方分析", q, rows)
}

// analyticsQualityExport godoc
// @Summary 导出数据质量异常明细 CSV
// @Tags 统计与分析
// @Security BearerAuth
// @Router /api/v1/weighbridge/analytics/quality/export [get]
func (h *Handler) analyticsQualityExport(c *gin.Context) {
	q, err := analyticsQuery(c)
	if err != nil {
		managementResult(c, nil, err)
		return
	}
	items, err := h.service.AnalyticsQualityExportRows(c.Request.Context(), q)
	if err != nil {
		managementResult(c, nil, err)
		return
	}
	if len(items) > 50000 {
		managementResult(c, nil, ErrInvalid)
		return
	}
	freshness, err := h.service.AnalyticsFreshness(c.Request.Context())
	if err != nil {
		managementResult(c, nil, err)
		return
	}
	dataThrough := formatNullableTime(freshness.DataThrough)
	anomalyMap := map[string][]string{}
	for _, item := range detectAnomalies(items) {
		anomalyMap[item.TicketNo] = append(anomalyMap[item.TicketNo], item.Type)
	}
	rows := [][]string{{
		"单号", "厂区", "出单时间", "方向", "物料", "供收方", "状态", "作废原因", "重开",
		"净重调整(吨)", "两次间隔(秒)", "毛重来源", "皮重来源", "出单人", "异常类型", "数据截止",
	}}
	for _, item := range items {
		status := "有效"
		if item.Status == "void" {
			status = "作废"
		}
		reopened := "否"
		if item.PreviousTicketNo != nil {
			reopened = "是"
		}
		reason := ""
		if item.VoidReason != nil {
			reason = *item.VoidReason
		}
		interval := ""
		if item.WeighIntervalSeconds != nil {
			interval = strconv.FormatInt(*item.WeighIntervalSeconds, 10)
		}
		grossSource, tareSource, issuer := "", "", ""
		if item.GrossSource != nil {
			grossSource = *item.GrossSource
		}
		if item.TareSource != nil {
			tareSource = *item.TareSource
		}
		if item.IssuerName != nil {
			issuer = *item.IssuerName
		}
		rows = append(rows, []string{
			item.TicketNo, item.SiteCode, item.IssuedAt.In(statementZone).Format("2006-01-02 15:04:05"),
			analyticsDirectionLabel(item.Direction), item.MaterialName, item.PartyName, status, reason, reopened,
			formatNullableMilliTonne(item.NetAdjustmentMilliTonne), interval, grossSource, tareSource, issuer,
			strings.Join(uniqueStrings(anomalyMap[item.TicketNo]), ","), dataThrough,
		})
	}
	writeAnalyticsCSV(c, "数据质量", q, rows)
}

func writeAnalyticsCSV(c *gin.Context, name string, q AnalyticsQuery, rows [][]string) {
	var buffer bytes.Buffer
	buffer.Write([]byte{0xef, 0xbb, 0xbf})
	writer := csv.NewWriter(&buffer)
	if err := writer.WriteAll(rows); err != nil {
		managementResult(c, nil, err)
		return
	}
	period := q.From.In(statementZone).Format("2006-01-02") + "至" + q.Until.AddDate(0, 0, -1).In(statementZone).Format("2006-01-02")
	filename := fmt.Sprintf("%s-%s.csv", name, period)
	c.Header("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": filename}))
	c.Data(http.StatusOK, "text/csv; charset=utf-8", buffer.Bytes())
}

func uniqueStrings(values []string) []string {
	seen := map[string]struct{}{}
	result := make([]string, 0, len(values))
	for _, value := range values {
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

func formatBp(value *int64) string {
	if value == nil {
		return "—"
	}
	return fmt.Sprintf("%.2f%%", float64(*value)/100)
}

func formatNullableMilliTonne(value *int64) string {
	if value == nil {
		return "—"
	}
	return FormatMilliTonne(*value)
}

func formatNullableTime(value *time.Time) string {
	if value == nil {
		return "—"
	}
	return value.In(statementZone).Format("2006-01-02 15:04:05")
}

func analyticsDirectionLabel(direction string) string {
	if direction == "inbound" {
		return "入厂"
	}
	return "出厂"
}
