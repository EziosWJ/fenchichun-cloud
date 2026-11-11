package grainintake

import (
	"errors"

	platformhttp "fenchichun.local/server/internal/platform/http"

	"github.com/gin-gonic/gin"
)

type SyncHandler struct{ service *SyncService }

func NewSyncHandler(service *SyncService) *SyncHandler { return &SyncHandler{service: service} }

// RegisterSyncRoutes exposes the read-only trip contract used by a weighing
// site. Like the existing weighbridge sync routes, siteCode identifies the
// owning site and is not an authentication secret.
func RegisterSyncRoutes(api gin.IRouter, handler *SyncHandler) {
	g := api.Group("/weighbridge/sync")
	g.GET("/trips", handler.trips)
	g.GET("/trips/:tripNo", handler.trip)
	g.POST("/trips/:tripNo/link", handler.link)
}

type syncLinkInput struct {
	SiteCode string `json:"siteCode"`
	TicketNo string `json:"ticketNo"`
}

func syncRespond(c *gin.Context, value any, err error) {
	if err == nil {
		platformhttp.OK(c, value)
		return
	}
	status, message := 500, "流转单查询或关联失败"
	switch {
	case errors.Is(err, ErrSiteUnauthorized):
		status = 401
		message = err.Error()
	case errors.Is(err, ErrInvalid):
		status = 400
		message = err.Error()
	case errors.Is(err, ErrNotFound):
		status = 404
		message = err.Error()
	case errors.Is(err, ErrConflict):
		status = 409
		message = err.Error()
	}
	platformhttp.WriteError(c, status, status, message, err)
}

// trips godoc
// @Summary 厂端按车牌查询流转单
// @Tags 厂云同步
// @Description 以启用的厂区编码查询该车牌最近的流转单，并返回生效化验及建议扣减项。多个候选由厂端人工选择，云端不自动匹配。
// @Param siteCode query string true "厂区编码"
// @Param plate query string true "车牌"
// @Success 200 {array} SyncTrip
// @Failure 400 {object} ApiEnvelope
// @Failure 401 {object} ApiEnvelope
// @Router /api/v1/weighbridge/sync/trips [get]
func (h *SyncHandler) trips(c *gin.Context) {
	siteCode, plate := c.Query("siteCode"), c.Query("plate")
	if plate == "" {
		syncRespond(c, nil, ErrInvalid)
		return
	}
	values, err := h.service.Candidates(c.Request.Context(), siteCode, plate)
	syncRespond(c, values, err)
}

// trip godoc
// @Summary 厂端查询单张流转单
// @Tags 厂云同步
// @Param tripNo path string true "流转单号"
// @Param siteCode query string true "厂区编码"
// @Success 200 {object} SyncTrip
// @Failure 401 {object} ApiEnvelope
// @Failure 404 {object} ApiEnvelope
// @Router /api/v1/weighbridge/sync/trips/{tripNo} [get]
func (h *SyncHandler) trip(c *gin.Context) {
	value, err := h.service.Trip(c.Request.Context(), c.Query("siteCode"), c.Param("tripNo"))
	syncRespond(c, value, err)
}

// link godoc
// @Summary 厂端在磅单同步后关联流转单
// @Tags 厂云同步
// @Description 使用首磅时选定的流转单号关联已同步的正式磅单；相同流转单与磅单重复调用返回成功，不重复累计。
// @Param tripNo path string true "流转单号"
// @Param request body syncLinkInput true "厂区编码与磅单号"
// @Success 200 {object} ApiEnvelope
// @Failure 400 {object} ApiEnvelope
// @Failure 401 {object} ApiEnvelope
// @Failure 409 {object} ApiEnvelope
// @Router /api/v1/weighbridge/sync/trips/{tripNo}/link [post]
func (h *SyncHandler) link(c *gin.Context) {
	var input syncLinkInput
	if err := c.ShouldBindJSON(&input); err != nil {
		syncRespond(c, nil, ErrInvalid)
		return
	}
	if err := h.service.LinkTicket(c.Request.Context(), input.SiteCode, c.Param("tripNo"), input.TicketNo); err != nil {
		syncRespond(c, nil, err)
		return
	}
	platformhttp.OK(c, gin.H{"tripNo": c.Param("tripNo"), "ticketNo": input.TicketNo})
}
