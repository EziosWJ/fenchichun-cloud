package weighbridge

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"fenchichun.local/server/internal/audit"
	"fenchichun.local/server/internal/auth"
	platformhttp "fenchichun.local/server/internal/platform/http"
	"github.com/gin-gonic/gin"
)

func managementEvent(c *gin.Context, action string) (audit.Event, bool) {
	principal, ok := auth.PrincipalFromContext(c.Request.Context())
	if !ok {
		platformhttp.WriteError(c, http.StatusUnauthorized, platformhttp.CodeUnauthorized, "未登录", nil)
		return audit.Event{}, false
	}
	meta, _ := platformhttp.RequestMetaFromContext(c.Request.Context())
	return audit.Event{Action: action, Resource: "weighbridge-master", Metadata: audit.Metadata{ActorID: principal.UserID, RequestID: meta.RequestID, ClientIP: meta.ClientIP, UserAgent: meta.UserAgent, RequestMethod: c.Request.Method, RequestURL: c.Request.URL.Path}}, true
}
func managementResult(c *gin.Context, value any, err error) {
	if err == nil {
		platformhttp.OK(c, value)
		return
	}
	if errors.Is(err, ErrInvalid) {
		platformhttp.WriteError(c, http.StatusBadRequest, platformhttp.CodeBadRequest, err.Error(), nil)
		return
	}
	if errors.Is(err, ErrConflict) {
		platformhttp.WriteError(c, http.StatusConflict, http.StatusConflict, err.Error(), nil)
		return
	}
	platformhttp.WriteError(c, http.StatusInternalServerError, platformhttp.CodeInternalError, "操作失败", nil)
}

// categories godoc
// @Summary 查询总部物料分类
// @Tags 过磅基础资料
// @Security BearerAuth
// @Success 200 {object} ApiEnvelope
// @Router /api/v1/weighbridge/master/categories [get]
func (h *Handler) categories(c *gin.Context) {
	value, err := h.service.Categories(c.Request.Context())
	managementResult(c, value, err)
}

// saveCategory godoc
// @Summary 保存总部物料分类
// @Tags 过磅基础资料
// @Security BearerAuth
// @Param request body CategoryInput true "分类"
// @Success 200 {object} ApiEnvelope
// @Router /api/v1/weighbridge/master/categories [post]
// @Router /api/v1/weighbridge/master/categories/{code} [put]
func (h *Handler) saveCategory(c *gin.Context) {
	event, ok := managementEvent(c, "category.save")
	if !ok {
		return
	}
	var in CategoryInput
	if err := c.ShouldBindJSON(&in); err != nil {
		managementResult(c, nil, ErrInvalid)
		return
	}
	value, err := h.service.SaveCategory(c.Request.Context(), c.Param("code"), in, event)
	managementResult(c, value, err)
}

// saveMaterial godoc
// @Summary 保存总部物料
// @Tags 过磅基础资料
// @Security BearerAuth
// @Param request body MaterialInput true "物料"
// @Success 200 {object} ApiEnvelope
// @Router /api/v1/weighbridge/master/materials [post]
// @Router /api/v1/weighbridge/master/materials/{code} [put]
func (h *Handler) saveMaterial(c *gin.Context) {
	event, ok := managementEvent(c, "material.save")
	if !ok {
		return
	}
	var in MaterialInput
	if err := c.ShouldBindJSON(&in); err != nil {
		managementResult(c, nil, ErrInvalid)
		return
	}
	value, err := h.service.SaveMaterial(c.Request.Context(), c.Param("code"), in, event)
	managementResult(c, value, err)
}

// saveParty godoc
// @Summary 保存总部往来主体及联系人
// @Tags 过磅基础资料
// @Security BearerAuth
// @Param request body PartyInput true "往来主体"
// @Success 200 {object} ApiEnvelope
// @Router /api/v1/weighbridge/master/parties [post]
// @Router /api/v1/weighbridge/master/parties/{code} [put]
func (h *Handler) saveParty(c *gin.Context) {
	event, ok := managementEvent(c, "party.save")
	if !ok {
		return
	}
	var in PartyInput
	if err := c.ShouldBindJSON(&in); err != nil {
		managementResult(c, nil, ErrInvalid)
		return
	}
	value, err := h.service.SaveParty(c.Request.Context(), c.Param("code"), in, event)
	managementResult(c, value, err)
}

