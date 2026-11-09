package weighbridge

import (
	platformhttp "fenchichun.local/server/internal/platform/http"
	"github.com/gin-gonic/gin"
)

type ChangeV5Response struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    ChangeReceiptV5 `json:"data"`
}

// RegisterSyncV5Routes registers the multi-item net adjustment endpoints. They
// keep the version 4 request envelope and reuse the same storage, deduplication
// and predecessor rules. Historical site codes remain read-only.
func RegisterSyncV5Routes(api gin.IRouter, handler *Handler) {
	api.POST("/weighbridge/sync/v5/changes", handler.applyChangeV5)
	api.GET("/weighbridge/sync/v5/changes", handler.lookupChange)
	api.GET("/weighbridge/sync/v5/tickets", handler.reconcileTicket)
	api.POST("/weighbridge/sync/v5/reconcile", handler.reconcileTickets)
}

// applyChangeV5 godoc
// @Summary 厂端上传多项净重调整变化
// @Tags 厂云同步
// @Description 摘要协议（schemaVersion 5 / digestVersion 3）：保存厂端计算的 SHA-256 摘要及完整 netAdjustments 明细，不重新计算摘要；校验逐项、比例折算、调整合计与最终净重。重复摘要返回原确认。
// @Param request body ChangeV5 true "单据变化"
// @Success 200 {object} ChangeV5Response
// @Failure 400 {object} ApiEnvelope
// @Failure 409 {object} ApiEnvelope
// @Failure 413 {object} ApiEnvelope
// @Failure 503 {object} ApiEnvelope
// @Router /api/v1/weighbridge/sync/v5/changes [post]
func (h *Handler) applyChangeV5(c *gin.Context) {
	var input ChangeV5
	if !bindSyncRequest(c, &input) {
		return
	}
	receipt, err := h.service.ApplyChangeV5(c.Request.Context(), input)
	if err != nil {
		writeSyncError(c, err)
		return
	}
	platformhttp.OK(c, receipt)
}
