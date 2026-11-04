package weighbridge

import (
	"context"
	"strings"
	"time"
)

type analyticsPartyTotalsRow struct {
	ActiveParties              int64
	TotalNetMilliTonne         int64
	ValidTickets               int64
	VoidTickets                int64
	AdjustedTickets            int64
	AdjustmentKnownTickets     int64
	AdjustmentNetMilliTonne    int64
	PreAdjustmentNetMilliTonne int64
}

type analyticsPartyRow struct {
	PartyCode                  string
	PartyName                  string
	TicketCount                int64
	NetMilliTonne              int64
	AdjustedTickets            int64
	AdjustmentKnownTickets     int64
	AdjustmentNetMilliTonne    int64
	PreAdjustmentNetMilliTonne int64
	VoidTickets                int64
	FirstIssuedAt              *time.Time
	LastIssuedAt               *time.Time
}

type analyticsPartyConcentrationRow struct {
	PartyCode     string
	PartyName     string
	NetMilliTonne int64
}

type analyticsPartySiteRowDB struct {
	SiteCode      string
	SiteName      string
	Tickets       int64
	NetMilliTonne int64
}

type analyticsRecentTicketRow struct {
	SiteCode             string
	TicketNo             string
	IssuedAt             time.Time
	Plate                string
	MaterialName         string
	NetMilliTonne        int64
	AdjustmentMilliTonne int64
}

func analyticsPartySortExpr(sortBy, sortOrder string) string {
	expr := "net_milli_tonne"
	switch sortBy {
	case "tickets":
		expr = "ticket_count"
	case "avg":
		expr = "COALESCE(net_milli_tonne / NULLIF(ticket_count, 0), 0)"
	case "adjustment":
		expr = "adjustment_net_milli_tonne"
	case "void":
		expr = "void_tickets"
	}
	direction := "DESC"
	if strings.EqualFold(sortOrder, "asc") {
		direction = "ASC"
	}
	return expr + " " + direction
}

func (r *Repository) AnalyticsPartyTotals(ctx context.Context, q AnalyticsQuery) (analyticsPartyTotalsRow, error) {
	where, args := analyticsWhere(q, true, "party")
	query := `SELECT
		COUNT(DISTINCT t.party_code) FILTER (WHERE t.status = 'valid') AS active_parties,
		COALESCE(SUM(t.final_net_milli_tonne) FILTER (WHERE t.status = 'valid'), 0) AS total_net_milli_tonne,
		COUNT(*) FILTER (WHERE t.status = 'valid') AS valid_tickets,
		COUNT(*) FILTER (WHERE t.status = 'void') AS void_tickets,
		COUNT(*) FILTER (WHERE t.status = 'valid' AND t.adjusted) AS adjusted_tickets,
		COUNT(*) FILTER (WHERE t.status = 'valid' AND t.adjustment_known) AS adjustment_known_tickets,
		COALESCE(SUM(t.net_adjustment_milli_tonne) FILTER (WHERE t.status = 'valid' AND t.adjustment_known), 0) AS adjustment_net_milli_tonne,
		COALESCE(SUM(t.pre_adjustment_net_milli_tonne) FILTER (WHERE t.status = 'valid' AND t.adjustment_known), 0) AS pre_adjustment_net_milli_tonne` + analyticsFrom + ` WHERE ` + where
	var row analyticsPartyTotalsRow
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&row).Error
	return row, err
}

func (r *Repository) AnalyticsPartyRows(ctx context.Context, q AnalyticsQuery) ([]analyticsPartyRow, int64, error) {
	where, args := analyticsWhere(q, true, "party")
	countQuery := `SELECT COUNT(*) FROM (SELECT 1` + analyticsFrom + ` WHERE ` + where + ` GROUP BY t.party_code HAVING COUNT(*) FILTER (WHERE t.status = 'valid') > 0) x`
	var total int64
	if err := r.db.WithContext(ctx).Raw(countQuery, args...).Scan(&total).Error; err != nil {
		return nil, 0, err
	}
	sortExpr := analyticsPartySortExpr(q.SortBy, q.SortOrder)
	query := `SELECT
		t.party_code,
		COALESCE(MAX(t.party_name), '') AS party_name,
		COUNT(*) FILTER (WHERE t.status = 'valid') AS ticket_count,
		COALESCE(SUM(t.final_net_milli_tonne) FILTER (WHERE t.status = 'valid'), 0) AS net_milli_tonne,
		COUNT(*) FILTER (WHERE t.status = 'valid' AND t.adjusted) AS adjusted_tickets,
		COUNT(*) FILTER (WHERE t.status = 'valid' AND t.adjustment_known) AS adjustment_known_tickets,
		COALESCE(SUM(t.net_adjustment_milli_tonne) FILTER (WHERE t.status = 'valid' AND t.adjustment_known), 0) AS adjustment_net_milli_tonne,
		COALESCE(SUM(t.pre_adjustment_net_milli_tonne) FILTER (WHERE t.status = 'valid' AND t.adjustment_known), 0) AS pre_adjustment_net_milli_tonne,
		COUNT(*) FILTER (WHERE t.status = 'void') AS void_tickets,
		MIN(t.issued_at) FILTER (WHERE t.status = 'valid') AS first_issued_at,
		MAX(t.issued_at) FILTER (WHERE t.status = 'valid') AS last_issued_at` + analyticsFrom + ` WHERE ` + where + ` GROUP BY t.party_code HAVING COUNT(*) FILTER (WHERE t.status = 'valid') > 0 ORDER BY ` + sortExpr + `, t.party_code LIMIT ? OFFSET ?`
	rows := []analyticsPartyRow{}
	args = append(args, q.PageSize, (q.Page-1)*q.PageSize)
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&rows).Error
	return rows, total, err
}

