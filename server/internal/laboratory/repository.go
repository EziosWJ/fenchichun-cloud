package laboratory

import (
	"context"
	"errors"
	"fenchichun.local/server/internal/audit"
	"fmt"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"time"
)

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }
func requireAccess(tx *gorm.DB, actor int64) error {
	return requireMenu(tx, actor, "laboratory:inspections")
}
func requireMenu(tx *gorm.DB, actor int64, permission string) error {
	var n int64
	err := tx.Table("sys_user_role ur").Joins("JOIN sys_role r ON r.id=ur.role_id AND r.deleted=0 AND r.status=1").Joins("JOIN sys_role_menu rm ON rm.role_id=r.id").Joins("JOIN sys_menu m ON m.id=rm.menu_id AND m.deleted=0 AND m.status=1").Where("ur.user_id=? AND m.permission_code=?", actor, permission).Count(&n).Error
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrForbidden
	}
	return nil
}

// All linked inspection writes lock the trip before the inspection.
func find(tx *gorm.DB, id int64, lock bool) (Inspection, error) {
	var v Inspection
	err := tx.Where("id=?", id).Take(&v).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return v, ErrNotFound
	}
	if err != nil {
		return v, err
	}
	if !lock {
		return v, nil
	}
	before := v.TripID
	if before != nil {
		if _, err := inspectionTrip(tx, *before); err != nil {
			return v, err
		}
	}
	err = tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id=?", id).Take(&v).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return v, ErrNotFound
	}
	if err != nil {
		return v, err
	}
	if (before == nil) != (v.TripID == nil) || (before != nil && v.TripID != nil && *before != *v.TripID) {
		return v, ErrConflict
	}
	return v, nil
}

type tripReference struct {
	ID                                                                                          int64
	SiteCode, Plate, MaterialCode, PartyCode, Driver, DriverPhone, ContractNo, InspectionMethod string
	ExitedAt, UnloadedAt                                                                        *time.Time
	TicketID, EffectiveInspectionID                                                             *int64
}

func inspectionTrip(tx *gorm.DB, id int64) (tripReference, error) {
	var t tripReference
	err := tx.Table("grain_trip").Clauses(clause.Locking{Strength: "UPDATE"}).Where("id=?", id).Take(&t).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return t, ErrNotFound
	}
	if err != nil {
		return t, err
	}
	var n int64
	if err := tx.Table("grain_exit_permit").Where("trip_id=?", id).Count(&n).Error; err != nil {
		return t, err
	}
	if t.InspectionMethod != "lab" {
		return t, fmt.Errorf("%w：目测流转单不能关联化验单", ErrConflict)
	}
	if t.ExitedAt != nil || t.UnloadedAt != nil || t.TicketID != nil || n > 0 {
		return t, fmt.Errorf("%w：流转单已卸粮、关联磅单、开证或出厂，不能更改化验依据", ErrConflict)
	}
	return t, nil
}
func matchesTrip(tx *gorm.DB, in Input) error {
	if in.TripID == nil {
		return nil
	}
	t, err := inspectionTrip(tx, *in.TripID)
	if err != nil {
		return err
	}
	if t.SiteCode != in.SiteCode || t.Plate != in.Plate || t.MaterialCode != in.MaterialCode || t.PartyCode != in.PartyCode {
		return fmt.Errorf("%w：化验单须与关联流转单的厂区、车牌、粮种和供应商一致", ErrConflict)
	}
	return nil
}
func (r *Repository) Detail(ctx context.Context, actor, id int64) (Inspection, error) {
	var v Inspection
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := requireAccess(tx, actor); err != nil {
			return err
		}
		var err error
		v, err = find(tx, id, false)
		return err
	})
	return v, err
}
func (r *Repository) List(ctx context.Context, actor int64, q Query) (Page, error) {
	result := Page{Records: []Inspection{}, Page: q.Page, PageSize: q.PageSize}
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := requireAccess(tx, actor); err != nil {
			if !errors.Is(err, ErrForbidden) || !q.Unlinked {
				return err
			}
			if err := requireMenu(tx, actor, "grain-intake:trips"); err != nil {
				return err
			}
		}
		query := tx.Model(&Inspection{})
		if q.TripID > 0 {
			query = query.Where("trip_id=?", q.TripID)
		}
		if q.Unlinked {
			query = query.Where("trip_id IS NULL")
		}
		if q.Status != "" {
			query = query.Where("status=?", q.Status)
		}
		if q.SiteCode != "" {
			query = query.Where("site_code=?", q.SiteCode)
		}
		if q.Keyword != "" {
			term := "%" + q.Keyword + "%"
			query = query.Where("number LIKE ? OR plate LIKE ? OR material_name LIKE ? OR party_name LIKE ?", term, term, term, term)
		}
		if err := query.Count(&result.Total).Error; err != nil {
			return err
		}
		return query.Order("created_at DESC,id DESC").Offset((q.Page - 1) * q.PageSize).Limit(q.PageSize).Find(&result.Records).Error
	})
	return result, err
}

