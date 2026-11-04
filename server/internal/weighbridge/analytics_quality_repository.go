package weighbridge

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

type analyticsQualitySummaryRow struct {
	TotalTickets               int64
	ValidTickets               int64
	VoidTickets                int64
	ReopenedTickets            int64
	AdjustedTickets            int64
	AdjustmentKnownTickets     int64
	AdjustmentNetMilliTonne    int64
	PreAdjustmentNetMilliTonne int64
	ManualWeightTickets        int64
	CorrectionTickets          int64
}

type analyticsReasonRowDB struct {
	Reason  string
	Tickets int64
}

type analyticsQualityGroupRowDB struct {
	Code        string
	Name        string
	Tickets     int64
	VoidTickets int64
}

type analyticsReopenChainRow struct {
	OriginalTicketNo string
	NewTicketNo      string
	SiteCode         string
	OriginalIssuedAt *time.Time
	OriginalVoidedAt *time.Time
	NewIssuedAt      *time.Time
	ReopenLagSeconds *int64
	CrossDay         bool
}

type analyticsAdjustmentCategoryRowDB struct {
	Category                   string
	CategoryName               string
	Tickets                    int64
	AdjustmentNetMilliTonne    int64
	PreAdjustmentNetMilliTonne int64
}

type analyticsAdjustmentModeRowDB struct {
	Mode    string
	Tickets int64
}

type analyticsAdjustmentTrendRow struct {
	PeriodStart                time.Time
	AdjustedTickets            int64
	AdjustmentNetMilliTonne    int64
	PreAdjustmentNetMilliTonne int64
}

type analyticsReopenTrendRow struct {
	PeriodStart     time.Time
	ReopenedTickets int64
}

type analyticsCorrectionSummaryRow struct {
	Tickets                   int64
	GrossCorrectionMilliTonne int64
	TareCorrectionMilliTonne  int64
}

type analyticsCorrectionSiteRowDB struct {
	SiteCode                  string
	SiteName                  string
	Tickets                   int64
	GrossCorrectionMilliTonne int64
	TareCorrectionMilliTonne  int64
}

type analyticsMissingFieldsRow struct {
	TotalTickets              int64
	MissingDriver             int64
	MissingDriverPhone        int64
	MissingContactName        int64
	MissingContactPhone       int64
	MissingAdjustmentCategory int64
	MissingIssuer             int64
	MissingMaterialName       int64
	MissingPartyName          int64
}

type analyticsAnomalyRow struct {
	TicketNo                string
	SiteCode                string
	IssuedAt                time.Time
	Direction               string
	FinalNetMilliTonne      int64
	FinalGrossMilliTonne    *int64
	FinalTareMilliTonne     *int64
	WeighIntervalSeconds    *int64
	IssuedLagSeconds        *int64
	VoidedAt                *time.Time
	VoidReason              *string
	Plate                   string
	Driver                  *string
	DriverPhone             *string
	ContactName             *string
	ContactPhone            *string
	AdjustmentKnown         bool
	Adjusted                bool
	AdjustmentCategory      *string
	NetAdjustmentMilliTonne *int64
	PreviousTicketNo        *string
	MaterialCode            string
	MaterialName            string
	PartyCode               string
	PartyName               string
	Status                  string
	GrossSource             *string
	TareSource              *string
	IssuerName              *string
}

type analyticsIssuerRow struct {
	IssuerName             string
	Tickets                int64
	VoidTickets            int64
	ReopenedTickets        int64
	AdjustedTickets        int64
	KnownAdjustmentTickets int64
}

type analyticsFreshnessRow struct {
	HistoryStart   *time.Time
	DataThrough    *time.Time
	LastReceivedAt *time.Time
}

type analyticsSiteReceiptRow struct {
	SiteCode        string
	SiteName        string
	LastReceivedAt  *time.Time
	ReceivedChanges int64
}

