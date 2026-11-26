package grainoutbound

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"fenchichun.local/server/internal/auth"
	platformhttp "fenchichun.local/server/internal/platform/http"
	"fenchichun.local/server/internal/weighbridge"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Handler struct {
	repo  *Repository
	scale *ScaleClient
	weigh *weighbridge.Service
}

func NewHandler(db *gorm.DB, weigh *weighbridge.Service) *Handler {
	return &Handler{repo: NewRepository(db), scale: NewScaleClient(), weigh: weigh}
}

func (h *Handler) Register(router gin.IRouter) {
	group := router.Group("/grain-outbound")
	group.GET("/me", h.me)
	group.GET("/weight", h.weight)
	group.POST("/weighings/first", h.first)
	group.POST("/weighings/second", h.second)
	group.DELETE("/weighings/pending", h.cancel)
}

func (h *Handler) me(c *gin.Context) {
	account, ok := h.account(c)
	if !ok {
		return
	}
	pending, err := h.repo.Pending(c.Request.Context(), account.UserID)
	if err != nil {
		platformhttp.WriteError(c, http.StatusInternalServerError, platformhttp.CodeInternalError, "读取过磅状态失败", nil)
		return
	}
	platformhttp.OK(c, Profile{Account: account, Pending: pending})
}

func (h *Handler) weight(c *gin.Context) {
	account, ok := h.account(c)
	if !ok {
		return
	}
	pending, err := h.repo.Pending(c.Request.Context(), account.UserID)
	if err != nil {
		platformhttp.WriteError(c, http.StatusInternalServerError, platformhttp.CodeInternalError, "读取过磅状态失败", nil)
		return
	}
	stage := "first"
	if pending != nil {
		stage = "second"
	}
	reading, _ := h.scale.Read(c.Request.Context(), account.ScaleCode, stage)
	platformhttp.OK(c, reading)
}

func (h *Handler) first(c *gin.Context) {
	account, ok := h.account(c)
	if !ok {
		return
	}
	ctx := c.Request.Context()
	pending, err := h.repo.Pending(ctx, account.UserID)
	if err != nil {
		platformhttp.WriteError(c, http.StatusInternalServerError, platformhttp.CodeInternalError, "读取过磅状态失败", nil)
		return
	}
	if pending != nil {
		platformhttp.WriteError(c, http.StatusConflict, http.StatusConflict, "已有未完的首磅，请先回磅或取消", nil)
		return
	}
	reading, _ := h.scale.Read(ctx, account.ScaleCode, "first")
	if !reading.Available {
		platformhttp.WriteError(c, http.StatusConflict, http.StatusConflict, reading.Message, nil)
		return
	}
	created, err := h.repo.CreatePending(ctx, account.UserID, account, reading.WeightMilliTonne, time.Now())
	if err != nil {
		platformhttp.WriteError(c, http.StatusConflict, http.StatusConflict, "首磅保存失败，请刷新后重试", nil)
		return
	}
	platformhttp.OK(c, gin.H{"weight": reading, "pending": created})
}

