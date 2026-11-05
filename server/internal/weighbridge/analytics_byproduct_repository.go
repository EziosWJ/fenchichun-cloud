package weighbridge

import (
	"context"
	"strings"
	"time"
)

type analyticsByproductSummaryRow struct {
	ActiveCustomers    int64
	TicketCount        int64
	TotalNetMilliTonne int64
	MaterialCount      int64
}

type analyticsByproductRow struct {
	PartyCode     string
	PartyName     string
	Nature        string
	TicketCount   int64
	NetMilliTonne int64
	MaterialCount int64
	MaterialNames string
	FirstIssuedAt *time.Time
	LastIssuedAt  *time.Time
}

type analyticsByproductMaterialRow struct {
	MaterialCode  string
	MaterialName  string
	TicketCount   int64
	NetMilliTonne int64
}

func defaultByproductQuery(q AnalyticsQuery) AnalyticsQuery {
	q.Direction = "outbound"
	if q.CategoryCode == "" && len(q.CategoryCodes) == 0 {
		q.CategoryCode = "C-C-0005"
	}
	return q
}

func (r *Repository) AnalyticsByproductSummary(ctx context.Context, q AnalyticsQuery) (analyticsByproductSummaryRow, error) {
	q = defaultByproductQuery(q)
	where, args := analyticsWhere(q, false, "party")
	query := `SELECT
		COUNT(DISTINCT t.party_code) AS active_customers,
		COUNT(*) AS ticket_count,
		COALESCE(SUM(t.final_net_milli_tonne), 0) AS total_net_milli_tonne,
		COUNT(DISTINCT t.material_code) AS material_count` + analyticsFrom + ` WHERE ` + where
	var row analyticsByproductSummaryRow
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&row).Error
	return row, err
}

func (r *Repository) AnalyticsByproductRows(ctx context.Context, q AnalyticsQuery) ([]analyticsByproductRow, int64, error) {
	q = defaultByproductQuery(q)
	where, args := analyticsWhere(q, false, "party")
	countQuery := `SELECT COUNT(DISTINCT t.party_code)` + analyticsFrom + ` WHERE ` + where
	var total int64
	if err := r.db.WithContext(ctx).Raw(countQuery, args...).Scan(&total).Error; err != nil {
		return nil, 0, err
	}
	sortExpr := byproductSortExpr(q.SortBy, q.SortOrder)
	query := `SELECT
		t.party_code,
		COALESCE(MAX(t.party_name), '') AS party_name,
		COALESCE(MAX(p.nature), '') AS nature,
		COUNT(*) AS ticket_count,
		COALESCE(SUM(t.final_net_milli_tonne), 0) AS net_milli_tonne,
		COUNT(DISTINCT t.material_code) AS material_count,
		COALESCE(string_agg(DISTINCT t.material_name, '、'), '') AS material_names,
		MIN(t.issued_at) AS first_issued_at,
		MAX(t.issued_at) AS last_issued_at` + analyticsFrom + ` WHERE ` + where + ` GROUP BY t.party_code ORDER BY ` + sortExpr + `, t.party_code LIMIT ? OFFSET ?`
	rows := []analyticsByproductRow{}
	args = append(args, q.PageSize, (q.Page-1)*q.PageSize)
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&rows).Error
	return rows, total, err
}

func byproductSortExpr(sortBy, sortOrder string) string {
	expr := "net_milli_tonne"
	switch sortBy {
	case "tickets":
		expr = "ticket_count"
	case "avg":
		expr = "COALESCE(net_milli_tonne / NULLIF(ticket_count, 0), 0)"
	case "lastIssuedAt":
		expr = "last_issued_at"
	}
	direction := "DESC"
	if strings.EqualFold(sortOrder, "asc") {
		direction = "ASC"
	}
	return expr + " " + direction
}

func (r *Repository) AnalyticsByproductConcentration(ctx context.Context, q AnalyticsQuery) ([]analyticsPartyConcentrationRow, error) {
	q = defaultByproductQuery(q)
	where, args := analyticsWhere(q, false, "party")
	query := `SELECT
		t.party_code,
		COALESCE(MAX(t.party_name), '') AS party_name,
		COALESCE(SUM(t.final_net_milli_tonne), 0) AS net_milli_tonne` + analyticsFrom + ` WHERE ` + where + ` GROUP BY t.party_code ORDER BY net_milli_tonne DESC, t.party_code`
	rows := []analyticsPartyConcentrationRow{}
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&rows).Error
	return rows, err
}

func (r *Repository) AnalyticsByproductMaterials(ctx context.Context, q AnalyticsQuery) ([]analyticsByproductMaterialRow, error) {
	q = defaultByproductQuery(q)
	where, args := analyticsWhere(q, false, "all")
	query := `SELECT
		t.material_code,
		COALESCE(MAX(t.material_name), '') AS material_name,
		COUNT(*) AS ticket_count,
		COALESCE(SUM(t.final_net_milli_tonne), 0) AS net_milli_tonne` + analyticsFrom + ` WHERE ` + where + ` GROUP BY t.material_code ORDER BY net_milli_tonne DESC`
	rows := []analyticsByproductMaterialRow{}
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&rows).Error
	return rows, err
}

type analyticsByproductTrendRow struct {
	PeriodStart   time.Time
	TicketCount   int64
	NetMilliTonne int64
}

func (r *Repository) AnalyticsByproductTrend(ctx context.Context, q AnalyticsQuery) ([]analyticsByproductTrendRow, error) {
	q = defaultByproductQuery(q)
	where, args := analyticsWhere(q, false, "all")
	period := analyticsPeriodExpr(q.Granularity)
	query := `SELECT
		` + period + ` AS period_start,
		COUNT(*) AS ticket_count,
		COALESCE(SUM(t.final_net_milli_tonne), 0) AS net_milli_tonne` + analyticsFrom + ` WHERE ` + where + ` GROUP BY period_start ORDER BY period_start LIMIT 1001`
	rows := []analyticsByproductTrendRow{}
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&rows).Error
	return rows, err
}