// materials godoc
// @Summary 查询总部物料
// @Tags 过磅基础资料
// @Security BearerAuth
// @Success 200 {object} ApiEnvelope
// @Router /api/v1/weighbridge/master/materials [get]
func (h *Handler) materials(c *gin.Context) {
	value, err := h.service.Materials(c.Request.Context())
	managementResult(c, value, err)
}

// parties godoc
// @Summary 查询总部往来主体及联系人
// @Tags 过磅基础资料
// @Security BearerAuth
// @Success 200 {object} ApiEnvelope
// @Router /api/v1/weighbridge/master/parties [get]
func (h *Handler) parties(c *gin.Context) {
	value, err := h.service.Parties(c.Request.Context())
	managementResult(c, value, err)
}

func ticketQuery(c *gin.Context) (TicketQuery, error) {
	q := TicketQuery{Page: 1, PageSize: 10, SiteCode: c.Query("siteCode"), Direction: c.Query("direction"), Status: c.Query("status"), Keyword: c.Query("keyword"), MaterialCode: c.Query("materialCode"), PartyCode: c.Query("partyCode")}
	if s := c.Query("page"); s != "" {
		n, err := strconv.Atoi(s)
		if err != nil {
			return q, ErrInvalid
		}
		q.Page = n
	}
	if s := c.Query("pageSize"); s != "" {
		n, err := strconv.Atoi(s)
		if err != nil {
			return q, ErrInvalid
		}
		q.PageSize = n
	}
	zone := time.FixedZone("Asia/Shanghai", 8*60*60)
	if s := c.Query("from"); s != "" {
		t, err := time.ParseInLocation("2006-01-02", s, zone)
		if err != nil {
			return q, ErrInvalid
		}
		q.From = &t
	}
	if s := c.Query("to"); s != "" {
		t, err := time.ParseInLocation("2006-01-02", s, zone)
		if err != nil {
			return q, ErrInvalid
		}
		t = t.AddDate(0, 0, 1)
		q.Until = &t
	}
	if q.Page < 1 || q.PageSize < 1 || q.PageSize > 100 || (q.From != nil && q.Until != nil && !q.From.Before(*q.Until)) || (q.Direction != "" && q.Direction != "inbound" && q.Direction != "outbound") || (q.Status != "" && q.Status != "valid" && q.Status != "void") {
		return q, ErrInvalid
	}
	return q, nil
}

// ticketPage godoc
// @Summary 查询各厂过磅单
// @Tags 云端过磅单
// @Security BearerAuth
// @Success 200 {object} ApiEnvelope
// @Router /api/v1/weighbridge/tickets [get]
func (h *Handler) ticketPage(c *gin.Context) {
	q, err := ticketQuery(c)
	if err != nil {
		managementResult(c, nil, err)
		return
	}
	page, err := h.service.TicketPage(c.Request.Context(), q)
	managementResult(c, page, err)
}

// ticketTotals godoc
// @Summary 统计各厂有效过磅单
// @Tags 云端过磅单
// @Security BearerAuth
// @Success 200 {object} ApiEnvelope
// @Router /api/v1/weighbridge/ticket-totals [get]
func (h *Handler) ticketTotals(c *gin.Context) {
	q, err := ticketQuery(c)
	if err != nil {
		managementResult(c, nil, err)
		return
	}
	totals, err := h.service.TicketTotals(c.Request.Context(), q)
	managementResult(c, totals, err)
}

// sites godoc
// @Summary 查询厂区
// @Tags 厂云同步
// @Security BearerAuth
// @Success 200 {object} ApiEnvelope
// @Router /api/v1/weighbridge/sites [get]
func (h *Handler) sites(c *gin.Context) {
	values, err := h.service.Sites(c.Request.Context())
	managementResult(c, values, err)
}

// updateSite godoc
// @Summary 更新厂区
// @Tags 厂云同步
// @Security BearerAuth
// @Param code path string true "厂区编码"
// @Param request body SiteInput true "厂区"
// @Success 200 {object} ApiEnvelope
// @Router /api/v1/weighbridge/sites/{code} [put]
func (h *Handler) updateSite(c *gin.Context) {
	event, ok := managementEvent(c, "site.update")
	if !ok {
		return
	}
	var input SiteInput
	if bindStrict(c, &input) != nil {
		managementResult(c, nil, ErrInvalid)
		return
	}
	err := h.service.UpdateSite(c.Request.Context(), c.Param("code"), input, event)
	if errors.Is(err, ErrForbidden) {
		platformhttp.WriteError(c, http.StatusForbidden, platformhttp.CodeForbidden, err.Error(), nil)
		return
	}
	managementResult(c, nil, err)
}