func (r *Repository) AnalyticsQualitySummary(ctx context.Context, q AnalyticsQuery) (analyticsQualitySummaryRow, error) {
	where, args := analyticsWhere(q, true, "all")
	query := `SELECT
		COUNT(*) AS total_tickets,
		COUNT(*) FILTER (WHERE t.status = 'valid') AS valid_tickets,
		COUNT(*) FILTER (WHERE t.status = 'void') AS void_tickets,
		COUNT(*) FILTER (WHERE t.status = 'valid' AND t.previous_ticket_no IS NOT NULL) AS reopened_tickets,
		COUNT(*) FILTER (WHERE t.status = 'valid' AND t.adjusted) AS adjusted_tickets,
		COUNT(*) FILTER (WHERE t.status = 'valid' AND t.adjustment_known) AS adjustment_known_tickets,
		COALESCE(SUM(t.net_adjustment_milli_tonne) FILTER (WHERE t.status = 'valid' AND t.adjustment_known), 0) AS adjustment_net_milli_tonne,
		COALESCE(SUM(t.pre_adjustment_net_milli_tonne) FILTER (WHERE t.status = 'valid' AND t.adjustment_known), 0) AS pre_adjustment_net_milli_tonne,
		COUNT(*) FILTER (WHERE t.status = 'valid' AND (t.gross_source = 'manual' OR t.tare_source = 'manual')) AS manual_weight_tickets,
		COUNT(*) FILTER (WHERE t.status = 'valid' AND (
			t.original_gross_milli_tonne IS DISTINCT FROM t.final_gross_milli_tonne
			OR t.original_tare_milli_tonne IS DISTINCT FROM t.final_tare_milli_tonne
		)) AS correction_tickets` + analyticsFrom + ` WHERE ` + where
	var row analyticsQualitySummaryRow
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&row).Error
	return row, err
}

func (r *Repository) AnalyticsQualityVoidReasons(ctx context.Context, q AnalyticsQuery) ([]analyticsReasonRowDB, error) {
	where, args := analyticsWhere(q, true, "all")
	query := `SELECT COALESCE(NULLIF(t.void_reason, ''), '未填写') AS reason, COUNT(*) AS tickets` + analyticsFrom + ` WHERE ` + where + ` AND t.status = 'void' GROUP BY 1 ORDER BY tickets DESC`
	rows := []analyticsReasonRowDB{}
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&rows).Error
	return rows, err
}

func (r *Repository) AnalyticsQualityGroups(ctx context.Context, q AnalyticsQuery, dimension string) ([]analyticsQualityGroupRowDB, error) {
	where, args := analyticsWhere(q, true, "all")
	var codeExpr, nameExpr, groupExpr string
	switch dimension {
	case "site":
		codeExpr, nameExpr, groupExpr = "t.site_code", "COALESCE(s.name, '')", "t.site_code, s.name"
	case "party":
		codeExpr, nameExpr, groupExpr = "t.party_code", "COALESCE(MAX(t.party_name), '')", "t.party_code"
	case "material":
		codeExpr, nameExpr, groupExpr = "t.material_code", "COALESCE(MAX(t.material_name), '')", "t.material_code"
	default:
		return nil, fmt.Errorf("unsupported quality dimension %q", dimension)
	}
	query := fmt.Sprintf(`SELECT %s AS code, %s AS name, COUNT(*) AS tickets, COUNT(*) FILTER (WHERE t.status = 'void') AS void_tickets
		%s WHERE %s GROUP BY %s ORDER BY tickets DESC`, codeExpr, nameExpr, analyticsFrom, where, groupExpr)
	rows := []analyticsQualityGroupRowDB{}
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&rows).Error
	return rows, err
}

