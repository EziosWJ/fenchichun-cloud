package grainoutbound

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrForbidden  = errors.New("没有酒糟出库权限")
	ErrNoAccount  = errors.New("未绑定出库人和车牌")
	ErrConflict   = errors.New("过磅状态已变化，请刷新后重试")
	ErrActive     = errors.New("已有进行中的酒糟过磅，请先完成当前车辆")
	ErrNoFirst    = errors.New("请先完成首磅")
	ErrWeight     = errors.New("回磅重量必须大于首磅重量")
	ErrExpired    = errors.New("首磅已超过6小时，请联系厂端终止后再重新首磅")
	ErrHandoff    = errors.New("二维码已失效，请重新生成")
	ErrTerminated = errors.New("首磅任务已终止，请重新首磅")
)

const (
	outboundRoleCode = "GRAIN_OUT"
	distillerCode    = "C-M-0006"
	businessZone     = "Asia/Shanghai"
	sessionTTL       = 6 * time.Hour
	qrTTL            = 10 * time.Minute

	statusFirstQRReady   = "first_qr_ready"
	statusFirstScanning  = "first_scanning"
	statusFirstRecorded  = "first_recorded"
	statusSecondQRReady  = "second_qr_ready"
	statusSecondScanning = "second_scanning"
	statusCompleted      = "completed"
	statusExpired        = "expired"
	statusCancelled      = "cancelled"
	statusTerminated     = "terminated"

	handoffIssued     = "issued"
	handoffClaimed    = "claimed"
	handoffCompleted  = "completed"
	handoffFailed     = "failed"
	handoffSuperseded = "superseded"
	handoffExpired    = "expired"
)

var activeStatuses = []string{
	statusFirstQRReady, statusFirstScanning, statusFirstRecorded,
	statusSecondQRReady, statusSecondScanning,
}

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

func (r *Repository) HasRole(ctx context.Context, userID int64, roleCode string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).Table("sys_user_role ur").
		Joins("JOIN sys_role r ON r.id = ur.role_id").
		Where("ur.user_id = ? AND r.role_code = ? AND r.status = 1 AND r.deleted = 0", userID, roleCode).
		Count(&count).Error
	return count > 0, err
}

func (r *Repository) Account(ctx context.Context, userID int64) (Account, error) {
	var account Account
	err := r.db.WithContext(ctx).Table("grain_outbound_account a").
		Select(`a.user_id, a.party_code, COALESCE(p.name, '') AS party_name, a.plate,
			a.site_code, COALESCE(s.name, '') AS site_name, a.scale_code`).
		Joins("LEFT JOIN wb_cloud_party p ON p.code = a.party_code").
		Joins("LEFT JOIN wb_cloud_site s ON s.code = a.site_code").
		Where("a.user_id = ? AND a.enabled = TRUE", userID).
		Take(&account).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return account, ErrNoAccount
	}
	return account, err
}

func (r *Repository) UserName(ctx context.Context, userID int64) (string, error) {
	var name string
	err := r.db.WithContext(ctx).Table("sys_user").
		Select("COALESCE(NULLIF(nickname, ''), username)").
		Where("id = ?", userID).Scan(&name).Error
	return name, err
}

// Current expires only a first QR that was never scanned. Once a factory task
// exists, the session stays visible and cannot be replaced by a new first weigh
// until the factory reports a termination.
func (r *Repository) Current(ctx context.Context, userID int64) (*Weighing, error) {
	now := time.Now()
	if err := r.expireUnscannedFirst(ctx, r.db, userID, now); err != nil {
		return nil, err
	}
	var row Weighing
	err := r.db.WithContext(ctx).Table("grain_outbound_weighing w").
		Select(`w.id, w.status, w.source, w.plate, w.party_code,
			COALESCE(p.name, '') AS party_name, w.site_code,
			COALESCE(s.name, '') AS site_name, w.scale_code,
			w.first_weight_milli_tonne, w.first_at,
			COALESCE(w.second_weight_milli_tonne, 0) AS second_weight_milli_tonne,
			w.second_at, w.net_milli_tonne, COALESCE(w.ticket_no, '') AS ticket_no,
			w.factory_task_no, w.capture_status, w.message, w.expires_at`).
		Joins("LEFT JOIN wb_cloud_party p ON p.code = w.party_code").
		Joins("LEFT JOIN wb_cloud_site s ON s.code = w.site_code").
		Where("w.user_id = ?", userID).
		Order("w.id DESC").Limit(1).Scan(&row).Error
	if err != nil {
		return nil, err
	}
	if row.ID == 0 {
		return nil, nil
	}
	return &row, nil
}

