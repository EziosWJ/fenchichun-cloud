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

func statementTicket(site, ticketNo, changeID, direction, partyCode, partyName, materialCode, materialName string, gross, tare, adjustment int64, issuedAt time.Time) weighbridge.Change {
	return weighbridge.Change{
		SchemaVersion: 3, ChangeID: changeID, SiteCode: site, TicketNo: ticketNo, Type: "issue",
		Ticket: &weighbridge.TicketSnapshot{
			TicketNo: ticketNo, Title: "酒厂过磅单", Plate: "晋A12345", Direction: direction,
			MaterialCode: materialCode, MaterialName: materialName, MaterialSpec: "散装",
			PartyCode: partyCode, PartyName: partyName,
			FirstConfirmedAt: issuedAt, SecondConfirmedAt: issuedAt, IssuedAt: issuedAt, IssuerName: "操作员",
			OriginalGross: weighbridge.FormatMilliTonne(gross), OriginalTare: weighbridge.FormatMilliTonne(tare),
			FinalGross: weighbridge.FormatMilliTonne(gross), FinalTare: weighbridge.FormatMilliTonne(tare),
			FinalNet:      weighbridge.FormatMilliTonne(gross - tare - adjustment),
			NetAdjustment: weighbridge.FormatMilliTonne(adjustment), NetAdjustmentMode: "amount",
			NetAdjustmentCategory: "QUALITY", NetAdjustmentCategoryName: "质量差",
		},
	}
}