func (r *Repository) AnalyticsQualityReopenChains(ctx context.Context, q AnalyticsQuery) ([]analyticsReopenChainRow, error) {
	where, args := analyticsWhere(q, false, "all")
	query := `SELECT
		o.ticket_no AS original_ticket_no,
		t.ticket_no AS new_ticket_no,
		t.site_code,
		o.issued_at AS original_issued_at,
		o.voided_at AS original_voided_at,
		t.issued_at AS new_issued_at,
		EXTRACT(EPOCH FROM (t.issued_at - o.voided_at))::bigint AS reopen_lag_seconds,
		COALESCE((o.voided_at AT TIME ZONE 'Asia/Shanghai')::date <> (t.issued_at AT TIME ZONE 'Asia/Shanghai')::date, FALSE) AS cross_day` + analyticsFrom + `
		JOIN wb_cloud_ticket o ON o.issued_site_code = t.previous_site_code AND o.ticket_no = t.previous_ticket_no
		WHERE ` + where + ` AND t.previous_ticket_no IS NOT NULL ORDER BY t.issued_at DESC, t.id DESC LIMIT 200`
	rows := []analyticsReopenChainRow{}
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&rows).Error
	return rows, err
}

func (r *Repository) AnalyticsQualityReopenLagMedian(ctx context.Context, q AnalyticsQuery) (*float64, error) {
	where, args := analyticsWhere(q, false, "all")
	query := `SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (t.issued_at - o.voided_at))) AS median` + analyticsFrom + `
		JOIN wb_cloud_ticket o ON o.issued_site_code = t.previous_site_code AND o.ticket_no = t.previous_ticket_no
		WHERE ` + where + ` AND t.previous_ticket_no IS NOT NULL AND o.voided_at IS NOT NULL`
	var median sql.NullFloat64
	if err := r.db.WithContext(ctx).Raw(query, args...).Scan(&median).Error; err != nil {
		return nil, err
	}
	if !median.Valid {
		return nil, nil
	}
	return &median.Float64, nil
}

func (r *Repository) AnalyticsQualityReopenTrend(ctx context.Context, q AnalyticsQuery) ([]analyticsReopenTrendRow, error) {
	where, args := analyticsWhere(q, false, "all")
	period := analyticsPeriodExpr(q.Granularity)
	query := fmt.Sprintf(`SELECT
		%s AS period_start,
		COUNT(*) FILTER (WHERE t.previous_ticket_no IS NOT NULL) AS reopened_tickets
		%s WHERE %s GROUP BY period_start ORDER BY period_start LIMIT 1001`, period, analyticsFrom, where)
	var rows []analyticsReopenTrendRow
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&rows).Error
	return rows, err
}

func (r *Repository) AnalyticsQualityAdjustmentCategories(ctx context.Context, q AnalyticsQuery) ([]analyticsAdjustmentCategoryRowDB, error) {
	where, args := analyticsWhere(q, false, "all")
	query := `SELECT
		COALESCE(t.adjustment_category, '') AS category,
		COALESCE(MAX(t.adjustment_category_name), '') AS category_name,
		COUNT(*) FILTER (WHERE t.adjusted) AS tickets,
		COALESCE(SUM(t.net_adjustment_milli_tonne), 0) AS adjustment_net_milli_tonne,
		COALESCE(SUM(t.pre_adjustment_net_milli_tonne), 0) AS pre_adjustment_net_milli_tonne` + analyticsFrom + ` WHERE ` + where + ` AND t.adjustment_known AND t.adjusted GROUP BY t.adjustment_category ORDER BY adjustment_net_milli_tonne DESC`
	rows := []analyticsAdjustmentCategoryRowDB{}
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&rows).Error
	return rows, err
}

func (r *Repository) AnalyticsQualityAdjustmentModes(ctx context.Context, q AnalyticsQuery) ([]analyticsAdjustmentModeRowDB, error) {
	where, args := analyticsWhere(q, false, "all")
	query := `SELECT COALESCE(NULLIF(t.adjustment_mode, ''), 'unknown') AS mode, COUNT(*) AS tickets` + analyticsFrom + ` WHERE ` + where + ` AND t.adjustment_known AND t.adjusted GROUP BY 1 ORDER BY tickets DESC`
	rows := []analyticsAdjustmentModeRowDB{}
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&rows).Error
	return rows, err
}

