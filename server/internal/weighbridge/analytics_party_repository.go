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
	Nature                     string
	TicketCount                int64
	NetMilliTonne              int64
	AdjustedTickets            int64
	AdjustmentKnownTickets     int64
	AdjustmentNetMilliTonne    int64
	PreAdjustmentNetMilliTonne int64
	VoidTickets                int64
	FirstIssuedAt              *time.Time
	LastIssuedAt               *time.Time
	AvgIntervalSeconds         *int64
	MedianIntervalSeconds      *int64
	ActiveMonths               int64
	MonthlyNetCvBp             *int64
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
	case "interval":
		expr = "avg_interval_seconds"
	case "volatility":
		expr = "monthly_net_cv_bp"
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
	query := `WITH base AS (
		SELECT t.id, t.party_code, t.party_name, p.nature, t.status, t.issued_at, t.issued_date,
			t.final_net_milli_tonne, t.adjusted, t.adjustment_known,
			t.net_adjustment_milli_tonne, t.pre_adjustment_net_milli_tonne` + analyticsFrom + ` WHERE ` + where + `
	), party_base AS (
		SELECT party_code,
			COALESCE(MAX(party_name), '') AS party_name,
			COALESCE(MAX(nature), '') AS nature,
			COUNT(*) FILTER (WHERE status = 'valid') AS ticket_count,
			COALESCE(SUM(final_net_milli_tonne) FILTER (WHERE status = 'valid'), 0) AS net_milli_tonne,
			COUNT(*) FILTER (WHERE status = 'valid' AND adjusted) AS adjusted_tickets,
			COUNT(*) FILTER (WHERE status = 'valid' AND adjustment_known) AS adjustment_known_tickets,
			COALESCE(SUM(net_adjustment_milli_tonne) FILTER (WHERE status = 'valid' AND adjustment_known), 0) AS adjustment_net_milli_tonne,
			COALESCE(SUM(pre_adjustment_net_milli_tonne) FILTER (WHERE status = 'valid' AND adjustment_known), 0) AS pre_adjustment_net_milli_tonne,
			COUNT(*) FILTER (WHERE status = 'void') AS void_tickets,
			MIN(issued_at) FILTER (WHERE status = 'valid') AS first_issued_at,
			MAX(issued_at) FILTER (WHERE status = 'valid') AS last_issued_at
		FROM base GROUP BY party_code HAVING COUNT(*) FILTER (WHERE status = 'valid') > 0
	), interval_rows AS (
		SELECT party_code, issued_at,
			LAG(issued_at) OVER (PARTITION BY party_code ORDER BY issued_at, id) AS previous_issued_at
		FROM base WHERE status = 'valid'
	), interval_stats AS (
		SELECT party_code,
			ROUND(AVG(EXTRACT(EPOCH FROM (issued_at - previous_issued_at))))::bigint AS avg_interval_seconds,
			ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (issued_at - previous_issued_at)))::numeric)::bigint AS median_interval_seconds
		FROM interval_rows WHERE previous_issued_at IS NOT NULL GROUP BY party_code
	), monthly AS (
		SELECT party_code, date_trunc('month', issued_date) AS period, SUM(final_net_milli_tonne) AS net
		FROM base WHERE status = 'valid' GROUP BY party_code, period
	), monthly_stats AS (
		SELECT party_code, COUNT(*) AS active_months,
			ROUND(STDDEV_SAMP(net) / NULLIF(AVG(net), 0) * 10000)::bigint AS monthly_net_cv_bp
		FROM monthly GROUP BY party_code
	)
	SELECT
		pb.party_code, pb.party_name, pb.nature, pb.ticket_count, pb.net_milli_tonne,
		pb.adjusted_tickets, pb.adjustment_known_tickets, pb.adjustment_net_milli_tonne, pb.pre_adjustment_net_milli_tonne,
		pb.void_tickets, pb.first_issued_at, pb.last_issued_at,
		ist.avg_interval_seconds, ist.median_interval_seconds,
		COALESCE(ms.active_months, 0) AS active_months, ms.monthly_net_cv_bp
	FROM party_base pb
	LEFT JOIN interval_stats ist ON ist.party_code = pb.party_code
	LEFT JOIN monthly_stats ms ON ms.party_code = pb.party_code
	ORDER BY ` + sortExpr + `, pb.party_code LIMIT ? OFFSET ?`
	rows := []analyticsPartyRow{}
	args = append(args, q.PageSize, (q.Page-1)*q.PageSize)
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&rows).Error
	return rows, total, err
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
