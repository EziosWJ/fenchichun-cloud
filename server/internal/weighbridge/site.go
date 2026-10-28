package weighbridge

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"regexp"
	"strings"
	"unicode/utf8"

	"fenchichun.local/server/internal/audit"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var ErrCredentialUnavailable = errors.New("历史凭据未保存明文，无法查看；原凭据仍然有效")
var ErrForbidden = errors.New("无权管理厂端接入")
var identityCode = regexp.MustCompile(`^[A-Za-z0-9_.-]{1,40}$`)

type SiteInput struct {
	Code      string `json:"code"`
	Name      string `json:"name"`
	ScaleCode string `json:"scaleCode"`
	ScaleName string `json:"scaleName"`
}
type SiteCredential struct {
	SiteCode  string `json:"siteCode"`
	ScaleCode string `json:"scaleCode"`
	Token     string `json:"token"`
}

// CreateSite binds a new site and its initial scale to a machine credential.
// The credential is retained for subsequent administrator viewing.
func (r *Repository) CreateSite(ctx context.Context, in SiteInput, event audit.Event) (SiteCredential, error) {
	if !identityCode.MatchString(in.Code) || strings.TrimSpace(in.Name) == "" || utf8.RuneCountInString(in.Name) > 100 || !identityCode.MatchString(in.ScaleCode) || strings.TrimSpace(in.ScaleName) == "" || utf8.RuneCountInString(in.ScaleName) > 100 {
		return SiteCredential{}, ErrInvalid
	}
	var random [32]byte
	if _, err := rand.Read(random[:]); err != nil {
		return SiteCredential{}, err
	}
	token := hex.EncodeToString(random[:])
	digest := sha256.Sum256([]byte(token))
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var count int64
		if err := tx.Table("sys_user_role ur").Joins("JOIN sys_role r ON r.id = ur.role_id").Where("ur.user_id = ? AND r.role_code = ? AND r.status = 1 AND r.deleted = 0", event.Metadata.ActorID, "ADMIN").Count(&count).Error; err != nil {
			return err
		}
		if count != 1 {
			return ErrForbidden
		}
		if err := tx.Model(&site{}).Where("code = ?", in.Code).Count(&count).Error; err != nil {
			return err
		}
		if count != 0 {
			return ErrConflict
		}
		s := site{Code: in.Code, Name: in.Name, Enabled: true}
		if err := tx.Create(&s).Error; err != nil {
			return err
		}
		if err := tx.Exec("INSERT INTO wb_cloud_scale (site_id, code, name) VALUES (?, ?, ?)", s.ID, in.ScaleCode, in.ScaleName).Error; err != nil {
			return err
		}
		if err := tx.Exec("INSERT INTO wb_cloud_credential (site_id, token_hash, token_value) VALUES (?, ?, ?)", s.ID, hex.EncodeToString(digest[:]), token).Error; err != nil {
			return err
		}
		return audit.RecordOn(ctx, tx, event)
	})
	if err != nil {
		return SiteCredential{}, err
	}
	return SiteCredential{SiteCode: in.Code, ScaleCode: in.ScaleCode, Token: token}, nil
}

type SiteView struct {
	Code      string `json:"code"`
	Name      string `json:"name"`
	Enabled   bool   `json:"enabled"`
	ScaleCode string `json:"scaleCode"`
	ScaleName string `json:"scaleName"`
}

func (r *Repository) Sites(ctx context.Context) ([]SiteView, error) {
	result := []SiteView{}
	err := r.db.WithContext(ctx).Table("wb_cloud_site s").Select("s.code, s.name, s.enabled, b.code AS scale_code, b.name AS scale_name").Joins("JOIN wb_cloud_scale b ON b.site_id = s.id").Order("s.code, b.code").Scan(&result).Error
	return result, err
}

