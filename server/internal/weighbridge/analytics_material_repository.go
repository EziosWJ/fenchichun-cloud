package weighbridge

import (
	"context"
	"fmt"
	"strings"
	"time"
)

type analyticsMaterialSummaryRow struct {
	MaterialCount              int64
	TotalTickets               int64
	InboundNetMilliTonne       int64
	OutboundNetMilliTonne      int64
	AdjustmentNetMilliTonne    int64
	AdjustmentKnownTickets     int64
	AdjustedTickets            int64
	PreAdjustmentNetMilliTonne int64
	LastIssuedAt               *time.Time
}

type analyticsMaterialRow struct {
	MaterialCode               string
	MaterialName               string
	MaterialSpec               string
	CategoryCode               string
	CategoryName               string
	InboundTickets             int64
	InboundNetMilliTonne       int64
	OutboundTickets            int64
	OutboundNetMilliTonne      int64
	TotalTickets               int64
	TotalNetMilliTonne         int64
	AdjustedTickets            int64
	AdjustmentKnownTickets     int64
	AdjustmentNetMilliTonne    int64
	PreAdjustmentNetMilliTonne int64
	LastIssuedAt               *time.Time
}

type analyticsStructureRow struct {
	Key           string
	Label         string
	NetMilliTonne int64
}

type analyticsMaterialTrendRow struct {
	MaterialCode  string
	MaterialName  string
	PeriodStart   time.Time
	NetMilliTonne int64
}

func (r *Repository) AnalyticsMaterialSummary(ctx context.Context, q AnalyticsQuery) (analyticsMaterialSummaryRow, error) {
	where, args := analyticsWhere(q, false, "material")
	query := `SELECT
		COUNT(DISTINCT (t.material_code, t.material_spec)) AS material_count,
		COUNT(*) AS total_tickets,
		COALESCE(SUM(t.final_net_milli_tonne) FILTER (WHERE t.direction = 'inbound'), 0) AS inbound_net_milli_tonne,
		COALESCE(SUM(t.final_net_milli_tonne) FILTER (WHERE t.direction = 'outbound'), 0) AS outbound_net_milli_tonne,
		COALESCE(SUM(t.net_adjustment_milli_tonne) FILTER (WHERE t.adjustment_known), 0) AS adjustment_net_milli_tonne,
		COUNT(*) FILTER (WHERE t.adjustment_known) AS adjustment_known_tickets,
		COUNT(*) FILTER (WHERE t.adjusted) AS adjusted_tickets,
		COALESCE(SUM(t.pre_adjustment_net_milli_tonne) FILTER (WHERE t.adjustment_known), 0) AS pre_adjustment_net_milli_tonne,
		MAX(t.issued_at) AS last_issued_at` + analyticsFrom + ` WHERE ` + where
	var row analyticsMaterialSummaryRow
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&row).Error
	return row, err
}

func (r *Repository) AnalyticsMaterialRows(ctx context.Context, q AnalyticsQuery) ([]analyticsMaterialRow, int64, error) {
	where, args := analyticsWhere(q, false, "material")
	countQuery := `SELECT COUNT(*) FROM (SELECT 1` + analyticsFrom + ` WHERE ` + where + ` GROUP BY t.material_code, t.material_spec) x`
	var total int64
	if err := r.db.WithContext(ctx).Raw(countQuery, args...).Scan(&total).Error; err != nil {
		return nil, 0, err
	}
	sortExpr := analyticsSortExpr(q.SortBy, q.SortOrder, "total_net_milli_tonne")
	query := `SELECT
		t.material_code,
		COALESCE(MAX(t.material_name), '') AS material_name,
		COALESCE(MAX(t.material_spec), '') AS material_spec,
		COALESCE(MAX(c.code), '') AS category_code,
		COALESCE(MAX(c.name), '') AS category_name,
		COUNT(*) FILTER (WHERE t.direction = 'inbound') AS inbound_tickets,
		COALESCE(SUM(t.final_net_milli_tonne) FILTER (WHERE t.direction = 'inbound'), 0) AS inbound_net_milli_tonne,
		COUNT(*) FILTER (WHERE t.direction = 'outbound') AS outbound_tickets,
		COALESCE(SUM(t.final_net_milli_tonne) FILTER (WHERE t.direction = 'outbound'), 0) AS outbound_net_milli_tonne,
		COUNT(*) AS total_tickets,
		COALESCE(SUM(t.final_net_milli_tonne), 0) AS total_net_milli_tonne,
		COUNT(*) FILTER (WHERE t.adjusted) AS adjusted_tickets,
		COUNT(*) FILTER (WHERE t.adjustment_known) AS adjustment_known_tickets,
		COALESCE(SUM(t.net_adjustment_milli_tonne) FILTER (WHERE t.adjustment_known), 0) AS adjustment_net_milli_tonne,
		COALESCE(SUM(t.pre_adjustment_net_milli_tonne) FILTER (WHERE t.adjustment_known), 0) AS pre_adjustment_net_milli_tonne,
		MAX(t.issued_at) AS last_issued_at` + analyticsFrom + ` WHERE ` + where + ` GROUP BY t.material_code, t.material_spec ORDER BY ` + sortExpr + `, t.material_code LIMIT ? OFFSET ?`
	rows := []analyticsMaterialRow{}
	args = append(args, q.PageSize, (q.Page-1)*q.PageSize)
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&rows).Error
	return rows, total, err
}

func (r *Repository) AnalyticsMaterialStructure(ctx context.Context, q AnalyticsQuery) ([]analyticsStructureRow, error) {
	where, args := analyticsWhere(q, false, "material")
	query := `SELECT
		COALESCE(c.code, '') AS key,
		COALESCE(c.name, '未分类') AS label,
		COALESCE(SUM(t.final_net_milli_tonne), 0) AS net_milli_tonne` + analyticsFrom + ` WHERE ` + where + ` GROUP BY c.code, c.name ORDER BY net_milli_tonne DESC`
	rows := []analyticsStructureRow{}
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&rows).Error
	return rows, err
}

func (r *Repository) AnalyticsMaterialTrend(ctx context.Context, q AnalyticsQuery, codes []string) ([]analyticsMaterialTrendRow, error) {
	if len(codes) == 0 {
		return []analyticsMaterialTrendRow{}, nil
	}
	where, args := analyticsWhere(q, false, "material")
	placeholders := make([]string, len(codes))
	for i, code := range codes {
		placeholders[i] = "?"
		args = append(args, code)
	}
	period := analyticsPeriodExpr(q.Granularity)
	query := fmt.Sprintf(`SELECT
		t.material_code,
		COALESCE(MAX(t.material_name), '') AS material_name,
		%s AS period_start,
		COALESCE(SUM(t.final_net_milli_tonne), 0) AS net_milli_tonne
		%s WHERE %s AND t.material_code IN (%s)
		GROUP BY t.material_code, period_start
		ORDER BY period_start, t.material_code`, period, analyticsFrom, where, strings.Join(placeholders, ","))
	rows := []analyticsMaterialTrendRow{}
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&rows).Error
	return rows, err
}
