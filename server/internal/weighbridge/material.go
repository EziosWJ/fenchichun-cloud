package weighbridge

import (
	"context"
	"fmt"
	"strings"
	"unicode/utf8"

	"fenchichun.local/server/internal/audit"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type MaterialInput struct {
	Name         string  `json:"name"`
	CategoryCode *string `json:"categoryCode"`
	Spec         string  `json:"spec"`
	Remark       string  `json:"remark"`
	Enabled      bool    `json:"enabled"`
}

func (r *Repository) SaveMaterial(ctx context.Context, code string, in MaterialInput, event audit.Event) (Material, error) {
	if strings.TrimSpace(in.Name) == "" || utf8.RuneCountInString(in.Name) > 100 || utf8.RuneCountInString(in.Spec) > 200 || utf8.RuneCountInString(in.Remark) > 2000 {
		return Material{}, ErrInvalid
	}
	var result Material
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var cat *Category
		if in.CategoryCode != nil {
			var c Category
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("code = ?", *in.CategoryCode).Take(&c).Error; err != nil {
				if err == gorm.ErrRecordNotFound {
					return ErrInvalid
				}
				return err
			}
			cat = &c
		}
		if code == "" {
			if cat != nil && !cat.Enabled {
				return ErrInvalid
			}
			var n int64
			if err := tx.Raw("INSERT INTO wb_cloud_sequence (kind, value) VALUES (?, 1) ON CONFLICT (kind) DO UPDATE SET value = wb_cloud_sequence.value + 1 RETURNING value", "material").Scan(&n).Error; err != nil {
				return err
			}
			result = Material{Code: fmt.Sprintf("C-M-%04d", n), Name: in.Name, Spec: in.Spec, Remark: in.Remark, Enabled: in.Enabled}
			if cat != nil {
				result.CategoryID = &cat.ID
			}
			if err := tx.Create(&result).Error; err != nil {
				return err
			}
		} else {
			if err := tx.Where("code = ?", code).Take(&result).Error; err != nil {
				if err == gorm.ErrRecordNotFound {
					return ErrInvalid
				}
				return err
			}
			if cat != nil && !cat.Enabled && (result.CategoryID == nil || *result.CategoryID != cat.ID) {
				return ErrInvalid
			}
			var categoryID *int64
			if cat != nil {
				categoryID = &cat.ID
			}
			result.Name = in.Name
			result.CategoryID = categoryID
			result.Spec = in.Spec
			result.Remark = in.Remark
			result.Enabled = in.Enabled
			if err := tx.Model(&result).Updates(map[string]any{"name": in.Name, "category_id": categoryID, "spec": in.Spec, "remark": in.Remark, "enabled": in.Enabled}).Error; err != nil {
				return err
			}
		}
		if cat != nil {
			result.CategoryCode = &cat.Code
		}
		return audit.RecordOn(ctx, tx, event)
	})
	return result, err
}
