package weighbridge

import (
	"context"
	"fmt"
	"time"
)

// AnalyticsStore is the read-only query surface used by the analytics service.
type AnalyticsStore interface {
	AnalyticsSummary(context.Context, AnalyticsQuery) (analyticsSummaryRow, error)
	AnalyticsTrend(context.Context, AnalyticsQuery) ([]analyticsTrendRow, error)
	AnalyticsSiteComparison(context.Context, AnalyticsQuery) ([]analyticsSiteRow, error)
	AnalyticsDuration(context.Context, AnalyticsQuery) (analyticsDurationRow, error)
	AnalyticsReopenedCount(context.Context, AnalyticsQuery) (int64, error)

	AnalyticsMaterialSummary(context.Context, AnalyticsQuery) (analyticsMaterialSummaryRow, error)
	AnalyticsMaterialRows(context.Context, AnalyticsQuery) ([]analyticsMaterialRow, int64, error)
	AnalyticsMaterialStructure(context.Context, AnalyticsQuery) ([]analyticsStructureRow, error)
	AnalyticsMaterialTrend(context.Context, AnalyticsQuery, []string) ([]analyticsMaterialTrendRow, error)

	AnalyticsPartyTotals(context.Context, AnalyticsQuery) (analyticsPartyTotalsRow, error)
	AnalyticsPartyRows(context.Context, AnalyticsQuery) ([]analyticsPartyRow, int64, error)
	AnalyticsPartyConcentration(context.Context, AnalyticsQuery) ([]analyticsPartyConcentrationRow, error)
	AnalyticsPartyNewCount(context.Context, AnalyticsQuery) (int64, error)
	AnalyticsPartyCohort(context.Context, AnalyticsQuery, time.Time, time.Time) (int64, int64, error)
	AnalyticsPartySites(context.Context, AnalyticsQuery) ([]analyticsPartySiteRowDB, error)
	AnalyticsPartyRecentTickets(context.Context, AnalyticsQuery, int) ([]analyticsRecentTicketRow, error)

	AnalyticsQualitySummary(context.Context, AnalyticsQuery) (analyticsQualitySummaryRow, error)
	AnalyticsQualityVoidReasons(context.Context, AnalyticsQuery) ([]analyticsReasonRowDB, error)
	AnalyticsQualityGroups(context.Context, AnalyticsQuery, string) ([]analyticsQualityGroupRowDB, error)
	AnalyticsQualityReopenChains(context.Context, AnalyticsQuery) ([]analyticsReopenChainRow, error)
	AnalyticsQualityReopenLagMedian(context.Context, AnalyticsQuery) (*float64, error)
	AnalyticsQualityReopenTrend(context.Context, AnalyticsQuery) ([]analyticsReopenTrendRow, error)
	AnalyticsQualityAdjustmentCategories(context.Context, AnalyticsQuery) ([]analyticsAdjustmentCategoryRowDB, error)
	AnalyticsQualityAdjustmentModes(context.Context, AnalyticsQuery) ([]analyticsAdjustmentModeRowDB, error)
	AnalyticsQualityAdjustmentTrend(context.Context, AnalyticsQuery) ([]analyticsAdjustmentTrendRow, error)
	AnalyticsQualityCorrections(context.Context, AnalyticsQuery) (analyticsCorrectionSummaryRow, []analyticsCorrectionSiteRowDB, error)
	AnalyticsQualityMissingFields(context.Context, AnalyticsQuery) (analyticsMissingFieldsRow, error)
	AnalyticsQualityAnomalies(context.Context, AnalyticsQuery, int) ([]analyticsAnomalyRow, error)
	AnalyticsQualityIssuerStats(context.Context, AnalyticsQuery) ([]analyticsIssuerRow, error)

	AnalyticsFreshness(context.Context) (AnalyticsFreshness, error)
}

func (s *Service) AnalyticsOverview(ctx context.Context, q AnalyticsQuery) (AnalyticsOverviewData, error) {
	current, err := s.store.AnalyticsSummary(ctx, q)
	if err != nil {
		return AnalyticsOverviewData{}, err
	}
	previous, previousErr := s.comparisonSummary(ctx, q, "previous")
	year, yearErr := s.comparisonSummary(ctx, q, "year")
	if previousErr != nil {
		return AnalyticsOverviewData{}, previousErr
	}
	if yearErr != nil {
		return AnalyticsOverviewData{}, yearErr
	}
	trendRows, err := s.store.AnalyticsTrend(ctx, q)
	if err != nil {
		return AnalyticsOverviewData{}, err
	}
	structure, err := s.store.AnalyticsMaterialStructure(ctx, q)
	if err != nil {
		return AnalyticsOverviewData{}, err
	}
	topMaterials, _, err := s.store.AnalyticsMaterialRows(ctx, withPage(q, 1, q.TopN, "net"))
	if err != nil {
		return AnalyticsOverviewData{}, err
	}
	inboundTop, _, err := s.store.AnalyticsPartyRows(ctx, withDirection(q, "inbound", 1, q.TopN))
	if err != nil {
		return AnalyticsOverviewData{}, err
	}
	outboundTop, _, err := s.store.AnalyticsPartyRows(ctx, withDirection(q, "outbound", 1, q.TopN))
	if err != nil {
		return AnalyticsOverviewData{}, err
	}
	freshness, err := s.store.AnalyticsFreshness(ctx)
	if err != nil {
		return AnalyticsOverviewData{}, err
	}
	summary := overviewSummaryFromRow(current)
	totalNet := summary.InboundNetMilliTonne + summary.OutboundNetMilliTonne
	result := AnalyticsOverviewData{
		Summary:           summary,
		Comparison:        buildComparison(current, previous, year),
		Trend:             buildTrend(trendRows, q.Granularity),
		MaterialStructure: buildStructure(structure, totalNet),
		TopMaterials:      buildTopMaterials(topMaterials, totalNet),
		TopParties:        append(buildTopParties(inboundTop, "inbound", totalNet), buildTopParties(outboundTop, "outbound", totalNet)...),
		Alerts:            overviewAlerts(summary, freshness),
		Freshness:         freshness,
	}
	return result, nil
}

