package weighbridge

import (
	"errors"
	"net/http"
	"strings"

	"fenchichun.local/server/internal/audit"
	"fenchichun.local/server/internal/auth"
	platformhttp "fenchichun.local/server/internal/platform/http"
	"github.com/gin-gonic/gin"
)

type Handler struct{ service *Service }

type ApiEnvelope struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data"`
}

func NewHandler(service *Service) *Handler { return &Handler{service: service} }

// RegisterRoutes registers machine-only endpoints; authentication is performed
// using the site credential and is independent of interactive user sessions.
func RegisterRoutes(api gin.IRouter, handler *Handler) {
	api.POST("/weighbridge/sync/changes", handler.change)
	api.GET("/weighbridge/sync/master", handler.master)
}

func RegisterManagementRoutes(authenticated gin.IRouter, handler *Handler) {
	authenticated.POST("/weighbridge/sites", handler.createSite)
	authenticated.GET("/weighbridge/sites", handler.sites)
	authenticated.PUT("/weighbridge/sites/:code/scales/:scaleCode", handler.updateSite)
	authenticated.POST("/weighbridge/sites/:code/credential", handler.rotateCredential)
	authenticated.GET("/weighbridge/sites/:code/credential", handler.getCredential)
	authenticated.GET("/weighbridge/tickets", handler.ticketPage)
	authenticated.GET("/weighbridge/ticket-totals", handler.ticketTotals)
	master := authenticated.Group("/weighbridge/master")
	master.GET("/categories", handler.categories)
	master.POST("/categories", handler.saveCategory)
	master.PUT("/categories/:code", handler.saveCategory)
	master.GET("/materials", handler.materials)
	master.POST("/materials", handler.saveMaterial)
	master.PUT("/materials/:code", handler.saveMaterial)
	master.GET("/parties", handler.parties)
	master.POST("/parties", handler.saveParty)
	master.PUT("/parties/:code", handler.saveParty)
}

// createSite godoc
// @Summary 创建厂区和初始厂端凭据
// @Tags 厂云同步
// @Security BearerAuth
// @Param request body SiteInput true "厂区及地磅"
// @Success 200 {object} ApiEnvelope
// @Router /api/v1/weighbridge/sites [post]
func (h *Handler) createSite(c *gin.Context) {
	principal, ok := auth.PrincipalFromContext(c.Request.Context())
	if !ok {
		platformhttp.WriteError(c, http.StatusUnauthorized, platformhttp.CodeUnauthorized, "未登录", nil)
		return
	}
	var input SiteInput
	if err := c.ShouldBindJSON(&input); err != nil {
		platformhttp.WriteError(c, http.StatusBadRequest, platformhttp.CodeBadRequest, "参数错误", nil)
		return
	}
	meta, _ := platformhttp.RequestMetaFromContext(c.Request.Context())
	event := audit.Event{Action: "weighbridge.site.create", Resource: "weighbridge-site", Metadata: audit.Metadata{ActorID: principal.UserID, RequestID: meta.RequestID, ClientIP: meta.ClientIP, UserAgent: meta.UserAgent, RequestMethod: c.Request.Method, RequestURL: c.Request.URL.Path}}
	result, err := h.service.CreateSite(c.Request.Context(), input, event)
	switch {
	case err == nil:
		platformhttp.OK(c, result)
	case errors.Is(err, ErrForbidden):
		platformhttp.WriteError(c, http.StatusForbidden, platformhttp.CodeForbidden, err.Error(), nil)
	case errors.Is(err, ErrInvalid):
		platformhttp.WriteError(c, http.StatusBadRequest, platformhttp.CodeBadRequest, err.Error(), nil)
	case errors.Is(err, ErrConflict):
		platformhttp.WriteError(c, http.StatusConflict, http.StatusConflict, err.Error(), nil)
	default:
		platformhttp.WriteError(c, http.StatusInternalServerError, platformhttp.CodeInternalError, "厂区创建失败", nil)
	}
}

// master godoc
// @Summary 厂端读取完整基础资料
// @Tags 厂云同步
// @Security BearerAuth
// @Success 200 {object} ApiEnvelope
// @Router /api/v1/weighbridge/sync/master [get]
func (h *Handler) master(c *gin.Context) {
	parts := strings.Fields(c.GetHeader("Authorization"))
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || parts[1] == "" {
		platformhttp.WriteError(c, http.StatusUnauthorized, platformhttp.CodeUnauthorized, "厂端身份无效", nil)
		return
	}
	snapshot, err := h.service.MasterSnapshot(c.Request.Context(), parts[1])
	if errors.Is(err, ErrUnauthorized) {
		platformhttp.WriteError(c, http.StatusUnauthorized, platformhttp.CodeUnauthorized, err.Error(), nil)
		return
	}
	if err != nil {
		platformhttp.WriteError(c, http.StatusInternalServerError, platformhttp.CodeInternalError, "同步失败", nil)
		return
	}
	platformhttp.OK(c, snapshot)
}

// change godoc
// @Summary 厂端上传过磅单变化
// @Tags 厂云同步
// @Security BearerAuth
// @Param request body Change true "单据变化"
// @Success 200 {object} ApiEnvelope
// @Router /api/v1/weighbridge/sync/changes [post]
func (h *Handler) change(c *gin.Context) {
	parts := strings.Fields(c.GetHeader("Authorization"))
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || parts[1] == "" {
		platformhttp.WriteError(c, http.StatusUnauthorized, platformhttp.CodeUnauthorized, "厂端身份无效", nil)
		return
	}
	var input Change
	if err := c.ShouldBindJSON(&input); err != nil {
		platformhttp.WriteError(c, http.StatusBadRequest, platformhttp.CodeBadRequest, "参数错误", nil)
		return
	}
	receipt, err := h.service.ApplyChange(c.Request.Context(), parts[1], input)
	switch {
	case err == nil:
		platformhttp.OK(c, receipt)
	case errors.Is(err, ErrUnauthorized):
		platformhttp.WriteError(c, http.StatusUnauthorized, platformhttp.CodeUnauthorized, err.Error(), nil)
	case errors.Is(err, ErrInvalid):
		platformhttp.WriteError(c, http.StatusBadRequest, platformhttp.CodeBadRequest, err.Error(), nil)
	case errors.Is(err, ErrConflict):
		platformhttp.WriteError(c, http.StatusConflict, http.StatusConflict, err.Error(), nil)
	default:
		platformhttp.WriteError(c, http.StatusInternalServerError, platformhttp.CodeInternalError, "同步失败", nil)
	}
}
