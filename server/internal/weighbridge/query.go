package weighbridge

import (
	"context"
	"encoding/json"
	"time"

	"gorm.io/gorm"
)

type TicketQuery struct {
	Page         int
	PageSize     int
	SiteCode     string
	Direction    string
	Status       string
	Keyword      string
	MaterialCode string
	PartyCode    string
	From         *time.Time
	Until        *time.Time
}
type TicketResult struct {
	SiteCode   string         `json:"siteCode"`
	Status     string         `json:"status"`
	Ticket     TicketSnapshot `json:"ticket"`
	VoidReason *string        `json:"voidReason"`
	VoidedBy   *string        `json:"voidedBy"`
	VoidedAt   *time.Time     `json:"voidedAt"`
}
type TicketPage struct {
	Records  []TicketResult `json:"records"`
	Total    int64          `json:"total"`
	Page     int            `json:"page"`
	PageSize int            `json:"pageSize"`
}
type DirectionTotal struct {
	Direction     string `json:"direction"`
	MaterialCode  string `json:"materialCode"`
	PartyCode     string `json:"partyCode"`
	Count         int64  `json:"count"`
	NetMilliTonne int64  `json:"netMilliTonne"`
}
type ticketRow struct {
	SiteCode   string
	Status     string
	Snapshot   string
	VoidReason *string
	VoidedBy   *string
	VoidedAt   *time.Time
}

func applyTicketFilter(tx *gorm.DB, q TicketQuery) *gorm.DB {
	if q.SiteCode != "" {
		tx = tx.Where("s.code = ?", q.SiteCode)
	}
	if q.Direction != "" {
		tx = tx.Where("t.direction = ?", q.Direction)
	}
	if q.Status != "" {
		tx = tx.Where("t.status = ?", q.Status)
	}
	if q.MaterialCode != "" {
		tx = tx.Where("t.material_code = ?", q.MaterialCode)
	}
	if q.PartyCode != "" {
		tx = tx.Where("t.party_code = ?", q.PartyCode)
	}
	if q.Keyword != "" {
		term := "%" + q.Keyword + "%"
		tx = tx.Where("t.ticket_no LIKE ? OR t.plate LIKE ?", term, term)
	}
	if q.From != nil {
		tx = tx.Where("t.issued_at >= ?", *q.From)
	}
	if q.Until != nil {
		tx = tx.Where("t.issued_at < ?", *q.Until)
	}
	return tx
}
func (r *Repository) TicketPage(ctx context.Context, q TicketQuery) (TicketPage, error) {
	if q.Page < 1 || q.PageSize < 1 || q.PageSize > 100 || (q.Direction != "" && q.Direction != "inbound" && q.Direction != "outbound") || (q.Status != "" && q.Status != "valid" && q.Status != "void") {
		return TicketPage{}, ErrInvalid
	}
	page := TicketPage{Records: []TicketResult{}, Page: q.Page, PageSize: q.PageSize}
	base := applyTicketFilter(r.db.WithContext(ctx).Table("wb_cloud_ticket t").Joins("JOIN wb_cloud_site s ON s.id = t.site_id"), q)
	if err := base.Count(&page.Total).Error; err != nil {
		return TicketPage{}, err
	}
	var rows []ticketRow
	if err := base.Select("s.code AS site_code, t.status, t.snapshot, t.void_reason, t.voided_by, t.voided_at").Order("t.issued_at DESC, t.id DESC").Limit(q.PageSize).Offset((q.Page - 1) * q.PageSize).Scan(&rows).Error; err != nil {
		return TicketPage{}, err
	}
	for _, row := range rows {
		var t TicketSnapshot
		if err := json.Unmarshal([]byte(row.Snapshot), &t); err != nil {
			return TicketPage{}, err
		}
		page.Records = append(page.Records, TicketResult{SiteCode: row.SiteCode, Status: row.Status, Ticket: t, VoidReason: row.VoidReason, VoidedBy: row.VoidedBy, VoidedAt: row.VoidedAt})
	}
	return page, nil
}
func (r *Repository) TicketTotals(ctx context.Context, q TicketQuery) ([]DirectionTotal, error) {
	q.Status = "valid"
	totals := []DirectionTotal{}
	base := applyTicketFilter(r.db.WithContext(ctx).Table("wb_cloud_ticket t").Joins("JOIN wb_cloud_site s ON s.id = t.site_id"), q)
	err := base.Select("t.direction, t.material_code, t.party_code, COUNT(*) AS count, COALESCE(SUM(t.final_net_milli_tonne), 0) AS net_milli_tonne").Group("t.direction, t.material_code, t.party_code").Order("t.direction, t.material_code, t.party_code").Scan(&totals).Error
	return totals, err
}