func (s *Service) AnalyticsFlow(ctx context.Context, q AnalyticsQuery) (AnalyticsFlowData, error) {
	current, err := s.store.AnalyticsSummary(ctx, q)
	if err != nil {
		return AnalyticsFlowData{}, err
	}
	previous, err := s.comparisonSummary(ctx, q, "previous")
	if err != nil {
		return AnalyticsFlowData{}, err
	}
	year, err := s.comparisonSummary(ctx, q, "year")
	if err != nil {
		return AnalyticsFlowData{}, err
	}
	trendRows, err := s.store.AnalyticsTrend(ctx, q)
	if err != nil {
		return AnalyticsFlowData{}, err
	}
	sites, err := s.store.AnalyticsSiteComparison(ctx, q)
	if err != nil {
		return AnalyticsFlowData{}, err
	}
	duration, err := s.store.AnalyticsDuration(ctx, q)
	if err != nil {
		return AnalyticsFlowData{}, err
	}
	reopened, err := s.store.AnalyticsReopenedCount(ctx, q)
	if err != nil {
		return AnalyticsFlowData{}, err
	}
	freshness, err := s.store.AnalyticsFreshness(ctx)
	if err != nil {
		return AnalyticsFlowData{}, err
	}
	summary := overviewSummaryFromRow(current)
	flowSummary := AnalyticsFlowSummary{AnalyticsOverviewSummary: summary}
	flowSummary.InboundAvgNetMilliTonne = average(current.InboundNetMilliTonne, current.InboundTickets)
	flowSummary.OutboundAvgNetMilliTonne = average(current.OutboundNetMilliTonne, current.OutboundTickets)
	siteRows := make([]AnalyticsFlowSiteRow, 0, len(sites))
	for _, row := range sites {
		valid := row.ValidTickets
		void := row.VoidTickets
		siteRows = append(siteRows, AnalyticsFlowSiteRow{
			SiteCode: row.SiteCode, SiteName: row.SiteName,
			InboundTickets: row.InboundTickets, InboundNetMilliTonne: row.InboundNetMilliTonne,
			OutboundTickets: row.OutboundTickets, OutboundNetMilliTonne: row.OutboundNetMilliTonne,
			NetFlowMilliTonne:         row.InboundNetMilliTonne - row.OutboundNetMilliTonne,
			AvgNetPerTicketMilliTonne: average(row.InboundNetMilliTonne+row.OutboundNetMilliTonne, valid),
			VoidTickets:               void, VoidRateBp: rateBp(void, valid+void),
			AdjustedTickets:        row.AdjustedTickets,
			AdjustmentWeightRateBp: rateBp(row.AdjustmentNetMilliTonne, row.PreAdjustmentNetMilliTonne),
			AdjustmentCoverageBp:   rateBp(row.AdjustmentKnownTickets, valid),
		})
	}
	sample := duration.SampleTickets
	crossDayRate := rateBp(duration.CrossDayTickets, sample)
	return AnalyticsFlowData{
		Summary:        flowSummary,
		Comparison:     buildComparison(current, previous, year),
		Trend:          buildTrend(trendRows, q.Granularity),
		SiteComparison: siteRows,
		Duration: AnalyticsDuration{
			SampleTickets: sample, MedianSeconds: duration.MedianSeconds, P90Seconds: duration.P90Seconds,
			MaxSeconds: duration.MaxSeconds, CrossDayTickets: duration.CrossDayTickets,
			CrossDayRateBp: crossDayRate, ReopenedExcludedTickets: reopened,
		},
		Freshness: freshness,
	}, nil
}

func (s *Service) AnalyticsMaterials(ctx context.Context, q AnalyticsQuery) (AnalyticsMaterialsData, error) {
	summaryRow, err := s.store.AnalyticsMaterialSummary(ctx, q)
	if err != nil {
		return AnalyticsMaterialsData{}, err
	}
	rows, total, err := s.store.AnalyticsMaterialRows(ctx, q)
	if err != nil {
		return AnalyticsMaterialsData{}, err
	}
	topRows, _, err := s.store.AnalyticsMaterialRows(ctx, withPage(q, 1, q.TopN, "net"))
	if err != nil {
		return AnalyticsMaterialsData{}, err
	}
	topAdjustments, _, err := s.store.AnalyticsMaterialRows(ctx, withPage(q, 1, q.TopN, "adjustment"))
	if err != nil {
		return AnalyticsMaterialsData{}, err
	}
	structure, err := s.store.AnalyticsMaterialStructure(ctx, q)
	if err != nil {
		return AnalyticsMaterialsData{}, err
	}
	codes := make([]string, 0, len(topRows))
	seen := map[string]struct{}{}
	for _, row := range topRows {
		if _, ok := seen[row.MaterialCode]; ok {
			continue
		}
		seen[row.MaterialCode] = struct{}{}
		codes = append(codes, row.MaterialCode)
	}
	trendRows, err := s.store.AnalyticsMaterialTrend(ctx, q, codes)
	if err != nil {
		return AnalyticsMaterialsData{}, err
	}
	freshness, err := s.store.AnalyticsFreshness(ctx)
	if err != nil {
		return AnalyticsMaterialsData{}, err
	}
	totalNet := summaryRow.InboundNetMilliTonne + summaryRow.OutboundNetMilliTonne
	result := AnalyticsMaterialsData{
		Summary: AnalyticsMaterialSummary{
			MaterialCount:           summaryRow.MaterialCount,
			InboundNetMilliTonne:    summaryRow.InboundNetMilliTonne,
			OutboundNetMilliTonne:   summaryRow.OutboundNetMilliTonne,
			AdjustmentNetMilliTonne: summaryRow.AdjustmentNetMilliTonne,
			AdjustmentWeightRateBp:  rateBp(summaryRow.AdjustmentNetMilliTonne, summaryRow.PreAdjustmentNetMilliTonne),
			AdjustmentCoverageBp:    rateBp(summaryRow.AdjustmentKnownTickets, summaryRow.TotalTickets),
			LastIssuedAt:            summaryRow.LastIssuedAt,
		},
		Records: make([]AnalyticsMaterialRow, 0, len(rows)),
		Total:   total, Page: q.Page, PageSize: q.PageSize,
		Trend:          buildMaterialTrend(trendRows, q.Granularity),
		Structure:      buildStructure(structure, totalNet),
		TopAdjustments: make([]AnalyticsMaterialRow, 0, len(topAdjustments)),
		Freshness:      freshness,
	}
	for _, row := range rows {
		result.Records = append(result.Records, materialRowFromDB(row, totalNet))
	}
	for _, row := range topAdjustments {
		result.TopAdjustments = append(result.TopAdjustments, materialRowFromDB(row, totalNet))
	}
	return result, nil
}

