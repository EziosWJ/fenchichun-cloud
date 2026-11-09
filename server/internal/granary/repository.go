package granary

import (
	"context"
	"errors"
	"gorm.io/gorm"
	"time"
)

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

func requireAny(tx *gorm.DB, actor int64, permissions ...string) error {
	var n int64
	err := tx.Table("sys_user_role ur").
		Joins("JOIN sys_role r ON r.id=ur.role_id AND r.deleted=0 AND r.status=1").
		Joins("JOIN sys_role_menu rm ON rm.role_id=r.id").
		Joins("JOIN sys_menu m ON m.id=rm.menu_id AND m.deleted=0 AND m.status=1").
		Where("ur.user_id=? AND m.permission_code IN ?", actor, permissions).
		Count(&n).Error
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrForbidden
	}
	return nil
}

// List 返回指定厂区的粮仓；siteCode 为空时返回全部。
func (r *Repository) List(ctx context.Context, actor int64, onlyEnabled bool) ([]Granary, error) {
	records := []Granary{}
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := requireAny(tx, actor, ManagePermission, UsePermission, "grain-intake:granaries"); err != nil {
			return err
		}
		query := tx.Model(&Granary{})
		if onlyEnabled {
			query = query.Where("enabled=true")
		}
		return query.Order("name ASC").Find(&records).Error
	})
	return records, err
}

func (r *Repository) Create(ctx context.Context, actor int64, in Input) (Granary, error) {
	in.normalize()
	if err := in.validate(); err != nil {
		return Granary{}, err
	}
	var v Granary
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := requireAny(tx, actor, ManagePermission); err != nil {
			return err
		}
		var n int64
		if err := tx.Model(&Granary{}).Where("lower(name)=lower(?)", in.Name).Count(&n).Error; err != nil {
			return err
		}
		if n > 0 {
			return ErrConflict
		}
		now := time.Now().UTC()
		v = Granary{Name: in.Name, Enabled: in.Enabled, Remark: in.Remark, CreatedAt: now, UpdatedAt: now}
		return tx.Create(&v).Error
	})
	return v, err
}

func (r *Repository) Update(ctx context.Context, actor, id int64, in Input) (Granary, error) {
	in.normalize()
	if err := in.validate(); err != nil {
		return Granary{}, err
	}
	var v Granary
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := requireAny(tx, actor, ManagePermission); err != nil {
			return err
		}
		if err := tx.Where("id=?", id).Take(&v).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound
			}
			return err
		}
		var n int64
		if err := tx.Model(&Granary{}).Where("lower(name)=lower(?) AND id<>?", in.Name, id).Count(&n).Error; err != nil {
			return err
		}
		if n > 0 {
			return ErrConflict
		}
		v.Name, v.Enabled, v.Remark = in.Name, in.Enabled, in.Remark
		v.UpdatedAt = time.Now().UTC()
		return tx.Save(&v).Error
	})
	return v, err
}

func (r *Repository) Delete(ctx context.Context, actor, id int64) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := requireAny(tx, actor, ManagePermission); err != nil {
			return err
		}
		result := tx.Delete(&Granary{}, id)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return ErrNotFound
		}
		return nil
	})
}
