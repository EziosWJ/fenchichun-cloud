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

func TestPostgresWeighbridgeAnalyticsMaterialInsights(t *testing.T) {
	if _, err := exec.LookPath("docker"); err != nil {
		t.Skip("Docker is required")
	}
	tmp := startMigratedPostgres(t)
	db := openTemporaryDatabase(t, tmp.dsn)
	defer db.Close()
	ctx := context.Background()
	repo := weighbridge.NewRepository(db.GORM)
	event := audit.Event{Action: "save", Resource: "weighbridge-site", Metadata: audit.Metadata{ActorID: 1}}
	if _, err := repo.CreateSite(ctx, weighbridge.SiteInput{Code: "A", Name: "甲厂"}, event); err != nil {
		t.Fatal(err)
	}
	first := time.Date(2026, 11, 1, 2, 0, 0, 0, time.UTC)
	second := time.Date(2026, 11, 2, 2, 0, 0, 0, time.UTC)
	issues := []weighbridge.Change{
		statementTicket("A", "SQ-1", "Q1", "inbound", "P1", "供应商甲", "C-M-0010", "高粱", 30000, 10000, 600, first),
		statementTicket("A", "SQ-2", "Q2", "inbound", "P1", "供应商甲", "C-M-0010", "高粱", 20000, 5000, 300, second),
		statementTicket("A", "SQ-3", "Q3", "inbound", "P2", "供应商乙", "C-M-0007", "大麦", 40000, 10000, 1200, first),
		statementTicket("A", "SQ-4", "Q4", "inbound", "P2", "供应商乙", "C-M-0009", "谷糠", 10000, 2000, 100, second),
		statementTicket("A", "BY-1", "B1", "outbound", "P4", "客户甲", "C-M-0006", "酒糟", 20000, 10000, 0, first),
		statementTicket("A", "BY-2", "B2", "outbound", "P5", "客户乙", "C-M-0006", "酒糟", 15000, 5000, 0, second),
	}
	for _, issue := range issues {
		if _, err := repo.ApplyChange(ctx, issue); err != nil {
			t.Fatalf("issue %s: %v", issue.TicketNo, err)
		}
	}
	from := first
	until := second.AddDate(0, 0, 1)
	q := weighbridge.AnalyticsQuery{From: from, Until: until, Granularity: "day", Compare: "previous", TopN: 10, Page: 1, PageSize: 20}

	supplier, err := repo.AnalyticsSupplierQualitySummary(ctx, q)
	if err != nil {
		t.Fatal(err)
	}
	if supplier.SupplierCount != 2 || supplier.TicketCount != 4 || supplier.SampleCount != 4 || supplier.AdjustedTickets != 4 {
		t.Fatalf("supplier summary = %+v", supplier)
	}
	if supplier.TotalAdjustmentMilliTonne != 2200 || supplier.TotalPreAdjustmentNetMilliTonne != 73000 {
		t.Fatalf("supplier totals = %+v", supplier)
	}
	rows, total, err := repo.AnalyticsSupplierQualityRows(ctx, q)
	if err != nil {
		t.Fatal(err)
	}
	if total != 2 || len(rows) != 2 {
		t.Fatalf("supplier rows total=%d rows=%+v", total, rows)
	}

	byproduct, err := repo.AnalyticsByproductSummary(ctx, q)
	if err != nil {
		t.Fatal(err)
	}
	if byproduct.ActiveCustomers != 2 || byproduct.TicketCount != 2 || byproduct.TotalNetMilliTonne != 20000 || byproduct.MaterialCount != 1 {
		t.Fatalf("byproduct summary = %+v", byproduct)
	}
	byproductRows, byproductTotal, err := repo.AnalyticsByproductRows(ctx, q)
	if err != nil {
		t.Fatal(err)
	}
	if byproductTotal != 2 || len(byproductRows) != 2 {
		t.Fatalf("byproduct rows total=%d rows=%+v", byproductTotal, byproductRows)
	}
	materials, err := repo.AnalyticsByproductMaterials(ctx, q)
	if err != nil || len(materials) != 1 || materials[0].MaterialCode != "C-M-0006" || materials[0].NetMilliTonne != 20000 {
		t.Fatalf("byproduct materials = %+v, %v", materials, err)
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
	response := serve("/api/v1/weighbridge/analytics/materials/supplier-quality?from=2026-11-01&to=2026-11-30")
	if response.Code != 200 || !strings.Contains(response.Body.String(), `"supplierCount":2`) || !strings.Contains(response.Body.String(), `"weightedRateBp":301`) {
		t.Fatalf("HTTP supplier quality: %d %s", response.Code, response.Body.String())
	}
	response = serve("/api/v1/weighbridge/analytics/materials/byproduct-flow?from=2026-11-01&to=2026-11-30")
	if response.Code != 200 || !strings.Contains(response.Body.String(), `"activeCustomers":2`) || !strings.Contains(response.Body.String(), `"totalNetMilliTonne":20000`) {
		t.Fatalf("HTTP byproduct flow: %d %s", response.Code, response.Body.String())
	}
}
