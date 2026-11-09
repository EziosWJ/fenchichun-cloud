package weighbridge

import (
	"time"

	"gorm.io/gorm"
)

// linkedTripsForUpdate locks the trips that reference a ticket before the
// ticket row is changed. Locks are taken trip-first because grain-intake and
// laboratory always lock the trip before its inspection or ticket.
func linkedTripsForUpdate(tx *gorm.DB, ticketID int64) ([]int64, error) {
	var rows []struct{ ID int64 }
	if err := tx.Raw("SELECT id FROM grain_trip WHERE ticket_id=? ORDER BY id FOR UPDATE", ticketID).Scan(&rows).Error; err != nil {
		return nil, err
	}
	ids := make([]int64, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.ID)
	}
	return ids, nil
}

// releaseVoidedTicket detaches a voided ticket from trips that have not issued
// an exit permit. A trip that already issued a permit keeps its evidence and
// turns into "blocked" for gate review instead. The grain_trip tables belong to
// the grain-intake module; this write runs in the same transaction as the void,
// following the same cross-module pattern used by laboratory event writes.
func releaseVoidedTicket(tx *gorm.DB, tripIDs []int64, ticketNo, reason string) error {
	now := time.Now().UTC()
	description := "关联磅单 " + ticketNo + " 已作废，自动解除关联"
	if reason != "" {
		description += "：" + reason
	}
	for _, id := range tripIDs {
		var permits int64
		if err := tx.Table("grain_exit_permit").Where("trip_id=?", id).Count(&permits).Error; err != nil {
			return err
		}
		if permits > 0 {
			continue
		}
		result := tx.Table("grain_trip").Where("id=? AND exited_at IS NULL", id).Updates(map[string]any{
			"ticket_id":  nil,
			"version":    gorm.Expr("version+1"),
			"updated_at": now,
		})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			continue
		}
		if err := tx.Exec("INSERT INTO grain_trip_event(trip_id,action,description,actor_id) VALUES (?,?,?,NULL)", id, "trip.ticket-voided", description).Error; err != nil {
			return err
		}
	}
	return nil
}
