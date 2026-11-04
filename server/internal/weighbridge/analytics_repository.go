package weighbridge

import (
	"context"
	"fmt"
	"strings"
	"time"
)

const analyticsFrom = ` FROM wb_cloud_ticket t
	LEFT JOIN wb_cloud_material m ON m.code = t.material_code
	LEFT JOIN wb_cloud_category c ON c.id = m.category_id
	LEFT JOIN wb_cloud_site s ON s.code = t.site_code `

type analyticsSummaryRow struct {
	ValidTickets               int64
	InboundTickets             int64
	InboundNetMilliTonne       int64
	OutboundTickets            int64
	OutboundNetMilliTonne      int64
	ActiveSites                int64
	ActiveSuppliers            int64
	ActiveCustomers            int64
	AdjustmentKnownTickets     int64
	AdjustedTickets            int64
	AdjustmentNetMilliTonne    int64
	PreAdjustmentNetMilliTonne int64
	VoidTickets                int64
}

type analyticsTrendRow struct {
	PeriodStart           time.Time
	InboundTickets        int64
	InboundNetMilliTonne  int64
	OutboundTickets       int64
	OutboundNetMilliTonne int64
	VoidTickets           int64
}

type analyticsSiteRow struct {
	SiteCode                   string
	SiteName                   string
	ValidTickets               int64
	InboundTickets             int64
	InboundNetMilliTonne       int64
	OutboundTickets            int64
	OutboundNetMilliTonne      int64
	VoidTickets                int64
	AdjustedTickets            int64
	AdjustmentKnownTickets     int64
	AdjustmentNetMilliTonne    int64
	PreAdjustmentNetMilliTonne int64
}

type analyticsDurationRow struct {
	SampleTickets   int64
	MedianSeconds   *float64
	P90Seconds      *float64
	MaxSeconds      *int64
	CrossDayTickets int64
}

func analyticsKeywordArgs(scope, keyword string) []any {
	if keyword == "" {
		return nil
	}
	term := "%" + keyword + "%"
	switch scope {
	case "material":
		return []any{term, term, term}
	case "party":
		return []any{term, term}
	default:
		return []any{term, term, term, term}
	}
}

func analyticsKeywordClause(scope string) string {
	switch scope {
	case "material":
		return "(t.material_code ILIKE ? OR COALESCE(t.material_name, '') ILIKE ? OR COALESCE(t.material_spec, '') ILIKE ?)"
	case "party":
		return "(t.party_code ILIKE ? OR COALESCE(t.party_name, '') ILIKE ?)"
	default:
		return "(t.material_code ILIKE ? OR COALESCE(t.material_name, '') ILIKE ? OR t.party_code ILIKE ? OR COALESCE(t.party_name, '') ILIKE ?)"
	}
}

func analyticsWhere(q AnalyticsQuery, includeVoid bool, keywordScope string) (string, []any) {
	clauses := make([]string, 0, 10)
	args := make([]any, 0, 16)
	if !includeVoid {
		clauses = append(clauses, "t.status = 'valid'")
	}
	if !q.From.IsZero() {
		clauses = append(clauses, "t.issued_at >= ?")
		args = append(args, q.From)
	}
	if !q.Until.IsZero() {
		clauses = append(clauses, "t.issued_at < ?")
		args = append(args, q.Until)
	}
	if q.SiteCode != "" {
		clauses = append(clauses, "t.site_code = ?")
		args = append(args, q.SiteCode)
	}
	if q.Direction != "" {
		clauses = append(clauses, "t.direction = ?")
		args = append(args, q.Direction)
	}
	if q.MaterialCode != "" {
		clauses = append(clauses, "t.material_code = ?")
		args = append(args, q.MaterialCode)
	}
	if q.CategoryCode != "" {
		clauses = append(clauses, "c.code = ?")
		args = append(args, q.CategoryCode)
	}
	if q.PartyCode != "" {
		clauses = append(clauses, "t.party_code = ?")
		args = append(args, q.PartyCode)
	}
	if q.IssuerName != "" {
		clauses = append(clauses, "t.issuer_name = ?")
		args = append(args, q.IssuerName)
	}
	if q.Keyword != "" {
		clauses = append(clauses, analyticsKeywordClause(keywordScope))
		args = append(args, analyticsKeywordArgs(keywordScope, q.Keyword)...)
	}
	if len(clauses) == 0 {
		return "TRUE", args
	}
	return strings.Join(clauses, " AND "), args
}