func (r *Repository) RotateCredential(ctx context.Context, code string, event audit.Event) (SiteCredential, error) {
	if !identityCode.MatchString(code) {
		return SiteCredential{}, ErrInvalid
	}
	var random [32]byte
	if _, err := rand.Read(random[:]); err != nil {
		return SiteCredential{}, err
	}
	token := hex.EncodeToString(random[:])
	digest := sha256.Sum256([]byte(token))
	var result SiteCredential
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var count int64
		if err := tx.Table("sys_user_role ur").Joins("JOIN sys_role r ON r.id = ur.role_id").Where("ur.user_id = ? AND r.role_code = ? AND r.status = 1 AND r.deleted = 0", event.Metadata.ActorID, "ADMIN").Count(&count).Error; err != nil {
			return err
		}
		if count != 1 {
			return ErrForbidden
		}
		var s site
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("code = ?", code).Take(&s).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrInvalid
			}
			return err
		}
		if !s.Enabled {
			return ErrConflict
		}
		var scale string
		if err := tx.Table("wb_cloud_scale").Select("code").Where("site_id = ?", s.ID).Order("id").Limit(1).Scan(&scale).Error; err != nil {
			return err
		}
		if scale == "" {
			return ErrInvalid
		}
		if err := tx.Exec("UPDATE wb_cloud_credential SET revoked_at = CURRENT_TIMESTAMP WHERE site_id = ? AND revoked_at IS NULL", s.ID).Error; err != nil {
			return err
		}
		if err := tx.Exec("INSERT INTO wb_cloud_credential (site_id, token_hash, token_value) VALUES (?, ?, ?)", s.ID, hex.EncodeToString(digest[:]), token).Error; err != nil {
			return err
		}
		if err := audit.RecordOn(ctx, tx, event); err != nil {
			return err
		}
		result = SiteCredential{SiteCode: code, ScaleCode: scale, Token: token}
		return nil
	})
	return result, err
}

func (r *Repository) UpdateSite(ctx context.Context, code, scaleCode string, in SiteInput, event audit.Event) error {
	if !identityCode.MatchString(code) || !identityCode.MatchString(scaleCode) || !identityCode.MatchString(in.Code) || !identityCode.MatchString(in.ScaleCode) || strings.TrimSpace(in.Name) == "" || utf8.RuneCountInString(in.Name) > 100 || strings.TrimSpace(in.ScaleName) == "" || utf8.RuneCountInString(in.ScaleName) > 100 {
		return ErrInvalid
	}
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var count int64
		if err := tx.Table("sys_user_role ur").Joins("JOIN sys_role r ON r.id = ur.role_id").Where("ur.user_id = ? AND r.role_code = ? AND r.status = 1 AND r.deleted = 0", event.Metadata.ActorID, "ADMIN").Count(&count).Error; err != nil {
			return err
		}
		if count != 1 {
			return ErrForbidden
		}
		var s site
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("code = ?", code).Take(&s).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrInvalid
			}
			return err
		}
		if err := tx.Model(&site{}).Where("code = ? AND id <> ?", in.Code, s.ID).Count(&count).Error; err != nil {
			return err
		}
		if count != 0 {
			return ErrConflict
		}
		if err := tx.Table("wb_cloud_scale").Where("site_id = ? AND code = ? AND code <> ?", s.ID, in.ScaleCode, scaleCode).Count(&count).Error; err != nil {
			return err
		}
		if count != 0 {
			return ErrConflict
		}
		result := tx.Table("wb_cloud_scale").Where("site_id = ? AND code = ?", s.ID, scaleCode).Updates(map[string]any{"code": in.ScaleCode, "name": in.ScaleName})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return ErrInvalid
		}
		if err := tx.Model(&s).Updates(map[string]any{"code": in.Code, "name": in.Name}).Error; err != nil {
			return err
		}
		return audit.RecordOn(ctx, tx, event)
	})
}

func (r *Repository) Credential(ctx context.Context, code string, actorID int64) (SiteCredential, error) {
	db := r.db.WithContext(ctx)
	var count int64
	if err := db.Table("sys_user_role ur").Joins("JOIN sys_role r ON r.id = ur.role_id").Where("ur.user_id = ? AND r.role_code = ? AND r.status = 1 AND r.deleted = 0", actorID, "ADMIN").Count(&count).Error; err != nil {
		return SiteCredential{}, err
	}
	if count != 1 {
		return SiteCredential{}, ErrForbidden
	}
	var row struct {
		SiteCode string
		Token    *string
	}
	if err := db.Table("wb_cloud_site s").Select("s.code AS site_code, c.token_value AS token").Joins("JOIN wb_cloud_credential c ON c.site_id = s.id AND c.revoked_at IS NULL").Where("s.code = ?", code).Take(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return SiteCredential{}, ErrInvalid
		}
		return SiteCredential{}, err
	}
	if row.Token == nil {
		return SiteCredential{}, ErrCredentialUnavailable
	}
	return SiteCredential{SiteCode: row.SiteCode, Token: *row.Token}, nil
}