func (s *Service) AnalyticsParties(ctx context.Context, q AnalyticsQuery) (AnalyticsPartiesData, error) {
	if q.Direction != "inbound" && q.Direction != "outbound" {
		return AnalyticsPartiesData{}, ErrInvalid
	}
	totals, err := s.store.AnalyticsPartyTotals(ctx, q)
	if err != nil {
		return AnalyticsPartiesData{}, err
	}
	rows, total, err := s.store.AnalyticsPartyRows(ctx, q)
	if err != nil {
		return AnalyticsPartiesData{}, err
	}
	topRows, _, err := s.store.AnalyticsPartyRows(ctx, withPage(q, 1, q.TopN, "net"))
	if err != nil {
		return AnalyticsPartiesData{}, err
	}
	concentrationRows, err := s.store.AnalyticsPartyConcentration(ctx, q)
	if err != nil {
		return AnalyticsPartiesData{}, err
	}
	freshness, err := s.store.AnalyticsFreshness(ctx)
	if err != nil {
		return AnalyticsPartiesData{}, err
	}
	newParties, err := s.store.AnalyticsPartyNewCount(ctx, q)
	if err != nil {
		return AnalyticsPartiesData{}, err
	}
	previousFrom, previousUntil := previousRange(q.From, q.Until)
	returning, dormant, err := s.store.AnalyticsPartyCohort(ctx, q, previousFrom, previousUntil)
	if err != nil {
		return AnalyticsPartiesData{}, err
	}
	totalNet := totals.TotalNetMilliTonne
	summary := AnalyticsPartySummary{
		ActiveParties: totals.ActiveParties, TotalNetMilliTonne: totalNet,
		AvgNetPerPartyMilliTonne: average(totalNet, totals.ActiveParties),
		NewParties:               newParties, ReturningParties: returning, DormantParties: dormant,
		HistoryStart:     freshness.HistoryStart,
		CoverageComplete: freshness.HistoryStart != nil && freshness.HistoryStart.Before(q.From),
	}
	summary.CR3Bp, summary.CR5Bp, summary.CR10Bp, summary.HHI = concentrationMetrics(concentrationRows, totalNet)
	result := AnalyticsPartiesData{
		Summary: summary, Total: total, Page: q.Page, PageSize: q.PageSize,
		Records:       make([]AnalyticsPartyRow, 0, len(rows)),
		Top:           make([]AnalyticsPartyRow, 0, len(topRows)),
		Concentration: buildPartyConcentration(concentrationRows, totalNet, 20),
		Freshness:     freshness,
	}
	for _, row := range rows {
		result.Records = append(result.Records, partyRowFromDB(row, q.Direction, totalNet))
	}
	for _, row := range topRows {
		result.Top = append(result.Top, partyRowFromDB(row, q.Direction, totalNet))
	}
	return result, nil
}

func (s *Service) AnalyticsPartyDetail(ctx context.Context, q AnalyticsQuery) (AnalyticsPartyDetail, error) {
	if q.Direction != "inbound" && q.Direction != "outbound" || q.PartyCode == "" {
		return AnalyticsPartyDetail{}, ErrInvalid
	}
	rowQ := withPage(q, 1, 1, "net")
	rows, _, err := s.store.AnalyticsPartyRows(ctx, rowQ)
	if err != nil {
		return AnalyticsPartyDetail{}, err
	}
	if len(rows) == 0 {
		return AnalyticsPartyDetail{}, ErrInvalid
	}
	party := partyRowFromDB(rows[0], q.Direction, 0)
	trendRows, err := s.store.AnalyticsTrend(ctx, q)
	if err != nil {
		return AnalyticsPartyDetail{}, err
	}
	materialQ := withPage(q, 1, 10, "net")
	materialSummary, err := s.store.AnalyticsMaterialSummary(ctx, materialQ)
	if err != nil {
		return AnalyticsPartyDetail{}, err
	}
	materialRows, _, err := s.store.AnalyticsMaterialRows(ctx, materialQ)
	if err != nil {
		return AnalyticsPartyDetail{}, err
	}
	siteRows, err := s.store.AnalyticsPartySites(ctx, q)
	if err != nil {
		return AnalyticsPartyDetail{}, err
	}
	recentRows, err := s.store.AnalyticsPartyRecentTickets(ctx, q, 5)
	if err != nil {
		return AnalyticsPartyDetail{}, err
	}
	materialTotal := materialSummary.InboundNetMilliTonne + materialSummary.OutboundNetMilliTonne
	result := AnalyticsPartyDetail{
		Party: party, Trend: buildTrend(trendRows, q.Granularity),
		Materials:     make([]AnalyticsMaterialRow, 0, len(materialRows)),
		Sites:         make([]AnalyticsPartySiteRow, 0, len(siteRows)),
		RecentTickets: make([]AnalyticsRecentTicket, 0, len(recentRows)),
	}
	for _, item := range materialRows {
		result.Materials = append(result.Materials, materialRowFromDB(item, materialTotal))
	}
	for _, item := range siteRows {
		result.Sites = append(result.Sites, AnalyticsPartySiteRow{
			SiteCode: item.SiteCode, SiteName: item.SiteName, Tickets: item.Tickets,
			NetMilliTonne: item.NetMilliTonne, ShareBp: rateBp(item.NetMilliTonne, party.NetMilliTonne),
		})
	}
	for _, item := range recentRows {
		result.RecentTickets = append(result.RecentTickets, AnalyticsRecentTicket{
			SiteCode: item.SiteCode, TicketNo: item.TicketNo, IssuedAt: item.IssuedAt,
			Plate: item.Plate, MaterialName: item.MaterialName, NetMilliTonne: item.NetMilliTonne,
			AdjustmentMilliTonne: item.AdjustmentMilliTonne,
		})
	}
	return result, nil
}

