package weighbridge

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"strconv"
	"strings"
	"time"

	"fenchichun.local/server/internal/auth"
	platformhttp "fenchichun.local/server/internal/platform/http"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type TaskTermination struct {
	At     time.Time `json:"at"`
	Actor  string    `json:"actor"`
	Reason string    `json:"reason"`
}
type TaskTicket struct {
	SiteCode string `json:"siteCode"`
	TicketNo string `json:"ticketNo"`
}
type TaskItem struct {
	TaskNo         string           `json:"taskNo"`
	Version        int64            `json:"version"`
	Status         string           `json:"status"`
	Plate          string           `json:"plate"`
	Direction      string           `json:"direction"`
	MaterialCode   string           `json:"materialCode"`
	MaterialName   string           `json:"materialName"`
	PartyCode      string           `json:"partyCode"`
	PartyName      string           `json:"partyName"`
	FirstWeighedAt time.Time        `json:"firstWeighedAt"`
	Termination    *TaskTermination `json:"termination"`
	Ticket         *TaskTicket      `json:"ticket"`
}
type TaskBatch struct {
	SchemaVersion int        `json:"schemaVersion"`
	SiteCode      string     `json:"siteCode"`
	Items         []TaskItem `json:"items"`
}
type taskRow struct {
	SiteCode       string
	TaskNo         string
	Version        int64
	Status         string
	FirstWeighedAt time.Time
	TicketSiteCode *string
	TicketNo       *string
	Snapshot       string
}

func (taskRow) TableName() string { return "wb_cloud_task" }
func (b TaskBatch) validate() error {
	if b.SchemaVersion != 1 || !identityCode.MatchString(b.SiteCode) || b.Items == nil || len(b.Items) > 200 {
		return ErrInvalid
	}
	seen := map[string]bool{}
	for _, t := range b.Items {
		if strings.TrimSpace(t.TaskNo) == "" || len(t.TaskNo) > 200 || seen[t.TaskNo] || t.Version < 1 || strings.TrimSpace(t.Plate) == "" || (t.Direction != "inbound" && t.Direction != "outbound") || strings.TrimSpace(t.MaterialCode) == "" || strings.TrimSpace(t.MaterialName) == "" || strings.TrimSpace(t.PartyCode) == "" || strings.TrimSpace(t.PartyName) == "" || t.FirstWeighedAt.IsZero() {
			return ErrInvalid
		}
		seen[t.TaskNo] = true
		switch t.Status {
		case "awaiting_second":
			if t.Termination != nil || t.Ticket != nil {
				return ErrInvalid
			}
		case "terminated":
			if t.Ticket != nil || t.Termination == nil || t.Termination.At.IsZero() || strings.TrimSpace(t.Termination.Actor) == "" || strings.TrimSpace(t.Termination.Reason) == "" {
				return ErrInvalid
			}
		case "completed":
			if t.Termination != nil || t.Ticket == nil || !identityCode.MatchString(t.Ticket.SiteCode) || strings.TrimSpace(t.Ticket.TicketNo) == "" || len(t.Ticket.TicketNo) > 200 {
				return ErrInvalid
			}
		default:
			return ErrInvalid
		}
	}
	return nil
}

type TaskVersion struct {
	TaskNo  string `json:"taskNo"`
	Version int64  `json:"version"`
}
type TaskReceipt struct {
	SchemaVersion int           `json:"schemaVersion"`
	SiteCode      string        `json:"siteCode"`
	ReceivedAt    time.Time     `json:"receivedAt"`
	Items         []TaskVersion `json:"items"`
}