// Reference names become snapshots. Confirmation checks that selected references remain enabled.
func references(tx *gorm.DB, in Input) (string, string, error) {
	material, party := "", ""
	if in.SiteCode != "" {
		var s struct{ Enabled bool }
		err := tx.Table("wb_cloud_site").Where("code=?", in.SiteCode).Take(&s).Error
		if errors.Is(err, gorm.ErrRecordNotFound) || (err == nil && !s.Enabled) {
			return "", "", fmt.Errorf("%w：厂区不存在或已停用", ErrInvalid)
		}
		if err != nil {
			return "", "", err
		}
	}
	if in.MaterialCode != "" {
		var m struct {
			Name    string
			Enabled bool
		}
		err := tx.Table("wb_cloud_material").Where("code=?", in.MaterialCode).Take(&m).Error
		if errors.Is(err, gorm.ErrRecordNotFound) || (err == nil && !m.Enabled) {
			return "", "", fmt.Errorf("%w：粮种不存在或已停用", ErrInvalid)
		}
		if err != nil {
			return "", "", err
		}
		material = m.Name
	}
	if in.PartyCode != "" {
		var p struct {
			Name       string
			Enabled    bool
			IsSupplier bool
		}
		err := tx.Table("wb_cloud_party").Where("code=?", in.PartyCode).Take(&p).Error
		if errors.Is(err, gorm.ErrRecordNotFound) || (err == nil && (!p.Enabled || !p.IsSupplier)) {
			return "", "", fmt.Errorf("%w：请选择启用的供应商", ErrInvalid)
		}
		if err != nil {
			return "", "", err
		}
		party = p.Name
	}
	return material, party, nil
}
func create(tx *gorm.DB, in Input, original *int64, actor int64) (Inspection, error) {
	if in.TripID != nil {
		t, err := inspectionTrip(tx, *in.TripID)
		if err != nil {
			return Inspection{}, err
		}
		in.SiteCode = t.SiteCode
		in.Plate = t.Plate
		in.MaterialCode = t.MaterialCode
		in.PartyCode = t.PartyCode
		in.Driver = t.Driver
		in.DriverPhone = t.DriverPhone
		in.ContractNo = t.ContractNo
	}
	var n int64
	if err := tx.Raw("INSERT INTO wb_cloud_sequence (kind,value) VALUES (?,1) ON CONFLICT (kind) DO UPDATE SET value=wb_cloud_sequence.value+1 RETURNING value", "inspection").Scan(&n).Error; err != nil {
		return Inspection{}, err
	}
	material, party, err := references(tx, in)
	if err != nil {
		return Inspection{}, err
	}
	now := time.Now().UTC()
	v := Inspection{Number: fmt.Sprintf("HY-%06d", n), Status: "draft", Version: 1, OriginalID: original, Input: in, MaterialName: material, PartyName: party, CreatedBy: actor, CreatedAt: now, UpdatedAt: now}
	err = tx.Create(&v).Error
	return v, err
}
func record(ctx context.Context, tx *gorm.DB, e audit.Event, v Inspection) error {
	if v.TripID != nil {
		if err := tx.Table("grain_trip").Where("id=?", *v.TripID).Updates(map[string]any{"version": gorm.Expr("version+1"), "updated_at": time.Now().UTC()}).Error; err != nil {
			return err
		}
		if err := tx.Exec("INSERT INTO grain_trip_event(trip_id,action,description,actor_id) VALUES (?,?,?,?)", *v.TripID, e.Action, "化验单 "+v.Number+"："+map[string]string{"inspection.save": "保存草稿", "inspection.confirm": "确认结果", "inspection.void": "作废", "inspection.delete": "删除草稿", "inspection.retest": "创建复检"}[e.Action], e.Metadata.ActorID).Error; err != nil {
			return err
		}
	}
	e.Resource = "laboratory-inspection"
	e.ResourceID = v.ID
	return audit.RecordOn(ctx, tx, e)
}
func (r *Repository) Save(ctx context.Context, id, version int64, in Input, e audit.Event) (Inspection, error) {
	var v Inspection
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := requireAccess(tx, e.Metadata.ActorID); err != nil {
			return err
		}
		var err error
		if id == 0 {
			v, err = create(tx, in, nil, e.Metadata.ActorID)
			if err != nil {
				return err
			}
		} else {
			v, err = find(tx, id, true)
			if err != nil {
				return err
			}
			if v.Status != "draft" || v.Version != version {
				return ErrConflict
			}
			if in.TripID != nil && (v.TripID == nil || *in.TripID != *v.TripID) {
				return ErrConflict
			}
			in.TripID = v.TripID
			if err := matchesTrip(tx, in); err != nil {
				return err
			}
			material, party, err := references(tx, in)
			if err != nil {
				return err
			}
			v.Input = in
			v.MaterialName = material
			v.PartyName = party
			v.Version++
			v.UpdatedAt = time.Now().UTC()
			if err := tx.Save(&v).Error; err != nil {
				return err
			}
		}
		return record(ctx, tx, e, v)
	})
	return v, err
}
func (r *Repository) Transition(ctx context.Context, id, version int64, action, reason string, e audit.Event) (Inspection, error) {
	var v Inspection
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := requireAccess(tx, e.Metadata.ActorID); err != nil {
			return err
		}
		var err error
		v, err = find(tx, id, true)
		if err != nil {
			return err
		}
		if v.Version != version {
			return ErrConflict
		}
		now, actor := time.Now().UTC(), e.Metadata.ActorID
		switch action {
		case "confirm":
			if v.Status != "draft" {
				return ErrConflict
			}
			if err := matchesTrip(tx, v.Input); err != nil {
				return err
			}
			if err := v.Input.validate(true); err != nil {
				return err
			}
			material, party, err := references(tx, v.Input)
			if err != nil {
				return err
			}
			v.MaterialName = material
			v.PartyName = party
			v.Status = "confirmed"
			v.ConfirmedAt = &now
			v.ConfirmedBy = &actor
		case "void":
			if v.Status != "confirmed" {
				return ErrConflict
			}
			if v.TripID != nil {
				if err := tx.Table("grain_trip").Where("id=? AND effective_inspection_id=?", *v.TripID, v.ID).Updates(map[string]any{"effective_inspection_id": nil, "effective_selected_at": nil, "effective_selected_by": nil}).Error; err != nil {
					return err
				}
			}
			v.Status = "void"
			v.VoidReason = reason
			v.VoidedAt = &now
			v.VoidedBy = &actor
		case "delete":
			if v.Status != "draft" {
				return ErrConflict
			}
			if err := tx.Delete(&v).Error; err != nil {
				return err
			}
			return record(ctx, tx, e, v)
		default:
			return ErrInvalid
		}
		v.Version++
		v.UpdatedAt = now
		if err := tx.Save(&v).Error; err != nil {
			return err
		}
		return record(ctx, tx, e, v)
	})
	return v, err
}
func (r *Repository) Retest(ctx context.Context, id, version int64, e audit.Event) (Inspection, error) {
	var v Inspection
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := requireAccess(tx, e.Metadata.ActorID); err != nil {
			return err
		}
		original, err := find(tx, id, true)
		if err != nil {
			return err
		}
		if original.Status != "confirmed" || original.Version != version {
			return ErrConflict
		}
		in := original.Input
		in.Moisture = ""
		in.Impurity = ""
		in.BulkDensity = ""
		in.Conclusion = ""
		in.Reason = ""
		in.Remark = ""
		v, err = create(tx, in, &original.ID, e.Metadata.ActorID)
		if err != nil {
			return err
		}
		return record(ctx, tx, e, v)
	})
	return v, err
}
