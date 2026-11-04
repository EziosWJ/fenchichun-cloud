//go:build integration

package integration

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"strings"
	"testing"
	"time"

	"fenchichun.local/server/internal/audit"
	"fenchichun.local/server/internal/auth"
	"fenchichun.local/server/internal/weighbridge"
	"github.com/gin-gonic/gin"
)

func TestPostgresWeighbridgeAnalyticsReadModel(t *testing.T) {
	if _, err := exec.LookPath("docker"); err != nil {
		t.Skip("Docker is required")
	}
	tmp := startMigratedPostgres(t)
	db := openTemporaryDatabase(t, tmp.dsn)
	defer db.Close()
	ctx := context.Background()
	repo := weighbridge.NewRepository(db.GORM)
	event := audit.Event{Action: "save", Resource: "weighbridge-site", Metadata: audit.Metadata{ActorID: 1}}
	for _, site := range []weighbridge.SiteInput{{Code: "A", Name: "甲厂"}, {Code: "B", Name: "乙厂"}} {
		if _, err := repo.CreateSite(ctx, site, event); err != nil {
			t.Fatal(err)
		}
	}

	first := time.Date(2026, 11, 1, 2, 0, 0, 0, time.UTC)
	second := time.Date(2026, 11, 2, 2, 0, 0, 0, time.UTC)
	issues := []weighbridge.Change{
		statementTicket("A", "A-1", "C1", "outbound", "P1", "客户甲", "M1", "高粱", 30000, 10000, 1000, first),
		statementTicket("A", "A-2", "C2", "outbound", "P1", "客户甲", "M1", "高粱", 20000, 5000, 500, second),
		statementTicket("A", "A-3", "C3", "inbound", "P2", "供应商乙", "M2", "大麦", 40000, 10000, 2000, first),
		statementTicket("B", "B-1", "C4", "outbound", "P1", "客户甲", "M1", "高粱", 25000, 5000, 0, first),
		statementTicket("A", "A-4", "C5", "inbound", "P3", "作废供应商", "M2", "大麦", 5000, 1000, 0, first),
	}
	for _, issue := range issues {
		if _, err := repo.ApplyChange(ctx, issue); err != nil {
			t.Fatalf("issue %s: %v", issue.TicketNo, err)
		}
	}
	if _, err := repo.ApplyChange(ctx, weighbridge.Change{
		SchemaVersion: 3, ChangeID: "V1", SiteCode: "A", TicketNo: "A-4", Type: "void",
		Void: &weighbridge.VoidInfo{Reason: "更正", Actor: "操作员", At: second},
	}); err != nil {
		t.Fatal(err)
	}

	from := first
	until := second.AddDate(0, 0, 1)
	q := weighbridge.AnalyticsQuery{From: from, Until: until, Granularity: "day", Compare: "previous", TopN: 10, Page: 1, PageSize: 20}
	summary, err := repo.AnalyticsSummary(ctx, q)
	if err != nil {
		t.Fatal(err)
	}
	if summary.ValidTickets != 4 || summary.InboundTickets != 1 || summary.OutboundTickets != 3 || summary.VoidTickets != 1 {
		t.Fatalf("summary = %+v", summary)
	}
	if summary.InboundNetMilliTonne != 28000 || summary.OutboundNetMilliTonne != 53500 {
		t.Fatalf("summary net = %+v", summary)
	}

	trend, err := repo.AnalyticsTrend(ctx, q)
	if err != nil {
		t.Fatal(err)
	}
	if len(trend) != 2 {
		t.Fatalf("trend = %+v", trend)
	}

	materials, total, err := repo.AnalyticsMaterialRows(ctx, q)
	if err != nil {
		t.Fatal(err)
	}
	if total != 2 || len(materials) != 2 {
		t.Fatalf("materials total=%d rows=%+v", total, materials)
	}

	partyQ := q
	partyQ.Direction = "outbound"
	parties, partyTotal, err := repo.AnalyticsPartyRows(ctx, partyQ)
	if err != nil {
		t.Fatal(err)
	}
	if partyTotal != 1 || len(parties) != 1 || parties[0].PartyCode != "P1" || parties[0].NetMilliTonne != 53500 {
		t.Fatalf("parties total=%d rows=%+v", partyTotal, parties)
	}

	newQ := q
	newQ.From = second
	newQ.Until = until
	newCount, err := repo.AnalyticsPartyNewCount(ctx, newQ)
	if err != nil || newCount != 0 {
		t.Fatalf("new party count = %d, %v", newCount, err)
	}

	quality, err := repo.AnalyticsQualitySummary(ctx, q)
	if err != nil {
		t.Fatal(err)
	}
	if quality.TotalTickets != 5 || quality.ValidTickets != 4 || quality.VoidTickets != 1 || quality.AdjustedTickets != 3 {
		t.Fatalf("quality = %+v", quality)
	}

	freshness, err := repo.AnalyticsFreshness(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if freshness.DataThrough == nil || freshness.HistoryStart == nil {
		t.Fatalf("freshness = %+v", freshness)
	}

	router := gin.New()
	authenticated := router.Group("/api/v1")
	authenticated.Use(func(c *gin.Context) {
		ctx := auth.ContextWithPrincipal(c.Request.Context(), auth.Principal{UserID: 1})
		c.Request = c.Request.WithContext(ctx)
		c.Next()
	})
	weighbridge.RegisterManagementRoutes(authenticated, weighbridge.NewHandler(weighbridge.NewService(repo)))
	serve := func(path string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, path, nil)
		router.ServeHTTP(w, req)
		return w
	}
	response := serve("/api/v1/weighbridge/analytics/overview?from=2026-11-01&to=2026-11-30")
	if response.Code != 200 || !strings.Contains(response.Body.String(), `"validTickets":4`) || !strings.Contains(response.Body.String(), `"netFlowMilliTonne":-25500`) {
		t.Fatalf("HTTP overview: %d %s", response.Code, response.Body.String())
	}
	response = serve("/api/v1/weighbridge/analytics/parties?direction=outbound&from=2026-11-01&to=2026-11-30")
	if response.Code != 200 || !strings.Contains(response.Body.String(), `"partyCode":"P1"`) || !strings.Contains(response.Body.String(), `"netMilliTonne":53500`) {
		t.Fatalf("HTTP parties: %d %s", response.Code, response.Body.String())
	}
}
