package grainintake

import (
	"context"
	"encoding/json"
	"errors"
	"fenchichun.local/server/internal/audit"
	"fenchichun.local/server/internal/laboratory"
	"fenchichun.local/server/internal/weighbridge"
	"fmt"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"time"
)

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db} }
func access(tx *gorm.DB, actor int64, permission string) error {
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

const stageSQL = `CASE
 WHEN t.exited_at IS NOT NULL THEN 'exited'
 WHEN t.effective_inspection_id IS NOT NULL AND (i.id IS NULL OR i.status <> 'confirmed' OR i.trip_id <> t.id) THEN 'blocked'
 WHEN t.ticket_id IS NOT NULL AND (w.id IS NULL OR w.status <> 'valid') THEN 'blocked'
 WHEN t.inspection_method='visual' AND t.visual_conclusion='' THEN 'pending_inspection'
 WHEN t.inspection_method='lab' AND i.id IS NULL THEN 'pending_inspection'
 WHEN t.inspection_method='visual' AND t.visual_conclusion='reject' AND t.ticket_id IS NOT NULL THEN 'blocked'
 WHEN t.inspection_method='visual' AND t.visual_conclusion='reject' THEN 'rejected'
 WHEN i.conclusion='reject' AND t.ticket_id IS NOT NULL THEN 'blocked'
 WHEN i.conclusion='reject' THEN 'rejected'
 WHEN p.status='approved' THEN 'permit_approved'
 WHEN p.id IS NOT NULL THEN 'permit_pending'
 WHEN t.ticket_id IS NOT NULL AND t.unloaded_at IS NOT NULL THEN 'ready'
 ELSE 'accepted' END`

func tripQuery(tx *gorm.DB) *gorm.DB {
	return tx.Table("grain_trip t").Joins("LEFT JOIN grain_inspection i ON i.id=t.effective_inspection_id").Joins("LEFT JOIN grain_inspection ti ON ti.trip_id=t.id").Joins("LEFT JOIN wb_cloud_ticket w ON w.id=t.ticket_id").Joins("LEFT JOIN grain_exit_permit p ON p.trip_id=t.id")
}
func (r *Repository) Trips(ctx context.Context, actor int64, q Query) (TripPage, error) {
	result := TripPage{Records: []Trip{}, Page: q.Page, PageSize: q.PageSize}
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		permission := TripPermission
		if q.Gate {
			permission = PermitPermission
		}
		if err := access(tx, actor, permission); err != nil {
			return err
		}
		query := tripQuery(tx)
		if q.Gate {
			query = query.Where("i.conclusion='reject' OR t.visual_conclusion='reject' OR t.exit_basis='rejection'")
		}
		if q.Stage != "" {
			query = query.Where("("+stageSQL+")=?", q.Stage)
		}
		if q.Method != "" {
			query = query.Where("t.inspection_method=?", q.Method)
		}
		if q.Keyword != "" {
			term := "%" + q.Keyword + "%"
			query = query.Where("t.number LIKE ? OR t.plate LIKE ? OR t.party_name LIKE ?", term, term, term)
		}
		if err := query.Count(&result.Total).Error; err != nil {
			return err
		}
		selectSQL := "t.*, CASE WHEN t.inspection_method='visual' THEN t.visual_conclusion ELSE COALESCE(i.conclusion,'') END AS effective_conclusion, ti.id AS inspection_id, COALESCE(ti.conclusion,'') AS inspection_conclusion, " + stageSQL + " AS stage"
		orderSQL := "t.created_at DESC,t.id DESC"
		if q.Order == "inspection_first" {
			orderSQL = "(ti.id IS NULL) DESC,t.created_at DESC,t.id DESC"
		}
		return query.Select(selectSQL).Order(orderSQL).Offset((q.Page - 1) * q.PageSize).Limit(q.PageSize).Scan(&result.Records).Error
	})
	return result, err
}
func (r *Repository) Permits(ctx context.Context, actor int64, q Query) (PermitPage, error) {
	result := PermitPage{Records: []Permit{}, Page: q.Page, PageSize: q.PageSize}
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := access(tx, actor, PermitPermission); err != nil {
			return err
		}
		query := tripQuery(tx).Where("p.id IS NOT NULL")
		if q.Method != "" {
			query = query.Where("t.inspection_method=?", q.Method)
		}
		if q.Keyword != "" {
			term := "%" + q.Keyword + "%"
			query = query.Where("p.number LIKE ? OR t.number LIKE ? OR t.plate LIKE ?", term, term, term)
		}
		if q.Stage != "" {
			query = query.Where("("+stageSQL+")=?", q.Stage)
		}
		if err := query.Count(&result.Total).Error; err != nil {
			return err
		}
		return query.Select("p.*,t.number AS trip_number,t.plate,t.site_code,t.exited_at," + stageSQL + " AS stage").Order("p.created_at DESC,p.id DESC").Offset((q.Page - 1) * q.PageSize).Limit(q.PageSize).Scan(&result.Records).Error
	})
	return result, err
}
func detail(tx *gorm.DB, id int64) (Detail, error) {
	result := Detail{Inspections: []laboratory.Inspection{}, Events: []Event{}}
	err := tripQuery(tx).Select("t.*,CASE WHEN t.inspection_method='visual' THEN t.visual_conclusion ELSE COALESCE(i.conclusion,'') END AS effective_conclusion,ti.id AS inspection_id,COALESCE(ti.conclusion,'') AS inspection_conclusion,"+stageSQL+" AS stage").Where("t.id=?", id).Take(&result.Trip).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return result, ErrNotFound
	}
	if err != nil {
		return result, err
	}
	if err := tx.Where("trip_id=?", id).Order("id DESC").Find(&result.Inspections).Error; err != nil {
		return result, err
	}
	var permit Permit
	err = tx.Where("trip_id=?", id).Take(&permit).Error
	if err == nil {
		result.Permit = &permit
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return result, err
	}
	if result.Trip.TicketID != nil {
		var row struct {
			SiteCode, Status, Snapshot string
			VoidReason                 *string
			VoidedBy                   *string
			VoidedAt                   *time.Time
		}
		if err := tx.Table("wb_cloud_ticket").Where("id=?", *result.Trip.TicketID).Take(&row).Error; err != nil {
			return result, err
		}
		var snap weighbridge.TicketSnapshot
		if err := json.Unmarshal([]byte(row.Snapshot), &snap); err != nil {
			return result, err
		}
		result.Ticket = &weighbridge.TicketResult{SiteCode: row.SiteCode, Status: row.Status, Ticket: snap, VoidReason: row.VoidReason, VoidedBy: row.VoidedBy, VoidedAt: row.VoidedAt}
	}
	err = tx.Table("grain_trip_event e").Select("e.*,COALESCE(NULLIF(u.nickname,''),u.username,'') AS actor_name").Joins("LEFT JOIN sys_user u ON u.id=e.actor_id").Where("e.trip_id=?", id).Order("e.id DESC").Scan(&result.Events).Error
	return result, err
}
func (r *Repository) Detail(ctx context.Context, actor, id int64, scope string) (Detail, error) {
	var value Detail
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := access(tx, actor, scope); err != nil {
			return err
		}
		var err error
		value, err = detail(tx, id)
		return err
	})
	return value, err
}
func lockedTrip(tx *gorm.DB, id int64) (Trip, error) {
	var v Trip
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id=?", id).Take(&v).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		err = ErrNotFound
	}
	return v, err
}
func nextNumber(tx *gorm.DB, kind, prefix string) (string, error) {
	var n int64
	err := tx.Raw("INSERT INTO wb_cloud_sequence(kind,value) VALUES (?,1) ON CONFLICT(kind) DO UPDATE SET value=wb_cloud_sequence.value+1 RETURNING value", kind).Scan(&n).Error
	return fmt.Sprintf("%s-%06d", prefix, n), err
}
func writeEvent(ctx context.Context, tx *gorm.DB, t Trip, e audit.Event, description string) error {
	actor := e.Metadata.ActorID
	row := Event{TripID: t.ID, Action: e.Action, Description: description, ActorID: &actor, CreatedAt: time.Now().UTC()}
	if err := tx.Create(&row).Error; err != nil {
		return err
	}
	e.Resource = "grain-intake"
	e.ResourceID = t.ID
	return audit.RecordOn(ctx, tx, e)
}
func hasPermit(tx *gorm.DB, id int64) (bool, error) {
	var n int64
	err := tx.Model(&Permit{}).Where("trip_id=?", id).Count(&n).Error
	return n > 0, err
}
func references(tx *gorm.DB, in Input) (string, string, string, error) {
	var n int64
	if err := tx.Table("wb_cloud_site").Where("code=? AND enabled=true", in.SiteCode).Count(&n).Error; err != nil {
		return "", "", "", err
	}
	if n != 1 {
		return "", "", "", fmt.Errorf("%w：厂区不存在或已停用", ErrInvalid)
	}
	var material struct{ Name, InspectionMethod string }
	err := tx.Table("wb_cloud_material").Where("code=? AND enabled=true", in.MaterialCode).Take(&material).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", "", "", fmt.Errorf("%w：粮种不存在或已停用", ErrInvalid)
	}
	if err != nil {
		return "", "", "", err
	}
	var party struct{ Name string }
	if in.PartyCode != "" {
		err = tx.Table("wb_cloud_party").Where("code=? AND enabled=true AND is_supplier=true", in.PartyCode).Take(&party).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", "", "", fmt.Errorf("%w：供应商不存在或已停用", ErrInvalid)
		}
		if err != nil {
			return "", "", "", err
		}
	}
	return material.Name, party.Name, material.InspectionMethod, nil
}
func (r *Repository) Save(ctx context.Context, id, version int64, in Input, e audit.Event) (Detail, error) {
	var value Detail
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := access(tx, e.Metadata.ActorID, TripPermission); err != nil {
			return err
		}
		material, party, method, err := references(tx, in)
		if err != nil {
			return err
		}
		now := time.Now().UTC()
		var t Trip
		description := "登记流转单"
		if id == 0 {
			number, err := nextNumber(tx, "grain-trip", "LZ")
			if err != nil {
				return err
			}
			t = Trip{InspectionMethod: method, Number: number, Version: 1, Input: in, MaterialName: material, PartyName: party, CreatedBy: e.Metadata.ActorID, CreatedAt: now, UpdatedAt: now}
			if err := tx.Create(&t).Error; err != nil {
				return err
			}
		} else {
			t, err = lockedTrip(tx, id)
			if err != nil {
				return err
			}
			if t.Version != version || t.ExitedAt != nil {
				return ErrConflict
			}
			exists, err := hasPermit(tx, id)
			if err != nil {
				return err
			}
			if exists {
				return fmt.Errorf("%w：开证后不能修改登记信息", ErrConflict)
			}
			coreChanged := t.SiteCode != in.SiteCode || t.Plate != in.Plate || t.MaterialCode != in.MaterialCode || t.PartyCode != in.PartyCode
			if coreChanged {
				var n int64
				if err := tx.Model(&laboratory.Inspection{}).Where("trip_id=? AND status = 'confirmed'", id).Count(&n).Error; err != nil {
					return err
				}
				if n > 0 || t.VisualInspectedAt != nil || t.TicketID != nil || t.UnloadedAt != nil {
					return fmt.Errorf("%w：已有确认化验、卸粮或磅单，不能覆盖车牌、粮种、供应商及厂区", ErrConflict)
				}
			}
			description = fmt.Sprintf("更正登记：车牌 %s→%s；粮种 %s→%s；供应商 %s→%s", t.Plate, in.Plate, t.MaterialName, material, t.PartyName, party)
			if t.MaterialCode != in.MaterialCode {
				t.InspectionMethod = method
			}
			t.Input = in
			if coreChanged {
				t.MaterialName = material
				t.PartyName = party
			}
			t.Version++
			t.UpdatedAt = now
			if err := tx.Save(&t).Error; err != nil {
				return err
			}
		}
		if err := writeEvent(ctx, tx, t, e, description); err != nil {
			return err
		}
		value, err = detail(tx, t.ID)
		return err
	})
	return value, err
}

