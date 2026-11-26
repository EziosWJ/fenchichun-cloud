package grainoutbound

import (
	"context"
	"errors"
	"fmt"
	"time"

	"gorm.io/gorm"
)

var (
	ErrForbidden = errors.New("没有酒糟出库权限")
	ErrNoAccount = errors.New("未绑定出库人和车牌")
	ErrConflict  = errors.New("过磅状态已变化，请刷新后重试")
)

const (
	outboundRoleCode = "GRAIN_OUT"
	distillerCode    = "C-M-0006"
	businessZone     = "Asia/Shanghai"
)

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

func (r *Repository) Distiller(ctx context.Context) (name, spec string, err error) {
	var row struct {
		Name string
		Spec string
	}
	err = r.db.WithContext(ctx).Table("wb_cloud_material").
		Select("name, spec").Where("code = ?", distillerCode).Take(&row).Error
	return row.Name, row.Spec, err
}

func (r *Repository) Pending(ctx context.Context, userID int64) (*PendingWeighing, error) {
	var rows []PendingWeighing
	err := r.db.WithContext(ctx).Table("grain_outbound_weighing").
		Select("id, first_weight_milli_tonne, first_at").
		Where("user_id = ? AND status = 'pending'", userID).
		Order("id DESC").Limit(1).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	return &rows[0], nil
}

func (r *Repository) CreatePending(ctx context.Context, userID int64, account Account, weight int64, at time.Time) (PendingWeighing, error) {
	var row PendingWeighing
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var existing int64
		if err := tx.Table("grain_outbound_weighing").
			Where("user_id = ? AND status = 'pending'", userID).Count(&existing).Error; err != nil {
			return err
		}
		if existing > 0 {
			return ErrConflict
		}
		if err := tx.Raw(`INSERT INTO grain_outbound_weighing
			(user_id, plate, party_code, site_code, scale_code, first_weight_milli_tonne, first_at, status)
			VALUES (?, ?, ?, ?, ?, ?, ?, 'pending') RETURNING id`,
			userID, account.Plate, account.PartyCode, account.SiteCode, account.ScaleCode, weight, at).Scan(&row.ID).Error; err != nil {
			return err
		}
		row.FirstWeightMilliTonne = weight
		row.FirstAt = at
		return nil
	})
	return row, err
}

func (r *Repository) CompletePending(ctx context.Context, id int64, ticketNo string, secondWeight int64, at time.Time) error {
	result := r.db.WithContext(ctx).Table("grain_outbound_weighing").
		Where("id = ? AND status = 'pending'", id).
		Updates(map[string]any{
			"status": "completed", "ticket_no": ticketNo,
			"second_weight_milli_tonne": secondWeight, "second_at": at, "updated_at": at,
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrConflict
	}
	return nil
}

func (r *Repository) CancelPending(ctx context.Context, userID int64) error {
	return r.db.WithContext(ctx).Table("grain_outbound_weighing").
		Where("user_id = ? AND status = 'pending'", userID).
		Updates(map[string]any{"status": "cancelled", "updated_at": time.Now()}).Error
}

func (r *Repository) NextTicketNo(ctx context.Context, siteCode string, at time.Time) (string, error) {
	zone, err := time.LoadLocation(businessZone)
	if err != nil {
		zone = time.FixedZone("CST", 8*60*60)
	}
	day := at.In(zone).Format("20060102")
	kind := fmt.Sprintf("out:%s:%s", siteCode, day)
	var value int64
	if err := r.db.WithContext(ctx).Raw(`INSERT INTO wb_cloud_sequence (kind, value) VALUES (?, 1)
		ON CONFLICT (kind) DO UPDATE SET value = wb_cloud_sequence.value + 1 RETURNING value`, kind).Scan(&value).Error; err != nil {
		return "", err
	}
	return fmt.Sprintf("%s-%s-M%04d", siteCode, day, value), nil
}
