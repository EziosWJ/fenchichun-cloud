package grainoutbound

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"fenchichun.local/server/internal/auth"
	platformhttp "fenchichun.local/server/internal/platform/http"

	"github.com/gin-gonic/gin"
	qrcode "github.com/skip2/go-qrcode"
	"gorm.io/gorm"
)

type Handler struct {
	repo  *Repository
	scale *ScaleClient
}

func NewHandler(db *gorm.DB) *Handler {
	return &Handler{repo: NewRepository(db), scale: NewScaleClient()}
}

// Register exposes the authenticated mobile endpoints.
func (h *Handler) Register(router gin.IRouter) {
	group := router.Group("/grain-outbound")
	group.GET("/me", h.me)
	group.GET("/current", h.current)
	group.GET("/weight", h.weight)
	group.GET("/weighings", h.history)
	group.POST("/weighings/first-qr", h.firstQR)
	group.POST("/weighings/second-qr", h.secondQR)
	group.DELETE("/weighings/pending", h.cancel)
}

// RegisterFactory exposes the token-authenticated handoff endpoints used by the
// factory scanner. They are intentionally outside the mobile user session:
// the one-time token plus site/scale is the handoff proof.
func (h *Handler) RegisterFactory(router gin.IRouter) {
	group := router.Group("/grain-outbound/handoffs")
	group.POST("/claim", h.claim)
	group.POST("/result", h.result)
	group.POST("/terminate", h.terminate)
	group.GET("/qr", h.qrImage)
}

// qrImage renders the same one-time handoff value as a PNG so the mini program
// does not depend on a canvas QR component. The value is already a one-time
// secret token; the image endpoint is intentionally public for the phone image
// request.
func (h *Handler) qrImage(c *gin.Context) {
	value := strings.TrimSpace(c.Query("value"))
	if value == "" || len(value) > 512 {
		platformhttp.WriteError(c, http.StatusBadRequest, platformhttp.CodeBadRequest, "二维码内容无效", nil)
		return
	}
	png, err := qrcode.Encode(value, qrcode.Medium, 512)
	if err != nil {
		platformhttp.WriteError(c, http.StatusInternalServerError, platformhttp.CodeInternalError, "生成二维码失败", nil)
		return
	}
	c.Header("Cache-Control", "no-store")
	c.Data(http.StatusOK, "image/png", png)
}

func (h *Handler) me(c *gin.Context) {
	account, ok := h.account(c)
	if !ok {
		return
	}
	current, err := h.repo.Current(c.Request.Context(), account.UserID)
	if err != nil {
		platformhttp.WriteError(c, http.StatusInternalServerError, platformhttp.CodeInternalError, "读取过磅状态失败", nil)
		return
	}
	markExpiredMessage(current)
	platformhttp.OK(c, Profile{Account: account, Current: current})
}

func (h *Handler) current(c *gin.Context) {
	account, ok := h.account(c)
	if !ok {
		return
	}
	current, err := h.repo.Current(c.Request.Context(), account.UserID)
	if err != nil {
		platformhttp.WriteError(c, http.StatusInternalServerError, platformhttp.CodeInternalError, "读取过磅状态失败", nil)
		return
	}
	markExpiredMessage(current)
	platformhttp.OK(c, gin.H{"current": current})
}

func (h *Handler) weight(c *gin.Context) {
	account, ok := h.account(c)
	if !ok {
		return
	}
	current, err := h.repo.Current(c.Request.Context(), account.UserID)
	if err != nil {
		platformhttp.WriteError(c, http.StatusInternalServerError, platformhttp.CodeInternalError, "读取过磅状态失败", nil)
		return
	}
	stage := "first"
	if current != nil && (current.Status == statusFirstRecorded || current.Status == statusSecondQRReady || current.Status == statusSecondScanning) {
		stage = "second"
	}
	reading, _ := h.scale.Read(c.Request.Context(), account.ScaleCode, stage)
	platformhttp.OK(c, reading)
}

func (h *Handler) history(c *gin.Context) {
	account, ok := h.account(c)
	if !ok {
		return
	}
	records, err := h.repo.History(c.Request.Context(), account.UserID)
	if err != nil {
		platformhttp.WriteError(c, http.StatusInternalServerError, platformhttp.CodeInternalError, "读取过磅历史失败", nil)
		return
	}
	platformhttp.OK(c, HistoryPage{Records: records})
}

func (h *Handler) firstQR(c *gin.Context) {
	account, ok := h.account(c)
	if !ok {
		return
	}
	reading, _ := h.scale.Read(c.Request.Context(), account.ScaleCode, "first")
	if !reading.Available {
		platformhttp.WriteError(c, http.StatusConflict, http.StatusConflict, reading.Message, nil)
		return
	}
	current, err := h.repo.CreateFirstQR(c.Request.Context(), account, reading.WeightMilliTonne, time.Now())
	if err != nil {
		writeWeighingError(c, err)
		return
	}
	platformhttp.OK(c, current)
}

func (h *Handler) secondQR(c *gin.Context) {
	account, ok := h.account(c)
	if !ok {
		return
	}
	reading, _ := h.scale.Read(c.Request.Context(), account.ScaleCode, "second")
	if !reading.Available {
		platformhttp.WriteError(c, http.StatusConflict, http.StatusConflict, reading.Message, nil)
		return
	}
	current, err := h.repo.CreateSecondQR(c.Request.Context(), account, reading.WeightMilliTonne, time.Now())
	if err != nil {
		writeWeighingError(c, err)
		return
	}
	platformhttp.OK(c, current)
}

