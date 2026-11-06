package weighbridge

import (
	"context"
	"fmt"
	"strings"
	"time"
)

type analyticsSupplierQualitySummaryRow struct {
	SupplierCount                   int64
	TicketCount                     int64
	SampleCount                     int64
	AdjustedTickets                 int64
	TotalAdjustmentMilliTonne       int64
	TotalPreAdjustmentNetMilliTonne int64
	AvgRateBp                       *int64
	MedianRateBp                    *int64
	P90RateBp                       *int64
}

type analyticsSupplierQualityRow struct {
	PartyCode                       string
	PartyName                       string
	Nature                          string
	TicketCount                     int64
	SampleCount                     int64
	AdjustedTickets                 int64
	TotalAdjustmentMilliTonne       int64
	TotalPreAdjustmentNetMilliTonne int64
	AvgRateBp                       *int64
	MedianRateBp                    *int64
	P90RateBp                       *int64
	StddevRateBp                    *int64
	MinRateBp                       *int64
	MaxRateBp                       *int64
	MaterialCount                   int64
	MaterialNames                   string
	FirstIssuedAt                   *time.Time
	LastIssuedAt                    *time.Time
}

type analyticsSupplierRateTrendRow struct {
	PartyCode   string
	PartyName   string
	PeriodStart time.Time
	AvgRateBp   *int64
	SampleCount int64
}

func defaultCoreCategoryCodes(q AnalyticsQuery) AnalyticsQuery {
	q.Direction = "inbound"
	if q.CategoryCode == "" && len(q.CategoryCodes) == 0 {
		q.CategoryCodes = []string{"C-C-0001", "C-C-0002"}
	}
	return q
}

func (r *Repository) AnalyticsSupplierQualitySummary(ctx context.Context, q AnalyticsQuery) (analyticsSupplierQualitySummaryRow, error) {
	q = defaultCoreCategoryCodes(q)
	where, args := analyticsWhere(q, false, "party")
	query := `WITH scoped AS (
		SELECT t.party_code, t.party_name, p.nature, t.material_code, t.material_name,
			t.net_adjustment_milli_tonne, t.pre_adjustment_net_milli_tonne,
			t.adjustment_known, t.adjusted, t.issued_at, t.issued_date` + analyticsFrom + ` WHERE ` + where + `
	), samples AS (
		SELECT *, (net_adjustment_milli_tonne::numeric / NULLIF(pre_adjustment_net_milli_tonne, 0)) AS rate
		FROM scoped
		WHERE adjustment_known AND pre_adjustment_net_milli_tonne > 0
	)
	SELECT
		(SELECT COUNT(DISTINCT party_code) FROM scoped) AS supplier_count,
		(SELECT COUNT(*) FROM scoped) AS ticket_count,
		(SELECT COUNT(*) FROM samples) AS sample_count,
		(SELECT COUNT(*) FROM samples WHERE adjusted) AS adjusted_tickets,
		(SELECT COALESCE(SUM(net_adjustment_milli_tonne), 0) FROM samples) AS total_adjustment_milli_tonne,
		(SELECT COALESCE(SUM(pre_adjustment_net_milli_tonne), 0) FROM samples) AS total_pre_adjustment_net_milli_tonne,
		(SELECT ROUND(AVG(rate) * 10000)::bigint FROM samples) AS avg_rate_bp,
		(SELECT ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rate) * 10000)::bigint FROM samples) AS median_rate_bp,
		(SELECT ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY rate) * 10000)::bigint FROM samples) AS p90_rate_bp`
	var row analyticsSupplierQualitySummaryRow
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&row).Error
	return row, err
}

