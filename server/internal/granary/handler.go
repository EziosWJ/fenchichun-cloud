package granary

import (
	"errors"
	"fenchichun.local/server/internal/auth"
	platformhttp "fenchichun.local/server/internal/platform/http"
	"github.com/gin-gonic/gin"
	"strconv"
)

type Handler struct{ service *Service }

func NewHandler(s *Service) *Handler { return &Handler{service: s} }

func (h *Handler) Register(api gin.IRouter) {
	g := api.Group("/granaries")
	g.GET("", h.list)
	g.POST("", h.create)
	g.PUT("/:id", h.update)
	g.DELETE("/:id", h.remove)
}

func respond(c *gin.Context, value any, err error) {
	if err == nil {
		platformhttp.OK(c, value)
		return
	}
	status, message := 500, "粮仓操作失败"
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

func actor(c *gin.Context) (int64, bool) {
	p, ok := auth.PrincipalFromContext(c.Request.Context())
	if !ok {
		platformhttp.WriteError(c, 401, 401, "未登录", nil)
		return 0, false
	}
	return p.UserID, true
}

func key(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		respond(c, nil, ErrInvalid)
		return 0, false
	}
	return id, true
}

// list godoc
// @Summary 查询粮仓
// @Tags 粮仓
// @Security BearerAuth
// @Param enabled query boolean false "仅启用"
// @Success 200 {array} Granary
// @Router /api/v1/granaries [get]
func (h *Handler) list(c *gin.Context) {
	uid, ok := actor(c)
	if !ok {
		return
	}
	value, err := h.service.List(c.Request.Context(), uid, c.Query("enabled") == "true")
	respond(c, value, err)
}

// create godoc
// @Summary 新增粮仓
// @Tags 粮仓
// @Security BearerAuth
// @Router /api/v1/granaries [post]
func (h *Handler) create(c *gin.Context) {
	uid, ok := actor(c)
	if !ok {
		return
	}
	var in Input
	if err := c.ShouldBindJSON(&in); err != nil {
		respond(c, nil, ErrInvalid)
		return
	}
	value, err := h.service.Create(c.Request.Context(), uid, in)
	respond(c, value, err)
}

// update godoc
// @Summary 修改粮仓
// @Tags 粮仓
// @Security BearerAuth
// @Router /api/v1/granaries/{id} [put]
func (h *Handler) update(c *gin.Context) {
	uid, ok := actor(c)
	if !ok {
		return
	}
	id, ok := key(c)
	if !ok {
		return
	}
	var in Input
	if err := c.ShouldBindJSON(&in); err != nil {
		respond(c, nil, ErrInvalid)
		return
	}
	value, err := h.service.Update(c.Request.Context(), uid, id, in)
	respond(c, value, err)
}

// remove godoc
// @Summary 删除粮仓
// @Tags 粮仓
// @Security BearerAuth
// @Router /api/v1/granaries/{id} [delete]
func (h *Handler) remove(c *gin.Context) {
	uid, ok := actor(c)
	if !ok {
		return
	}
	id, ok := key(c)
	if !ok {
		return
	}
	respond(c, gin.H{"id": id}, h.service.Delete(c.Request.Context(), uid, id))
}
