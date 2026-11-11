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
	g.GET("/:id", h.detail)
	g.POST("", h.create)
	g.POST("/:id/void", h.void)
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

// list godoc
// @Summary 分页查询化验记录
// @Tags 化验室
// @Security BearerAuth
// @Param page query int false "页码"
// @Param pageSize query int false "每页条数"
// @Param keyword query string false "单号、车牌、粮种或供应商"
// @Param status query string false "confirmed/void"
// @Param tripId query int false "流转单ID"
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
	value, err := h.service.List(c.Request.Context(), e.Metadata.ActorID, Query{Page: page, PageSize: size, Keyword: c.Query("keyword"), Status: c.Query("status"), TripID: tripID})
	result(c, value, err)
}

// detail godoc
// @Summary 查询化验记录详情
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
// @Summary 为流转单录入化验结果（提交即生效）
// @Description 必须关联流转单；一张流转单只能录入一次；结果只有接收/拒收；拒收必须填写原因。
// @Tags 化验室
// @Security BearerAuth
// @Param request body Input true "流转单ID、三项检测值与结论"
// @Success 200 {object} Response
// @Router /api/v1/laboratory/inspections [post]
func (h *Handler) create(c *gin.Context) {
	e, ok := event(c, "inspection.create")
	if !ok {
		return
	}
	var input Input
	if err := c.ShouldBindJSON(&input); err != nil {
		result(c, nil, ErrInvalid)
		return
	}
	value, err := h.service.Create(c.Request.Context(), input, e)
	result(c, value, err)
}

type voidRequest struct {
	Version int64  `json:"version"`
	Reason  string `json:"reason"`
}

// void godoc
// @Summary 作废化验单
// @Description 仅允许在过磅单生成前作废；保留原始检测值、原因和人员时间，并让流转单回到待化验。
// @Tags 化验室
// @Security BearerAuth
// @Param id path int true "化验单ID"
// @Param request body voidRequest true "版本与作废原因"
// @Success 200 {object} Response
// @Router /api/v1/laboratory/inspections/{id}/void [post]
func (h *Handler) void(c *gin.Context) {
	e, ok := event(c, "inspection.void")
	if !ok {
		return
	}
	key, ok := id(c)
	if !ok {
		return
	}
	var input voidRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		result(c, nil, ErrInvalid)
		return
	}
	value, err := h.service.Void(c.Request.Context(), e.Metadata.ActorID, key, input.Version, input.Reason, e)
	result(c, value, err)
}