func (r *Repository) AnalyticsQualityAdjustmentTrend(ctx context.Context, q AnalyticsQuery) ([]analyticsAdjustmentTrendRow, error) {
	where, args := analyticsWhere(q, false, "all")
	period := analyticsPeriodExpr(q.Granularity)
	query := fmt.Sprintf(`SELECT
		%s AS period_start,
		COUNT(*) FILTER (WHERE t.adjusted) AS adjusted_tickets,
		COALESCE(SUM(t.net_adjustment_milli_tonne), 0) AS adjustment_net_milli_tonne,
		COALESCE(SUM(t.pre_adjustment_net_milli_tonne), 0) AS pre_adjustment_net_milli_tonne
		%s WHERE %s AND t.adjustment_known GROUP BY period_start ORDER BY period_start LIMIT 1001`, period, analyticsFrom, where)
	var rows []analyticsAdjustmentTrendRow
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&rows).Error
	return rows, err
}

func (r *Repository) AnalyticsQualityCorrections(ctx context.Context, q AnalyticsQuery) (analyticsCorrectionSummaryRow, []analyticsCorrectionSiteRowDB, error) {
	where, args := analyticsWhere(q, false, "all")
	correction := ` AND (t.original_gross_milli_tonne IS DISTINCT FROM t.final_gross_milli_tonne OR t.original_tare_milli_tonne IS DISTINCT FROM t.final_tare_milli_tonne)`
	summaryQuery := `SELECT
		COUNT(*) AS tickets,
		COALESCE(SUM(COALESCE(t.original_gross_milli_tonne, 0) - COALESCE(t.final_gross_milli_tonne, 0)), 0) AS gross_correction_milli_tonne,
		COALESCE(SUM(COALESCE(t.original_tare_milli_tonne, 0) - COALESCE(t.final_tare_milli_tonne, 0)), 0) AS tare_correction_milli_tonne` + analyticsFrom + ` WHERE ` + where + correction
	var summary analyticsCorrectionSummaryRow
	if err := r.db.WithContext(ctx).Raw(summaryQuery, args...).Scan(&summary).Error; err != nil {
		return summary, nil, err
	}
	siteQuery := `SELECT
		t.site_code,
		COALESCE(s.name, '') AS site_name,
		COUNT(*) AS tickets,
		COALESCE(SUM(COALESCE(t.original_gross_milli_tonne, 0) - COALESCE(t.final_gross_milli_tonne, 0)), 0) AS gross_correction_milli_tonne,
		COALESCE(SUM(COALESCE(t.original_tare_milli_tonne, 0) - COALESCE(t.final_tare_milli_tonne, 0)), 0) AS tare_correction_milli_tonne` + analyticsFrom + ` WHERE ` + where + correction + ` GROUP BY t.site_code, s.name ORDER BY tickets DESC`
	rows := []analyticsCorrectionSiteRowDB{}
	err := r.db.WithContext(ctx).Raw(siteQuery, args...).Scan(&rows).Error
	return summary, rows, err
}

func (r *Repository) AnalyticsQualityMissingFields(ctx context.Context, q AnalyticsQuery) (analyticsMissingFieldsRow, error) {
	where, args := analyticsWhere(q, true, "all")
	query := `SELECT
		COUNT(*) AS total_tickets,
		COUNT(*) FILTER (WHERE t.driver IS NULL OR t.driver = '') AS missing_driver,
		COUNT(*) FILTER (WHERE t.driver_phone IS NULL OR t.driver_phone = '') AS missing_driver_phone,
		COUNT(*) FILTER (WHERE t.contact_name IS NULL OR t.contact_name = '') AS missing_contact_name,
		COUNT(*) FILTER (WHERE t.contact_phone IS NULL OR t.contact_phone = '') AS missing_contact_phone,
		COUNT(*) FILTER (WHERE t.adjusted AND (t.adjustment_category IS NULL OR t.adjustment_category = '')) AS missing_adjustment_category,
		COUNT(*) FILTER (WHERE t.issuer_name IS NULL OR t.issuer_name = '') AS missing_issuer,
		COUNT(*) FILTER (WHERE t.material_name IS NULL OR t.material_name = '') AS missing_material_name,
		COUNT(*) FILTER (WHERE t.party_name IS NULL OR t.party_name = '') AS missing_party_name` + analyticsFrom + ` WHERE ` + where
	var row analyticsMissingFieldsRow
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&row).Error
	return row, err
}