func TestPostgresWeighbridgeStatementAggregation(t *testing.T) {
	if _, err := exec.LookPath("docker"); err != nil {
		t.Skip("Docker is required")
	}
	tmp := startMigratedPostgres(t)
	db := openTemporaryDatabase(t, tmp.dsn)
	defer db.Close()
	ctx := context.Background()
	repo := weighbridge.NewRepository(db.GORM)
	event := audit.Event{Action: "save", Resource: "weighbridge-site", Metadata: audit.Metadata{ActorID: 1}}
	var statementMenu struct {
		Path           string
		Component      string
		PermissionCode string
	}
	if err := db.GORM.Table("sys_menu").Select("path, component, permission_code").Where("permission_code = ?", "weighbridge:analytics:statement").Take(&statementMenu).Error; err != nil {
		t.Fatalf("statement menu seed: %v", err)
	}
	if statementMenu.Path != "/analytics/reconciliation" || statementMenu.Component != "weighbridge/analytics/statement/index" {
		t.Fatalf("statement menu = %+v", statementMenu)
	}
	var adminMenus int64
	if err := db.GORM.Table("sys_role_menu rm").Joins("JOIN sys_role r ON r.id = rm.role_id").Joins("JOIN sys_menu m ON m.id = rm.menu_id").Where("r.role_code = 'ADMIN' AND r.deleted = 0 AND m.permission_code = ?", "weighbridge:analytics:statement").Count(&adminMenus).Error; err != nil || adminMenus != 1 {
		t.Fatalf("statement menu ADMIN assignment = %d, %v", adminMenus, err)
	}
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
		statementTicket("A", "A-3", "C3", "outbound", "P1", "客户甲", "M2", "大麦", 10000, 1000, 0, second.Add(time.Hour)),
		statementTicket("A", "A-4", "C4", "outbound", "P3", "作废客户", "M1", "高粱", 5000, 1000, 0, first),
		statementTicket("A", "A-5", "C5", "inbound", "P2", "供应商乙", "M1", "高粱", 40000, 10000, 2000, first),
		statementTicket("B", "B-1", "C6", "outbound", "P1", "客户甲", "M1", "高粱", 25000, 5000, 0, first),
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

	page, err := repo.StatementParties(ctx, weighbridge.StatementQuery{
		Page: 1, PageSize: 10, Direction: "outbound", PartyKeyword: "",
	})
	if err != nil {
		t.Fatal(err)
	}
	if page.Total != 2 || page.Summary.PartyCount != 2 || page.Summary.TicketCount != 4 || page.Summary.NetMilliTonne != 62500 {
		t.Fatalf("outbound page = %+v", page)
	}
	if len(page.Records) != 2 || page.Records[0].SiteCode != "A" || page.Records[0].NetMilliTonne != 42500 || page.Records[1].SiteCode != "B" || page.Records[1].NetMilliTonne != 20000 {
		t.Fatalf("outbound records = %+v", page.Records)
	}
	if page.Records[0].GrossMilliTonne != 60000 || page.Records[0].TareMilliTonne != 16000 || page.Records[0].NetAdjustmentMilliTonne != 1500 {
		t.Fatalf("outbound weights = %+v", page.Records[0])
	}

	until := second.AddDate(0, 0, 1)
	detail, err := repo.StatementDetail(ctx, weighbridge.StatementQuery{
		SiteCode: "A", PartyCode: "P1", Direction: "outbound", From: &first, Until: &until,
	})
	if err != nil {
		t.Fatal(err)
	}
	if detail.SiteName != "甲厂" || detail.PartyName != "客户甲" || detail.TicketCount != 3 || detail.NetMilliTonne != 42500 {
		t.Fatalf("detail = %+v", detail)
	}
	if len(detail.Materials) != 2 || detail.Materials[0].MaterialCode != "M1" || detail.Materials[0].NetMilliTonne != 33500 {
		t.Fatalf("detail materials = %+v", detail.Materials)
	}
	if len(detail.Daily) != 2 || detail.Daily[0].Date != "2026-11-01" || detail.Daily[1].Date != "2026-11-02" {
		t.Fatalf("detail daily = %+v", detail.Daily)
	}

	inbound, err := repo.StatementParties(ctx, weighbridge.StatementQuery{Page: 1, PageSize: 10, Direction: "inbound"})
	if err != nil || inbound.Total != 1 || inbound.Records[0].PartyCode != "P2" || inbound.Records[0].NetMilliTonne != 28000 {
		t.Fatalf("inbound = %+v, %v", inbound, err)
	}
	filtered, err := repo.StatementParties(ctx, weighbridge.StatementQuery{Page: 1, PageSize: 10, Direction: "outbound", PartyKeyword: "客户甲"})
	if err != nil || filtered.Total != 2 {
		t.Fatalf("keyword = %+v, %v", filtered, err)
	}

	tickets, err := repo.StatementTickets(ctx, weighbridge.StatementQuery{
		SiteCode: "A", PartyCode: "P1", Direction: "outbound", From: &first, Until: &until,
	})
	if err != nil || len(tickets) != 3 || tickets[0].TicketNo != "A-1" || tickets[2].TicketNo != "A-3" {
		t.Fatalf("tickets = %+v, %v", tickets, err)
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
	response := serve("/api/v1/weighbridge/statements/parties?direction=outbound&from=2026-11-01&to=2026-11-30&page=1&pageSize=10")
	if response.Code != 200 || !strings.Contains(response.Body.String(), `"partyCount":2`) || !strings.Contains(response.Body.String(), `"netMilliTonne":62500`) {
		t.Fatalf("HTTP parties: %d %s", response.Code, response.Body.String())
	}
	response = serve("/api/v1/weighbridge/statements/parties/detail?direction=outbound&siteCode=A&partyCode=P1&from=2026-11-01&to=2026-11-30")
	if response.Code != 200 || !strings.Contains(response.Body.String(), `"materialCode":"M1"`) || !strings.Contains(response.Body.String(), `"date":"2026-11-01"`) {
		t.Fatalf("HTTP detail: %d %s", response.Code, response.Body.String())
	}
	response = serve("/api/v1/weighbridge/statements/parties/export?direction=outbound&from=2026-11-01&to=2026-11-30")
	if response.Code != 200 || !strings.HasPrefix(response.Body.String(), "\xef\xbb\xbf") || !strings.Contains(response.Header().Get("Content-Type"), "text/csv") || !strings.Contains(response.Body.String(), "合计") {
		t.Fatalf("HTTP export: %d %s %s", response.Code, response.Header().Get("Content-Type"), response.Body.String())
	}
	response = serve("/api/v1/weighbridge/statements/parties?direction=unknown")
	if response.Code != 400 {
		t.Fatalf("invalid direction: %d %s", response.Code, response.Body.String())
	}
	response = serve("/api/v1/weighbridge/statements/parties?direction=outbound&pageSize=1")
	if response.Code != 200 || !strings.Contains(response.Body.String(), `"code":200`) {
		t.Fatalf("HTTP envelope: %d %s", response.Code, response.Body.String())
	}
}