func (r *Repository) History(ctx context.Context, userID int64) ([]HistoryWeighing, error) {
	const limit = 50
	rows := make([]HistoryWeighing, 0)
	err := r.db.WithContext(ctx).Table("grain_outbound_weighing").
		Select(`id, COALESCE(ticket_no, '') AS ticket_no, status, source, plate,
			first_weight_milli_tonne, COALESCE(second_weight_milli_tonne, 0) AS second_weight_milli_tonne,
			net_milli_tonne, first_at, second_at, factory_task_no`).
		Where("user_id = ?", userID).
		Order("id DESC").Limit(limit).Scan(&rows).Error
	return rows, err
}

func (r *Repository) CreateFirstQR(ctx context.Context, account Account, weight int64, at time.Time) (*Weighing, error) {
	token, tokenHash, err := newHandoffToken()
	if err != nil {
		return nil, err
	}
	var weighingID int64
	err = r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := r.expireUnscannedFirst(ctx, tx, account.UserID, at); err != nil {
			return err
		}
		existing, err := r.activeTx(ctx, tx, account.UserID)
		if err != nil {
			return err
		}
		if existing != nil {
			if existing.Status != statusFirstQRReady {
				return ErrActive
			}
			weighingID = existing.ID
			if err := tx.Table("grain_outbound_weighing").Where("id = ?", weighingID).
				Updates(map[string]any{
					"plate":                    account.Plate,
					"party_code":               account.PartyCode,
					"site_code":                account.SiteCode,
					"scale_code":               account.ScaleCode,
					"first_weight_milli_tonne": weight,
					"first_at":                 at,
					"expires_at":               at.Add(sessionTTL),
					"updated_at":               at,
					"message":                  "",
				}).Error; err != nil {
				return err
			}
			if err := r.supersedeHandoffs(ctx, tx, weighingID, "first", at); err != nil {
				return err
			}
		} else {
			if err := tx.Raw(`INSERT INTO grain_outbound_weighing
				(user_id, plate, party_code, site_code, scale_code, first_weight_milli_tonne, first_at,
				 status, source, expires_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'mobile_scan', ?, ?) RETURNING id`,
				account.UserID, account.Plate, account.PartyCode, account.SiteCode, account.ScaleCode,
				weight, at, statusFirstQRReady, at.Add(sessionTTL), at).Scan(&weighingID).Error; err != nil {
				return err
			}
		}
		return r.insertHandoff(ctx, tx, weighingID, "first", tokenHash, at, qrTTL)
	})
	if err != nil {
		return nil, err
	}
	current, err := r.byID(ctx, weighingID)
	if err != nil {
		return nil, err
	}
	current.QR = &HandoffQR{Value: "fc-handoff:" + token, ExpiresAt: at.Add(qrTTL)}
	return current, nil
}

