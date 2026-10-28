package weighbridge

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

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

type MasterResponse struct {
	Code    int            `json:"code"`
	Message string         `json:"message"`
	Data    MasterSnapshot `json:"data"`
}
type ChangeResponse struct {
	Code    int           `json:"code"`
	Message string        `json:"message"`
	Data    ChangeReceipt `json:"data"`
}

func bindStrict(c *gin.Context, target any) error {
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return ErrInvalid
	}
	return nil
}

func NewHandler(service *Service) *Handler { return &Handler{service: service} }

// RegisterRoutes registers factory synchronization endpoints. Site codes are not authentication.
func RegisterRoutes(api gin.IRouter, handler *Handler) {
	api.POST("/weighbridge/sync/changes", handler.change)
	api.GET("/weighbridge/sync/master", handler.master)
}

func RegisterManagementRoutes(authenticated gin.IRouter, handler *Handler) {
	authenticated.POST("/weighbridge/sites", handler.createSite)
	authenticated.GET("/weighbridge/sites", handler.sites)
	authenticated.PUT("/weighbridge/sites/:code", handler.updateSite)
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
// @Summary 创建厂区
// @Tags 厂云同步
// @Security BearerAuth
// @Param request body SiteInput true "厂区"
// @Success 200 {object} ApiEnvelope
// @Router /api/v1/weighbridge/sites [post]
func (h *Handler) createSite(c *gin.Context) {
	principal, ok := auth.PrincipalFromContext(c.Request.Context())
	if !ok {
		platformhttp.WriteError(c, http.StatusUnauthorized, platformhttp.CodeUnauthorized, "未登录", nil)
		return
	}
	var input SiteInput
	if err := bindStrict(c, &input); err != nil {
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
// @Description 以启用的厂区编码读取版本 2 一致性快照；编码不提供来源认证。
// @Param siteCode query string true "厂区编码"
// @Success 200 {object} MasterResponse
// @Failure 401 {object} ApiEnvelope
// @Router /api/v1/weighbridge/sync/master [get]
func (h *Handler) master(c *gin.Context) {
	snapshot, err := h.service.MasterSnapshot(c.Request.Context(), c.Query("siteCode"))
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
// @Description 版本 2，按厂区编码归属，重开使用 previousSiteCode 和 previousTicketNo 定位原单。
// @Param request body Change true "单据变化"
// @Success 200 {object} ChangeResponse
// @Failure 400 {object} ApiEnvelope
// @Failure 401 {object} ApiEnvelope
// @Failure 409 {object} ApiEnvelope
// @Router /api/v1/weighbridge/sync/changes [post]
func (h *Handler) change(c *gin.Context) {
	var input Change
	if err := bindStrict(c, &input); err != nil {
		platformhttp.WriteError(c, http.StatusBadRequest, platformhttp.CodeBadRequest, "参数错误", nil)
		return
	}
	receipt, err := h.service.ApplyChange(c.Request.Context(), input)
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