func (s *Service) AnalyticsQuality(ctx context.Context, q AnalyticsQuery) (AnalyticsQualityData, error) {
	summaryRow, err := s.store.AnalyticsQualitySummary(ctx, q)
	if err != nil {
		return AnalyticsQualityData{}, err
	}
	voidTrendRows, err := s.store.AnalyticsTrend(ctx, q)
	if err != nil {
		return AnalyticsQualityData{}, err
	}
	voidReasons, err := s.store.AnalyticsQualityVoidReasons(ctx, q)
	if err != nil {
		return AnalyticsQualityData{}, err
	}
	voidBySite, err := s.store.AnalyticsQualityGroups(ctx, q, "site")
	if err != nil {
		return AnalyticsQualityData{}, err
	}
	voidByParty, err := s.store.AnalyticsQualityGroups(ctx, q, "party")
	if err != nil {
		return AnalyticsQualityData{}, err
	}
	voidByMaterial, err := s.store.AnalyticsQualityGroups(ctx, q, "material")
	if err != nil {
		return AnalyticsQualityData{}, err
	}
	reopenChains, err := s.store.AnalyticsQualityReopenChains(ctx, q)
	if err != nil {
		return AnalyticsQualityData{}, err
	}
	reopenMedian, err := s.store.AnalyticsQualityReopenLagMedian(ctx, q)
	if err != nil {
		return AnalyticsQualityData{}, err
	}
	reopenTrendRows, err := s.store.AnalyticsQualityReopenTrend(ctx, q)
	if err != nil {
		return AnalyticsQualityData{}, err
	}
	adjustmentCategories, err := s.store.AnalyticsQualityAdjustmentCategories(ctx, q)
	if err != nil {
		return AnalyticsQualityData{}, err
	}
	adjustmentModes, err := s.store.AnalyticsQualityAdjustmentModes(ctx, q)
	if err != nil {
		return AnalyticsQualityData{}, err
	}
	adjustmentTrendRows, err := s.store.AnalyticsQualityAdjustmentTrend(ctx, q)
	if err != nil {
		return AnalyticsQualityData{}, err
	}
	correctionSummary, correctionSites, err := s.store.AnalyticsQualityCorrections(ctx, q)
	if err != nil {
		return AnalyticsQualityData{}, err
	}
	missing, err := s.store.AnalyticsQualityMissingFields(ctx, q)
	if err != nil {
		return AnalyticsQualityData{}, err
	}
	anomalyRows, err := s.store.AnalyticsQualityAnomalies(ctx, q, 1000)
	if err != nil {
		return AnalyticsQualityData{}, err
	}
	anomalies := detectAnomalies(anomalyRows)
	issuerRows, err := s.store.AnalyticsQualityIssuerStats(ctx, q)
	if err != nil {
		return AnalyticsQualityData{}, err
	}
	freshness, err := s.store.AnalyticsFreshness(ctx)
	if err != nil {
		return AnalyticsQualityData{}, err
	}
	adjustmentMaterialQ := withPage(q, 1, q.TopN, "adjustment")
	adjustmentMaterialSummary, err := s.store.AnalyticsMaterialSummary(ctx, adjustmentMaterialQ)
	if err != nil {
		return AnalyticsQualityData{}, err
	}
	adjustmentMaterialRows, _, err := s.store.AnalyticsMaterialRows(ctx, adjustmentMaterialQ)
	if err != nil {
		return AnalyticsQualityData{}, err
	}
	adjustmentPartyRows, err := s.adjustmentPartyRows(ctx, q)
	if err != nil {
		return AnalyticsQualityData{}, err
	}
	summary := qualitySummaryFromRow(summaryRow)
	summary.AnomalyTickets = uniqueTicketCount(anomalies)
	result := AnalyticsQualityData{
		Summary: summary,
		VoidAnalysis: AnalyticsQualityVoid{
			Trend: buildTrend(voidTrendRows, q.Granularity), Reasons: buildVoidReasons(voidReasons, summary.VoidTickets),
			BySite: buildQualityGroups(voidBySite), ByParty: buildQualityGroups(voidByParty), ByMaterial: buildQualityGroups(voidByMaterial),
		},
		ReopenAnalysis: AnalyticsQualityReopen{
			Trend:                  buildReopenTrend(reopenTrendRows, q.Granularity),
			Chains:                 buildReopenChains(reopenChains),
			MedianReopenLagSeconds: reopenMedian,
		},
		AdjustmentAnalysis: AnalyticsQualityAdjustment{
			ByCategory: buildAdjustmentCategories(adjustmentCategories),
			ByMaterial: buildMaterialRowsForQuality(adjustmentMaterialRows, adjustmentMaterialSummary),
			ByParty:    adjustmentPartyRows,
			Modes:      buildAdjustmentModes(adjustmentModes),
			Trend:      buildAdjustmentTrend(adjustmentTrendRows, q.Granularity),
		},
		CorrectionAnalysis: AnalyticsQualityCorrection{
			Tickets:                   correctionSummary.Tickets,
			GrossCorrectionMilliTonne: correctionSummary.GrossCorrectionMilliTonne,
			TareCorrectionMilliTonne:  correctionSummary.TareCorrectionMilliTonne,
			BySite:                    buildCorrectionSites(correctionSites),
		},
		MissingFields: buildMissingFields(missing),
		Anomalies:     anomalies,
		IssuerStats:   buildIssuerStats(issuerRows),
		Freshness:     freshness,
	}
	return result, nil
}

// AnalyticsQualityExportRows returns ticket-level quality rows for CSV export.
// It intentionally uses a larger cap than the on-screen anomaly list.
func (s *Service) AnalyticsQualityExportRows(ctx context.Context, q AnalyticsQuery) ([]analyticsAnomalyRow, error) {
	return s.store.AnalyticsQualityAnomalies(ctx, q, 50001)
}

func (s *Service) AnalyticsFreshness(ctx context.Context) (AnalyticsFreshness, error) {
	return s.store.AnalyticsFreshness(ctx)
}

func (s *Service) comparisonSummary(ctx context.Context, q AnalyticsQuery, mode string) (analyticsSummaryRow, error) {
	from, until := comparisonRange(q.From, q.Until, mode)
	if from.IsZero() || until.IsZero() {
		return analyticsSummaryRow{}, nil
	}
	next := q
	next.From = from
	next.Until = until
	return s.store.AnalyticsSummary(ctx, next)
}

func comparisonRange(from, until time.Time, mode string) (time.Time, time.Time) {
	switch mode {
	case "previous":
		return previousRange(from, until)
	case "year":
		return from.AddDate(-1, 0, 0), until.AddDate(-1, 0, 0)
	default:
		return time.Time{}, time.Time{}
	}
}

func previousRange(from, until time.Time) (time.Time, time.Time) {
	duration := until.Sub(from)
	return from.Add(-duration), from
}