// Inspection and ticket rows are locked after their trip; laboratory writes use the same order.
func effective(tx *gorm.DB, t Trip) (laboratory.Inspection, error) {
	var i laboratory.Inspection
	if t.InspectionMethod == "visual" {
		if t.VisualInspectedAt == nil || t.VisualInspectedBy == nil || (t.VisualConclusion != "accept" && t.VisualConclusion != "reject") {
			return i, fmt.Errorf("%w：尚未确认目测结果", ErrConflict)
		}
		i.Conclusion, i.Reason, i.ConfirmedAt = t.VisualConclusion, t.VisualReason, t.VisualInspectedAt
		return i, nil
	}
	if t.EffectiveInspectionID == nil {
		return i, fmt.Errorf("%w：尚未选择生效化验单", ErrConflict)
	}
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id=?", *t.EffectiveInspectionID).Take(&i).Error
	if err != nil {
		return i, err
	}
	if i.Status != "confirmed" || i.TripID == nil || *i.TripID != t.ID || i.SiteCode != t.SiteCode || i.Plate != t.Plate || i.MaterialCode != t.MaterialCode || i.PartyCode != t.PartyCode {
		return i, fmt.Errorf("%w：生效化验单已失效或信息不一致", ErrConflict)
	}
	return i, nil
}
func ready(tx *gorm.DB, t Trip) (laboratory.Inspection, error) {
	i, err := effective(tx, t)
	if err != nil {
		return i, err
	}
	if i.Conclusion != "accept" || t.UnloadedAt == nil || t.UnloadingLocation == "" || t.TicketID == nil {
		return i, fmt.Errorf("%w：须确认接收、卸粮及关联有效磅单", ErrConflict)
	}
	var ticket struct{ Status string }
	err = tx.Table("wb_cloud_ticket").Clauses(clause.Locking{Strength: "UPDATE"}).Where("id=?", *t.TicketID).Take(&ticket).Error
	if err != nil {
		return i, err
	}
	if ticket.Status != "valid" {
		return i, fmt.Errorf("%w：关联磅单已作废", ErrConflict)
	}
	return i, nil
}
func (r *Repository) Command(ctx context.Context, id int64, action string, in Command, e audit.Event) (Detail, error) {
	var value Detail
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		permission := TripPermission
		if action == "approve-permit" || action == "confirm-exit" {
			permission = PermitPermission
		}
		if err := access(tx, e.Metadata.ActorID, permission); err != nil {
			return err
		}
		if action == "approve-permit" {
			if err := access(tx, e.Metadata.ActorID, TripPermission); err != nil {
				return err
			}
		}
		t, err := lockedTrip(tx, id)
		if err != nil {
			return err
		}
		// A repeated exit acknowledges the same historical basis without changing its time/person.
		if action == "confirm-exit" && t.ExitedAt != nil {
			if t.ExitBasis != in.Basis {
				return ErrConflict
			}
			if in.Basis == "rejection" && t.InspectionMethod != "visual" && (t.ExitInspectionID == nil || *t.ExitInspectionID != in.InspectionID) {
				return ErrConflict
			}
			if in.Basis == "permit" {
				var p Permit
				if err := tx.Where("trip_id=?", id).Take(&p).Error; err != nil {
					return err
				}
				if p.ID != in.PermitID {
					return ErrConflict
				}
			}
			value, err = detail(tx, id)
			return err
		}
		if t.ExitedAt != nil || t.Version != in.Version {
			return ErrConflict
		}
		exists, err := hasPermit(tx, id)
		if err != nil {
			return err
		}
		if exists && (action == "confirm-unloading" || action == "link-ticket") {
			return fmt.Errorf("%w：开证后不能更改依据", ErrConflict)
		}
		now, actor := time.Now().UTC(), e.Metadata.ActorID
		description := ""
		switch action {
		case "record-visual":
			if t.InspectionMethod != "visual" || t.VisualInspectedAt != nil || t.UnloadedAt != nil || t.TicketID != nil || exists || t.PartyCode == "" {
				return fmt.Errorf("%w：请核实供应商，目测结果只能登记一次", ErrConflict)
			}
			t.VisualConclusion, t.VisualReason, t.VisualInspectedAt, t.VisualInspectedBy = in.Conclusion, in.Reason, &now, &actor
			description = "记录目测结果：" + in.Conclusion + "；" + in.Reason
		case "confirm-unloading":
			i, err := effective(tx, t)
			if err != nil {
				return err
			}
			if i.Conclusion != "accept" {
				return ErrConflict
			}
			if t.UnloadedAt != nil || t.TicketID != nil {
				return fmt.Errorf("%w：卸粮已确认，不覆盖现场记录", ErrConflict)
			}
			t.UnloadingLocation = in.Location
			t.UnloadedAt = &now
			t.UnloadedBy = &actor
			description = "确认卸粮，实际地点：" + in.Location
		case "link-ticket":
			i, err := effective(tx, t)
			if err != nil {
				return err
			}
			if i.Conclusion != "accept" || t.UnloadedAt == nil {
				return fmt.Errorf("%w：请先确认接收与卸粮", ErrConflict)
			}
			var ticket struct {
				ID                                                                    int64
				SiteCode, Status, Direction, Plate, MaterialCode, PartyCode, Snapshot string
			}
			err = tx.Table("wb_cloud_ticket").Clauses(clause.Locking{Strength: "UPDATE"}).Where("issued_site_code=? AND ticket_no=?", in.TicketSiteCode, in.TicketNo).Take(&ticket).Error
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return fmt.Errorf("%w：磅单尚未同步到云端", ErrConflict)
			}
			if err != nil {
				return err
			}
			if ticket.SiteCode != t.SiteCode || ticket.Status != "valid" || ticket.Direction != "inbound" || ticket.Plate != t.Plate || ticket.MaterialCode != t.MaterialCode || ticket.PartyCode != t.PartyCode {
				return fmt.Errorf("%w：磅单厂区、方向、车牌、粮种或供应商不一致", ErrConflict)
			}
			if t.TicketID != nil && *t.TicketID != ticket.ID {
				return fmt.Errorf("%w：本趟已关联其他磅单", ErrConflict)
			}
			var n int64
			if err := tx.Model(&Trip{}).Where("ticket_id=? AND id<>?", ticket.ID, id).Count(&n).Error; err != nil {
				return err
			}
			if n > 0 {
				return fmt.Errorf("%w：磅单已关联其他流转单", ErrConflict)
			}
			var snap weighbridge.TicketSnapshot
			if err := json.Unmarshal([]byte(ticket.Snapshot), &snap); err != nil {
				return err
			}
			if ticketLinkReason(t, i.ConfirmedAt, snap) != "" {
				return fmt.Errorf("%w：化验生效、首磅、卸粮和回磅时间顺序不一致，需核查离线期间记录", ErrConflict)
			}
			t.TicketID = &ticket.ID
			description = "关联磅单 " + in.TicketSiteCode + " / " + in.TicketNo
		case "issue-permit":
			if exists {
				return fmt.Errorf("%w：本趟已开具出门证", ErrConflict)
			}
			_, err := ready(tx, t)
			if err != nil {
				return err
			}
			number, err := nextNumber(tx, "grain-permit", "CM")
			if err != nil {
				return err
			}
			p := Permit{Number: number, TripID: id, Version: 1, Status: "pending", InspectionID: t.EffectiveInspectionID, TicketID: *t.TicketID, CreatedBy: actor, CreatedAt: now}
			if err := tx.Create(&p).Error; err != nil {
				return err
			}
			description = "开具出门证 " + number
		case "approve-permit":
			_, err := ready(tx, t)
			if err != nil {
				return err
			}
			var p Permit
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("trip_id=?", id).Take(&p).Error; err != nil {
				return err
			}
			if p.ID != in.PermitID || p.Status != "pending" || !sameInspection(p.InspectionID, t.EffectiveInspectionID) || p.TicketID != *t.TicketID {
				return ErrConflict
			}
			p.Status = "approved"
			p.Version++
			p.ApprovedBy = &actor
			p.ApprovedAt = &now
			if err := tx.Save(&p).Error; err != nil {
				return err
			}
			description = "审批出门证 " + p.Number
		case "confirm-exit":
			i, err := effective(tx, t)
			if err != nil {
				return err
			}
			if in.Basis == "rejection" {
				if exists || t.TicketID != nil || t.UnloadedAt != nil || i.Conclusion != "reject" || i.Reason == "" || (t.InspectionMethod != "visual" && (i.ID != in.InspectionID || i.Version != in.InspectionVersion)) {
					return ErrConflict
				}
				description = "核验拒收依据，确认出厂"
			} else if in.Basis == "permit" {
				if _, err := ready(tx, t); err != nil {
					return err
				}
				var p Permit
				if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("trip_id=?", id).Take(&p).Error; err != nil {
					return err
				}
				if p.Status != "approved" || p.ID != in.PermitID || !sameInspection(p.InspectionID, t.EffectiveInspectionID) || p.TicketID != *t.TicketID {
					return ErrConflict
				}
				description = "核验出门证 " + p.Number + "，确认出厂"
			} else {
				return ErrInvalid
			}
			t.ExitedAt = &now
			t.ExitedBy = &actor
			t.ExitBasis = in.Basis
			t.ExitInspectionID = t.EffectiveInspectionID
		default:
			return ErrInvalid
		}
		t.Version++
		t.UpdatedAt = now
		if err := tx.Save(&t).Error; err != nil {
			return err
		}
		if err := writeEvent(ctx, tx, t, e, description); err != nil {
			return err
		}
		value, err = detail(tx, id)
		return err
	})
	return value, err
}