func (r *Repository) AnalyticsSupplierQualityRows(ctx context.Context, q AnalyticsQuery) ([]analyticsSupplierQualityRow, int64, error) {
	q = defaultCoreCategoryCodes(q)
	where, args := analyticsWhere(q, false, "party")
	countQuery := `SELECT COUNT(DISTINCT t.party_code)` + analyticsFrom + ` WHERE ` + where
	var total int64
	if err := r.db.WithContext(ctx).Raw(countQuery, args...).Scan(&total).Error; err != nil {
		return nil, 0, err
	}
	sortExpr := supplierQualitySortExpr(q.SortBy, q.SortOrder)
	query := `WITH scoped AS (
		SELECT t.party_code, t.party_name, p.nature, t.material_code, t.material_name,
			t.net_adjustment_milli_tonne, t.pre_adjustment_net_milli_tonne,
			t.adjustment_known, t.adjusted, t.issued_at` + analyticsFrom + ` WHERE ` + where + `
	), samples AS (
		SELECT *, (net_adjustment_milli_tonne::numeric / NULLIF(pre_adjustment_net_milli_tonne, 0)) AS rate
		FROM scoped
		WHERE adjustment_known AND pre_adjustment_net_milli_tonne > 0
	), party_scope AS (
		SELECT party_code,
			COALESCE(MAX(party_name), '') AS party_name,
			COALESCE(MAX(nature), '') AS nature,
			COUNT(*) AS ticket_count,
			COUNT(DISTINCT material_code) AS material_count,
			COALESCE(string_agg(DISTINCT material_name, '、'), '') AS material_names,
			MIN(issued_at) AS first_issued_at,
			MAX(issued_at) AS last_issued_at
		FROM scoped GROUP BY party_code
	), sample_stats AS (
		SELECT party_code,
			COUNT(*) AS sample_count,
			COUNT(*) FILTER (WHERE adjusted) AS adjusted_tickets,
			COALESCE(SUM(net_adjustment_milli_tonne), 0) AS total_adjustment_milli_tonne,
			COALESCE(SUM(pre_adjustment_net_milli_tonne), 0) AS total_pre_adjustment_net_milli_tonne,
			ROUND(AVG(rate) * 10000)::bigint AS avg_rate_bp,
			ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rate) * 10000)::bigint AS median_rate_bp,
			ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY rate) * 10000)::bigint AS p90_rate_bp,
			ROUND(STDDEV_SAMP(rate) * 10000)::bigint AS stddev_rate_bp,
			ROUND(MIN(rate) * 10000)::bigint AS min_rate_bp,
			ROUND(MAX(rate) * 10000)::bigint AS max_rate_bp
		FROM samples GROUP BY party_code
	)
	SELECT
		ps.party_code, ps.party_name, ps.nature, ps.ticket_count,
		COALESCE(ss.sample_count, 0) AS sample_count,
		COALESCE(ss.adjusted_tickets, 0) AS adjusted_tickets,
		COALESCE(ss.total_adjustment_milli_tonne, 0) AS total_adjustment_milli_tonne,
		COALESCE(ss.total_pre_adjustment_net_milli_tonne, 0) AS total_pre_adjustment_net_milli_tonne,
		ss.avg_rate_bp, ss.median_rate_bp, ss.p90_rate_bp, ss.stddev_rate_bp, ss.min_rate_bp, ss.max_rate_bp,
		ps.material_count, ps.material_names, ps.first_issued_at, ps.last_issued_at
	FROM party_scope ps
	LEFT JOIN sample_stats ss ON ss.party_code = ps.party_code
	ORDER BY ` + sortExpr + `, ps.party_code
	LIMIT ? OFFSET ?`
	rows := []analyticsSupplierQualityRow{}
	args = append(args, q.PageSize, (q.Page-1)*q.PageSize)
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&rows).Error
	return rows, total, err
}

func supplierQualitySortExpr(sortBy, sortOrder string) string {
	expr := "COALESCE(ss.avg_rate_bp, 0)"
	switch sortBy {
	case "sample":
		expr = "COALESCE(ss.sample_count, 0)"
	case "tickets":
		expr = "ps.ticket_count"
	case "stddev":
		expr = "COALESCE(ss.stddev_rate_bp, 0)"
	case "cv":
		expr = "COALESCE(ss.stddev_rate_bp::numeric / NULLIF(ss.avg_rate_bp, 0), 0)"
	case "lastIssuedAt":
		expr = "ps.last_issued_at"
	case "weighted":
		expr = "COALESCE(ss.total_adjustment_milli_tonne::numeric / NULLIF(ss.total_pre_adjustment_net_milli_tonne, 0), 0)"
	}
	direction := "DESC"
	if strings.EqualFold(sortOrder, "asc") {
		direction = "ASC"
	}
	return expr + " " + direction
}

func (r *Repository) AnalyticsSupplierQualityTrend(ctx context.Context, q AnalyticsQuery, codes []string) ([]analyticsSupplierRateTrendRow, error) {
	if len(codes) == 0 {
		return []analyticsSupplierRateTrendRow{}, nil
	}
	q = defaultCoreCategoryCodes(q)
	where, args := analyticsWhere(q, false, "party")
	placeholders := make([]string, len(codes))
	for i, code := range codes {
		placeholders[i] = "?"
		args = append(args, code)
	}
	period := analyticsPeriodExprFor("samples", q.Granularity)
	query := fmt.Sprintf(`WITH scoped AS (
		SELECT t.party_code, t.party_name, t.net_adjustment_milli_tonne, t.pre_adjustment_net_milli_tonne,
			t.adjustment_known, t.issued_date`+analyticsFrom+` WHERE %s
	), samples AS (
		SELECT *, (net_adjustment_milli_tonne::numeric / NULLIF(pre_adjustment_net_milli_tonne, 0)) AS rate
		FROM scoped
		WHERE adjustment_known AND pre_adjustment_net_milli_tonne > 0
	)
	SELECT
		party_code,
		COALESCE(MAX(party_name), '') AS party_name,
		%s AS period_start,
		ROUND(AVG(rate) * 10000)::bigint AS avg_rate_bp,
		COUNT(*) AS sample_count
	FROM samples
	WHERE party_code IN (%s)
	GROUP BY party_code, period_start
	ORDER BY period_start, party_code`, where, period, strings.Join(placeholders, ","))
	rows := []analyticsSupplierRateTrendRow{}
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&rows).Error
	return rows, err
}
