package deduction

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"time"

	"fenchichun.local/server/internal/audit"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

func requireManage(tx *gorm.DB, actor int64) error {
	var n int64
	err := tx.Table("sys_user_role ur").
		Joins("JOIN sys_role r ON r.id=ur.role_id AND r.deleted=0 AND r.status=1").
		Joins("JOIN sys_role_menu rm ON rm.role_id=r.id").
		Joins("JOIN sys_menu m ON m.id=rm.menu_id AND m.deleted=0 AND m.status=1").
		Where("ur.user_id=? AND m.permission_code=?", actor, ManagePermission).
		Count(&n).Error
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrForbidden
	}
	return nil
}

func (r *Repository) Categories(ctx context.Context) ([]Category, error) {
	rows := []Category{}
	err := r.db.WithContext(ctx).Order("sort_order, code").Find(&rows).Error
	return rows, err
}

func (r *Repository) List(ctx context.Context, actor int64, materialCode string) ([]Rule, error) {
	rows := []Rule{}
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := requireManage(tx, actor); err != nil {
			return err
		}
		query := tx.Table("grain_deduction_rule r").
			Select("r.*, m.name AS material_name, c.name AS category_name").
			Joins("JOIN wb_cloud_material m ON m.code=r.material_code").
			Joins("JOIN grain_deduction_category c ON c.code=r.category_code")
		if materialCode != "" {
			query = query.Where("r.material_code=?", materialCode)
		}
		if err := query.Order("m.name, c.sort_order, r.code, r.version DESC").Scan(&rows).Error; err != nil {
			return err
		}
		return attachRanges(tx, rows)
	})
	return rows, err
}

// ActiveRules returns the enabled rules that are effective now. It is used by
// the site-facing trip query and does not require a management permission.
func (r *Repository) ActiveRules(ctx context.Context, materialCode string) ([]Rule, error) {
	rows := []Rule{}
	now := time.Now().UTC()
	err := r.db.WithContext(ctx).Table("grain_deduction_rule r").
		Select("r.*, m.name AS material_name, c.name AS category_name").
		Joins("JOIN wb_cloud_material m ON m.code=r.material_code").
		Joins("JOIN grain_deduction_category c ON c.code=r.category_code").
		Where("r.material_code=? AND r.effective_from <= ?", materialCode, now).
		Where(`r.enabled=TRUE AND NOT EXISTS (
			SELECT 1 FROM grain_deduction_rule n
			WHERE n.code=r.code AND n.version > r.version AND n.effective_from <= ?
		)`, now).
		Order("c.sort_order, r.code").
		Scan(&rows).Error
	if err != nil {
		return rows, err
	}
	err = attachRanges(r.db.WithContext(ctx), rows)
	return rows, err
}

func attachRanges(tx *gorm.DB, rows []Rule) error {
	if len(rows) == 0 {
		return nil
	}
	ids := make([]int64, 0, len(rows))
	index := make(map[int64]int, len(rows))
	for i := range rows {
		ids = append(ids, rows[i].ID)
		index[rows[i].ID] = i
		rows[i].Ranges = []Range{}
	}
	// Range does not carry rule_id in its JSON shape; scan it separately.
	type rangeRow struct {
		Range
		RuleID int64 `gorm:"column:rule_id"`
	}
	typed := []rangeRow{}
	if err := tx.Table("grain_deduction_rule_range").Where("rule_id IN ?", ids).Order("rule_id, sort_order").Scan(&typed).Error; err != nil {
		return err
	}
	for _, item := range typed {
		if i, ok := index[item.RuleID]; ok {
			rows[i].Ranges = append(rows[i].Ranges, item.Range)
		}
	}
	return nil
}