// TicketCandidates lists cloud tickets matching this trip's site, plate,
// material and supplier that no trip has linked yet. Linkable mirrors the
// weighing-order rules enforced by link-ticket so the UI can explain why a
// candidate is unavailable instead of letting the operator guess.
func (r *Repository) TicketCandidates(ctx context.Context, actor, tripID int64) ([]TicketCandidate, error) {
	candidates := []TicketCandidate{}
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := access(tx, actor, TripPermission); err != nil {
			return err
		}
		var t Trip
		if err := tx.Where("id=?", tripID).Take(&t).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound
			}
			return err
		}
		var confirmedAt *time.Time
		if t.EffectiveInspectionID != nil {
			var inspection struct{ ConfirmedAt *time.Time }
			err := tx.Model(&laboratory.Inspection{}).Select("confirmed_at").Where("id=?", *t.EffectiveInspectionID).Take(&inspection).Error
			if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			confirmedAt = inspection.ConfirmedAt
		}
		var rows []struct {
			SiteCode, TicketNo, Plate, MaterialCode, PartyCode, Snapshot string
			IssuedAt                                                     time.Time
			FinalNetMilliTonne                                           int64
		}
		if err := tx.Table("wb_cloud_ticket w").
			Select("w.issued_site_code AS site_code, w.ticket_no, w.plate, w.material_code, w.party_code, w.snapshot, w.issued_at, w.final_net_milli_tonne").
			Joins("LEFT JOIN grain_trip linked ON linked.ticket_id=w.id").
			Where("w.status='valid' AND w.direction='inbound' AND w.site_code=? AND w.plate=? AND w.material_code=? AND w.party_code=? AND linked.id IS NULL", t.SiteCode, t.Plate, t.MaterialCode, t.PartyCode).
			Order("w.issued_at DESC, w.id DESC").
			Limit(200).
			Scan(&rows).Error; err != nil {
			return err
		}
		for _, row := range rows {
			var snap weighbridge.TicketSnapshot
			if err := json.Unmarshal([]byte(row.Snapshot), &snap); err != nil {
				return err
			}
			candidate := TicketCandidate{
				SiteCode: row.SiteCode, TicketNo: row.TicketNo, Plate: row.Plate,
				MaterialCode: row.MaterialCode, MaterialName: snap.MaterialName,
				PartyCode: row.PartyCode, PartyName: snap.PartyName,
				FinalGross: snap.FinalGross, FinalTare: snap.FinalTare, FinalNetMilliTonne: row.FinalNetMilliTonne,
				FirstConfirmedAt: snap.FirstConfirmedAt, SecondConfirmedAt: snap.SecondConfirmedAt, IssuedAt: row.IssuedAt,
				Linkable: true,
			}
			if reason := ticketLinkReason(t, confirmedAt, snap); reason != "" {
				candidate.Linkable, candidate.Reason = false, reason
			}
			candidates = append(candidates, candidate)
		}
		return nil
	})
	return candidates, err
}

