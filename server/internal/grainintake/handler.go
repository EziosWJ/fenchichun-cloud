package grainintake

import (
	"errors"
	"fenchichun.local/server/internal/audit"
	"fenchichun.local/server/internal/auth"
	platformhttp "fenchichun.local/server/internal/platform/http"
	"github.com/gin-gonic/gin"
	"strconv"
)

type Handler struct{ service *Service }

type ApiEnvelope struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data"`
}

func NewHandler(s *Service) *Handler { return &Handler{s} }
func (h *Handler) Register(api gin.IRouter) {
	g := api.Group("/grain-intake")
	g.GET("/trips", h.trips)
	g.POST("/trips", h.create)
	g.GET("/trips/:id", h.trip)
	g.GET("/trips/:id/ticket-candidates", h.ticketCandidates)
	g.PUT("/trips/:id", h.update)
	g.POST("/trips/:id/:action", h.command)
	g.GET("/rejections", h.rejections)
	g.GET("/permits", h.permits)
	g.GET("/exit-basis/:id", h.exitBasis)
	g.GET("/trip-defaults", h.defaults)
}
func respond(c *gin.Context, value any, err error) {
	if err == nil {
		platformhttp.OK(c, value)
		return
	}
	status, message := 500, "流转业务操作失败"
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
	return audit.Event{Action: action, Resource: "grain-intake", Metadata: audit.Metadata{ActorID: p.UserID, RequestID: meta.RequestID, ClientIP: meta.ClientIP, UserAgent: meta.UserAgent, RequestMethod: c.Request.Method, RequestURL: c.Request.URL.Path}}, true
}
func key(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		respond(c, nil, ErrInvalid)
		return 0, false
	}
	return id, true
}
func query(c *gin.Context) Query {
	page, _ := strconv.Atoi(c.Query("page"))
	size, _ := strconv.Atoi(c.Query("pageSize"))
	return Query{
		Page: page, PageSize: size, Keyword: c.Query("keyword"), Stage: c.Query("stage"),
		Order: c.Query("order"), Method: c.Query("method"), SiteCode: c.Query("siteCode"),
		MaterialCode: c.Query("materialCode"), Result: c.Query("result"), DateFrom: c.Query("dateFrom"), DateTo: c.Query("dateTo"),
	}
}

// defaults godoc
// @Summary 登记页默认值
// @Tags 原粮流转
// @Security BearerAuth
// @Success 200 {object} map[string]string
// @Router /api/v1/grain-intake/trip-defaults [get]
func (h *Handler) defaults(c *gin.Context) {
	e, ok := actorEvent(c, "trip.defaults")
	if !ok {
		return
	}
	site, err := h.service.Defaults(c.Request.Context(), e.Metadata.ActorID)
	respond(c, gin.H{"siteCode": site}, err)
}

type SaveRequest struct {
	Input
	Version int64 `json:"version"`
}
type DetailResponse struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    Detail `json:"data"`
}
type TripPageResponse struct {
	Code    int      `json:"code"`
	Message string   `json:"message"`
	Data    TripPage `json:"data"`
}
type PermitPageResponse struct {
	Code    int        `json:"code"`
	Message string     `json:"message"`
	Data    PermitPage `json:"data"`
}

// trips godoc
// @Summary 分页查询流转单
// @Tags 原粮流转
// @Security BearerAuth
// @Param page query int false "页码"
// @Param pageSize query int false "每页条数"
// @Param keyword query string false "流转单号、车牌或供应商"
// @Param siteCode query string false "厂区编码"
// @Param materialCode query string false "物料编码"
// @Param result query string false "化验结果：pending/accept/reject"
// @Param dateFrom query string false "登记开始日期，格式 YYYY-MM-DD"
// @Param dateTo query string false "登记结束日期，格式 YYYY-MM-DD"
// @Param stage query string false "办理阶段"
// @Success 200 {object} TripPageResponse
// @Router /api/v1/grain-intake/trips [get]
func (h *Handler) trips(c *gin.Context) {
	e, ok := actorEvent(c, "trip.list")
	if !ok {
		return
	}
	v, err := h.service.Trips(c.Request.Context(), e.Metadata.ActorID, query(c))
	respond(c, v, err)
}

// permits godoc
// @Summary 分页查询出门证
// @Tags 出门证
// @Security BearerAuth
// @Param page query int false "页码"
// @Param pageSize query int false "每页条数"
// @Param keyword query string false "证号、流转单号或车牌"
// @Param stage query string false "办理阶段"
// @Param siteCode query string false "厂区编码"
// @Param dateFrom query string false "开具开始日期（YYYY-MM-DD）"
// @Param dateTo query string false "开具结束日期（YYYY-MM-DD）"
// @Success 200 {object} PermitPageResponse
// @Router /api/v1/grain-intake/permits [get]
func (h *Handler) permits(c *gin.Context) {
	e, ok := actorEvent(c, "permit.list")
	if !ok {
		return
	}
	v, err := h.service.Permits(c.Request.Context(), e.Metadata.ActorID, query(c))
	respond(c, v, err)
}

