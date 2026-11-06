package weighbridge

import (
	"strings"
	"testing"
	"time"
)

func TestParseStatementTicketAggregatesSnapshotWeights(t *testing.T) {
	row := statementRow{
		SiteCode: "F001", SiteName: "一厂", PartyCode: "C-P-0001", MaterialCode: "C-M-0001",
		Direction: "outbound", IssuedAt: time.Date(2026, 11, 2, 2, 0, 0, 0, time.UTC),
		FinalNetMilliTonne: 18500,
		Snapshot:           `{"ticketNo":"T1","plate":"晋A1","materialName":"高粱","materialSpec":"散装","partyName":"客户甲","finalGross":"30","finalTare":"10","netAdjustment":"1.5"}`,
	}
	ticket, err := parseStatementTicket(row)
	if err != nil {
		t.Fatal(err)
	}
	if ticket.gross != 30000 || ticket.tare != 10000 || ticket.adjustment != 1500 || ticket.net != 18500 {
		t.Fatalf("weights = %+v", ticket)
	}
	if ticket.partyName != "客户甲" || ticket.materialName != "高粱" || ticket.materialSpec != "散装" {
		t.Fatalf("snapshot names = %+v", ticket)
	}
}

func TestAggregateStatementPartiesGroupsBySiteAndParty(t *testing.T) {
	at := time.Date(2026, 11, 1, 2, 0, 0, 0, time.UTC)
	tickets := []statementTicket{
		{siteCode: "F001", siteName: "一厂", partyCode: "P1", partyName: "客户甲", ticketNo: "T1", issuedAt: at, gross: 30000, tare: 10000, adjustment: 1000, net: 19000},
		{siteCode: "F001", siteName: "一厂", partyCode: "P1", partyName: "客户甲", ticketNo: "T2", issuedAt: at.Add(24 * time.Hour), gross: 20000, tare: 5000, adjustment: 500, net: 14500},
		{siteCode: "F002", siteName: "二厂", partyCode: "P1", partyName: "客户甲", ticketNo: "T3", issuedAt: at, gross: 25000, tare: 5000, net: 20000},
		{siteCode: "F001", siteName: "一厂", partyCode: "P2", partyName: "客户乙", ticketNo: "T4", issuedAt: at, gross: 10000, tare: 1000, net: 9000},
	}
	parties, summary := aggregateStatementParties(tickets, "")
	if len(parties) != 3 || summary.PartyCount != 3 || summary.TicketCount != 4 {
		t.Fatalf("parties=%+v summary=%+v", parties, summary)
	}
	if parties[0].SiteCode != "F001" || parties[0].PartyCode != "P1" || parties[0].NetMilliTonne != 33500 {
		t.Fatalf("largest party = %+v", parties[0])
	}
	if parties[1].SiteCode != "F002" || parties[1].PartyCode != "P1" || parties[1].NetMilliTonne != 20000 {
		t.Fatalf("second party = %+v", parties[1])
	}
	if parties[2].SiteCode != "F001" || parties[2].PartyCode != "P2" || parties[2].NetMilliTonne != 9000 {
		t.Fatalf("third party = %+v", parties[2])
	}
	filtered, filteredSummary := aggregateStatementParties(tickets, "客户乙")
	if len(filtered) != 1 || filtered[0].PartyCode != "P2" || filteredSummary.TicketCount != 1 {
		t.Fatalf("keyword filter = %+v %+v", filtered, filteredSummary)
	}
}

func TestAggregateStatementDetailBuildsMaterialAndDailyRows(t *testing.T) {
	at := time.Date(2026, 11, 1, 2, 0, 0, 0, time.UTC)
	from := at
	until := at.AddDate(0, 0, 2)
	q := StatementQuery{SiteCode: "F001", PartyCode: "P1", Direction: "outbound", From: &from, Until: &until}
	tickets := []statementTicket{
		{siteCode: "F001", siteName: "一厂", partyCode: "P1", partyName: "客户甲", materialCode: "M1", materialName: "高粱", materialSpec: "散装", issuedAt: at, gross: 30000, tare: 10000, adjustment: 1000, net: 19000},
		{siteCode: "F001", siteName: "一厂", partyCode: "P1", partyName: "客户甲", materialCode: "M1", materialName: "高粱", materialSpec: "散装", issuedAt: at.Add(24 * time.Hour), gross: 20000, tare: 5000, adjustment: 500, net: 14500},
		{siteCode: "F001", siteName: "一厂", partyCode: "P1", partyName: "客户甲", materialCode: "M2", materialName: "大麦", issuedAt: at, gross: 10000, tare: 1000, net: 9000},
	}
	detail := aggregateStatementDetail(q, tickets)
	if detail.SiteCode != "F001" || detail.PartyName != "客户甲" || detail.From != "2026-11-01" || detail.To != "2026-11-02" {
		t.Fatalf("detail header = %+v", detail)
	}
	if detail.TicketCount != 3 || detail.GrossMilliTonne != 60000 || detail.TareMilliTonne != 16000 || detail.NetAdjustmentMilliTonne != 1500 || detail.NetMilliTonne != 42500 {
		t.Fatalf("detail totals = %+v", detail)
	}
	if len(detail.Materials) != 2 || detail.Materials[0].MaterialCode != "M1" || detail.Materials[0].NetMilliTonne != 33500 {
		t.Fatalf("materials = %+v", detail.Materials)
	}
	if len(detail.Daily) != 2 || detail.Daily[0].Date != "2026-11-01" || detail.Daily[1].Date != "2026-11-02" {
		t.Fatalf("daily = %+v", detail.Daily)
	}
}

func TestFormatMilliTonne(t *testing.T) {
	for _, tc := range []struct {
		value int64
		want  string
	}{
		{0, "0.000"}, {1, "0.001"}, {1500, "1.500"}, {-1500, "-1.500"}, {123456789, "123456.789"},
	} {
		if got := FormatMilliTonne(tc.value); got != tc.want {
			t.Fatalf("FormatMilliTonne(%d) = %q, want %q", tc.value, got, tc.want)
		}
	}
}

func TestStatementCSVIncludesBOMAndTotals(t *testing.T) {
	at := time.Date(2026, 11, 1, 2, 0, 0, 0, time.UTC)
	parties := []StatementParty{{SiteCode: "F001", SiteName: "一厂", PartyCode: "P1", PartyName: "客户甲", FirstIssuedAt: at, LastIssuedAt: at}}
	parties[0].StatementTotals.add(30000, 10000, 1000, 19000)
	summary := StatementPageSummary{PartyCount: 1}
	summary.TicketCount = 1
	summary.GrossMilliTonne = 30000
	summary.TareMilliTonne = 10000
	summary.NetAdjustmentMilliTonne = 1000
	summary.NetMilliTonne = 19000
	data, err := statementSummaryCSV(parties, summary, "outbound")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(string(data), "\xef\xbb\xbf") || !strings.Contains(string(data), "合计") || !strings.Contains(string(data), "19.000") {
		t.Fatalf("csv = %q", string(data))
	}
}
