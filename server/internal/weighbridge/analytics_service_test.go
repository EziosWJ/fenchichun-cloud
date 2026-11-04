package weighbridge

import (
	"testing"
	"time"
)

func TestAnalyticsRateAndAverage(t *testing.T) {
	if value := rateBp(1, 3); value == nil || *value != 3333 {
		t.Fatalf("rateBp = %v", value)
	}
	if value := rateBp(1, 0); value != nil {
		t.Fatalf("zero denominator should be nil, got %v", value)
	}
	if value := average(10, 3); value == nil || *value != 3 {
		t.Fatalf("average = %v", value)
	}
	if value := average(10, 0); value != nil {
		t.Fatalf("zero count average should be nil, got %v", value)
	}
}

func TestAnalyticsPeriodLabels(t *testing.T) {
	start := time.Date(2026, 11, 2, 0, 0, 0, 0, statementZone)
	if got := periodLabel(start, "day"); got != "2026-11-02" {
		t.Fatalf("day label = %s", got)
	}
	if got := periodLabel(start, "week"); got != "2026-W45" {
		t.Fatalf("week label = %s", got)
	}
	if got := periodLabel(start, "month"); got != "2026-11" {
		t.Fatalf("month label = %s", got)
	}
	if got := periodLabel(start, "quarter"); got != "2026-Q4" {
		t.Fatalf("quarter label = %s", got)
	}
	if got := periodLabel(start, "year"); got != "2026" {
		t.Fatalf("year label = %s", got)
	}
	if end := periodEnd(start, "week"); end.Format("2006-01-02") != "2026-11-08" {
		t.Fatalf("week end = %s", end.Format("2006-01-02"))
	}
}

func TestAnalyticsPreviousRangeIsEqualLength(t *testing.T) {
	from := time.Date(2026, 11, 1, 0, 0, 0, 0, statementZone)
	until := time.Date(2026, 12, 1, 0, 0, 0, 0, statementZone)
	previousFrom, previousUntil := previousRange(from, until)
	if previousUntil != from || previousFrom != time.Date(2026, 10, 2, 0, 0, 0, 0, statementZone) {
		t.Fatalf("previous range = %s - %s", previousFrom, previousUntil)
	}
}

func TestDetectAnomalies(t *testing.T) {
	issued := time.Date(2026, 11, 2, 10, 0, 0, 0, statementZone)
	interval := int64(90000)
	lag := int64(90000)
	driver := "司机甲"
	rows := []analyticsAnomalyRow{
		{
			TicketNo: "T1", SiteCode: "A", IssuedAt: issued, FinalNetMilliTonne: 50,
			WeighIntervalSeconds: &interval, IssuedLagSeconds: &lag, Driver: &driver,
		},
		{
			TicketNo: "T2", SiteCode: "A", IssuedAt: issued, FinalNetMilliTonne: 1000,
			AdjustmentKnown: false,
		},
	}
	anomalies := detectAnomalies(rows)
	types := map[string]bool{}
	for _, item := range anomalies {
		types[item.Type] = true
	}
	for _, expected := range []string{"net_too_small", "interval_over_24h", "issued_lag_over_24h", "missing_driver", "legacy_adjustment_unknown", "missing_contact"} {
		if !types[expected] {
			t.Fatalf("missing anomaly %s in %+v", expected, anomalies)
		}
	}
	if !types["duplicate_plate_same_day"] {
		t.Fatalf("expected duplicate plate anomaly in %+v", anomalies)
	}
}

func TestConcentrationMetrics(t *testing.T) {
	rows := []analyticsPartyConcentrationRow{
		{PartyCode: "P1", NetMilliTonne: 50},
		{PartyCode: "P2", NetMilliTonne: 30},
		{PartyCode: "P3", NetMilliTonne: 20},
	}
	cr3, _, _, hhi := concentrationMetrics(rows, 100)
	if cr3 == nil || *cr3 != 10000 {
		t.Fatalf("cr3 = %v", cr3)
	}
	if hhi == nil || *hhi != 3800 {
		t.Fatalf("hhi = %v", hhi)
	}
}

func TestBuildComparisonUsesPreviousBase(t *testing.T) {
	current := analyticsSummaryRow{ValidTickets: 30, InboundNetMilliTonne: 300000}
	previous := analyticsSummaryRow{ValidTickets: 20, InboundNetMilliTonne: 200000}
	comparison := buildComparison(current, previous, analyticsSummaryRow{})
	if comparison.Previous.ValidTickets.Delta != 10 {
		t.Fatalf("ticket delta = %+v", comparison.Previous.ValidTickets)
	}
	if comparison.Previous.InboundNetMilliTonne.DeltaBp == nil || *comparison.Previous.InboundNetMilliTonne.DeltaBp != 5000 {
		t.Fatalf("inbound delta = %+v", comparison.Previous.InboundNetMilliTonne)
	}
}