func (h *Handler) second(c *gin.Context) {
	account, ok := h.account(c)
	if !ok {
		return
	}
	ctx := c.Request.Context()
	pending, err := h.repo.Pending(ctx, account.UserID)
	if err != nil {
		platformhttp.WriteError(c, http.StatusInternalServerError, platformhttp.CodeInternalError, "读取过磅状态失败", nil)
		return
	}
	if pending == nil {
		platformhttp.WriteError(c, http.StatusConflict, http.StatusConflict, "请先完成首磅", nil)
		return
	}
	reading, _ := h.scale.Read(ctx, account.ScaleCode, "second")
	if !reading.Available {
		platformhttp.WriteError(c, http.StatusConflict, http.StatusConflict, reading.Message, nil)
		return
	}
	if reading.WeightMilliTonne >= pending.FirstWeightMilliTonne {
		platformhttp.WriteError(c, http.StatusBadRequest, platformhttp.CodeBadRequest, "回磅重量必须小于首磅重量", nil)
		return
	}
	net := pending.FirstWeightMilliTonne - reading.WeightMilliTonne
	now := time.Now()
	ticketNo, err := h.repo.NextTicketNo(ctx, account.SiteCode, now)
	if err != nil {
		platformhttp.WriteError(c, http.StatusInternalServerError, platformhttp.CodeInternalError, "生成磅单号失败", nil)
		return
	}
	if err := h.createTicket(ctx, account, pending, reading, ticketNo, net, now); err != nil {
		code := http.StatusInternalServerError
		message := "生成云平台过磅单失败"
		switch {
		case errors.Is(err, weighbridge.ErrInvalid):
			code, message = http.StatusBadRequest, "过磅数据无效，请重试"
		case errors.Is(err, weighbridge.ErrConflict):
			code, message = http.StatusConflict, "磅单冲突，请刷新后重试"
		case errors.Is(err, weighbridge.ErrUnauthorized):
			code, message = http.StatusBadRequest, "出库站点无效，请联系管理员"
		}
		platformhttp.WriteError(c, code, code, message, nil)
		return
	}
	if err := h.repo.CompletePending(ctx, pending.ID, ticketNo, reading.WeightMilliTonne, now); err != nil {
		platformhttp.WriteError(c, http.StatusInternalServerError, platformhttp.CodeInternalError, "更新过磅状态失败", nil)
		return
	}
	platformhttp.OK(c, TicketResult{
		TicketNo:               ticketNo,
		FirstWeightMilliTonne:  pending.FirstWeightMilliTonne,
		SecondWeightMilliTonne: reading.WeightMilliTonne,
		NetMilliTonne:          net,
		IssuedAt:               now,
		Mock:                   reading.Mock,
	})
}

func (h *Handler) cancel(c *gin.Context) {
	account, ok := h.account(c)
	if !ok {
		return
	}
	if err := h.repo.CancelPending(c.Request.Context(), account.UserID); err != nil {
		platformhttp.WriteError(c, http.StatusInternalServerError, platformhttp.CodeInternalError, "取消失败", nil)
		return
	}
	platformhttp.OK(c, nil)
}

func (h *Handler) createTicket(ctx context.Context, account Account, pending *PendingWeighing, reading ScaleReading, ticketNo string, net int64, now time.Time) error {
	materialName, materialSpec, err := h.repo.Distiller(ctx)
	if err != nil {
		return err
	}
	issuer, err := h.repo.UserName(ctx, account.UserID)
	if err != nil {
		return err
	}
	first := formatTonnes(pending.FirstWeightMilliTonne)
	second := formatTonnes(reading.WeightMilliTonne)
	change := weighbridge.Change{
		SchemaVersion: 2,
		ChangeID:      "mobile-" + ticketNo,
		SiteCode:      account.SiteCode,
		TicketNo:      ticketNo,
		Type:          "issue",
		Ticket: &weighbridge.TicketSnapshot{
			TicketNo:          ticketNo,
			Title:             "酒糟出库过磅单",
			Plate:             account.Plate,
			Direction:         "outbound",
			MaterialCode:      distillerCode,
			MaterialName:      materialName,
			MaterialSpec:      materialSpec,
			PartyCode:         account.PartyCode,
			PartyName:         account.PartyName,
			FirstConfirmedAt:  pending.FirstAt,
			SecondConfirmedAt: now,
			IssuedAt:          now,
			IssuerName:        issuer,
			OriginalGross:     first,
			OriginalTare:      second,
			FinalGross:        first,
			FinalTare:         second,
			GrossSource:       "mobile",
			TareSource:        "mobile",
		},
	}
	_, err = h.weigh.ApplyChange(ctx, change)
	return err
}

func formatTonnes(milliTonne int64) string {
	return fmt.Sprintf("%d.%03d", milliTonne/1000, milliTonne%1000)
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
		status := http.StatusForbidden
		platformhttp.WriteError(c, status, platformhttp.CodeForbidden, ErrNoAccount.Error(), nil)
		return Account{}, false
	}
	return account, true
}