func (r *Repository) Save(ctx context.Context, actor, id int64, in Input, e audit.Event) (Rule, error) {
	in.normalize()
	if err := in.validate(); err != nil {
		return Rule{}, err
	}
	var result Rule
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := requireManage(tx, actor); err != nil {
			return err
		}
		var material struct {
			Name    string
			Enabled bool
		}
		if err := tx.Table("wb_cloud_material").Select("name, enabled").Where("code=?", in.MaterialCode).Take(&material).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return fmt.Errorf("%w：物料不存在", ErrInvalid)
			}
			return err
		}
		if !material.Enabled {
			return fmt.Errorf("%w：物料已停用", ErrInvalid)
		}
		var category Category
		if err := tx.Where("code=?", in.CategoryCode).Take(&category).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return fmt.Errorf("%w：扣减类别不存在", ErrInvalid)
			}
			return err
		}
		if !category.Enabled {
			return fmt.Errorf("%w：扣减类别已停用", ErrInvalid)
		}
		now := time.Now().UTC()
		effective := now
		if in.EffectiveFrom != "" {
			parsed, err := parseTime(in.EffectiveFrom)
			if err != nil {
				return fmt.Errorf("%w：生效时间格式不正确", ErrInvalid)
			}
			effective = parsed.UTC()
		}
		code := in.Code
		version := int64(1)
		if id == 0 {
			if code == "" {
				var n int64
				if err := tx.Raw("INSERT INTO wb_cloud_sequence(kind,value) VALUES (?,1) ON CONFLICT(kind) DO UPDATE SET value=wb_cloud_sequence.value+1 RETURNING value", "deduction-rule").Scan(&n).Error; err != nil {
					return err
				}
				code = fmt.Sprintf("DR-%06d", n)
			} else {
				var count int64
				if err := tx.Model(&Rule{}).Where("code=?", code).Count(&count).Error; err != nil {
					return err
				}
				if count > 0 {
					return fmt.Errorf("%w：规则编码已存在，请直接编辑原规则生成新版本", ErrConflict)
				}
			}
		} else {
			var current Rule
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id=?", id).Take(&current).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return ErrNotFound
				}
				return err
			}
			// Editing any version creates the next version of the same rule code.
			// The old row stays available for the effective-date history.
			code = current.Code
			if err := tx.Raw("SELECT COALESCE(MAX(version),0)+1 FROM grain_deduction_rule WHERE code=?", code).Scan(&version).Error; err != nil {
				return err
			}
		}
		result = Rule{
			Code: code, MaterialCode: in.MaterialCode, CategoryCode: in.CategoryCode,
			Mode: in.Mode, BasisField: in.BasisField, AmountMilliTonne: in.AmountMilliTonne,
			Version: version, EffectiveFrom: effective, Enabled: in.Enabled, Remark: in.Remark,
			CreatedAt: now, UpdatedAt: now,
		}
		if err := tx.Create(&result).Error; err != nil {
			return ErrConflict
		}
		if in.Mode == ModePercent {
			for i, item := range in.Ranges {
				row := Range{MinValue: item.MinValue, RateBP: item.RateBP, SortOrder: i + 1}
				if item.MaxValue != "" {
					max := item.MaxValue
					row.MaxValue = &max
				}
				if err := tx.Table("grain_deduction_rule_range").Create(map[string]any{
					"rule_id": result.ID, "min_value": row.MinValue, "max_value": row.MaxValue,
					"rate_bp": row.RateBP, "sort_order": row.SortOrder,
				}).Error; err != nil {
					return err
				}
			}
		}
		if err := tx.Table("wb_cloud_material").Where("code=?", result.MaterialCode).Take(&material).Error; err != nil {
			return err
		}
		result.MaterialName = material.Name
		result.CategoryName = category.Name
		if in.Mode == ModePercent {
			ranges := []Range{}
			if err := tx.Table("grain_deduction_rule_range").Where("rule_id=?", result.ID).Order("sort_order").Find(&ranges).Error; err != nil {
				return err
			}
			result.Ranges = ranges
		}
		e.Resource = "grain-deduction-rule"
		e.ResourceID = result.ID
		return audit.RecordOn(ctx, tx, e)
	})
	return result, err
}

// Delete removes one rule version and its ranges. Other versions of the same
// rule code remain; if the deleted row was the effective version, the previous
// version becomes effective again according to its date and enabled state.
func (r *Repository) Delete(ctx context.Context, actor, id int64, e audit.Event) error {
	if id <= 0 {
		return ErrInvalid
	}
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := requireManage(tx, actor); err != nil {
			return err
		}
		var rule Rule
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id=?", id).Take(&rule).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound
			}
			return err
		}
		if err := tx.Where("rule_id=?", id).Delete(&Range{}).Error; err != nil {
			return err
		}
		if err := tx.Where("id=?", id).Delete(&Rule{}).Error; err != nil {
			return err
		}
		e.Resource = "grain-deduction-rule"
		e.ResourceID = id
		return audit.RecordOn(ctx, tx, e)
	})
}

// Evaluate resolves every active rule for the material against the inspection
// values. Percent rules return their band rate; the weighing client converts
// that rate to tonnes against the final net weight.
func (r *Repository) Evaluate(ctx context.Context, materialCode, moisture, impurity string) ([]Evaluation, error) {
	rules, err := r.ActiveRules(ctx, materialCode)
	if err != nil {
		return nil, err
	}
	items := []Evaluation{}
	for _, rule := range rules {
		if rule.Mode == ModeAmount {
			if rule.AmountMilliTonne <= 0 {
				continue
			}
			items = append(items, Evaluation{
				RuleID: rule.ID, RuleCode: rule.Code, RuleVersion: rule.Version,
				CategoryCode: rule.CategoryCode, CategoryName: rule.CategoryName,
				Mode: ModeAmount, AmountMilliTonne: rule.AmountMilliTonne,
			})
			continue
		}
		value, label := basisValue(rule.BasisField, moisture, impurity)
		if value == "" {
			continue
		}
		parsed, ok := new(big.Rat).SetString(value)
		if !ok {
			continue
		}
		for _, band := range rule.Ranges {
			min, ok := new(big.Rat).SetString(band.MinValue)
			if !ok || parsed.Cmp(min) < 0 {
				continue
			}
			if band.MaxValue != nil {
				max, ok := new(big.Rat).SetString(*band.MaxValue)
				if !ok || parsed.Cmp(max) >= 0 {
					continue
				}
			}
			rate := band.RateBP
			items = append(items, Evaluation{
				RuleID: rule.ID, RuleCode: rule.Code, RuleVersion: rule.Version,
				CategoryCode: rule.CategoryCode, CategoryName: rule.CategoryName,
				Mode: ModePercent, BasisField: rule.BasisField, BasisValue: value,
				RateBP: &rate, Explanation: fmt.Sprintf("%s %s 落入 %s 至 %s 区间", label, value, band.MinValue, rangeEnd(band.MaxValue)),
			})
			break
		}
	}
	return items, nil
}

func basisValue(field, moisture, impurity string) (string, string) {
	switch field {
	case BasisMoisture:
		return moisture, "水分"
	case BasisImpurity:
		return impurity, "杂质"
	}
	return "", ""
}

func rangeEnd(value *string) string {
	if value == nil {
		return "不限"
	}
	return *value
}