func (r *Repository) CreateSecondQR(ctx context.Context, account Account, weight int64, at time.Time) (*Weighing, error) {
	token, tokenHash, err := newHandoffToken()
	if err != nil {
		return nil, err
	}
	var weighingID int64
	err = r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		existing, err := r.activeTx(ctx, tx, account.UserID)
		if err != nil {
			return err
		}
		if existing == nil {
			return ErrNoFirst
		}
		if existing.Status != statusFirstRecorded && existing.Status != statusSecondQRReady {
			return ErrConflict
		}
		if existing.ExpiresAt != nil && existing.ExpiresAt.Before(at) {
			return ErrExpired
		}
		if weight <= existing.FirstWeightMilliTonne {
			return ErrWeight
		}
		weighingID = existing.ID
		if err := tx.Table("grain_outbound_weighing").Where("id = ?", weighingID).
			Updates(map[string]any{
				"status":                    statusSecondQRReady,
				"second_weight_milli_tonne": weight,
				"second_at":                 at,
				"updated_at":                at,
				"message":                   "",
			}).Error; err != nil {
			return err
		}
		if err := r.supersedeHandoffs(ctx, tx, weighingID, "second", at); err != nil {
			return err
		}
		return r.insertHandoff(ctx, tx, weighingID, "second", tokenHash, at, qrTTL)
	})
	if err != nil {
		return nil, err
	}
	current, err := r.byID(ctx, weighingID)
	if err != nil {
		return nil, err
	}
	current.QR = &HandoffQR{Value: "fc-handoff:" + token, ExpiresAt: at.Add(qrTTL)}
	return current, nil
}

// Cancel only releases a QR that has not been scanned. After the factory has a
// task, cancellation belongs to the factory PC.
func (r *Repository) Cancel(ctx context.Context, userID int64) error {
	now := time.Now()
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		existing, err := r.activeTx(ctx, tx, userID)
		if err != nil || existing == nil {
			return err
		}
		switch existing.Status {
		case statusFirstQRReady:
			if err := tx.Table("grain_outbound_weighing").Where("id = ?", existing.ID).
				Updates(map[string]any{"status": statusCancelled, "expires_at": nil, "updated_at": now}).Error; err != nil {
				return err
			}
			return r.supersedeHandoffs(ctx, tx, existing.ID, "first", now)
		case statusSecondQRReady:
			if err := tx.Table("grain_outbound_weighing").Where("id = ?", existing.ID).
				Updates(map[string]any{
					"status":                    statusFirstRecorded,
					"second_weight_milli_tonne": 0,
					"second_at":                 nil,
					"net_milli_tonne":           0,
					"updated_at":                now,
				}).Error; err != nil {
				return err
			}
			return r.supersedeHandoffs(ctx, tx, existing.ID, "second", now)
		case statusFirstScanning, statusSecondScanning:
			return ErrConflict
		default:
			return ErrConflict
		}
	})
}

func (r *Repository) Claim(ctx context.Context, token, siteCode, scaleCode string) (ClaimResponse, error) {
	tokenHash := hashToken(token)
	var result ClaimResponse
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		now := time.Now()
		var handoff handoffRow
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("token_hash = ?", tokenHash).Take(&handoff).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrHandoff
			}
			return err
		}
		if handoff.Status != handoffIssued && handoff.Status != handoffClaimed && handoff.Status != handoffCompleted && handoff.Status != handoffFailed {
			return ErrHandoff
		}
		if handoff.Status != handoffCompleted && handoff.ExpiresAt.Before(now) {
			return ErrHandoff
		}
		var weighing Weighing
		if err := tx.Table("grain_outbound_weighing").Where("id = ?", handoff.WeighingID).Take(&weighing).Error; err != nil {
			return err
		}
		if weighing.SiteCode != strings.TrimSpace(siteCode) || weighing.ScaleCode != strings.TrimSpace(scaleCode) {
			return ErrHandoff
		}
		if handoff.Status != handoffCompleted {
			if handoff.Action == "first" && weighing.Status != statusFirstQRReady && weighing.Status != statusFirstScanning {
				return ErrConflict
			}
			if handoff.Action == "second" && weighing.Status != statusSecondQRReady && weighing.Status != statusSecondScanning {
				return ErrConflict
			}
		}
		claimStatus := handoff.Status
		if handoff.Status == handoffIssued || handoff.Status == handoffFailed {
			status := statusFirstScanning
			if handoff.Action == "second" {
				status = statusSecondScanning
			}
			if err := tx.Table("grain_outbound_weighing").Where("id = ?", weighing.ID).
				Updates(map[string]any{"status": status, "updated_at": now}).Error; err != nil {
				return err
			}
			if err := tx.Table("grain_outbound_handoff").Where("id = ?", handoff.ID).
				Updates(map[string]any{"status": handoffClaimed, "claimed_at": now, "updated_at": now}).Error; err != nil {
				return err
			}
			claimStatus = handoffClaimed
		}
		var account string
		if err := tx.Table("sys_user").Select("COALESCE(NULLIF(nickname, ''), username)").
			Where("id = ?", weighingUserID(tx, weighing.ID)).Scan(&account).Error; err != nil {
			return err
		}
		result = ClaimResponse{
			HandoffID: handoff.ID, WeighingID: weighing.ID, Action: handoff.Action,
			Status: claimStatus, Plate: weighing.Plate, PartyCode: weighing.PartyCode,
			PartyName: weighing.PartyName, MaterialCode: distillerCode, MobileAccount: account,
			SiteCode: weighing.SiteCode, ScaleCode: weighing.ScaleCode,
			FactoryTaskNo: weighing.FactoryTaskNo, FirstWeightMilliTonne: weighing.FirstWeightMilliTonne,
			FirstAt: weighing.FirstAt, ExpiresAt: handoff.ExpiresAt,
		}
		return nil
	})
	return result, err
}

