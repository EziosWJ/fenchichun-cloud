package grainintake

import (
	"context"
	"encoding/json"
	"errors"
	"fenchichun.local/server/internal/audit"
	"fenchichun.local/server/internal/deduction"
	"fenchichun.local/server/internal/laboratory"
	"fenchichun.local/server/internal/weighbridge"
	"fmt"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"strings"
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
 WHEN t.unloaded_at IS NULL THEN 'pending_unload'
 WHEN t.ticket_id IS NULL THEN 'pending_ticket'
 ELSE 'accepted' END`

func tripQuery(tx *gorm.DB) *gorm.DB {
	return tx.Table("grain_trip t").Joins("LEFT JOIN grain_inspection i ON i.id=t.effective_inspection_id").Joins("LEFT JOIN grain_inspection ti ON ti.trip_id=t.id AND ti.status <> 'void'").Joins("LEFT JOIN wb_cloud_ticket w ON w.id=t.ticket_id").Joins("LEFT JOIN grain_exit_permit p ON p.trip_id=t.id")
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
	result.Deductions = []deduction.Evaluation{}
	if result.Trip.InspectionMethod == "lab" && result.Trip.EffectiveInspectionID != nil {
		for _, item := range result.Inspections {
			if item.ID != *result.Trip.EffectiveInspectionID || item.Conclusion != "accept" {
				continue
			}
			ctx := tx.Statement.Context
			if ctx == nil {
				ctx = context.Background()
			}
			values, err := deduction.NewRepository(tx).Evaluate(ctx, item.MaterialCode, item.Moisture, item.Impurity)
			if err != nil {
				return result, err
			}
			if values != nil {
				result.Deductions = values
			}
			break
		}
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
		if row.Status != "valid" {
			result.TicketWarning = "关联的过磅单已作废，无法继续开证或出厂。请重新关联有效磅单；如已开具出门证，请联系管理员核查后再办理。"
		} else {
			var confirmedAt *time.Time
			if result.Trip.InspectionMethod == "visual" {
				confirmedAt = result.Trip.VisualInspectedAt
			} else if result.Trip.EffectiveInspectionID != nil {
				for _, item := range result.Inspections {
					if item.ID == *result.Trip.EffectiveInspectionID {
						confirmedAt = item.ConfirmedAt
						break
					}
				}
			}
			if reason := ticketOrderReason(result.Trip, confirmedAt, snap); isTicketTimeWarning(reason) {
				result.TicketWarning = reason + "，无法继续开证或出厂。请核对化验、首磅、卸货和回磅时间；如属离线补录，请联系管理员处理后再办理。"
			}
		}
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
		if err := access(tx, e.Metadata.ActorID, "grain-intake:trip-edit"); err != nil {
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
			// A deadline or lost response can make the client retry a create. The
			// client-supplied request id makes that retry return the original trip
			// instead of creating a duplicate.
			if in.ClientRequestID != "" {
				var existing Trip
				err := tx.Where("created_by=? AND client_request_id=?", e.Metadata.ActorID, in.ClientRequestID).Take(&existing).Error
				if err == nil {
					value, err = detail(tx, existing.ID)
					return err
				}
				if !errors.Is(err, gorm.ErrRecordNotFound) {
					return err
				}
			}
			number, err := nextNumber(tx, "grain-trip", "LZ")
			if err != nil {
				return err
			}
			t = Trip{InspectionMethod: method, Number: number, Version: 1, Input: in, MaterialName: material, PartyName: party, CreatedBy: e.Metadata.ActorID, CreatedAt: now, UpdatedAt: now}
			create := tx
			if in.ClientRequestID != "" {
				create = tx.Clauses(clause.OnConflict{DoNothing: true})
			}
			if err := create.Create(&t).Error; err != nil {
				return err
			}
			if in.ClientRequestID != "" && t.ID == 0 {
				if err := tx.Where("created_by=? AND client_request_id=?", e.Metadata.ActorID, in.ClientRequestID).Take(&t).Error; err != nil {
					return err
				}
				value, err = detail(tx, t.ID)
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
			return i, fmt.Errorf("%w：尚未确认目测结果，无法继续办理。请先记录目测接收或拒收结论。", ErrConflict)
		}
		i.Conclusion, i.Reason, i.ConfirmedAt = t.VisualConclusion, t.VisualReason, t.VisualInspectedAt
		return i, nil
	}
	if t.EffectiveInspectionID == nil {
		return i, fmt.Errorf("%w：尚未选择生效化验单，无法继续办理。请先在化验单页录入并确认化验结果。", ErrConflict)
	}
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id=?", *t.EffectiveInspectionID).Take(&i).Error
	if err != nil {
		return i, err
	}
	if i.Status != "confirmed" || i.TripID == nil || *i.TripID != t.ID || i.SiteCode != t.SiteCode || i.Plate != t.Plate || i.MaterialCode != t.MaterialCode || i.PartyCode != t.PartyCode {
		return i, fmt.Errorf("%w：生效化验单已失效或与流转单信息不一致，无法继续办理。请核对化验单后重新录入或选择有效结果。", ErrConflict)
	}
	return i, nil
}
func ready(tx *gorm.DB, t Trip) (laboratory.Inspection, error) {
	i, err := effective(tx, t)
	if err != nil {
		return i, err
	}
	var problems []string
	if i.Conclusion != "accept" {
		problems = append(problems, "检验结论不是接收")
	}
	if t.UnloadedAt == nil {
		problems = append(problems, "尚未确认卸货")
	} else if t.UnloadingLocation == "" {
		problems = append(problems, "未记录实际卸货地点")
	}
	if t.TicketID == nil {
		problems = append(problems, "尚未关联有效磅单")
	} else {
		var ticket struct{ Status string }
		err = tx.Table("wb_cloud_ticket").Clauses(clause.Locking{Strength: "UPDATE"}).Where("id=?", *t.TicketID).Take(&ticket).Error
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				problems = append(problems, "关联的磅单不存在")
			} else {
				return i, err
			}
		} else if ticket.Status != "valid" {
			problems = append(problems, "关联磅单已作废")
		}
	}
	if len(problems) > 0 {
		return i, fmt.Errorf("%w：%s，无法继续办理。请按顺序检查：确认检验接收、确认卸货及实际地点、关联有效磅单。", ErrConflict, strings.Join(problems, "；"))
	}
	return i, nil
}

// linkTicket validates an operator-selected ticket before it is linked.
func linkTicket(tx *gorm.DB, t *Trip, ticketSiteCode, ticketNo string) (string, error) {
	i, err := effective(tx, *t)
	if err != nil {
		return "", err
	}
	if i.Conclusion != "accept" {
		return "", fmt.Errorf("%w：检验结论不是接收，不能关联磅单。请先按拒收流程办理退厂。", ErrConflict)
	}
	if t.UnloadedAt == nil {
		return "", fmt.Errorf("%w：尚未确认卸货，不能关联磅单。请先在“卸货与磅单”页确认实际卸货地点和卸货完成。", ErrConflict)
	}
	var ticket struct {
		ID                                                                    int64
		SiteCode, Status, Direction, Plate, MaterialCode, PartyCode, Snapshot string
	}
	err = tx.Table("wb_cloud_ticket").Clauses(clause.Locking{Strength: "UPDATE"}).Where("issued_site_code=? AND ticket_no=?", ticketSiteCode, ticketNo).Take(&ticket).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", fmt.Errorf("%w：磅单尚未同步到云端，不能关联。请等待厂端同步后刷新候选磅单。", ErrConflict)
	}
	if err != nil {
		return "", err
	}
	if ticket.Status != "valid" {
		return "", fmt.Errorf("%w：该磅单已作废，不能关联。请选择其他有效磅单。", ErrConflict)
	}
	if ticket.Direction != "inbound" {
		return "", fmt.Errorf("%w：该磅单不是入厂方向，不能关联本趟原粮流转单。请核对磅单方向。", ErrConflict)
	}
	var differences []string
	if ticket.SiteCode != t.SiteCode {
		differences = append(differences, "厂区")
	}
	if ticket.Plate != t.Plate {
		differences = append(differences, "车牌")
	}
	if ticket.MaterialCode != t.MaterialCode {
		differences = append(differences, "货品")
	}
	if ticket.PartyCode != t.PartyCode {
		differences = append(differences, "供应商")
	}
	if len(differences) > 0 {
		return "", fmt.Errorf("%w：磅单与流转单的%s不一致，不能关联。请核对后重新选择，或先更正登记信息。", ErrConflict, strings.Join(differences, "、"))
	}
	if t.TicketID != nil && *t.TicketID != ticket.ID {
		return "", fmt.Errorf("%w：本趟已关联其他磅单，不能直接更换。如需更换，请先联系管理员处理原关联。", ErrConflict)
	}
	var n int64
	if err := tx.Model(&Trip{}).Where("ticket_id=? AND id<>?", ticket.ID, t.ID).Count(&n).Error; err != nil {
		return "", err
	}
	if n > 0 {
		return "", fmt.Errorf("%w：该磅单已关联其他流转单，不能重复关联。请核对磅单号，或联系管理员解除原关联。", ErrConflict)
	}
	var snap weighbridge.TicketSnapshot
	if err := json.Unmarshal([]byte(ticket.Snapshot), &snap); err != nil {
		return "", err
	}
	if reason := ticketLinkReason(*t, i.ConfirmedAt, snap); reason != "" {
		return "", ticketOrderConflict(reason)
	}
	t.TicketID = &ticket.ID
	return "关联磅单 " + ticketSiteCode + " / " + ticketNo, nil
}

func (r *Repository) Command(ctx context.Context, id int64, action string, in Command, e audit.Event) (Detail, error) {
	var value Detail
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		permission := map[string]string{
			"record-visual":     "grain-intake:visual",
			"confirm-unloading": "grain-intake:unload",
			"link-ticket":       "grain-intake:ticket",
			"confirm-ticket":    "grain-intake:ticket",
			"issue-permit":      "grain-intake:issue-permit",
			"approve-permit":    "grain-intake:approve-permit",
			"confirm-exit":      "grain-intake:release",
		}[action]
		if permission == "" {
			permission = TripPermission
		}
		if err := access(tx, e.Metadata.ActorID, permission); err != nil {
			return err
		}
		t, err := lockedTrip(tx, id)
		if err != nil {
			return err
		}
		// A lost response can make the client retry the confirmation. Return the
		// existing result before the version check and do not add another event or
		// version bump.
		if action == "confirm-ticket" && t.TicketConfirmedAt != nil {
			if t.TicketID == nil {
				return fmt.Errorf("%w：尚未关联过磅单", ErrConflict)
			}
			var ticket struct{ Status string }
			if err := tx.Table("wb_cloud_ticket").Where("id=?", *t.TicketID).Take(&ticket).Error; err != nil {
				return err
			}
			if ticket.Status != "valid" {
				return fmt.Errorf("%w：关联的过磅单已作废，不能重复确认。请重新关联有效磅单；如已开证，请联系管理员核查。", ErrConflict)
			}
			value, err = detail(tx, id)
			return err
		}
		// A repeated exit acknowledges the same historical basis without changing its time/person.
		if action == "confirm-exit" && t.ExitedAt != nil {
			if t.ExitBasis != in.Basis {
				return fmt.Errorf("%w：本趟已按其他依据确认出厂，不能重复提交。请刷新查看最终记录。", ErrConflict)
			}
			if in.Basis == "rejection" && t.InspectionMethod != "visual" && (t.ExitInspectionID == nil || *t.ExitInspectionID != in.InspectionID) {
				return fmt.Errorf("%w：本趟已按其他拒收依据确认出厂，请刷新查看最终记录。", ErrConflict)
			}
			if in.Basis == "permit" {
				var p Permit
				if err := tx.Where("trip_id=?", id).Take(&p).Error; err != nil {
					return err
				}
				if p.ID != in.PermitID {
					return fmt.Errorf("%w：出门证已变化，请刷新查看最终出厂记录。", ErrConflict)
				}
			}
			value, err = detail(tx, id)
			return err
		}
		if t.ExitedAt != nil {
			return fmt.Errorf("%w：本趟已确认出厂，不能再次办理。请刷新查看最终记录。", ErrConflict)
		}
		if t.Version != in.Version {
			return fmt.Errorf("%w：该流转单已被其他人更新，您的页面不是最新状态。请刷新后重新核对再办理。", ErrConflict)
		}
		exists, err := hasPermit(tx, id)
		if err != nil {
			return err
		}
		if exists && (action == "confirm-unloading" || action == "link-ticket") {
			return fmt.Errorf("%w：本趟已开具出门证，不能再更改卸货或磅单依据。请按出门证流程继续办理。", ErrConflict)
		}
		now, actor := time.Now().UTC(), e.Metadata.ActorID
		description := ""
		switch action {
		case "record-visual":
			if t.InspectionMethod != "visual" {
				return fmt.Errorf("%w：本趟检验方式是化验，不能记录目测结果。请由化验员录入化验单。", ErrConflict)
			}
			if t.VisualInspectedAt != nil {
				return fmt.Errorf("%w：目测结果已经登记，不能重复记录。如需更正，请联系管理员核查。", ErrConflict)
			}
			if t.UnloadedAt != nil || t.TicketID != nil || exists {
				return fmt.Errorf("%w：本趟已进入卸货、关联磅单或开证阶段，不能再补记目测结果。请按当前阶段继续办理。", ErrConflict)
			}
			if t.PartyCode == "" {
				return fmt.Errorf("%w：尚未核实供应商，不能确认目测结果。请先在登记信息中选择供应商。", ErrConflict)
			}
			t.VisualConclusion, t.VisualReason, t.VisualInspectedAt, t.VisualInspectedBy = in.Conclusion, in.Reason, &now, &actor
			description = "记录目测结果：" + in.Conclusion + "；" + in.Reason
		case "confirm-unloading":
			i, err := effective(tx, t)
			if err != nil {
				return err
			}
			if i.Conclusion != "accept" {
				return fmt.Errorf("%w：检验结论不是接收，不能确认卸货。请按拒收流程办理退厂。", ErrConflict)
			}
			if t.UnloadedAt != nil {
				return fmt.Errorf("%w：卸货已经确认，不能重复提交。请刷新查看已记录的实际卸货地点和时间。", ErrConflict)
			}
			t.UnloadingLocation = in.Location
			t.UnloadedAt = &now
			t.UnloadedBy = &actor
			description = "确认卸货，实际地点：" + in.Location
		case "link-ticket":
			description, err = linkTicket(tx, &t, in.TicketSiteCode, in.TicketNo)
			if err != nil {
				return err
			}
			t.TicketConfirmedAt = &now
			t.TicketConfirmedBy = &actor
		case "confirm-ticket":
			if t.TicketID == nil {
				return fmt.Errorf("%w：本趟尚未关联过磅单，无法确认。请等待过磅单同步并完成关联。", ErrConflict)
			}
			var ticket struct{ Status string }
			if err := tx.Table("wb_cloud_ticket").Clauses(clause.Locking{Strength: "UPDATE"}).Where("id=?", *t.TicketID).Take(&ticket).Error; err != nil {
				return err
			}
			if ticket.Status != "valid" {
				return fmt.Errorf("%w：关联的过磅单已作废，不能确认。请重新关联有效磅单；如已开证，请联系管理员核查。", ErrConflict)
			}
			t.TicketConfirmedAt = &now
			t.TicketConfirmedBy = &actor
			description = "确认过磅单关联"
		case "issue-permit":
			if exists {
				return fmt.Errorf("%w：本趟已开具出门证，不能重复开证。请到出门证页继续审批或等待门卫放行。", ErrConflict)
			}
			if t.TicketConfirmedAt == nil {
				return fmt.Errorf("%w：过磅单尚未确认关联，不能开证。请先在“卸货与磅单”页核对并确认过磅单关联。", ErrConflict)
			}
			_, err := ready(tx, t)
			if err != nil {
				return err
			}
			if reason, err := loadTicketOrderReason(tx, t); err != nil {
				return err
			} else if reason != "" {
				return ticketOrderConflict(reason)
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
			if reason, err := loadTicketOrderReason(tx, t); err != nil {
				return err
			} else if reason != "" {
				return ticketOrderConflict(reason)
			}
			var p Permit
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("trip_id=?", id).Take(&p).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return fmt.Errorf("%w：本趟尚未开具出门证，无法审批。请先完成开证。", ErrConflict)
				}
				return err
			}
			if p.ID != in.PermitID || !sameInspection(p.InspectionID, t.EffectiveInspectionID) || p.TicketID != *t.TicketID {
				return fmt.Errorf("%w：出门证依据已变化，无法审批。请刷新后重新核对出门证、化验单和磅单。", ErrConflict)
			}
			if p.Status != "pending" {
				return fmt.Errorf("%w：该出门证已审批，不能重复审批。请刷新查看审批结果。", ErrConflict)
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
				if exists {
					return fmt.Errorf("%w：本趟已开具出门证，不能按拒收依据出厂。请按正常出门证流程办理。", ErrConflict)
				}
				if t.TicketID != nil || t.UnloadedAt != nil {
					return fmt.Errorf("%w：本趟已关联磅单或确认卸货，不能按拒收依据出厂。请核对实际流程后联系管理员处理。", ErrConflict)
				}
				if i.Conclusion != "reject" {
					return fmt.Errorf("%w：当前检验结论不是拒收，不能按拒收依据出厂。请核对检验结果。", ErrConflict)
				}
				if i.Reason == "" {
					return fmt.Errorf("%w：拒收原因缺失，不能确认出厂。请联系化验员补录拒收原因。", ErrConflict)
				}
				if t.InspectionMethod != "visual" && (i.ID != in.InspectionID || i.Version != in.InspectionVersion) {
					return fmt.Errorf("%w：拒收化验依据已变化，不能确认出厂。请刷新后重新核对生效化验单。", ErrConflict)
				}
				description = "核验拒收依据，确认出厂"
			} else if in.Basis == "permit" {
				if _, err := ready(tx, t); err != nil {
					return err
				}
				var p Permit
				if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("trip_id=?", id).Take(&p).Error; err != nil {
					if errors.Is(err, gorm.ErrRecordNotFound) {
						return fmt.Errorf("%w：本趟尚未开具出门证，不能确认出厂。请先完成开证和审批。", ErrConflict)
					}
					return err
				}
				if p.Status != "approved" {
					return fmt.Errorf("%w：出门证尚未审批，不能确认出厂。请先完成审批。", ErrConflict)
				}
				if p.ID != in.PermitID {
					return fmt.Errorf("%w：出门证已变化，不能确认出厂。请刷新后重新核对。", ErrConflict)
				}
				if !sameInspection(p.InspectionID, t.EffectiveInspectionID) || p.TicketID != *t.TicketID {
					return fmt.Errorf("%w：出门证依据与当前化验或磅单不一致，不能确认出厂。请刷新核查后重新开证。", ErrConflict)
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
				FinalGross: snap.FinalGross, FinalTare: snap.FinalTare, FinalNet: snap.FinalNet, FinalNetMilliTonne: row.FinalNetMilliTonne,
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

// ticketOrderReason returns an empty string when the inspection and unloading
// times satisfy the weighing order. It is shared by candidate listing,
// confirm-ticket and issue-permit so the automatic association path cannot
// accept a ticket that the authenticated link command would reject.
func ticketOrderReason(t Trip, confirmedAt *time.Time, snap weighbridge.TicketSnapshot) string {
	if t.InspectionMethod == "visual" {
		confirmedAt = t.VisualInspectedAt
	}
	if reason := weighbridge.InspectionOrderReason(t.InspectionMethod, t.VisualConclusion == "accept", confirmedAt, t.EffectiveSelectedAt, snap.FirstConfirmedAt); reason != "" {
		return reason
	}
	return weighbridge.UnloadOrderReason(t.UnloadedAt, snap.FirstConfirmedAt, snap.SecondConfirmedAt)
}

func isTicketTimeWarning(reason string) bool {
	switch reason {
	case "首磅早于化验生效", "首磅晚于卸粮", "回磅早于卸粮":
		return true
	}
	return false
}

func ticketOrderGuidance(reason string) string {
	switch reason {
	case "首磅早于化验生效":
		return "请核对化验或目测确认时间与首磅时间；若属离线补录，请先更正单据时间或联系管理员处理。"
	case "首磅晚于卸粮":
		return "请核对首磅时间与卸货确认时间，确认是否在首磅完成后再办理卸货确认。"
	case "回磅早于卸粮":
		return "请核对回磅时间与卸货确认时间，按先首磅、再确认卸货、最后回磅的顺序办理。"
	case "尚未确认卸粮":
		return "请先在“卸货与磅单”页确认实际卸货地点和卸货完成。"
	case "尚未选择生效化验单":
		return "请先在化验单页录入并确认化验结果。"
	case "尚未确认目测接收":
		return "请先完成目测接收确认。"
	default:
		return "请核对化验、首磅、卸货和回磅时间后再办理。"
	}
}

func ticketOrderConflict(reason string) error {
	return fmt.Errorf("%w：%s，无法继续办理。%s", ErrConflict, reason, ticketOrderGuidance(reason))
}

// ticketLinkReason is the stricter candidate/link rule: in addition to the
// order checks it requires the store to have confirmed unloading.
func ticketLinkReason(t Trip, confirmedAt *time.Time, snap weighbridge.TicketSnapshot) string {
	if reason := ticketOrderReason(t, confirmedAt, snap); reason != "" {
		return reason
	}
	if t.UnloadedAt == nil {
		return "尚未确认卸粮"
	}
	return ""
}

// loadTicketOrderReason re-reads the linked ticket snapshot and effective
// inspection, then applies the same order rules. It returns an empty string
// for a missing or non-valid ticket because ready/link paths report that
// separately.
func loadTicketOrderReason(tx *gorm.DB, t Trip) (string, error) {
	if t.TicketID == nil {
		return "", nil
	}
	var ticket struct {
		Status, Snapshot string
	}
	if err := tx.Table("wb_cloud_ticket").Where("id=?", *t.TicketID).Take(&ticket).Error; err != nil {
		return "", err
	}
	if ticket.Status != "valid" {
		return "", nil
	}
	var snap weighbridge.TicketSnapshot
	if err := json.Unmarshal([]byte(ticket.Snapshot), &snap); err != nil {
		return "", err
	}
	i, err := effective(tx, t)
	if err != nil {
		return "", err
	}
	return ticketOrderReason(t, i.ConfirmedAt, snap), nil
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