// ticketLinkReason returns an empty string when the weighing order satisfies
// the same rules as link-ticket.
func ticketLinkReason(t Trip, confirmedAt *time.Time, snap weighbridge.TicketSnapshot) string {
	if t.InspectionMethod == "visual" {
		if t.VisualConclusion != "accept" || t.VisualInspectedAt == nil {
			return "尚未确认目测接收"
		}
		confirmedAt = t.VisualInspectedAt
	} else if t.EffectiveInspectionID == nil || t.EffectiveSelectedAt == nil || confirmedAt == nil {
		return "尚未选择生效化验单"
	}
	if t.UnloadedAt == nil {
		return "尚未确认卸粮"
	}
	if snap.FirstConfirmedAt.Before(*confirmedAt) || (t.InspectionMethod != "visual" && snap.FirstConfirmedAt.Before(*t.EffectiveSelectedAt)) {
		return "首磅早于化验生效"
	}
	if snap.FirstConfirmedAt.After(*t.UnloadedAt) {
		return "首磅晚于卸粮"
	}
	if snap.SecondConfirmedAt.Before(*t.UnloadedAt) {
		return "回磅早于卸粮"
	}
	return ""
}

func sameInspection(a, b *int64) bool {
	return (a == nil && b == nil) || (a != nil && b != nil && *a == *b)
}

// Defaults 返回当前用户最近一张流转单的厂区，供登记页作为默认值。
func (r *Repository) Defaults(ctx context.Context, actor int64) (string, error) {
	var site string
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := access(tx, actor, TripPermission); err != nil {
			return err
		}
		return tx.Table("grain_trip").Where("created_by=?", actor).Order("id DESC").Limit(1).Pluck("site_code", &site).Error
	})
	return site, err
}
