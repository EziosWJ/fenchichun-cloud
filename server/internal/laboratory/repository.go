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

func find(tx *gorm.DB, id int64, lock bool) (Inspection, error) {
	var v Inspection
	if lock {
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id=?", id).Take(&v).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return v, ErrNotFound
		}
		return v, err
	}
	err := tx.Where("id=?", id).Take(&v).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return v, ErrNotFound
	}
	return v, err
}

type tripReference struct {
	ID                                                              int64
	SiteCode                                                        string
	Plate, MaterialCode, PartyCode, Driver, DriverPhone, ContractNo string
	ExitedAt, UnloadedAt                                            *time.Time
	TicketID, EffectiveInspectionID                                 *int64
}

// inspectionTrip 锁定流转单并确认它仍处于可化验阶段。
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
	if t.ExitedAt != nil || t.UnloadedAt != nil || t.TicketID != nil || n > 0 {
		return t, fmt.Errorf("%w：流转单已卸粮、关联磅单、开证或出厂，不能录入化验结果", ErrConflict)
	}
	return t, nil
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
			return err
		}
		query := tx.Model(&Inspection{})
		if q.TripID > 0 {
			query = query.Where("trip_id=?", q.TripID)
		}
		if q.Status != "" {
			query = query.Where("status=?", q.Status)
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

// Create 为一张流转单录入唯一一次化验结果，提交即确认并自动成为本趟生效依据。
func (r *Repository) Create(ctx context.Context, in Input, e audit.Event) (Inspection, error) {
	var v Inspection
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := requireAccess(tx, e.Metadata.ActorID); err != nil {
			return err
		}
		if in.TripID == nil || *in.TripID <= 0 {
			return fmt.Errorf("%w：请先选择待化验的流转单", ErrInvalid)
		}
		trip, err := inspectionTrip(tx, *in.TripID)
		if err != nil {
			return err
		}
		var n int64
		if err := tx.Model(&Inspection{}).Where("trip_id=?", *in.TripID).Count(&n).Error; err != nil {
			return err
		}
		if n > 0 {
			return fmt.Errorf("%w：该流转单已录入化验结果", ErrConflict)
		}
		in.SiteCode = trip.SiteCode
		in.Plate = trip.Plate
		in.MaterialCode = trip.MaterialCode
		in.PartyCode = trip.PartyCode
		in.Driver = trip.Driver
		in.DriverPhone = trip.DriverPhone
		in.ContractNo = trip.ContractNo
		if err := in.validate(true); err != nil {
			return err
		}

		var seq int64
		if err := tx.Raw("INSERT INTO wb_cloud_sequence (kind,value) VALUES (?,1) ON CONFLICT (kind) DO UPDATE SET value=wb_cloud_sequence.value+1 RETURNING value", "inspection").Scan(&seq).Error; err != nil {
			return err
		}
		material, party, err := references(tx, in)
		if err != nil {
			return err
		}
		now := time.Now().UTC()
		actor := e.Metadata.ActorID
		v = Inspection{
			Number: fmt.Sprintf("HY-%06d", seq), Status: "confirmed", Version: 1,
			Input: in, MaterialName: material, PartyName: party,
			CreatedBy: actor, CreatedAt: now, UpdatedAt: now,
			ConfirmedBy: &actor, ConfirmedAt: &now,
		}
		if err := tx.Create(&v).Error; err != nil {
			return fmt.Errorf("%w：该流转单已录入化验结果", ErrConflict)
		}
		if err := tx.Table("grain_trip").Where("id=?", *in.TripID).Updates(map[string]any{
			"effective_inspection_id": v.ID,
			"effective_selected_at":   now,
			"effective_selected_by":   actor,
			"version":                 gorm.Expr("version+1"),
			"updated_at":              now,
		}).Error; err != nil {
			return err
		}
		conclusion := map[string]string{"accept": "接收", "reject": "拒收"}[in.Conclusion]
		description := fmt.Sprintf("化验单 %s：%s（水分 %s%%，杂质 %s%%，容重 %s g/L）", v.Number, conclusion, in.Moisture, in.Impurity, in.BulkDensity)
		if err := tx.Exec("INSERT INTO grain_trip_event(trip_id,action,description,actor_id) VALUES (?,?,?,?)", *in.TripID, "inspection.create", description, actor).Error; err != nil {
			return err
		}
		e.Resource = "laboratory-inspection"
		e.ResourceID = v.ID
		return audit.RecordOn(ctx, tx, e)
	})
	return v, err
}