func (r *Repository) Result(ctx context.Context, in ResultRequest) error {
	tokenHash := hashToken(in.Token)
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		now := time.Now()
		var handoff handoffRow
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("token_hash = ?", tokenHash).Take(&handoff).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrHandoff
			}
			return err
		}
		if handoff.Action != strings.TrimSpace(in.Action) {
			return ErrHandoff
		}
		if handoff.Status == handoffCompleted {
			return nil
		}
		if handoff.Status != handoffClaimed && handoff.Status != handoffIssued && handoff.Status != handoffFailed {
			return ErrHandoff
		}
		var weighing Weighing
		if err := tx.Table("grain_outbound_weighing").Where("id = ?", handoff.WeighingID).Take(&weighing).Error; err != nil {
			return err
		}
		if weighing.SiteCode != strings.TrimSpace(in.SiteCode) || weighing.ScaleCode != strings.TrimSpace(in.ScaleCode) {
			return ErrHandoff
		}
		resultJSON, _ := json.Marshal(in)
		switch strings.TrimSpace(in.Status) {
		case "failed":
			if err := tx.Table("grain_outbound_handoff").Where("id = ?", handoff.ID).
				Updates(map[string]any{"status": handoffFailed, "result": resultJSON, "updated_at": now, "completed_at": now}).Error; err != nil {
				return err
			}
			status := statusFirstQRReady
			if handoff.Action == "second" {
				status = statusSecondQRReady
			}
			return tx.Table("grain_outbound_weighing").Where("id = ?", weighing.ID).
				Updates(map[string]any{"status": status, "message": in.Message, "updated_at": now}).Error
		case "terminated":
			if err := tx.Table("grain_outbound_handoff").Where("id = ?", handoff.ID).
				Updates(map[string]any{"status": handoffCompleted, "result": resultJSON, "updated_at": now, "completed_at": now}).Error; err != nil {
				return err
			}
			return tx.Table("grain_outbound_weighing").Where("id = ?", weighing.ID).
				Updates(map[string]any{"status": statusTerminated, "message": in.Message, "expires_at": nil, "updated_at": now}).Error
		case "first_recorded":
			if handoff.Action != "first" || in.FirstWeightMilliTonne <= 0 || in.FirstAt.IsZero() {
				return ErrHandoff
			}
			if err := tx.Table("grain_outbound_handoff").Where("id = ?", handoff.ID).
				Updates(map[string]any{"status": handoffCompleted, "result": resultJSON, "updated_at": now, "completed_at": now}).Error; err != nil {
				return err
			}
			expires := in.FirstAt.Add(sessionTTL)
			if err := tx.Table("grain_outbound_weighing").Where("id = ?", weighing.ID).
				Updates(map[string]any{
					"status":                    statusFirstRecorded,
					"first_weight_milli_tonne":  in.FirstWeightMilliTonne,
					"first_at":                  in.FirstAt,
					"second_weight_milli_tonne": 0,
					"second_at":                 nil,
					"net_milli_tonne":           0,
					"factory_task_no":           in.FactoryTaskNo,
					"capture_status":            in.CaptureStatus,
					"message":                   in.Message,
					"expires_at":                expires,
					"updated_at":                now,
				}).Error; err != nil {
				return err
			}
			return r.supersedeOtherHandoffs(ctx, tx, weighing.ID, "first", handoff.ID, now)
		case "completed":
			if handoff.Action != "second" || in.SecondWeightMilliTonne <= 0 || in.SecondAt.IsZero() || strings.TrimSpace(in.FactoryTicketNo) == "" {
				return ErrHandoff
			}
			net := in.SecondWeightMilliTonne - weighing.FirstWeightMilliTonne
			if net <= 0 {
				return ErrWeight
			}
			if err := tx.Table("grain_outbound_handoff").Where("id = ?", handoff.ID).
				Updates(map[string]any{"status": handoffCompleted, "result": resultJSON, "updated_at": now, "completed_at": now}).Error; err != nil {
				return err
			}
			if err := tx.Table("grain_outbound_weighing").Where("id = ?", weighing.ID).
				Updates(map[string]any{
					"status":                    statusCompleted,
					"second_weight_milli_tonne": in.SecondWeightMilliTonne,
					"second_at":                 in.SecondAt,
					"net_milli_tonne":           net,
					"ticket_no":                 strings.TrimSpace(in.FactoryTicketNo),
					"factory_task_no":           in.FactoryTaskNo,
					"capture_status":            in.CaptureStatus,
					"message":                   in.Message,
					"expires_at":                nil,
					"updated_at":                now,
				}).Error; err != nil {
				return err
			}
			return r.supersedeOtherHandoffs(ctx, tx, weighing.ID, "second", handoff.ID, now)
		default:
			return ErrHandoff
		}
	})
}

