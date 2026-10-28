package weighbridge

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"unicode/utf8"

	"fenchichun.local/server/internal/audit"
	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var ErrForbidden = errors.New("无权管理厂区")
var identityCode = regexp.MustCompile(`^[A-Za-z0-9_.-]{1,40}$`)

type SiteInput struct {
	Code string `json:"code"`
	Name string `json:"name"`
}
type SiteView struct {
	Code    string `json:"code"`
	Name    string `json:"name"`
	Enabled bool   `json:"enabled"`
}

func siteError(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return ErrConflict
	}
	return err
}
func validSite(in SiteInput) bool {
	return identityCode.MatchString(in.Code) && strings.TrimSpace(in.Name) != "" && utf8.RuneCountInString(in.Name) <= 100
}
func requireSiteAdmin(tx *gorm.DB, actor int64) error {
	var count int64
	if err := tx.Table("sys_user_role ur").Joins("JOIN sys_role r ON r.id = ur.role_id").Where("ur.user_id = ? AND r.role_code = ? AND r.status = 1 AND r.deleted = 0", actor, "ADMIN").Count(&count).Error; err != nil {
		return err
	}
	if count != 1 {
		return ErrForbidden
	}
	return nil
}
func (r *Repository) CreateSite(ctx context.Context, in SiteInput, event audit.Event) (SiteView, error) {
	if !validSite(in) {
		return SiteView{}, ErrInvalid
	}
	value := SiteView{Code: in.Code, Name: in.Name, Enabled: true}
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := requireSiteAdmin(tx, event.Metadata.ActorID); err != nil {
			return err
		}
		var count int64
		if err := tx.Table("wb_cloud_site_code").Where("code = ?", in.Code).Count(&count).Error; err != nil {
			return err
		}
		if count != 0 {
			return ErrConflict
		}
		if err := tx.Create(&site{Code: in.Code, Name: in.Name, Enabled: true}).Error; err != nil {
			return err
		}
		if err := tx.Exec("INSERT INTO wb_cloud_site_code (code, site_code) VALUES (?, ?)", in.Code, in.Code).Error; err != nil {
			return err
		}
		return audit.RecordOn(ctx, tx, event)
	})
	return value, siteError(err)
}
func (r *Repository) Sites(ctx context.Context) ([]SiteView, error) {
	result := []SiteView{}
	err := r.db.WithContext(ctx).Table("wb_cloud_site").Order("code").Scan(&result).Error
	return result, err
}
func (r *Repository) UpdateSite(ctx context.Context, code string, in SiteInput, event audit.Event) error {
	if !identityCode.MatchString(code) || !validSite(in) {
		return ErrInvalid
	}
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := requireSiteAdmin(tx, event.Metadata.ActorID); err != nil {
			return err
		}
		var s site
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("code = ?", code).Take(&s).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrInvalid
			}
			return err
		}
		var owner string
		if err := tx.Table("wb_cloud_site_code").Select("site_code").Where("code = ?", in.Code).Scan(&owner).Error; err != nil {
			return err
		}
		if owner != "" && owner != code {
			return ErrConflict
		}
		if err := tx.Model(&site{}).Where("code = ?", code).Updates(map[string]any{"code": in.Code, "name": in.Name}).Error; err != nil {
			return err
		}
		if owner == "" {
			if err := tx.Exec("INSERT INTO wb_cloud_site_code (code, site_code) VALUES (?, ?)", in.Code, in.Code).Error; err != nil {
				return err
			}
		}
		return audit.RecordOn(ctx, tx, event)
	})
	return siteError(err)
}
