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

type CategoryInput struct {
	Name    string `json:"name"`
	Enabled bool   `json:"enabled"`
}

func (r *Repository) Categories(ctx context.Context) ([]Category, error) {
	values := []Category{}
	err := r.db.WithContext(ctx).Order("code").Find(&values).Error
	return values, err
}

func (r *Repository) SaveCategory(ctx context.Context, code string, in CategoryInput, event audit.Event) (Category, error) {
	if strings.TrimSpace(in.Name) == "" || utf8.RuneCountInString(in.Name) > 100 {
		return Category{}, ErrInvalid
	}
	var item Category
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if code == "" {
			var n int64
			if err := tx.Raw("INSERT INTO wb_cloud_sequence (kind, value) VALUES (?, 1) ON CONFLICT (kind) DO UPDATE SET value = wb_cloud_sequence.value + 1 RETURNING value", "category").Scan(&n).Error; err != nil {
				return err
			}
			item = Category{Code: fmt.Sprintf("C-C-%04d", n), Name: in.Name, Enabled: in.Enabled}
			if err := tx.Create(&item).Error; err != nil {
				return err
			}
		} else {
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("code = ?", code).Take(&item).Error; err != nil {
				if err == gorm.ErrRecordNotFound {
					return ErrInvalid
				}
				return err
			}
			item.Name = in.Name
			item.Enabled = in.Enabled
			if err := tx.Model(&item).Updates(map[string]any{"name": item.Name, "enabled": item.Enabled}).Error; err != nil {
				return err
			}
		}
		return audit.RecordOn(ctx, tx, event)
	})
	return item, err
}