func overviewSummaryFromRow(row analyticsSummaryRow) AnalyticsOverviewSummary {
	totalNet := row.InboundNetMilliTonne + row.OutboundNetMilliTonne
	return AnalyticsOverviewSummary{
		ValidTickets:   row.ValidTickets,
		InboundTickets: row.InboundTickets, InboundNetMilliTonne: row.InboundNetMilliTonne,
		OutboundTickets: row.OutboundTickets, OutboundNetMilliTonne: row.OutboundNetMilliTonne,
		NetFlowMilliTonne: row.InboundNetMilliTonne - row.OutboundNetMilliTonne,
		ActiveSites:       row.ActiveSites, ActiveSuppliers: row.ActiveSuppliers, ActiveCustomers: row.ActiveCustomers,
		AvgNetPerTicketMilliTonne: average(totalNet, row.ValidTickets),
		AdjustedTickets:           row.AdjustedTickets, AdjustmentNetMilliTonne: row.AdjustmentNetMilliTonne,
		AdjustmentWeightRateBp: rateBp(row.AdjustmentNetMilliTonne, row.PreAdjustmentNetMilliTonne),
		AdjustmentCoverageBp:   rateBp(row.AdjustmentKnownTickets, row.ValidTickets),
		VoidTickets:            row.VoidTickets, VoidRateBp: rateBp(row.VoidTickets, row.ValidTickets+row.VoidTickets),
	}
}

func buildComparison(current, previous, year analyticsSummaryRow) AnalyticsComparison {
	return AnalyticsComparison{
		Previous: comparisonSummary(current, previous),
		Year:     comparisonSummary(current, year),
	}
}

func comparisonSummary(current, previous analyticsSummaryRow) AnalyticsComparisonSummary {
	return AnalyticsComparisonSummary{
		ValidTickets:            comparisonMetric(current.ValidTickets, previous.ValidTickets),
		InboundTickets:          comparisonMetric(current.InboundTickets, previous.InboundTickets),
		OutboundTickets:         comparisonMetric(current.OutboundTickets, previous.OutboundTickets),
		InboundNetMilliTonne:    comparisonMetric(current.InboundNetMilliTonne, previous.InboundNetMilliTonne),
		OutboundNetMilliTonne:   comparisonMetric(current.OutboundNetMilliTonne, previous.OutboundNetMilliTonne),
		NetFlowMilliTonne:       comparisonMetric(current.InboundNetMilliTonne-current.OutboundNetMilliTonne, previous.InboundNetMilliTonne-previous.OutboundNetMilliTonne),
		AdjustmentNetMilliTonne: comparisonMetric(current.AdjustmentNetMilliTonne, previous.AdjustmentNetMilliTonne),
		VoidTickets:             comparisonMetric(current.VoidTickets, previous.VoidTickets),
	}
}

func comparisonMetric(current, previous int64) AnalyticsComparisonMetric {
	delta := current - previous
	return AnalyticsComparisonMetric{Current: current, Previous: previous, Delta: delta, DeltaBp: rateBp(delta, previous)}
}

func buildTrend(rows []analyticsTrendRow, granularity string) AnalyticsTrend {
	points := make([]AnalyticsTrendPoint, 0, len(rows))
	for _, row := range rows {
		valid := row.InboundTickets + row.OutboundTickets
		total := row.InboundNetMilliTonne + row.OutboundNetMilliTonne
		points = append(points, AnalyticsTrendPoint{
			Period:         periodLabel(row.PeriodStart, granularity),
			PeriodStart:    row.PeriodStart.Format("2006-01-02"),
			PeriodEnd:      periodEnd(row.PeriodStart, granularity).Format("2006-01-02"),
			InboundTickets: row.InboundTickets, InboundNetMilliTonne: row.InboundNetMilliTonne,
			OutboundTickets: row.OutboundTickets, OutboundNetMilliTonne: row.OutboundNetMilliTonne,
			NetFlowMilliTonne:         row.InboundNetMilliTonne - row.OutboundNetMilliTonne,
			AvgNetPerTicketMilliTonne: average(total, valid),
			VoidTickets:               row.VoidTickets, VoidRateBp: rateBp(row.VoidTickets, valid+row.VoidTickets),
		})
	}
	return AnalyticsTrend{Granularity: granularity, Points: points}
}

func buildReopenTrend(rows []analyticsReopenTrendRow, granularity string) AnalyticsTrend {
	points := make([]AnalyticsTrendPoint, 0, len(rows))
	for _, row := range rows {
		points = append(points, AnalyticsTrendPoint{
			Period:          periodLabel(row.PeriodStart, granularity),
			PeriodStart:     row.PeriodStart.Format("2006-01-02"),
			PeriodEnd:       periodEnd(row.PeriodStart, granularity).Format("2006-01-02"),
			ReopenedTickets: row.ReopenedTickets,
		})
	}
	return AnalyticsTrend{Granularity: granularity, Points: points}
}

func buildAdjustmentTrend(rows []analyticsAdjustmentTrendRow, granularity string) AnalyticsTrend {
	points := make([]AnalyticsTrendPoint, 0, len(rows))
	for _, row := range rows {
		points = append(points, AnalyticsTrendPoint{
			Period:                  periodLabel(row.PeriodStart, granularity),
			PeriodStart:             row.PeriodStart.Format("2006-01-02"),
			PeriodEnd:               periodEnd(row.PeriodStart, granularity).Format("2006-01-02"),
			AdjustedTickets:         row.AdjustedTickets,
			AdjustmentNetMilliTonne: row.AdjustmentNetMilliTonne,
			AdjustmentWeightRateBp:  rateBp(row.AdjustmentNetMilliTonne, row.PreAdjustmentNetMilliTonne),
		})
	}
	return AnalyticsTrend{Granularity: granularity, Points: points}
}

func periodLabel(start time.Time, granularity string) string {
	switch granularity {
	case "week":
		year, week := start.ISOWeek()
		return fmt.Sprintf("%d-W%02d", year, week)
	case "month":
		return start.Format("2006-01")
	case "quarter":
		return fmt.Sprintf("%d-Q%d", start.Year(), (int(start.Month())-1)/3+1)
	case "year":
		return start.Format("2006")
	default:
		return start.Format("2006-01-02")
	}
}

func periodEnd(start time.Time, granularity string) time.Time {
	switch granularity {
	case "week":
		return start.AddDate(0, 0, 6)
	case "month":
		return start.AddDate(0, 1, -1)
	case "quarter":
		return start.AddDate(0, 3, -1)
	case "year":
		return start.AddDate(1, 0, -1)
	default:
		return start
	}
}

func buildStructure(rows []analyticsStructureRow, totalNet int64) []AnalyticsStructureRow {
	result := make([]AnalyticsStructureRow, 0, len(rows))
	for _, row := range rows {
		result = append(result, AnalyticsStructureRow{Key: row.Key, Label: row.Label, NetMilliTonne: row.NetMilliTonne, ShareBp: rateBp(row.NetMilliTonne, totalNet)})
	}
	return result
}

