package weighbridge

import (
	"context"
)

// StatementParties returns one row per site and counterparty for the selected
// direction. Tickets are aggregated from their snapshots so the cloud table
// stays the single source of truth.
func (r *Repository) StatementParties(ctx context.Context, q StatementQuery) (StatementPartyPage, error) {
	if err := validateStatementQuery(q, false); err != nil {
		return StatementPartyPage{}, err
	}
	parties, summary, err := r.statementPartiesAll(ctx, q)
	if err != nil {
		return StatementPartyPage{}, err
	}
	page := StatementPartyPage{
		Records: pageStatementParties(parties, q.Page, q.PageSize),
		Total:   int64(len(parties)), Page: q.Page, PageSize: q.PageSize, Summary: summary,
	}
	if page.Records == nil {
		page.Records = []StatementParty{}
	}
	return page, nil
}

func (r *Repository) StatementPartiesAll(ctx context.Context, q StatementQuery) ([]StatementParty, StatementPageSummary, error) {
	if err := validateStatementQuery(q, false); err != nil {
		return nil, StatementPageSummary{}, err
	}
	return r.statementPartiesAll(ctx, q)
}

func (r *Repository) statementPartiesAll(ctx context.Context, q StatementQuery) ([]StatementParty, StatementPageSummary, error) {
	tickets, err := r.statementTickets(ctx, q)
	if err != nil {
		return nil, StatementPageSummary{}, err
	}
	parties, summary := aggregateStatementParties(tickets, q.PartyKeyword)
	return parties, summary, nil
}

func (r *Repository) StatementDetail(ctx context.Context, q StatementQuery) (StatementDetail, error) {
	if err := validateStatementQuery(q, true); err != nil {
		return StatementDetail{}, err
	}
	tickets, err := r.statementTickets(ctx, q)
	if err != nil {
		return StatementDetail{}, err
	}
	detail := aggregateStatementDetail(q, tickets)
	if detail.SiteName == "" {
		detail.SiteName = r.statementSiteName(ctx, q.SiteCode)
	}
	if detail.PartyName == "" {
		detail.PartyName = r.statementPartyName(ctx, q.PartyCode)
	}
	return detail, nil
}

func (r *Repository) StatementTickets(ctx context.Context, q StatementQuery) ([]StatementTicket, error) {
	if err := validateStatementQuery(q, true); err != nil {
		return nil, err
	}
	rows, err := r.statementRows(ctx, q)
	if err != nil {
		return nil, err
	}
	tickets := make([]StatementTicket, 0, len(rows))
	for _, row := range rows {
		ticket, err := parseStatementTicket(row)
		if err != nil {
			return nil, err
		}
		tickets = append(tickets, StatementTicket{
			SiteCode: ticket.siteCode, SiteName: ticket.siteName,
			PartyCode: ticket.partyCode, PartyName: ticket.partyName,
			TicketNo: ticket.ticketNo, Plate: ticket.plate,
			MaterialCode: ticket.materialCode, MaterialName: ticket.materialName, MaterialSpec: ticket.materialSpec,
			Direction: ticket.direction, Status: ticket.status, IssuedAt: ticket.issuedAt,
			GrossMilliTonne: ticket.gross, TareMilliTonne: ticket.tare,
			NetAdjustmentMilliTonne: ticket.adjustment, NetMilliTonne: ticket.net,
		})
	}
	return tickets, nil
}

func (r *Repository) statementTickets(ctx context.Context, q StatementQuery) ([]statementTicket, error) {
	rows, err := r.statementRows(ctx, q)
	if err != nil {
		return nil, err
	}
	tickets := make([]statementTicket, 0, len(rows))
	for _, row := range rows {
		ticket, err := parseStatementTicket(row)
		if err != nil {
			return nil, err
		}
		tickets = append(tickets, ticket)
	}
	return tickets, nil
}

func (r *Repository) statementRows(ctx context.Context, q StatementQuery) ([]statementRow, error) {
	query := r.db.WithContext(ctx).
		Table("wb_cloud_ticket t").
		Joins("LEFT JOIN wb_cloud_site s ON s.code = t.site_code").
		Select("t.site_code, COALESCE(s.name, '') AS site_name, t.party_code, t.material_code, t.direction, t.issued_at, t.final_net_milli_tonne, t.snapshot").
		Where("t.status = ?", "valid")
	if q.SiteCode != "" {
		query = query.Where("t.site_code = ?", q.SiteCode)
	}
	if q.Direction != "" {
		query = query.Where("t.direction = ?", q.Direction)
	}
	if q.PartyCode != "" {
		query = query.Where("t.party_code = ?", q.PartyCode)
	}
	if q.MaterialCode != "" {
		query = query.Where("t.material_code = ?", q.MaterialCode)
	}
	if q.From != nil {
		query = query.Where("t.issued_at >= ?", *q.From)
	}
	if q.Until != nil {
		query = query.Where("t.issued_at < ?", *q.Until)
	}
	var rows []statementRow
	if err := query.Order("t.issued_at ASC, t.id ASC").Scan(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func (r *Repository) statementSiteName(ctx context.Context, siteCode string) string {
	var name string
	_ = r.db.WithContext(ctx).Table("wb_cloud_site").Where("code = ?", siteCode).Pluck("name", &name).Error
	return name
}

func (r *Repository) statementPartyName(ctx context.Context, partyCode string) string {
	var name string
	_ = r.db.WithContext(ctx).Table("wb_cloud_party").Where("code = ?", partyCode).Pluck("name", &name).Error
	return name
}

func validateStatementQuery(q StatementQuery, detail bool) error {
	if q.Direction != "inbound" && q.Direction != "outbound" {
		return ErrInvalid
	}
	if detail && (q.SiteCode == "" || q.PartyCode == "") {
		return ErrInvalid
	}
	if q.From != nil && q.Until != nil && !q.From.Before(*q.Until) {
		return ErrInvalid
	}
	return nil
}
