package weighbridge

import (
	"errors"
	"net/http"

	"fenchichun.local/server/internal/auth"
	platformhttp "fenchichun.local/server/internal/platform/http"
	"github.com/gin-gonic/gin"
)

type ChangeV4Response struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    ChangeReceiptV4 `json:"data"`
}

type BatchReconcileRequest struct {
	Items []TicketRef `json:"items"`
}

// RegisterSyncV4Routes registers the digest-protocol factory endpoints. Site
// codes are not authentication; a historical code may only be read.
func RegisterSyncV4Routes(api gin.IRouter, handler *Handler) {
	api.POST("/weighbridge/sync/v4/changes", handler.applyChangeV4)
	api.GET("/weighbridge/sync/v4/changes", handler.lookupChange)
	api.GET("/weighbridge/sync/v4/tickets", handler.reconcileTicket)
	api.POST("/weighbridge/sync/v4/reconcile", handler.reconcileTickets)
}

func RegisterSyncV4ManagementRoutes(authenticated gin.IRouter, handler *Handler) {
	authenticated.GET("/weighbridge/sync/receipts/sites", handler.syncSiteReceipts)
	authenticated.GET("/weighbridge/sync/receipts/ticket", handler.syncTicketReceipt)
}

func writeSyncError(c *gin.Context, err error) {
	var syncErr *SyncError
	if !errors.As(err, &syncErr) {
		syncErr = newSyncError(SyncCategoryTemporary, "storage_unavailable", "云端暂时无法处理，请稍后重试")
	}
	status := http.StatusConflict
	switch syncErr.Category {
	case SyncCategoryTemporary:
		status = http.StatusServiceUnavailable
	case SyncCategoryConfigOrData:
		status = http.StatusBadRequest
	}
	platformhttp.WriteError(c, status, status, syncErr.Message, syncErr)
}

func writeManagementSyncError(c *gin.Context, err error) {
	if errors.Is(err, ErrForbiddenSync) {
		platformhttp.WriteError(c, http.StatusForbidden, platformhttp.CodeForbidden, err.Error(), nil)
		return
	}
	writeSyncError(c, err)
}

func syncActor(c *gin.Context) (int64, bool) {
	principal, ok := auth.PrincipalFromContext(c.Request.Context())
	if !ok {
		platformhttp.WriteError(c, http.StatusUnauthorized, platformhttp.CodeUnauthorized, "未登录", nil)
		return 0, false
	}
	return principal.UserID, true
}

// applyChangeV4 godoc
// @Summary 厂端上传摘要协议变化
// @Tags 厂云同步
// @Description 摘要协议（schemaVersion 4）：云端保存厂端计算的 SHA-256 摘要并作为变化标识，不重新计算；同一摘要重复返回原确认，旧变化不能覆盖新状态。
// @Param request body ChangeV4 true "单据变化"
// @Success 200 {object} ChangeV4Response
// @Failure 400 {object} ApiEnvelope
// @Failure 409 {object} ApiEnvelope
// @Failure 503 {object} ApiEnvelope
// @Router /api/v1/weighbridge/sync/v4/changes [post]
func (h *Handler) applyChangeV4(c *gin.Context) {
	var input ChangeV4
	if err := bindStrict(c, &input); err != nil {
		writeSyncError(c, newSyncError(SyncCategoryConfigOrData, "invalid_request", "请求不是合法的新协议变化报文"))
		return
	}
	receipt, err := h.service.ApplyChangeV4(c.Request.Context(), input)
	if err != nil {
		writeSyncError(c, err)
		return
	}
	platformhttp.OK(c, receipt)
}