func buildTopMaterials(rows []analyticsMaterialRow, totalNet int64) []AnalyticsTopRow {
	result := make([]AnalyticsTopRow, 0, len(rows))
	for _, row := range rows {
		result = append(result, AnalyticsTopRow{
			Code: row.MaterialCode, Name: row.MaterialName, NetMilliTonne: row.TotalNetMilliTonne,
			TicketCount: row.TotalTickets, ShareBp: rateBp(row.TotalNetMilliTonne, totalNet),
		})
	}
	return result
}

func buildTopParties(rows []analyticsPartyRow, direction string, totalNet int64) []AnalyticsTopRow {
	result := make([]AnalyticsTopRow, 0, len(rows))
	for _, row := range rows {
		result = append(result, AnalyticsTopRow{
			Code: row.PartyCode, Name: row.PartyName, Direction: direction,
			NetMilliTonne: row.NetMilliTonne, TicketCount: row.TicketCount, ShareBp: rateBp(row.NetMilliTonne, totalNet),
		})
	}
	return result
}

func materialRowFromDB(row analyticsMaterialRow, totalNet int64) AnalyticsMaterialRow {
	return AnalyticsMaterialRow{
		MaterialCode: row.MaterialCode, MaterialName: row.MaterialName, MaterialSpec: row.MaterialSpec,
		CategoryCode: row.CategoryCode, CategoryName: row.CategoryName,
		InboundTickets: row.InboundTickets, InboundNetMilliTonne: row.InboundNetMilliTonne,
		OutboundTickets: row.OutboundTickets, OutboundNetMilliTonne: row.OutboundNetMilliTonne,
		TotalTickets: row.TotalTickets, TotalNetMilliTonne: row.TotalNetMilliTonne,
		AvgNetPerTicketMilliTonne: average(row.TotalNetMilliTonne, row.TotalTickets),
		ShareBp:                   rateBp(row.TotalNetMilliTonne, totalNet),
		AdjustedTickets:           row.AdjustedTickets, AdjustmentNetMilliTonne: row.AdjustmentNetMilliTonne,
		AdjustmentWeightRateBp: rateBp(row.AdjustmentNetMilliTonne, row.PreAdjustmentNetMilliTonne),
		AdjustmentCoverageBp:   rateBp(row.AdjustmentKnownTickets, row.TotalTickets),
		LastIssuedAt:           row.LastIssuedAt,
	}
}

func partyRowFromDB(row analyticsPartyRow, direction string, totalNet int64) AnalyticsPartyRow {
	return AnalyticsPartyRow{
		PartyCode: row.PartyCode, PartyName: row.PartyName, Direction: direction,
		TicketCount: row.TicketCount, NetMilliTonne: row.NetMilliTonne,
		AvgNetPerTicketMilliTonne: average(row.NetMilliTonne, row.TicketCount),
		ShareBp:                   rateBp(row.NetMilliTonne, totalNet),
		FirstIssuedAt:             row.FirstIssuedAt, LastIssuedAt: row.LastIssuedAt,
		AdjustedTickets: row.AdjustedTickets, AdjustmentNetMilliTonne: row.AdjustmentNetMilliTonne,
		AdjustmentWeightRateBp: rateBp(row.AdjustmentNetMilliTonne, row.PreAdjustmentNetMilliTonne),
		AdjustmentCoverageBp:   rateBp(row.AdjustmentKnownTickets, row.TicketCount),
		VoidTickets:            row.VoidTickets, VoidRateBp: rateBp(row.VoidTickets, row.TicketCount+row.VoidTickets),
	}
}

func buildMaterialTrend(rows []analyticsMaterialTrendRow, granularity string) []AnalyticsMaterialTrendSeries {
	series := make([]AnalyticsMaterialTrendSeries, 0)
	index := map[string]int{}
	for _, row := range rows {
		position, ok := index[row.MaterialCode]
		if !ok {
			position = len(series)
			index[row.MaterialCode] = position
			series = append(series, AnalyticsMaterialTrendSeries{MaterialCode: row.MaterialCode, MaterialName: row.MaterialName})
		}
		series[position].Points = append(series[position].Points, struct {
			Period        string `json:"period"`
			NetMilliTonne int64  `json:"netMilliTonne"`
		}{Period: periodLabel(row.PeriodStart, granularity), NetMilliTonne: row.NetMilliTonne})
	}
	return series
}

func buildPartyConcentration(rows []analyticsPartyConcentrationRow, totalNet int64, limit int) []AnalyticsPartyConcentration {
	if limit <= 0 || limit > len(rows) {
		limit = len(rows)
	}
	result := make([]AnalyticsPartyConcentration, 0, limit)
	for _, row := range rows[:limit] {
		result = append(result, AnalyticsPartyConcentration{Label: row.PartyName, NetMilliTonne: row.NetMilliTonne, ShareBp: rateBp(row.NetMilliTonne, totalNet)})
	}
	return result
}

func concentrationMetrics(rows []analyticsPartyConcentrationRow, totalNet int64) (*int64, *int64, *int64, *int64) {
	cr := func(n int) *int64 {
		var sum int64
		for i, row := range rows {
			if i >= n {
				break
			}
			sum += row.NetMilliTonne
		}
		return rateBp(sum, totalNet)
	}
	var hhi int64
	for _, row := range rows {
		share := rateBp(row.NetMilliTonne, totalNet)
		if share != nil {
			hhi += (*share * *share) / 10000
		}
	}
	hhiValue := hhi
	return cr(3), cr(5), cr(10), &hhiValue
}

func buildVoidReasons(rows []analyticsReasonRowDB, totalVoid int64) []AnalyticsReasonRow {
	result := make([]AnalyticsReasonRow, 0, len(rows))
	for _, row := range rows {
		result = append(result, AnalyticsReasonRow{Reason: row.Reason, Tickets: row.Tickets, ShareBp: rateBp(row.Tickets, totalVoid)})
	}
	return result
}

func buildQualityGroups(rows []analyticsQualityGroupRowDB) []AnalyticsQualityGroupRow {
	result := make([]AnalyticsQualityGroupRow, 0, len(rows))
	for _, row := range rows {
		result = append(result, AnalyticsQualityGroupRow{
			Code: row.Code, Name: row.Name, Tickets: row.Tickets, VoidTickets: row.VoidTickets,
			VoidRateBp: rateBp(row.VoidTickets, row.Tickets),
		})
	}
	return result
}

