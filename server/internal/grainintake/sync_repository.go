package grainintake

import (
	"context"
	"errors"
	"fmt"
	"time"

	"fenchichun.local/server/internal/laboratory"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ErrSiteUnauthorized means the site code is missing or disabled. The handler
// maps it to 401 like the existing weighbridge sync endpoints.
var ErrSiteUnauthorized = errors.New("厂区编码不存在或已停用")

const syncTripLimit = 50

func requireEnabledSite(tx *gorm.DB, siteCode string) error {
	if siteCode == "" {
		return ErrSiteUnauthorized
	}
	var n int64
	if err := tx.Table("wb_cloud_site").Where("code=? AND enabled=TRUE", siteCode).Count(&n).Error; err != nil {
		return err
	}
	if n != 1 {
		return ErrSiteUnauthorized
	}
	return nil
}

func syncTripSelect() string {
	return "t.id, t.number, t.version, t.plate, t.material_code, t.material_name, t.party_code, t.party_name, " +
		"t.driver, t.driver_phone, t.contract_no, t.inspection_method, t.visual_conclusion, t.visual_reason, t.visual_inspected_at, " +
		"t.effective_inspection_id, t.created_at, t.unloaded_at, t.unloading_location, t.exited_at, t.ticket_id, COALESCE(w.ticket_no,'') AS ticket_no, " +
		stageSQL + " AS stage"
}

func (r *Repository) syncTrips(ctx context.Context, siteCode, plate, tripNo string) ([]SyncTrip, error) {
	result := []SyncTrip{}
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := requireEnabledSite(tx, siteCode); err != nil {
			return err
		}
		rows := []syncTripRow{}
		query := tripQuery(tx).Select(syncTripSelect()).Where("t.site_code=?", siteCode)
		if plate != "" {
			query = query.Where("t.plate=?", plate).Order("t.created_at DESC, t.id DESC").Limit(syncTripLimit)
		} else {
			query = query.Where("t.number=?", tripNo).Limit(1)
		}
		if err := query.Scan(&rows).Error; err != nil {
			return err
		}
		inspections := map[int64]laboratory.Inspection{}
		ids := []int64{}
		for _, row := range rows {
			if row.EffectiveInspectionID != nil {
				ids = append(ids, *row.EffectiveInspectionID)
			}
		}
		if len(ids) > 0 {
			values := []laboratory.Inspection{}
			if err := tx.Where("id IN ?", ids).Find(&values).Error; err != nil {
				return err
			}
			for _, value := range values {
				inspections[value.ID] = value
			}
		}
		for _, row := range rows {
			trip := SyncTrip{
				TripNo: row.TripNo, TripID: row.TripID, Version: row.Version, Stage: row.Stage,
				Plate: row.Plate, MaterialCode: row.MaterialCode, MaterialName: row.MaterialName,
				PartyCode: row.PartyCode, PartyName: row.PartyName, Driver: row.Driver,
				DriverPhone: row.DriverPhone, ContractNo: row.ContractNo,
				InspectionMethod: row.InspectionMethod, RegisteredAt: row.RegisteredAt,
				UnloadedAt: row.UnloadedAt, UnloadingLocation: row.UnloadingLocation, TicketNo: row.TicketNo,
				Blockers: []string{},
			}
			if row.EffectiveInspectionID != nil {
				if value, ok := inspections[*row.EffectiveInspectionID]; ok {
					trip.Inspection = &SyncInspection{
						ID: value.ID, Version: value.Version, Status: value.Status,
						Conclusion: value.Conclusion, Moisture: value.Moisture, Impurity: value.Impurity, BulkDensity: value.BulkDensity,
						Reason: value.Reason, ConfirmedAt: value.ConfirmedAt,
					}
				}
			}
			if row.InspectionMethod == "visual" {
				trip.EffectiveConclusion = row.VisualConclusion
			} else if trip.Inspection != nil {
				trip.EffectiveConclusion = trip.Inspection.Conclusion
			}
			trip.Blockers = syncTripBlockers(row, trip)
			trip.Linkable = len(trip.Blockers) == 0
			result = append(result, trip)
		}
		return nil
	}, nil)
	return result, err
}

func (r *Repository) SyncCandidates(ctx context.Context, siteCode, plate string) ([]SyncTrip, error) {
	if plate == "" {
		return nil, ErrInvalid
	}
	return r.syncTrips(ctx, siteCode, plate, "")
}

func (r *Repository) SyncTrip(ctx context.Context, siteCode, tripNo string) (SyncTrip, error) {
	if tripNo == "" {
		return SyncTrip{}, ErrInvalid
	}
	rows, err := r.syncTrips(ctx, siteCode, "", tripNo)
	if err != nil {
		return SyncTrip{}, err
	}
	if len(rows) == 0 {
		return SyncTrip{}, ErrNotFound
	}
	return rows[0], nil
}

// LinkTicketBySystem performs the same validation as the authenticated
// link-ticket command but is called by the weighing site after its ticket
// change has been confirmed. It is idempotent for the same trip and ticket.
func (r *Repository) LinkTicketBySystem(ctx context.Context, siteCode, tripNo, ticketNo string) error {
	if siteCode == "" || tripNo == "" || ticketNo == "" {
		return ErrInvalid
	}
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := requireEnabledSite(tx, siteCode); err != nil {
			return err
		}
		var t Trip
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("number=? AND site_code=?", tripNo, siteCode).Take(&t).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		if t.ExitedAt != nil {
			return fmt.Errorf("%w：流转单已确认出厂", ErrConflict)
		}
		before := t.TicketID
		description, err := linkTicket(tx, &t, siteCode, ticketNo)
		if err != nil {
			return err
		}
		if before != nil && t.TicketID != nil && *before == *t.TicketID {
			return nil
		}
		now := time.Now().UTC()
		t.Version++
		t.UpdatedAt = now
		if err := tx.Save(&t).Error; err != nil {
			return err
		}
		return tx.Exec(
			"INSERT INTO grain_trip_event(trip_id,action,description,actor_id) VALUES (?,?,?,NULL)",
			t.ID, "trip.ticket-linked", description,
		).Error
	})
}

func syncTripBlockers(row syncTripRow, trip SyncTrip) []string {
	blockers := []string{}
	if row.ExitedAt != nil {
		blockers = append(blockers, "已确认出厂")
	}
	if row.TicketID != nil || row.TicketNo != "" {
		blockers = append(blockers, "已关联磅单 "+row.TicketNo)
	}
	if row.Stage == "blocked" {
		blockers = append(blockers, "当前流转单存在化验或磅单阻断")
	}
	if row.InspectionMethod == "visual" {
		if row.VisualConclusion != "accept" {
			blockers = append(blockers, "目测结论未接收")
		}
	} else {
		if row.EffectiveInspectionID == nil || trip.Inspection == nil {
			blockers = append(blockers, "尚未录入化验单")
		} else {
			if trip.Inspection.Status != "confirmed" {
				blockers = append(blockers, "化验单未确认")
			}
			if trip.Inspection.Conclusion != "accept" {
				blockers = append(blockers, "化验结论为拒收")
			}
		}
	}
	return blockers
}
