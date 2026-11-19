package weighbridge

import (
	"errors"
	"net/http"
	"strconv"

	platformhttp "fenchichun.local/server/internal/platform/http"
	"github.com/gin-gonic/gin"
)

func (h *Handler) registerTemporaryParty(c *gin.Context) {
	var in TemporaryPartyInput
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 8192)
	if bindStrict(c, &in) != nil {
		platformhttp.WriteError(c, 400, 400, "临时主体登记参数无效", gin.H{"kind": "invalid"})
		return
	}
	receipt, err := h.service.RegisterTemporaryParty(c.Request.Context(), in)
	switch {
	case err == nil:
		platformhttp.OK(c, receipt)
	case errors.Is(err, ErrUnauthorized):
		platformhttp.WriteError(c, 401, 401, "厂区编码无效或已停用", gin.H{"kind": "invalid_site"})
	case errors.Is(err, ErrInvalid):
		platformhttp.WriteError(c, 400, 400, "临时主体登记参数无效", gin.H{"kind": "invalid"})
	case errors.Is(err, errTemporaryPartyVersion):
		platformhttp.WriteError(c, 409, 409, err.Error(), gin.H{"kind": "version_conflict"})
	case errors.Is(err, errTemporaryPartyFinal):
		platformhttp.WriteError(c, 409, 409, err.Error(), gin.H{"kind": "finalized"})
	default:
		platformhttp.WriteError(c, 500, 500, "临时主体登记失败，请稍后重试", gin.H{"kind": "temporary"})
	}
}

func (h *Handler) temporaryParties(c *gin.Context) {
	event, ok := managementEvent(c, "temporary-party.list")
	if !ok {
		return
	}
	rows, err := h.service.TemporaryParties(c.Request.Context(), event.Metadata.ActorID)
	temporaryPartyManagementResult(c, rows, err)
}

func (h *Handler) decideTemporaryParty(c *gin.Context) {
	event, ok := managementEvent(c, "temporary-party.decide")
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	var in TemporaryPartyDecision
	if err != nil || bindStrict(c, &in) != nil {
		managementResult(c, nil, ErrInvalid)
		return
	}
	temporaryPartyManagementResult(c, nil, h.service.DecideTemporaryParty(c.Request.Context(), id, in, event))
}

func temporaryPartyManagementResult(c *gin.Context, value any, err error) {
	if errors.Is(err, errTemporaryPartyDenied) {
		platformhttp.WriteError(c, 403, 403, err.Error(), nil)
		return
	}
	managementResult(c, value, err)
}
