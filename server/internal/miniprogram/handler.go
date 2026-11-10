package miniprogram

import (
	platformhttp "fenchichun.local/server/internal/platform/http"
	"github.com/gin-gonic/gin"
)

type Handler struct{ service HandlerService }

func NewHandler(service HandlerService) *Handler { return &Handler{service: service} }

// Register mounts the anonymous read-only dictionary endpoint under /api/v1.
func (h *Handler) Register(api gin.IRouter) {
	api.GET("/miniprogram/dictionaries", h.dictionaries)
}

// dictionaries godoc
// @Summary 小程序字典
// @Description 返回启用中的厂区、货品、供应商和粮仓，供微信小程序缓存使用。
// @Tags 小程序
// @Security BearerAuth
// @Success 200 {object} Dictionary
// @Router /api/v1/miniprogram/dictionaries [get]
func (h *Handler) dictionaries(c *gin.Context) {
	value, err := h.service.Dictionary(c.Request.Context())
	if err != nil {
		platformhttp.WriteError(c, 500, 500, "字典加载失败", nil)
		return
	}
	platformhttp.OK(c, value)
}