func (r *Repository) ReceiveTasks(ctx context.Context, b TaskBatch) (TaskReceipt, error) {
	out := TaskReceipt{1, b.SiteCode, time.Now().UTC(), []TaskVersion{}}
	if err := b.validate(); err != nil {
		return out, err
	}
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var s site
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("code = ? AND enabled = ?", b.SiteCode, true).Take(&s).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrUnauthorized
		}
		if err != nil {
			return err
		}
		for _, item := range b.Items {
			data, err := json.Marshal(item)
			if err != nil {
				return err
			}
			var old taskRow
			err = tx.Where("site_code = ? AND task_no = ?", b.SiteCode, item.TaskNo).Take(&old).Error
			if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			if err == nil && item.Version <= old.Version {
				if item.Version == old.Version {
					var prev TaskItem
					if json.Unmarshal([]byte(old.Snapshot), &prev) != nil {
						return ErrConflict
					}
					a, _ := json.Marshal(prev)
					if string(a) != string(data) {
						return ErrConflict
					}
				}
				out.Items = append(out.Items, TaskVersion{item.TaskNo, old.Version})
				continue
			}
			if err == nil && old.Status != "awaiting_second" && old.Status != item.Status {
				return ErrConflict
			}
			row := taskRow{SiteCode: b.SiteCode, TaskNo: item.TaskNo, Version: item.Version, Status: item.Status, FirstWeighedAt: item.FirstWeighedAt, Snapshot: string(data)}
			if item.Ticket != nil {
				row.TicketSiteCode = &item.Ticket.SiteCode
				row.TicketNo = &item.Ticket.TicketNo
			}
			if err = tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "site_code"}, {Name: "task_no"}}, UpdateAll: true}).Create(&row).Error; err != nil {
				return err
			}
			out.Items = append(out.Items, TaskVersion{item.TaskNo, item.Version})
		}
		return tx.Exec("INSERT INTO wb_cloud_task_sync(site_code,last_synced_at) VALUES (?,?) ON CONFLICT(site_code) DO UPDATE SET last_synced_at=EXCLUDED.last_synced_at", b.SiteCode, out.ReceivedAt).Error
	})
	return out, err
}

type TaskView struct {
	TaskItem
	SiteCode string `json:"siteCode"`
	SiteName string `json:"siteName"`
}
type TaskPage struct {
	Records  []TaskView `json:"records"`
	Total    int64      `json:"total"`
	Page     int        `json:"page"`
	PageSize int        `json:"pageSize"`
}
type TaskSyncStatus struct {
	SiteCode      string     `json:"siteCode"`
	SiteName      string     `json:"siteName"`
	LastSyncedAt  *time.Time `json:"lastSyncedAt"`
	AwaitingCount *int64     `json:"awaitingCount"`
}

func requireTasks(ctx context.Context, db *gorm.DB, actor int64) error {
	p, e := auth.NewRepository(db).FindPermissionsByUserID(ctx, actor)
	if e != nil {
		return e
	}
	if !slices.Contains(p, "weighbridge:tasks") {
		return ErrForbidden
	}
	return nil
}
func (r *Repository) TaskPage(ctx context.Context, actor int64, siteCode, plate, status string, page, size int) (TaskPage, error) {
	out := TaskPage{Records: []TaskView{}, Page: page, PageSize: size}
	db := r.db.WithContext(ctx)
	if err := requireTasks(ctx, db, actor); err != nil {
		return out, err
	}
	if page < 1 || size < 1 || size > 100 || (status != "awaiting_second" && status != "terminated" && status != "issued_pending_upload") {
		return out, ErrInvalid
	}
	q := db.Table("wb_cloud_task t").Joins("JOIN wb_cloud_site s ON s.code=t.site_code")
	if status == "issued_pending_upload" {
		q = q.Where("t.status = 'completed' AND NOT EXISTS (SELECT 1 FROM wb_cloud_ticket k WHERE k.issued_site_code=t.ticket_site_code AND k.ticket_no=t.ticket_no)")
	} else {
		q = q.Where("t.status = ?", status)
	}
	if siteCode != "" {
		q = q.Where("t.site_code = ?", siteCode)
	}
	if plate != "" {
		q = q.Where("t.snapshot->>'plate' ILIKE ?", "%"+plate+"%")
	}
	if err := q.Count(&out.Total).Error; err != nil {
		return out, err
	}
	var rows []struct{ SiteCode, SiteName, Snapshot string }
	if err := q.Select("t.site_code,s.name AS site_name,t.snapshot::text AS snapshot").Order("t.first_weighed_at DESC,t.task_no ASC,t.site_code ASC").Limit(size).Offset((page - 1) * size).Scan(&rows).Error; err != nil {
		return out, err
	}
	for _, row := range rows {
		var t TaskItem
		if err := json.Unmarshal([]byte(row.Snapshot), &t); err != nil {
			return out, err
		}
		if t.Status == "completed" {
			t.Status = "issued_pending_upload"
		}
		out.Records = append(out.Records, TaskView{t, row.SiteCode, row.SiteName})
	}
	return out, nil
}
func (r *Repository) TaskStatus(ctx context.Context, actor int64) ([]TaskSyncStatus, error) {
	db := r.db.WithContext(ctx)
	if err := requireTasks(ctx, db, actor); err != nil {
		return nil, err
	}
	rows := []TaskSyncStatus{}
	err := db.Raw(`SELECT s.code AS site_code,s.name AS site_name,y.last_synced_at, CASE WHEN y.last_synced_at IS NULL THEN NULL ELSE (SELECT count(*) FROM wb_cloud_task t WHERE t.site_code=s.code AND t.status='awaiting_second') END AS awaiting_count FROM wb_cloud_site s LEFT JOIN wb_cloud_task_sync y ON y.site_code=s.code ORDER BY s.code`).Scan(&rows).Error
	return rows, err
}

