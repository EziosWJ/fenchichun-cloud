package weighbridge

import (
	"context"
	"time"
)

const distillerGrainsFilter = `t.status = 'valid' AND t.direction = 'outbound' AND t.material_code = '` + distillerGrainsMaterialCode + `'`

// DistillerGrainsStats returns the outbound totals grouped by day, the ticket
// records of the window (when requested) and every customer that ever shipped
// distiller grains. Voided tickets are excluded by the shared filter.
func (r *Repository) DistillerGrainsStats(ctx context.Context, q DistillerGrainsQuery) (DistillerGrainsStats, error) {
	result := DistillerGrainsStats{
		From:      q.From.Format("2006-01-02"),
		To:        q.To.Format("2006-01-02"),
		Days:      []DistillerGrainsDay{},
		Records:   []DistillerGrainsRecord{},
		Customers: []DistillerGrainsCustomer{},
	}
	filter := distillerGrainsFilter + ` AND t.issued_date BETWEEN ? AND ?`
	args := []any{result.From, result.To}
	if q.CustomerCode != "" {
		filter += ` AND t.party_code = ?`
		args = append(args, q.CustomerCode)
	}
	var days []struct {
		Date          time.Time
		TicketCount   int64
		NetMilliTonne int64
	}
	dayQuery := `SELECT t.issued_date AS date,
			COUNT(*) AS ticket_count,
			COALESCE(SUM(t.final_net_milli_tonne), 0) AS net_milli_tonne
		FROM wb_cloud_ticket t WHERE ` + filter + `
		GROUP BY t.issued_date ORDER BY t.issued_date`
	if err := r.db.WithContext(ctx).Raw(dayQuery, args...).Scan(&days).Error; err != nil {
		return result, err
	}
	for _, day := range days {
		result.Days = append(result.Days, DistillerGrainsDay{
			Date:          day.Date.Format("2006-01-02"),
			TicketCount:   day.TicketCount,
			NetMilliTonne: day.NetMilliTonne,
		})
		result.TicketCount += day.TicketCount
		result.TotalNetMilliTonne += day.NetMilliTonne
	}
	if q.IncludeRecords {
		var records []struct {
			TicketNo      string
			IssuedAt      time.Time
			Plate         string
			PartyCode     string
			PartyName     string
			NetMilliTonne int64
		}
		recordQuery := `SELECT t.ticket_no,
				t.issued_at,
				t.plate,
				t.party_code,
				COALESCE(t.party_name, '') AS party_name,
				t.final_net_milli_tonne AS net_milli_tonne
			FROM wb_cloud_ticket t WHERE ` + filter + `
			ORDER BY t.issued_at, t.ticket_no`
		if err := r.db.WithContext(ctx).Raw(recordQuery, args...).Scan(&records).Error; err != nil {
			return result, err
		}
		for _, record := range records {
			result.Records = append(result.Records, DistillerGrainsRecord{
				TicketNo:      record.TicketNo,
				IssuedAt:      record.IssuedAt,
				Plate:         record.Plate,
				PartyCode:     record.PartyCode,
				PartyName:     record.PartyName,
				NetMilliTonne: record.NetMilliTonne,
			})
		}
	}
	var customers []struct {
		Code string
		Name string
	}
	customerQuery := `SELECT DISTINCT t.party_code AS code,
			COALESCE(t.party_name, '') AS name
		FROM wb_cloud_ticket t WHERE ` + distillerGrainsFilter + `
		ORDER BY name, code`
	if err := r.db.WithContext(ctx).Raw(customerQuery).Scan(&customers).Error; err != nil {
		return result, err
	}
	for _, customer := range customers {
		result.Customers = append(result.Customers, DistillerGrainsCustomer{Code: customer.Code, Name: customer.Name})
	}
	return result, nil
}
