package laboratory

import (
	"errors"
	"fenchichun.local/server/internal/audit"
	"fenchichun.local/server/internal/auth"
	platformhttp "fenchichun.local/server/internal/platform/http"
	"github.com/gin-gonic/gin"
	"net/http"
	"strconv"
)

type Handler struct{ service *Service }

func NewHandler(s *Service) *Handler { return &Handler{service: s} }
func (h *Handler) Register(api gin.IRouter) {
	g := api.Group("/laboratory/inspections")
	g.GET("", h.list)
	g.POST("", h.create)
	g.GET("/:id", h.detail)
	g.PUT("/:id", h.update)
	g.POST("/:id/:action", h.action)
}
func result(c *gin.Context, value any, err error) {
	if err == nil {
		platformhttp.OK(c, value)
		return
	}
	status := http.StatusInternalServerError
	message := "化验单操作失败"
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
func event(c *gin.Context, action string) (audit.Event, bool) {
	p, ok := auth.PrincipalFromContext(c.Request.Context())
	if !ok {
		platformhttp.WriteError(c, 401, 401, "未登录", nil)
		return audit.Event{}, false
	}
	meta, _ := platformhttp.RequestMetaFromContext(c.Request.Context())
	return audit.Event{Action: action, Resource: "laboratory-inspection", Metadata: audit.Metadata{ActorID: p.UserID, RequestID: meta.RequestID, ClientIP: meta.ClientIP, UserAgent: meta.UserAgent, RequestMethod: c.Request.Method, RequestURL: c.Request.URL.Path}}, true
}
func id(c *gin.Context) (int64, bool) {
	v, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || v <= 0 {
		result(c, nil, ErrInvalid)
		return 0, false
	}
	return v, true
}

type Response struct {
	Code    int        `json:"code"`
	Message string     `json:"message"`
	Data    Inspection `json:"data"`
}
type PageResponse struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    Page   `json:"data"`
}
type SaveRequest struct {
	Input
	Version int64 `json:"version"`
}
type ActionRequest struct {
	Version int64  `json:"version"`
	Reason  string `json:"reason"`
}

// list godoc
// @Summary 分页查询独立化验单
// @Tags 化验室
// @Security BearerAuth
// @Param page query int false "页码"
// @Param pageSize query int false "每页条数"
// @Param keyword query string false "单号、车牌、粮种或供应商"
// @Param status query string false "draft/confirmed/void"
// @Param tripId query int false "流转单ID"
// @Param unlinked query boolean false "仅查询未关联流转单的化验单"
// @Success 200 {object} PageResponse
// @Router /api/v1/laboratory/inspections [get]
func (h *Handler) list(c *gin.Context) {
	e, ok := event(c, "inspection.list")
	if !ok {
		return
	}
	tripID, _ := strconv.ParseInt(c.Query("tripId"), 10, 64)
	page, _ := strconv.Atoi(c.Query("page"))
	size, _ := strconv.Atoi(c.Query("pageSize"))
	value, err := h.service.List(c.Request.Context(), e.Metadata.ActorID, Query{Page: page, PageSize: size, Keyword: c.Query("keyword"), Status: c.Query("status"), TripID: tripID, Unlinked: c.Query("unlinked") == "true"})
	result(c, value, err)
}

// detail godoc
// @Summary 查询独立化验单详情
// @Tags 化验室
// @Security BearerAuth
// @Param id path int true "化验单ID"
// @Success 200 {object} Response
// @Router /api/v1/laboratory/inspections/{id} [get]
func (h *Handler) detail(c *gin.Context) {
	e, ok := event(c, "inspection.detail")
	if !ok {
		return
	}
	key, ok := id(c)
	if !ok {
		return
	}
	value, err := h.service.Detail(c.Request.Context(), e.Metadata.ActorID, key)
	result(c, value, err)
}

// create godoc
// @Summary 保存化验单草稿
// @Tags 化验室
// @Security BearerAuth
// @Param request body Input true "化验单草稿（水分%、杂质%、容重g/L；最多6位小数）"
// @Success 200 {object} Response
// @Router /api/v1/laboratory/inspections [post]
func (h *Handler) create(c *gin.Context) { h.save(c, 0) }

// update godoc
// @Summary 更新化验单草稿（确认后禁止修改）
// @Tags 化验室
// @Security BearerAuth
// @Param id path int true "化验单ID"
// @Param request body SaveRequest true "草稿及当前版本"
// @Success 200 {object} Response
// @Router /api/v1/laboratory/inspections/{id} [put]
func (h *Handler) update(c *gin.Context) {
	key, ok := id(c)
	if ok {
		h.save(c, key)
	}
}
func (h *Handler) save(c *gin.Context, key int64) {
	e, ok := event(c, "inspection.save")
	if !ok {
		return
	}
	var input SaveRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		result(c, nil, ErrInvalid)
		return
	}
	value, err := h.service.Save(c.Request.Context(), key, input.Version, input.Input, e)
	result(c, value, err)
}

// action godoc
// @Summary 确认、作废、删除草稿或建立复检单
// @Description confirm要求信息完整且拒收填写原因；void仅限已确认单且须原因；delete仅限草稿；retest仅限已确认单，新建关联草稿，不改变原单。
// @Tags 化验室
// @Security BearerAuth
// @Param id path int true "化验单ID"
// @Param action path string true "动作" Enums(confirm,void,delete,retest)
// @Param request body ActionRequest true "当前版本及作废原因"
// @Success 200 {object} Response
// @Router /api/v1/laboratory/inspections/{id}/{action} [post]
func (h *Handler) action(c *gin.Context) {
	key, ok := id(c)
	if !ok {
		return
	}
	action := c.Param("action")
	e, ok := event(c, "inspection."+action)
	if !ok {
		return
	}
	var input ActionRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		result(c, nil, ErrInvalid)
		return
	}
	if action == "retest" {
		value, err := h.service.Retest(c.Request.Context(), key, input.Version, e)
		result(c, value, err)
		return
	}
	value, err := h.service.Transition(c.Request.Context(), key, input.Version, action, input.Reason, e)
	result(c, value, err)
}