func analyticsPeriodExpr(granularity string) string {
	switch granularity {
	case "week":
		return "date_trunc('week', t.issued_date)::date"
	case "month":
		return "date_trunc('month', t.issued_date)::date"
	case "quarter":
		return "date_trunc('quarter', t.issued_date)::date"
	case "year":
		return "date_trunc('year', t.issued_date)::date"
	default:
		return "t.issued_date"
	}
}

func analyticsSortExpr(sortBy, sortOrder, defaultExpr string) string {
	expr := defaultExpr
	switch sortBy {
	case "tickets":
		expr = "total_tickets"
	case "avg":
		expr = "COALESCE(total_net_milli_tonne / NULLIF(total_tickets, 0), 0)"
	case "adjustment":
		expr = "adjustment_net_milli_tonne"
	case "void":
		expr = "void_tickets"
	case "lastIssuedAt":
		expr = "last_issued_at"
	case "net":
		expr = "total_net_milli_tonne"
	}
	direction := "DESC"
	if strings.EqualFold(sortOrder, "asc") {
		direction = "ASC"
	}
	return expr + " " + direction
}

func (r *Repository) AnalyticsSummary(ctx context.Context, q AnalyticsQuery) (analyticsSummaryRow, error) {
	where, args := analyticsWhere(q, true, "all")
	query := `SELECT
		COUNT(*) FILTER (WHERE t.status = 'valid') AS valid_tickets,
		COUNT(*) FILTER (WHERE t.status = 'valid' AND t.direction = 'inbound') AS inbound_tickets,
		COALESCE(SUM(t.final_net_milli_tonne) FILTER (WHERE t.status = 'valid' AND t.direction = 'inbound'), 0) AS inbound_net_milli_tonne,
		COUNT(*) FILTER (WHERE t.status = 'valid' AND t.direction = 'outbound') AS outbound_tickets,
		COALESCE(SUM(t.final_net_milli_tonne) FILTER (WHERE t.status = 'valid' AND t.direction = 'outbound'), 0) AS outbound_net_milli_tonne,
		COUNT(DISTINCT t.site_code) FILTER (WHERE t.status = 'valid') AS active_sites,
		COUNT(DISTINCT t.party_code) FILTER (WHERE t.status = 'valid' AND t.direction = 'inbound') AS active_suppliers,
		COUNT(DISTINCT t.party_code) FILTER (WHERE t.status = 'valid' AND t.direction = 'outbound') AS active_customers,
		COUNT(*) FILTER (WHERE t.status = 'valid' AND t.adjustment_known) AS adjustment_known_tickets,
		COUNT(*) FILTER (WHERE t.status = 'valid' AND t.adjusted) AS adjusted_tickets,
		COALESCE(SUM(t.net_adjustment_milli_tonne) FILTER (WHERE t.status = 'valid' AND t.adjustment_known), 0) AS adjustment_net_milli_tonne,
		COALESCE(SUM(t.pre_adjustment_net_milli_tonne) FILTER (WHERE t.status = 'valid' AND t.adjustment_known), 0) AS pre_adjustment_net_milli_tonne,
		COUNT(*) FILTER (WHERE t.status = 'void') AS void_tickets` + analyticsFrom + ` WHERE ` + where
	var row analyticsSummaryRow
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&row).Error
	return row, err
}