func (r *Repository) TerminateByTask(ctx context.Context, siteCode, taskNo, reason string) error {
	now := time.Now()
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var weighing Weighing
		err := tx.Table("grain_outbound_weighing").
			Where("site_code = ? AND factory_task_no = ? AND status IN ?", strings.TrimSpace(siteCode), strings.TrimSpace(taskNo), activeStatuses).
			Order("id DESC").Take(&weighing).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		if err != nil {
			return err
		}
		if err := tx.Table("grain_outbound_weighing").Where("id = ?", weighing.ID).
			Updates(map[string]any{"status": statusTerminated, "message": reason, "expires_at": nil, "updated_at": now}).Error; err != nil {
			return err
		}
		return tx.Table("grain_outbound_handoff").
			Where("weighing_id = ? AND status IN ?", weighing.ID, []string{handoffIssued, handoffClaimed, handoffFailed}).
			Updates(map[string]any{"status": handoffSuperseded, "updated_at": now}).Error
	})
}

type handoffRow struct {
	ID         int64
	WeighingID int64
	Action     string
	Status     string
	ExpiresAt  time.Time
}

func (handoffRow) TableName() string { return "grain_outbound_handoff" }

func (r *Repository) expireUnscannedFirst(ctx context.Context, db *gorm.DB, userID int64, now time.Time) error {
	var ids []int64
	if err := db.WithContext(ctx).Table("grain_outbound_weighing").
		Where("user_id = ? AND status = ? AND expires_at IS NOT NULL AND expires_at < ?", userID, statusFirstQRReady, now).
		Pluck("id", &ids).Error; err != nil {
		return err
	}
	if len(ids) == 0 {
		return nil
	}
	if err := db.WithContext(ctx).Table("grain_outbound_weighing").Where("id IN ?", ids).
		Updates(map[string]any{"status": statusExpired, "updated_at": now}).Error; err != nil {
		return err
	}
	return db.WithContext(ctx).Table("grain_outbound_handoff").
		Where("weighing_id IN ? AND status IN ?", ids, []string{handoffIssued, handoffClaimed, handoffFailed}).
		Updates(map[string]any{"status": handoffExpired, "updated_at": now}).Error
}

