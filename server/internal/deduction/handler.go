package deduction

import (
	"errors"
	"strconv"

	"fenchichun.local/server/internal/audit"
	"fenchichun.local/server/internal/auth"
	platformhttp "fenchichun.local/server/internal/platform/http"

	"github.com/gin-gonic/gin"
)

type Handler struct{ service *Service }

func NewHandler(s *Service) *Handler { return &Handler{service: s} }

func (h *Handler) Register(api gin.IRouter) {
	g := api.Group("/grain-intake")
	g.GET("/deduction-categories", h.categories)
	g.GET("/deduction-preview", h.preview)
	g.GET("/deduction-rules", h.list)
	g.POST("/deduction-rules", h.create)
	g.PUT("/deduction-rules/:id", h.update)
	g.DELETE("/deduction-rules/:id", h.remove)
}

func respond(c *gin.Context, value any, err error) {
	if err == nil {
		platformhttp.OK(c, value)
		return
	}
	status, message := 500, "扣减规则操作失败"
	switch {
	case errors.Is(err, ErrInvalid):
		status = 400
	case errors.Is(err, ErrForbidden):
		status = 403
	case errors.Is(err, ErrNotFound):
		status = 404
	case errors.Is(err, ErrConflict):
		status = 409
	}
	if status != 500 {
		message = err.Error()
	}
	platformhttp.WriteError(c, status, status, message, err)
}

func actorEvent(c *gin.Context, action string) (audit.Event, bool) {
	p, ok := auth.PrincipalFromContext(c.Request.Context())
	if !ok {
		platformhttp.WriteError(c, 401, 401, "未登录", nil)
		return audit.Event{}, false
	}
	meta, _ := platformhttp.RequestMetaFromContext(c.Request.Context())
	return audit.Event{
		Action: action, Resource: "grain-deduction-rule",
		Metadata: audit.Metadata{ActorID: p.UserID, RequestID: meta.RequestID, ClientIP: meta.ClientIP, UserAgent: meta.UserAgent, RequestMethod: c.Request.Method, RequestURL: c.Request.URL.Path},
	}, true
}

func key(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		respond(c, nil, ErrInvalid)
		return 0, false
	}
	return id, true
}

// categories godoc
// @Summary 查询扣减类别字典
// @Tags 原粮流转
// @Security BearerAuth
// @Success 200 {array} Category
// @Router /api/v1/grain-intake/deduction-categories [get]
func (h *Handler) categories(c *gin.Context) {
	value, err := h.service.Categories(c.Request.Context())
	respond(c, value, err)
}

// preview godoc
// @Summary 按物料和水分预览扣减规则
// @Tags 原粮流转
// @Security BearerAuth
// @Description 仅返回水分依据的扣减规则，供化验单录入水分后预览；容量不作为扣减依据，杂质在称重台二次称重时录入。
// @Param materialCode query string true "物料编码"
// @Param moisture query string true "水分（%）"
// @Success 200 {array} Evaluation
// @Router /api/v1/grain-intake/deduction-preview [get]
func (h *Handler) preview(c *gin.Context) {
	value, err := h.service.PreviewMoisture(c.Request.Context(), c.Query("materialCode"), c.Query("moisture"))
	respond(c, value, err)
}

// list godoc
// @Summary 查询扣减规则
// @Tags 原粮流转
// @Security BearerAuth
// @Param materialCode query string false "物料编码"
// @Success 200 {array} Rule
// @Router /api/v1/grain-intake/deduction-rules [get]
func (h *Handler) list(c *gin.Context) {
	e, ok := actorEvent(c, "deduction-rule.list")
	if !ok {
		return
	}
	value, err := h.service.Rules(c.Request.Context(), e.Metadata.ActorID, c.Query("materialCode"))
	respond(c, value, err)
}

// create godoc
// @Summary 新增扣减规则
// @Tags 原粮流转
// @Security BearerAuth
// @Param request body Input true "扣减规则"
// @Success 200 {object} Rule
// @Router /api/v1/grain-intake/deduction-rules [post]
func (h *Handler) create(c *gin.Context) {
	e, ok := actorEvent(c, "deduction-rule.create")
	if !ok {
		return
	}
	var in Input
	if err := c.ShouldBindJSON(&in); err != nil {
		respond(c, nil, ErrInvalid)
		return
	}
	value, err := h.service.Save(c.Request.Context(), e.Metadata.ActorID, 0, in, e)
	respond(c, value, err)
}

// update godoc
// @Summary 修改扣减规则
// @Tags 原粮流转
// @Security BearerAuth
// @Param id path int true "规则 ID"
// @Param request body Input true "扣减规则"
// @Success 200 {object} Rule
// @Router /api/v1/grain-intake/deduction-rules/{id} [put]
func (h *Handler) update(c *gin.Context) {
	e, ok := actorEvent(c, "deduction-rule.update")
	if !ok {
		return
	}
	id, ok := key(c)
	if !ok {
		return
	}
	var in Input
	if err := c.ShouldBindJSON(&in); err != nil {
		respond(c, nil, ErrInvalid)
		return
	}
	value, err := h.service.Save(c.Request.Context(), e.Metadata.ActorID, id, in, e)
	respond(c, value, err)
}

// remove godoc
// @Summary 删除扣减规则版本
// @Tags 原粮流转
// @Security BearerAuth
// @Description 删除指定版本及其区间；同编码的其他版本保留。
// @Param id path int true "规则 ID"
// @Router /api/v1/grain-intake/deduction-rules/{id} [delete]
func (h *Handler) remove(c *gin.Context) {
	e, ok := actorEvent(c, "deduction-rule.delete")
	if !ok {
		return
	}
	id, ok := key(c)
	if !ok {
		return
	}
	err := h.service.Delete(c.Request.Context(), e.Metadata.ActorID, id, e)
	respond(c, nil, err)
}