func (r *Repository) AnalyticsPartyConcentration(ctx context.Context, q AnalyticsQuery) ([]analyticsPartyConcentrationRow, error) {
	where, args := analyticsWhere(q, false, "party")
	query := `SELECT
		t.party_code,
		COALESCE(MAX(t.party_name), '') AS party_name,
		COALESCE(SUM(t.final_net_milli_tonne), 0) AS net_milli_tonne` + analyticsFrom + ` WHERE ` + where + ` GROUP BY t.party_code ORDER BY net_milli_tonne DESC, t.party_code`
	rows := []analyticsPartyConcentrationRow{}
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&rows).Error
	return rows, err
}

func (r *Repository) AnalyticsPartyNewCount(ctx context.Context, q AnalyticsQuery) (int64, error) {
	// First-seen must look at all history before the period end, not only the
	// selected period; otherwise every active party would look new.
	firstQ := q
	firstQ.From = time.Time{}
	where, args := analyticsWhere(firstQ, false, "party")
	query := `WITH first_seen AS (
		SELECT t.party_code, MIN(t.issued_at) AS first_at
		` + analyticsFrom + ` WHERE ` + where + ` GROUP BY t.party_code
	)
	SELECT COUNT(*) FROM first_seen WHERE first_at >= ?`
	args = append(args, q.From)
	var count int64
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&count).Error
	return count, err
}

func (r *Repository) AnalyticsPartyCohort(ctx context.Context, q AnalyticsQuery, previousFrom, previousUntil time.Time) (returning int64, dormant int64, err error) {
	currentWhere, currentArgs := analyticsWhere(q, false, "party")
	previousQ := q
	previousQ.From = previousFrom
	previousQ.Until = previousUntil
	previousWhere, previousArgs := analyticsWhere(previousQ, false, "party")
	beforeQ := q
	beforeQ.From = time.Time{}
	beforeQ.Until = q.From
	beforeWhere, beforeArgs := analyticsWhere(beforeQ, false, "party")
	query := `WITH current AS (
		SELECT DISTINCT t.party_code` + analyticsFrom + ` WHERE ` + currentWhere + `
	), previous AS (
		SELECT DISTINCT t.party_code` + analyticsFrom + ` WHERE ` + previousWhere + `
	), before AS (
		SELECT DISTINCT t.party_code` + analyticsFrom + ` WHERE ` + beforeWhere + `
	)
	SELECT
		(SELECT COUNT(*) FROM current c WHERE NOT EXISTS (SELECT 1 FROM previous p WHERE p.party_code = c.party_code) AND EXISTS (SELECT 1 FROM before b WHERE b.party_code = c.party_code)) AS returning,
		(SELECT COUNT(*) FROM before b WHERE NOT EXISTS (SELECT 1 FROM current c WHERE c.party_code = b.party_code)) AS dormant`
	args := append(append(append([]any{}, currentArgs...), previousArgs...), beforeArgs...)
	var row struct {
		Returning int64
		Dormant   int64
	}
	if err = r.db.WithContext(ctx).Raw(query, args...).Scan(&row).Error; err != nil {
		return 0, 0, err
	}
	return row.Returning, row.Dormant, nil
}

func (r *Repository) AnalyticsPartySites(ctx context.Context, q AnalyticsQuery) ([]analyticsPartySiteRowDB, error) {
	where, args := analyticsWhere(q, false, "party")
	query := `SELECT
		t.site_code,
		COALESCE(s.name, '') AS site_name,
		COUNT(*) AS tickets,
		COALESCE(SUM(t.final_net_milli_tonne), 0) AS net_milli_tonne` + analyticsFrom + ` WHERE ` + where + ` GROUP BY t.site_code, s.name ORDER BY net_milli_tonne DESC`
	rows := []analyticsPartySiteRowDB{}
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&rows).Error
	return rows, err
}

func (r *Repository) AnalyticsPartyRecentTickets(ctx context.Context, q AnalyticsQuery, limit int) ([]analyticsRecentTicketRow, error) {
	where, args := analyticsWhere(q, false, "party")
	query := `SELECT
		t.site_code,
		t.ticket_no,
		t.issued_at,
		t.plate,
		COALESCE(t.material_name, '') AS material_name,
		t.final_net_milli_tonne AS net_milli_tonne,
		COALESCE(t.net_adjustment_milli_tonne, 0) AS adjustment_milli_tonne` + analyticsFrom + ` WHERE ` + where + ` ORDER BY t.issued_at DESC, t.id DESC LIMIT ?`
	args = append(args, limit)
	rows := []analyticsRecentTicketRow{}
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&rows).Error
	return rows, err
}
