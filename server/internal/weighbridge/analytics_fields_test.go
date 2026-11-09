package weighbridge

import (
	"testing"
	"time"
)

func TestDeriveTicketAnalyticsFromSnapshot(t *testing.T) {
	first := time.Date(2026, 11, 1, 23, 30, 0, 0, time.FixedZone("Asia/Shanghai", 8*60*60))
	second := time.Date(2026, 11, 2, 1, 0, 0, 0, time.FixedZone("Asia/Shanghai", 8*60*60))
	snapshot := TicketSnapshot{
		IssuedAt:                  second.Add(15 * time.Minute),
		FirstConfirmedAt:          first,
		SecondConfirmedAt:         second,
		OriginalGross:             "31.000",
		OriginalTare:              "10.500",
		FinalGross:                "30.000",
		FinalTare:                 "10.000",
		NetAdjustment:             "1.500",
		NetAdjustmentMode:         "amount",
		NetAdjustmentCategory:     "QUALITY",
		NetAdjustmentCategoryName: "质量差",
		GrossSource:               "collected",
		TareSource:                "manual",
		IssuerName:                "司磅员",
		Driver:                    "司机甲",
		DriverPhone:               "13800000000",
		ContactName:               "联系人",
		ContactPhone:              "13900000000",
		MaterialName:              "高粱",
		MaterialSpec:              "散装",
		PartyName:                 "供应商甲",
	}

	fields, err := deriveTicketAnalytics(snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if fields.OriginalGrossMilliTonne == nil || *fields.OriginalGrossMilliTonne != 31000 {
		t.Fatalf("original gross = %v", fields.OriginalGrossMilliTonne)
	}
	if fields.FinalGrossMilliTonne == nil || *fields.FinalGrossMilliTonne != 30000 {
		t.Fatalf("final gross = %v", fields.FinalGrossMilliTonne)
	}
	if fields.PreAdjustmentNetMilliTonne == nil || *fields.PreAdjustmentNetMilliTonne != 20000 {
		t.Fatalf("pre adjustment net = %v", fields.PreAdjustmentNetMilliTonne)
	}
	if !fields.AdjustmentKnown || !fields.Adjusted || fields.NetAdjustmentMilliTonne == nil || *fields.NetAdjustmentMilliTonne != 1500 {
		t.Fatalf("adjustment fields = %+v", fields)
	}
	if fields.WeighIntervalSeconds == nil || *fields.WeighIntervalSeconds != 5400 {
		t.Fatalf("interval = %v", fields.WeighIntervalSeconds)
	}
	if !fields.CrossDay {
		t.Fatal("expected cross-day ticket")
	}
	if fields.IssuedDate == nil || fields.IssuedDate.Format("2006-01-02") != "2026-11-02" {
		t.Fatalf("issued date = %v", fields.IssuedDate)
	}
	if fields.MaterialName == nil || *fields.MaterialName != "高粱" {
		t.Fatalf("material name = %v", fields.MaterialName)
	}
}

func TestDeriveTicketAnalyticsLegacyAdjustmentUnknown(t *testing.T) {
	snapshot := TicketSnapshot{
		IssuedAt:          time.Date(2026, 11, 2, 1, 0, 0, 0, time.UTC),
		FirstConfirmedAt:  time.Date(2026, 11, 2, 0, 45, 0, 0, time.UTC),
		SecondConfirmedAt: time.Date(2026, 11, 2, 1, 0, 0, 0, time.UTC),
		OriginalGross:     "20.000",
		OriginalTare:      "5.000",
		FinalGross:        "20.000",
		FinalTare:         "5.000",
	}
	fields, err := deriveTicketAnalytics(snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if fields.AdjustmentKnown || fields.Adjusted || fields.NetAdjustmentMilliTonne != nil {
		t.Fatalf("legacy adjustment should be unknown: %+v", fields)
	}
	if fields.PreAdjustmentNetMilliTonne == nil || *fields.PreAdjustmentNetMilliTonne != 15000 {
		t.Fatalf("pre adjustment net = %v", fields.PreAdjustmentNetMilliTonne)
	}
}

func TestDeriveTicketAnalyticsRejectsInvalidWeights(t *testing.T) {
	snapshot := TicketSnapshot{
		IssuedAt:          time.Now(),
		FirstConfirmedAt:  time.Now(),
		SecondConfirmedAt: time.Now(),
		OriginalGross:     "bad",
		OriginalTare:      "5.000",
		FinalGross:        "20.000",
		FinalTare:         "5.000",
	}
	if _, err := deriveTicketAnalytics(snapshot); err == nil {
		t.Fatal("expected invalid weight error")
	}
}

func TestDeriveTicketAnalyticsMultiItemAdjustment(t *testing.T) {
	items := []NetAdjustmentItem{
		{Mode: "percent", Amount: "0.200", RateBP: intPtr(100), Category: "WATER", CategoryName: "水分大", Remark: "水分大"},
		{Mode: "amount", Amount: "0.500", Category: "IMPURITY", CategoryName: "杂质多"},
	}
	snapshot := TicketSnapshot{
		IssuedAt:          time.Date(2026, 11, 7, 1, 0, 0, 0, time.UTC),
		FirstConfirmedAt:  time.Date(2026, 11, 7, 0, 45, 0, 0, time.UTC),
		SecondConfirmedAt: time.Date(2026, 11, 7, 1, 0, 0, 0, time.UTC),
		OriginalGross:     "30.000",
		OriginalTare:      "10.000",
		FinalGross:        "30.000",
		FinalTare:         "10.000",
		FinalNet:          "19.300",
		NetAdjustment:     "0.700",
		NetAdjustments:    &items,
	}
	fields, err := deriveTicketAnalytics(snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if !fields.AdjustmentKnown || !fields.Adjusted {
		t.Fatalf("adjustment should be known and adjusted: %+v", fields)
	}
	if fields.NetAdjustmentMilliTonne == nil || *fields.NetAdjustmentMilliTonne != 700 {
		t.Fatalf("adjustment total = %v", fields.NetAdjustmentMilliTonne)
	}
	if fields.AdjustmentMode == nil || *fields.AdjustmentMode != MultiAdjustmentCode {
		t.Fatalf("mode = %v", fields.AdjustmentMode)
	}
	if fields.AdjustmentCategory == nil || *fields.AdjustmentCategory != MultiAdjustmentCode {
		t.Fatalf("category = %v", fields.AdjustmentCategory)
	}
	if fields.AdjustmentCategoryName == nil || *fields.AdjustmentCategoryName != MultiAdjustmentName {
		t.Fatalf("category name = %v", fields.AdjustmentCategoryName)
	}
}

func TestDeriveTicketAnalyticsSingleItemAdjustment(t *testing.T) {
	items := []NetAdjustmentItem{
		{Mode: "percent", Amount: "0.200", RateBP: intPtr(100), Category: "WATER", CategoryName: "水分大"},
	}
	snapshot := TicketSnapshot{
		OriginalGross:  "30.000",
		OriginalTare:   "10.000",
		FinalGross:     "30.000",
		FinalTare:      "10.000",
		FinalNet:       "19.800",
		NetAdjustment:  "0.200",
		NetAdjustments: &items,
	}
	fields, err := deriveTicketAnalytics(snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if fields.AdjustmentMode == nil || *fields.AdjustmentMode != "percent" {
		t.Fatalf("mode = %v", fields.AdjustmentMode)
	}
	if fields.AdjustmentCategory == nil || *fields.AdjustmentCategory != "WATER" {
		t.Fatalf("category = %v", fields.AdjustmentCategory)
	}
	if fields.AdjustmentCategoryName == nil || *fields.AdjustmentCategoryName != "水分大" {
		t.Fatalf("category name = %v", fields.AdjustmentCategoryName)
	}
}

func TestDeriveTicketAnalyticsEmptyItemAdjustment(t *testing.T) {
	empty := []NetAdjustmentItem{}
	snapshot := TicketSnapshot{
		OriginalGross:  "30.000",
		OriginalTare:   "10.000",
		FinalGross:     "30.000",
		FinalTare:      "10.000",
		FinalNet:       "20.000",
		NetAdjustment:  "0",
		NetAdjustments: &empty,
	}
	fields, err := deriveTicketAnalytics(snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if fields.Adjusted {
		t.Fatal("an empty detail array must not count as adjusted")
	}
	if fields.AdjustmentMode != nil || fields.AdjustmentCategory != nil || fields.AdjustmentCategoryName != nil {
		t.Fatalf("empty details must not be classified: %+v", fields)
	}
}