func (r *Repository) AnalyticsTrend(ctx context.Context, q AnalyticsQuery) ([]analyticsTrendRow, error) {
	where, args := analyticsWhere(q, true, "all")
	period := analyticsPeriodExpr(q.Granularity)
	query := fmt.Sprintf(`SELECT
		%s AS period_start,
		COUNT(*) FILTER (WHERE t.status = 'valid' AND t.direction = 'inbound') AS inbound_tickets,
		COALESCE(SUM(t.final_net_milli_tonne) FILTER (WHERE t.status = 'valid' AND t.direction = 'inbound'), 0) AS inbound_net_milli_tonne,
		COUNT(*) FILTER (WHERE t.status = 'valid' AND t.direction = 'outbound') AS outbound_tickets,
		COALESCE(SUM(t.final_net_milli_tonne) FILTER (WHERE t.status = 'valid' AND t.direction = 'outbound'), 0) AS outbound_net_milli_tonne,
		COUNT(*) FILTER (WHERE t.status = 'void') AS void_tickets
		%s WHERE %s GROUP BY period_start ORDER BY period_start LIMIT 1001`, period, analyticsFrom, where)
	var rows []analyticsTrendRow
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&rows).Error
	return rows, err
}

func (r *Repository) AnalyticsSiteComparison(ctx context.Context, q AnalyticsQuery) ([]analyticsSiteRow, error) {
	where, args := analyticsWhere(q, true, "all")
	query := `SELECT
		t.site_code,
		COALESCE(s.name, '') AS site_name,
		COUNT(*) FILTER (WHERE t.status = 'valid') AS valid_tickets,
		COUNT(*) FILTER (WHERE t.status = 'valid' AND t.direction = 'inbound') AS inbound_tickets,
		COALESCE(SUM(t.final_net_milli_tonne) FILTER (WHERE t.status = 'valid' AND t.direction = 'inbound'), 0) AS inbound_net_milli_tonne,
		COUNT(*) FILTER (WHERE t.status = 'valid' AND t.direction = 'outbound') AS outbound_tickets,
		COALESCE(SUM(t.final_net_milli_tonne) FILTER (WHERE t.status = 'valid' AND t.direction = 'outbound'), 0) AS outbound_net_milli_tonne,
		COUNT(*) FILTER (WHERE t.status = 'void') AS void_tickets,
		COUNT(*) FILTER (WHERE t.status = 'valid' AND t.adjusted) AS adjusted_tickets,
		COUNT(*) FILTER (WHERE t.status = 'valid' AND t.adjustment_known) AS adjustment_known_tickets,
		COALESCE(SUM(t.net_adjustment_milli_tonne) FILTER (WHERE t.status = 'valid' AND t.adjustment_known), 0) AS adjustment_net_milli_tonne,
		COALESCE(SUM(t.pre_adjustment_net_milli_tonne) FILTER (WHERE t.status = 'valid' AND t.adjustment_known), 0) AS pre_adjustment_net_milli_tonne` + analyticsFrom + ` WHERE ` + where + ` GROUP BY t.site_code, s.name ORDER BY valid_tickets DESC, t.site_code`
	var rows []analyticsSiteRow
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&rows).Error
	return rows, err
}

func (r *Repository) AnalyticsDuration(ctx context.Context, q AnalyticsQuery) (analyticsDurationRow, error) {
	where, args := analyticsWhere(q, false, "all")
	query := `SELECT
		COUNT(*) AS sample_tickets,
		PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY t.weigh_interval_seconds) AS median_seconds,
		PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY t.weigh_interval_seconds) AS p90_seconds,
		MAX(t.weigh_interval_seconds) AS max_seconds,
		COUNT(*) FILTER (WHERE t.cross_day) AS cross_day_tickets` + analyticsFrom + ` WHERE ` + where + ` AND t.previous_ticket_no IS NULL AND t.weigh_interval_seconds IS NOT NULL AND t.weigh_interval_seconds >= 0`
	var row analyticsDurationRow
	if err := r.db.WithContext(ctx).Raw(query, args...).Scan(&row).Error; err != nil {
		return row, err
	}
	return row, nil
}

func (r *Repository) AnalyticsReopenedCount(ctx context.Context, q AnalyticsQuery) (int64, error) {
	where, args := analyticsWhere(q, false, "all")
	query := `SELECT COUNT(*)` + analyticsFrom + ` WHERE ` + where + ` AND t.previous_ticket_no IS NOT NULL`
	var count int64
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&count).Error
	return count, err
}