func buildReopenChains(rows []analyticsReopenChainRow) []AnalyticsReopenChain {
	result := make([]AnalyticsReopenChain, 0, len(rows))
	for _, row := range rows {
		result = append(result, AnalyticsReopenChain{
			OriginalTicketNo: row.OriginalTicketNo, NewTicketNo: row.NewTicketNo, SiteCode: row.SiteCode,
			OriginalIssuedAt: row.OriginalIssuedAt, OriginalVoidedAt: row.OriginalVoidedAt,
			NewIssuedAt: row.NewIssuedAt, ReopenLagSeconds: row.ReopenLagSeconds, CrossDay: row.CrossDay,
		})
	}
	return result
}

func buildAdjustmentCategories(rows []analyticsAdjustmentCategoryRowDB) []AnalyticsAdjustmentCategoryRow {
	result := make([]AnalyticsAdjustmentCategoryRow, 0, len(rows))
	for _, row := range rows {
		result = append(result, AnalyticsAdjustmentCategoryRow{
			Category: row.Category, CategoryName: row.CategoryName, Tickets: row.Tickets,
			AdjustmentNetMilliTonne: row.AdjustmentNetMilliTonne,
			RateBp:                  rateBp(row.AdjustmentNetMilliTonne, row.PreAdjustmentNetMilliTonne),
		})
	}
	return result
}

func buildAdjustmentModes(rows []analyticsAdjustmentModeRowDB) []AnalyticsAdjustmentModeRow {
	var total int64
	for _, row := range rows {
		total += row.Tickets
	}
	result := make([]AnalyticsAdjustmentModeRow, 0, len(rows))
	for _, row := range rows {
		result = append(result, AnalyticsAdjustmentModeRow{Mode: row.Mode, Tickets: row.Tickets, ShareBp: rateBp(row.Tickets, total)})
	}
	return result
}

func buildMaterialRowsForQuality(rows []analyticsMaterialRow, summary analyticsMaterialSummaryRow) []AnalyticsMaterialRow {
	totalNet := summary.InboundNetMilliTonne + summary.OutboundNetMilliTonne
	result := make([]AnalyticsMaterialRow, 0, len(rows))
	for _, row := range rows {
		result = append(result, materialRowFromDB(row, totalNet))
	}
	return result
}

func buildCorrectionSites(rows []analyticsCorrectionSiteRowDB) []AnalyticsCorrectionSiteRow {
	result := make([]AnalyticsCorrectionSiteRow, 0, len(rows))
	for _, row := range rows {
		result = append(result, AnalyticsCorrectionSiteRow{
			SiteCode: row.SiteCode, SiteName: row.SiteName, Tickets: row.Tickets,
			GrossCorrectionMilliTonne: row.GrossCorrectionMilliTonne,
			TareCorrectionMilliTonne:  row.TareCorrectionMilliTonne,
		})
	}
	return result
}

func buildMissingFields(row analyticsMissingFieldsRow) []AnalyticsMissingField {
	total := row.TotalTickets
	return []AnalyticsMissingField{
		{Field: "driver", Label: "司机", MissingCount: row.MissingDriver, MissingRateBp: rateBp(row.MissingDriver, total)},
		{Field: "driverPhone", Label: "司机电话", MissingCount: row.MissingDriverPhone, MissingRateBp: rateBp(row.MissingDriverPhone, total)},
		{Field: "contactName", Label: "联系人", MissingCount: row.MissingContactName, MissingRateBp: rateBp(row.MissingContactName, total)},
		{Field: "contactPhone", Label: "联系电话", MissingCount: row.MissingContactPhone, MissingRateBp: rateBp(row.MissingContactPhone, total)},
		{Field: "adjustmentCategory", Label: "调整类别（有调整时）", MissingCount: row.MissingAdjustmentCategory, MissingRateBp: rateBp(row.MissingAdjustmentCategory, total)},
		{Field: "issuerName", Label: "出单人", MissingCount: row.MissingIssuer, MissingRateBp: rateBp(row.MissingIssuer, total)},
		{Field: "materialName", Label: "物料名称", MissingCount: row.MissingMaterialName, MissingRateBp: rateBp(row.MissingMaterialName, total)},
		{Field: "partyName", Label: "供收方名称", MissingCount: row.MissingPartyName, MissingRateBp: rateBp(row.MissingPartyName, total)},
	}
}

func buildIssuerStats(rows []analyticsIssuerRow) []AnalyticsIssuerStat {
	result := make([]AnalyticsIssuerStat, 0, len(rows))
	for _, row := range rows {
		result = append(result, AnalyticsIssuerStat{
			IssuerName: row.IssuerName, Tickets: row.Tickets, VoidTickets: row.VoidTickets,
			VoidRateBp:      rateBp(row.VoidTickets, row.Tickets+row.VoidTickets),
			ReopenedTickets: row.ReopenedTickets, AdjustedTickets: row.AdjustedTickets,
			AdjustmentTicketRateBp: rateBp(row.AdjustedTickets, row.KnownAdjustmentTickets),
		})
	}
	return result
}

func qualitySummaryFromRow(row analyticsQualitySummaryRow) AnalyticsQualitySummary {
	return AnalyticsQualitySummary{
		TotalTickets: row.TotalTickets, ValidTickets: row.ValidTickets, VoidTickets: row.VoidTickets,
		VoidRateBp:      rateBp(row.VoidTickets, row.ValidTickets+row.VoidTickets),
		ReopenedTickets: row.ReopenedTickets, ReopenRateBp: rateBp(row.ReopenedTickets, row.ValidTickets),
		AdjustedTickets:         row.AdjustedTickets,
		AdjustmentTicketRateBp:  rateBp(row.AdjustedTickets, row.AdjustmentKnownTickets),
		AdjustmentNetMilliTonne: row.AdjustmentNetMilliTonne,
		AdjustmentWeightRateBp:  rateBp(row.AdjustmentNetMilliTonne, row.PreAdjustmentNetMilliTonne),
		AdjustmentCoverageBp:    rateBp(row.AdjustmentKnownTickets, row.ValidTickets),
		ManualWeightTickets:     row.ManualWeightTickets,
		ManualWeightRateBp:      rateBp(row.ManualWeightTickets, row.ValidTickets),
		CorrectionTickets:       row.CorrectionTickets,
	}
}

func (s *Service) adjustmentPartyRows(ctx context.Context, q AnalyticsQuery) ([]AnalyticsPartyRow, error) {
	if q.Direction != "" {
		return s.qualityPartyRows(ctx, q, q.Direction)
	}
	inbound, err := s.qualityPartyRows(ctx, q, "inbound")
	if err != nil {
		return nil, err
	}
	outbound, err := s.qualityPartyRows(ctx, q, "outbound")
	if err != nil {
		return nil, err
	}
	return append(inbound, outbound...), nil
}