func (h *Handler) cancel(c *gin.Context) {
	account, ok := h.account(c)
	if !ok {
		return
	}
	if err := h.repo.Cancel(c.Request.Context(), account.UserID); err != nil {
		writeWeighingError(c, err)
		return
	}
	platformhttp.OK(c, nil)
}

func (h *Handler) claim(c *gin.Context) {
	var in ClaimRequest
	if c.ShouldBindJSON(&in) != nil || in.Token == "" || in.SiteCode == "" || in.ScaleCode == "" {
		platformhttp.WriteError(c, http.StatusBadRequest, platformhttp.CodeBadRequest, "扫码参数错误", nil)
		return
	}
	result, err := h.repo.Claim(c.Request.Context(), in.Token, in.SiteCode, in.ScaleCode)
	if err != nil {
		writeHandoffError(c, err)
		return
	}
	platformhttp.OK(c, result)
}

func (h *Handler) result(c *gin.Context) {
	var in ResultRequest
	if c.ShouldBindJSON(&in) != nil || in.Token == "" || in.SiteCode == "" || in.ScaleCode == "" || in.Action == "" || in.Status == "" {
		platformhttp.WriteError(c, http.StatusBadRequest, platformhttp.CodeBadRequest, "扫码结果参数错误", nil)
		return
	}
	if err := h.repo.Result(c.Request.Context(), in); err != nil {
		writeHandoffError(c, err)
		return
	}
	platformhttp.OK(c, nil)
}

func (h *Handler) terminate(c *gin.Context) {
	var in TerminateRequest
	if c.ShouldBindJSON(&in) != nil || in.SiteCode == "" || in.FactoryTaskNo == "" {
		platformhttp.WriteError(c, http.StatusBadRequest, platformhttp.CodeBadRequest, "终止参数错误", nil)
		return
	}
	if err := h.repo.TerminateByTask(c.Request.Context(), in.SiteCode, in.FactoryTaskNo, in.Reason); err != nil {
		writeHandoffError(c, err)
		return
	}
	platformhttp.OK(c, nil)
}

func (h *Handler) account(c *gin.Context) (Account, bool) {
	principal, ok := auth.PrincipalFromContext(c.Request.Context())
	if !ok {
		platformhttp.WriteError(c, http.StatusUnauthorized, platformhttp.CodeUnauthorized, "未登录", nil)
		return Account{}, false
	}
	hasRole, err := h.repo.HasRole(c.Request.Context(), principal.UserID, outboundRoleCode)
	if err != nil {
		platformhttp.WriteError(c, http.StatusInternalServerError, platformhttp.CodeInternalError, "校验权限失败", nil)
		return Account{}, false
	}
	if !hasRole {
		platformhttp.WriteError(c, http.StatusForbidden, platformhttp.CodeForbidden, ErrForbidden.Error(), nil)
		return Account{}, false
	}
	account, err := h.repo.Account(c.Request.Context(), principal.UserID)
	if err != nil {
		platformhttp.WriteError(c, http.StatusForbidden, platformhttp.CodeForbidden, ErrNoAccount.Error(), nil)
		return Account{}, false
	}
	return account, true
}

func writeWeighingError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrActive):
		platformhttp.WriteError(c, http.StatusConflict, http.StatusConflict, ErrActive.Error(), nil)
	case errors.Is(err, ErrNoFirst):
		platformhttp.WriteError(c, http.StatusConflict, http.StatusConflict, ErrNoFirst.Error(), nil)
	case errors.Is(err, ErrWeight):
		platformhttp.WriteError(c, http.StatusBadRequest, platformhttp.CodeBadRequest, ErrWeight.Error(), nil)
	case errors.Is(err, ErrExpired):
		platformhttp.WriteError(c, http.StatusConflict, http.StatusConflict, ErrExpired.Error(), nil)
	case errors.Is(err, ErrTerminated):
		platformhttp.WriteError(c, http.StatusConflict, http.StatusConflict, ErrTerminated.Error(), nil)
	case errors.Is(err, ErrConflict):
		platformhttp.WriteError(c, http.StatusConflict, http.StatusConflict, ErrConflict.Error(), nil)
	default:
		platformhttp.WriteError(c, http.StatusInternalServerError, platformhttp.CodeInternalError, "过磅操作失败", nil)
	}
}

func writeHandoffError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrHandoff):
		platformhttp.WriteError(c, http.StatusConflict, http.StatusConflict, ErrHandoff.Error(), nil)
	case errors.Is(err, ErrConflict):
		platformhttp.WriteError(c, http.StatusConflict, http.StatusConflict, ErrConflict.Error(), nil)
	case errors.Is(err, ErrWeight):
		platformhttp.WriteError(c, http.StatusBadRequest, platformhttp.CodeBadRequest, ErrWeight.Error(), nil)
	default:
		platformhttp.WriteError(c, http.StatusInternalServerError, platformhttp.CodeInternalError, "厂端扫码处理失败", nil)
	}
}

func markExpiredMessage(current *Weighing) {
	if current == nil || current.ExpiresAt == nil || current.Message != "" {
		return
	}
	if current.Status != statusFirstRecorded && current.Status != statusSecondQRReady && current.Status != statusSecondScanning {
		return
	}
	if current.ExpiresAt.Before(time.Now()) {
		current.Message = ErrExpired.Error()
	}
}