func (r *Repository) AnalyticsQualityAnomalies(ctx context.Context, q AnalyticsQuery, limit int) ([]analyticsAnomalyRow, error) {
	where, args := analyticsWhere(q, true, "all")
	query := `SELECT
		t.ticket_no,
		t.site_code,
		t.issued_at,
		t.direction,
		t.final_net_milli_tonne,
		t.final_gross_milli_tonne,
		t.final_tare_milli_tonne,
		t.weigh_interval_seconds,
		t.issued_lag_seconds,
		t.voided_at,
		t.void_reason,
		t.plate,
		t.driver,
		t.driver_phone,
		t.contact_name,
		t.contact_phone,
		t.adjustment_known,
		t.adjusted,
		t.adjustment_category,
		t.net_adjustment_milli_tonne,
		t.previous_ticket_no,
		t.material_code,
		t.material_name,
		t.party_code,
		t.party_name,
		t.status,
		t.gross_source,
		t.tare_source,
		t.issuer_name` + analyticsFrom + ` WHERE ` + where + ` ORDER BY t.issued_at DESC, t.id DESC LIMIT ?`
	args = append(args, limit)
	rows := []analyticsAnomalyRow{}
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&rows).Error
	return rows, err
}

func (r *Repository) AnalyticsQualityIssuerStats(ctx context.Context, q AnalyticsQuery) ([]analyticsIssuerRow, error) {
	where, args := analyticsWhere(q, true, "all")
	query := `SELECT
		COALESCE(NULLIF(t.issuer_name, ''), '未填写') AS issuer_name,
		COUNT(*) FILTER (WHERE t.status = 'valid') AS tickets,
		COUNT(*) FILTER (WHERE t.status = 'void') AS void_tickets,
		COUNT(*) FILTER (WHERE t.status = 'valid' AND t.previous_ticket_no IS NOT NULL) AS reopened_tickets,
		COUNT(*) FILTER (WHERE t.status = 'valid' AND t.adjusted) AS adjusted_tickets,
		COUNT(*) FILTER (WHERE t.status = 'valid' AND t.adjustment_known) AS known_adjustment_tickets` + analyticsFrom + ` WHERE ` + where + ` GROUP BY 1 ORDER BY tickets DESC`
	rows := []analyticsIssuerRow{}
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&rows).Error
	return rows, err
}

func (r *Repository) AnalyticsFreshness(ctx context.Context) (AnalyticsFreshness, error) {
	var row analyticsFreshnessRow
	query := `SELECT MIN(issued_at) AS history_start, MAX(issued_at) AS data_through, MAX(latest_received_at) AS last_received_at FROM wb_cloud_ticket`
	if err := r.db.WithContext(ctx).Raw(query).Scan(&row).Error; err != nil {
		return AnalyticsFreshness{}, err
	}
	receiptQuery := `SELECT
		s.code AS site_code,
		s.name AS site_name,
		COUNT(sc.id) AS received_changes,
		MAX(sc.received_at) AS last_received_at
		FROM wb_cloud_site s
		LEFT JOIN wb_cloud_ticket_change sc ON sc.issued_site_code = s.code
		GROUP BY s.code, s.name
		ORDER BY s.code`
	receipts := []analyticsSiteReceiptRow{}
	if err := r.db.WithContext(ctx).Raw(receiptQuery).Scan(&receipts).Error; err != nil {
		return AnalyticsFreshness{}, err
	}
	result := AnalyticsFreshness{
		DataThrough:    row.DataThrough,
		LastReceivedAt: row.LastReceivedAt,
		HistoryStart:   row.HistoryStart,
		SiteReceipts:   make([]AnalyticsSiteReceipt, 0, len(receipts)),
	}
	for _, item := range receipts {
		result.SiteReceipts = append(result.SiteReceipts, AnalyticsSiteReceipt{
			SiteCode: item.SiteCode, SiteName: item.SiteName,
			LastReceivedAt: item.LastReceivedAt, ReceivedChanges: item.ReceivedChanges,
		})
	}
	return result, nil
}