type taskStore interface {
	ReceiveTasks(context.Context, TaskBatch) (TaskReceipt, error)
	TaskPage(context.Context, int64, string, string, string, int, int) (TaskPage, error)
	TaskStatus(context.Context, int64) ([]TaskSyncStatus, error)
}

func (h *Handler) receiveTasks(c *gin.Context) {
	var b TaskBatch
	if !bindSyncRequest(c, &b) {
		return
	}
	store, ok := h.service.store.(taskStore)
	if !ok {
		platformhttp.WriteError(c, 503, 503, "服务不可用", nil)
		return
	}
	v, err := store.ReceiveTasks(c.Request.Context(), b)
	switch {
	case err == nil:
		platformhttp.OK(c, v)
	case errors.Is(err, ErrInvalid):
		platformhttp.WriteError(c, 400, 400, err.Error(), nil)
	case errors.Is(err, ErrUnauthorized):
		platformhttp.WriteError(c, 401, 401, err.Error(), nil)
	case errors.Is(err, ErrConflict):
		platformhttp.WriteError(c, 409, 409, err.Error(), nil)
	default:
		platformhttp.WriteError(c, 503, 503, "服务不可用", nil)
	}
}
func (h *Handler) taskPage(c *gin.Context) {
	actor, ok := syncActor(c)
	if !ok {
		return
	}
	p, size := 1, 10
	var err error
	if v := c.Query("pageNum"); v != "" {
		p, err = strconv.Atoi(v)
		if err != nil {
			managementResult(c, nil, ErrInvalid)
			return
		}
	}
	if v := c.Query("pageSize"); v != "" {
		size, err = strconv.Atoi(v)
		if err != nil {
			managementResult(c, nil, ErrInvalid)
			return
		}
	}
	status := c.DefaultQuery("status", "awaiting_second")
	store, ok := h.service.store.(taskStore)
	if !ok {
		managementResult(c, nil, errors.New("service unavailable"))
		return
	}
	v, err := store.TaskPage(c.Request.Context(), actor, c.Query("siteCode"), c.Query("plate"), status, p, size)
	if errors.Is(err, ErrForbidden) {
		platformhttp.WriteError(c, 403, 403, err.Error(), nil)
		return
	}
	managementResult(c, v, err)
}
func (h *Handler) taskStatus(c *gin.Context) {
	actor, ok := syncActor(c)
	if !ok {
		return
	}
	store, ok := h.service.store.(taskStore)
	if !ok {
		managementResult(c, nil, errors.New("service unavailable"))
		return
	}
	v, err := store.TaskStatus(c.Request.Context(), actor)
	if errors.Is(err, ErrForbidden) {
		platformhttp.WriteError(c, 403, 403, err.Error(), nil)
		return
	}
	managementResult(c, v, err)
}