func (s *Service) qualityPartyRows(ctx context.Context, q AnalyticsQuery, direction string) ([]AnalyticsPartyRow, error) {
	next := withPage(q, 1, q.TopN, "adjustment")
	next.Direction = direction
	rows, _, err := s.store.AnalyticsPartyRows(ctx, next)
	if err != nil {
		return nil, err
	}
	totals, err := s.store.AnalyticsPartyTotals(ctx, next)
	if err != nil {
		return nil, err
	}
	result := make([]AnalyticsPartyRow, 0, len(rows))
	for _, row := range rows {
		result = append(result, partyRowFromDB(row, direction, totals.TotalNetMilliTonne))
	}
	return result, nil
}

func detectAnomalies(rows []analyticsAnomalyRow) []AnalyticsAnomaly {
	plateDay := map[string]int{}
	for _, row := range rows {
		key := row.Plate + "|" + row.IssuedAt.In(statementZone).Format("2006-01-02")
		plateDay[key]++
	}
	result := make([]AnalyticsAnomaly, 0)
	appendAnomaly := func(row analyticsAnomalyRow, kind, detail string) {
		result = append(result, AnalyticsAnomaly{TicketNo: row.TicketNo, SiteCode: row.SiteCode, IssuedAt: row.IssuedAt, Type: kind, Detail: detail})
	}
	for _, row := range rows {
		if row.FinalNetMilliTonne < 100 {
			appendAnomaly(row, "net_too_small", "净重小于 0.1 吨")
		}
		if row.FinalGrossMilliTonne == nil || *row.FinalGrossMilliTonne <= 0 {
			appendAnomaly(row, "gross_not_positive", "最终毛重为空或不大于 0")
		}
		if row.FinalTareMilliTonne == nil || *row.FinalTareMilliTonne <= 0 {
			appendAnomaly(row, "tare_not_positive", "最终皮重为空或不大于 0")
		}
		if row.FinalGrossMilliTonne != nil && row.FinalTareMilliTonne != nil && *row.FinalGrossMilliTonne <= *row.FinalTareMilliTonne {
			appendAnomaly(row, "gross_le_tare", "最终毛重不大于最终皮重")
		}
		if row.WeighIntervalSeconds != nil {
			if *row.WeighIntervalSeconds < 0 {
				appendAnomaly(row, "interval_negative", "两次过磅间隔为负")
			}
			if *row.WeighIntervalSeconds > 86400 {
				appendAnomaly(row, "interval_over_24h", "两次过磅间隔超过 24 小时")
			}
		}
		if row.IssuedLagSeconds != nil && *row.IssuedLagSeconds > 86400 {
			appendAnomaly(row, "issued_lag_over_24h", "出单延迟超过 24 小时")
		}
		if row.VoidedAt != nil && row.VoidedAt.Sub(row.IssuedAt) > 7*24*time.Hour {
			appendAnomaly(row, "void_latency_over_7d", "出单后超过 7 天才作废")
		}
		if row.Driver == nil || *row.Driver == "" {
			appendAnomaly(row, "missing_driver", "司机为空")
		}
		if row.DriverPhone == nil || *row.DriverPhone == "" {
			appendAnomaly(row, "missing_driver_phone", "司机电话为空")
		}
		if (row.ContactName == nil || *row.ContactName == "") && (row.ContactPhone == nil || *row.ContactPhone == "") {
			appendAnomaly(row, "missing_contact", "联系人及电话均为空")
		}
		if row.Adjusted && (row.AdjustmentCategory == nil || *row.AdjustmentCategory == "") {
			appendAnomaly(row, "missing_adjustment_category", "有净重调整但缺少调整类别")
		}
		if !row.AdjustmentKnown {
			appendAnomaly(row, "legacy_adjustment_unknown", "旧协议单据缺少调整字段")
		}
		key := row.Plate + "|" + row.IssuedAt.In(statementZone).Format("2006-01-02")
		if plateDay[key] > 1 {
			appendAnomaly(row, "duplicate_plate_same_day", "同日同车牌多单，需人工判断")
		}
	}
	return result
}

func uniqueTicketCount(rows []AnalyticsAnomaly) int64 {
	seen := map[string]struct{}{}
	for _, row := range rows {
		seen[row.TicketNo] = struct{}{}
	}
	return int64(len(seen))
}

func overviewAlerts(summary AnalyticsOverviewSummary, freshness AnalyticsFreshness) []AnalyticsAlert {
	alerts := make([]AnalyticsAlert, 0)
	if summary.VoidRateBp != nil && *summary.VoidRateBp >= 500 {
		alerts = append(alerts, AnalyticsAlert{Type: "void_rate", Level: "warning", Count: summary.VoidTickets, Message: "作废率高于 5%"})
	}
	if summary.AdjustmentCoverageBp != nil && *summary.AdjustmentCoverageBp < 10000 {
		missing := summary.ValidTickets - (summary.ValidTickets * *summary.AdjustmentCoverageBp / 10000)
		alerts = append(alerts, AnalyticsAlert{Type: "adjustment_coverage", Level: "info", Count: missing, Message: "部分旧协议单据缺少调整字段，扣量率仅覆盖已知单据"})
	}
	if freshness.LastReceivedAt == nil || time.Since(*freshness.LastReceivedAt) > 2*time.Hour {
		alerts = append(alerts, AnalyticsAlert{Type: "sync_stale", Level: "warning", Count: 0, Message: "最近接收时间超过 2 小时或没有接收记录"})
	}
	return alerts
}

func withPage(q AnalyticsQuery, page, pageSize int, sortBy string) AnalyticsQuery {
	q.Page = page
	q.PageSize = pageSize
	q.SortBy = sortBy
	q.SortOrder = "desc"
	return q
}

func withDirection(q AnalyticsQuery, direction string, page, pageSize int) AnalyticsQuery {
	q.Direction = direction
	q.Page = page
	q.PageSize = pageSize
	q.SortBy = "net"
	q.SortOrder = "desc"
	return q
}

func average(total, count int64) *int64 {
	if count == 0 {
		return nil
	}
	value := total / count
	return &value
}

func rateBp(numerator, denominator int64) *int64 {
	if denominator == 0 {
		return nil
	}
	value := numerator * 10000 / denominator
	return &value
}