// trip godoc
// @Summary 查看流转单及其化验、磅单和出门证
// @Tags 原粮流转
// @Security BearerAuth
// @Param id path int true "流转单ID"
// @Success 200 {object} DetailResponse
// @Router /api/v1/grain-intake/trips/{id} [get]
func (h *Handler) trip(c *gin.Context) { h.read(c, TripPermission) }

// ticketCandidates godoc
// @Summary 查询本趟可关联的正式磅单
// @Tags 原粮流转
// @Security BearerAuth
// @Param id path int true "流转单ID"
// @Success 200 {object} ApiEnvelope
// @Router /api/v1/grain-intake/trips/{id}/ticket-candidates [get]
func (h *Handler) ticketCandidates(c *gin.Context) {
	e, ok := actorEvent(c, "trip.ticket-candidates")
	if !ok {
		return
	}
	id, ok := key(c)
	if !ok {
		return
	}
	v, err := h.service.TicketCandidates(c.Request.Context(), e.Metadata.ActorID, id)
	respond(c, v, err)
}

// exitBasis godoc
// @Summary 门卫核验正常或拒收出厂依据
// @Tags 出门证
// @Security BearerAuth
// @Param id path int true "流转单ID"
// @Success 200 {object} DetailResponse
// @Router /api/v1/grain-intake/exit-basis/{id} [get]
func (h *Handler) exitBasis(c *gin.Context) { h.read(c, PermitPermission) }
func (h *Handler) read(c *gin.Context, scope string) {
	e, ok := actorEvent(c, "trip.detail")
	if !ok {
		return
	}
	id, ok := key(c)
	if !ok {
		return
	}
	v, err := h.service.Detail(c.Request.Context(), e.Metadata.ActorID, id, scope)
	respond(c, v, err)
}

// create godoc
// @Summary 登记本趟流转单
// @Tags 原粮流转
// @Security BearerAuth
// @Param request body Input true "厂区、车牌、粮种必填，供应商可待核实"
// @Success 200 {object} DetailResponse
// @Router /api/v1/grain-intake/trips [post]
func (h *Handler) create(c *gin.Context) { h.save(c, 0) }

// update godoc
// @Summary 更正流转单登记信息
// @Tags 原粮流转
// @Security BearerAuth
// @Param id path int true "流转单ID"
// @Param request body SaveRequest true "登记信息及版本"
// @Success 200 {object} DetailResponse
// @Router /api/v1/grain-intake/trips/{id} [put]
func (h *Handler) update(c *gin.Context) {
	id, ok := key(c)
	if ok {
		h.save(c, id)
	}
}
func (h *Handler) save(c *gin.Context, id int64) {
	e, ok := actorEvent(c, "trip.save")
	if !ok {
		return
	}
	var in SaveRequest
	if c.ShouldBindJSON(&in) != nil {
		respond(c, nil, ErrInvalid)
		return
	}
	v, err := h.service.Save(c.Request.Context(), id, in.Version, in.Input, e)
	respond(c, v, err)
}

// command godoc
// @Summary 关联化验、指定生效、确认卸粮、关联磅单及出门放行
// @Description record-visual要求流转单菜单权限；select-inspection要求化验菜单权限；approve-permit、confirm-exit要求出门证菜单权限；其他动作要求流转单菜单权限。拒收凭生效化验或目测记录出厂，无需正常出门证。
// @Tags 原粮流转
// @Security BearerAuth
// @Param id path int true "流转单ID"
// @Param action path string true "业务动作" Enums(record-visual,link-inspection,select-inspection,confirm-unloading,link-ticket,issue-permit,approve-permit,confirm-exit)
// @Param request body Command true "本趟版本及对应依据"
// @Success 200 {object} DetailResponse
// @Router /api/v1/grain-intake/trips/{id}/{action} [post]
func (h *Handler) command(c *gin.Context) {
	id, ok := key(c)
	if !ok {
		return
	}
	action := c.Param("action")
	e, ok := actorEvent(c, "trip."+action)
	if !ok {
		return
	}
	var in Command
	if c.ShouldBindJSON(&in) != nil {
		respond(c, nil, ErrInvalid)
		return
	}
	v, err := h.service.Command(c.Request.Context(), id, action, in, e)
	respond(c, v, err)
}

// rejections godoc
// @Summary 门卫查询待核验拒收车辆
// @Tags 出门证
// @Security BearerAuth
// @Param page query int false "页码"
// @Param pageSize query int false "每页条数"
// @Param keyword query string false "流转单号、车牌或供应商"
// @Param stage query string false "办理阶段"
// @Param siteCode query string false "厂区编码"
// @Param dateFrom query string false "登记开始日期（YYYY-MM-DD）"
// @Param dateTo query string false "登记结束日期（YYYY-MM-DD）"
// @Success 200 {object} TripPageResponse
// @Router /api/v1/grain-intake/rejections [get]
func (h *Handler) rejections(c *gin.Context) {
	e, ok := actorEvent(c, "trip.rejections")
	if !ok {
		return
	}
	v, err := h.service.Rejections(c.Request.Context(), e.Metadata.ActorID, query(c))
	respond(c, v, err)
}