func (r *Repository) activeTx(ctx context.Context, tx *gorm.DB, userID int64) (*Weighing, error) {
	var row Weighing
	err := tx.WithContext(ctx).Table("grain_outbound_weighing").
		Select(`id, status, source, plate, party_code, site_code, scale_code,
			first_weight_milli_tonne, first_at,
			COALESCE(second_weight_milli_tonne, 0) AS second_weight_milli_tonne,
			second_at, net_milli_tonne, COALESCE(ticket_no, '') AS ticket_no,
			factory_task_no, capture_status, message, expires_at`).
		Where("user_id = ? AND status IN ?", userID, activeStatuses).
		Order("id DESC").Take(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *Repository) byID(ctx context.Context, id int64) (*Weighing, error) {
	var row Weighing
	err := r.db.WithContext(ctx).Table("grain_outbound_weighing w").
		Select(`w.id, w.status, w.source, w.plate, w.party_code,
			COALESCE(p.name, '') AS party_name, w.site_code,
			COALESCE(s.name, '') AS site_name, w.scale_code,
			w.first_weight_milli_tonne, w.first_at,
			COALESCE(w.second_weight_milli_tonne, 0) AS second_weight_milli_tonne,
			w.second_at, w.net_milli_tonne, COALESCE(w.ticket_no, '') AS ticket_no,
			w.factory_task_no, w.capture_status, w.message, w.expires_at`).
		Joins("LEFT JOIN wb_cloud_party p ON p.code = w.party_code").
		Joins("LEFT JOIN wb_cloud_site s ON s.code = w.site_code").
		Where("w.id = ?", id).Take(&row).Error
	return &row, err
}

func (r *Repository) insertHandoff(ctx context.Context, tx *gorm.DB, weighingID int64, action, tokenHash string, at time.Time, ttl time.Duration) error {
	return tx.WithContext(ctx).Table("grain_outbound_handoff").Create(map[string]any{
		"weighing_id": weighingID, "action": action, "token_hash": tokenHash,
		"status": handoffIssued, "expires_at": at.Add(ttl), "updated_at": at,
	}).Error
}

func (r *Repository) supersedeHandoffs(ctx context.Context, tx *gorm.DB, weighingID int64, action string, at time.Time) error {
	return tx.WithContext(ctx).Table("grain_outbound_handoff").
		Where("weighing_id = ? AND action = ? AND status IN ?", weighingID, action, []string{handoffIssued, handoffClaimed, handoffFailed}).
		Updates(map[string]any{"status": handoffSuperseded, "updated_at": at}).Error
}

func (r *Repository) supersedeOtherHandoffs(ctx context.Context, tx *gorm.DB, weighingID int64, action string, currentID int64, at time.Time) error {
	return tx.WithContext(ctx).Table("grain_outbound_handoff").
		Where("weighing_id = ? AND action = ? AND id <> ? AND status IN ?", weighingID, action, currentID, []string{handoffIssued, handoffClaimed, handoffFailed}).
		Updates(map[string]any{"status": handoffSuperseded, "updated_at": at}).Error
}

func newHandoffToken() (string, string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", "", err
	}
	token := base64.RawURLEncoding.EncodeToString(buf)
	return token, hashToken(token), nil
}

func hashToken(token string) string {
	token = strings.TrimPrefix(strings.TrimSpace(token), "fc-handoff:")
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func weighingUserID(tx *gorm.DB, weighingID int64) int64 {
	var userID int64
	_ = tx.Table("grain_outbound_weighing").Select("user_id").Where("id = ?", weighingID).Scan(&userID).Error
	return userID
}