// lookupChange godoc
// @Summary 厂端按摘要查询历史确认
// @Tags 厂云同步
// @Description 允许使用旧出单厂区编码只读查询已接收的历史确认，用于处理回执丢失。
// @Param siteCode query string true "出单厂区编码"
// @Param digest query string true "变化摘要"
// @Success 200 {object} ApiEnvelope
// @Failure 400 {object} ApiEnvelope
// @Router /api/v1/weighbridge/sync/v4/changes [get]
func (h *Handler) lookupChange(c *gin.Context) {
	result, err := h.service.LookupChange(c.Request.Context(), c.Query("siteCode"), c.Query("digest"))
	if err != nil {
		writeSyncError(c, err)
		return
	}
	platformhttp.OK(c, result)
}

// reconcileTicket godoc
// @Summary 厂端按单号核对云端单据
// @Tags 厂云同步
// @Description 按出单厂区编码和单号返回云端单据状态、最新摘要和历史变化确认；历史编码只读。
// @Param siteCode query string true "出单厂区编码"
// @Param ticketNo query string true "单号"
// @Success 200 {object} ApiEnvelope
// @Failure 400 {object} ApiEnvelope
// @Router /api/v1/weighbridge/sync/v4/tickets [get]
func (h *Handler) reconcileTicket(c *gin.Context) {
	result, err := h.service.ReconcileTicket(c.Request.Context(), c.Query("siteCode"), c.Query("ticketNo"))
	if err != nil {
		writeSyncError(c, err)
		return
	}
	platformhttp.OK(c, result)
}

// reconcileTickets godoc
// @Summary 厂端批量核对云端单据
// @Tags 厂云同步
// @Description 批量上限 200 条；逐项返回单据状态和最新摘要，不返回变化历史；单项配置错误在 items[].error 中返回。需要变化历史时使用单张对账接口。
// @Param request body BatchReconcileRequest true "批量对账请求"
// @Success 200 {object} ApiEnvelope
// @Failure 400 {object} ApiEnvelope
// @Router /api/v1/weighbridge/sync/v4/reconcile [post]
func (h *Handler) reconcileTickets(c *gin.Context) {
	var input BatchReconcileRequest
	if err := bindStrict(c, &input); err != nil {
		writeSyncError(c, newSyncError(SyncCategoryConfigOrData, "invalid_request", "请求不是合法的批量对账报文"))
		return
	}
	result, err := h.service.ReconcileTickets(c.Request.Context(), input.Items)
	if err != nil {
		writeSyncError(c, err)
		return
	}
	platformhttp.OK(c, result)
}

// syncSiteReceipts godoc
// @Summary 按厂区查看云端最近成功接收情况
// @Tags 厂云同步
// @Security BearerAuth
// @Description 只展示云端已成功接收的变化；不代表厂端在线、没有积压或数据完整。
// @Success 200 {object} ApiEnvelope
// @Failure 403 {object} ApiEnvelope
// @Router /api/v1/weighbridge/sync/receipts/sites [get]
func (h *Handler) syncSiteReceipts(c *gin.Context) {
	actorID, ok := syncActor(c)
	if !ok {
		return
	}
	result, err := h.service.SiteReceipts(c.Request.Context(), actorID)
	if err != nil {
		writeManagementSyncError(c, err)
		return
	}
	platformhttp.OK(c, result)
}

// syncTicketReceipt godoc
// @Summary 按单据查看云端已保存变化
// @Tags 厂云同步
// @Security BearerAuth
// @Description 返回云端单据快照、最新摘要、历史变化确认及原单与重开单关联，供有权限的管理员核对差异。
// @Param siteCode query string true "出单厂区编码"
// @Param ticketNo query string true "单号"
// @Success 200 {object} ApiEnvelope
// @Failure 403 {object} ApiEnvelope
// @Router /api/v1/weighbridge/sync/receipts/ticket [get]
func (h *Handler) syncTicketReceipt(c *gin.Context) {
	actorID, ok := syncActor(c)
	if !ok {
		return
	}
	result, err := h.service.TicketReceipt(c.Request.Context(), actorID, c.Query("siteCode"), c.Query("ticketNo"))
	if err != nil {
		writeManagementSyncError(c, err)
		return
	}
	platformhttp.OK(c, result)
}
