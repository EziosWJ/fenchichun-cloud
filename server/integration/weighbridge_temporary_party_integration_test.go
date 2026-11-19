//go:build integration

package integration

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"strings"
	"sync"
	"testing"
	"time"

	"fenchichun.local/server/internal/audit"
	"fenchichun.local/server/internal/auth"
	"fenchichun.local/server/internal/weighbridge"
	"github.com/gin-gonic/gin"
)

func TestPostgresWeighbridgeTemporaryParty(t *testing.T) {
	if _, err := exec.LookPath("docker"); err != nil {
		t.Skip("Docker is required")
	}
	tmp := startMigratedPostgres(t)
	db := openTemporaryDatabase(t, tmp.dsn)
	defer db.Close()
	ctx := context.Background()
	repo := weighbridge.NewRepository(db.GORM)
	event := audit.Event{Action: "save", Resource: "weighbridge", Metadata: audit.Metadata{ActorID: 1}}
	for _, code := range []string{"TP-A", "TP-B"} {
		if _, err := repo.CreateSite(ctx, weighbridge.SiteInput{Code: code, Name: code + "厂"}, event); err != nil {
			t.Fatal(err)
		}
	}
	formal, err := repo.SaveParty(ctx, "", weighbridge.PartyInput{
		Name: "正式供货方", Nature: "enterprise", IsSupplier: true, Enabled: true,
	}, event)
	if err != nil {
		t.Fatal(err)
	}

	router := gin.New()
	api := router.Group("/api/v1")
	h := weighbridge.NewHandler(weighbridge.NewService(repo))
	weighbridge.RegisterRoutes(api, h)
	management := api.Group("")
	management.Use(func(c *gin.Context) {
		actor := int64(1)
		if c.Request.Header.Get("X-Test-Unprivileged") == "1" {
			actor = 99999
		}
		c.Request = c.Request.WithContext(auth.ContextWithPrincipal(c.Request.Context(), auth.Principal{UserID: actor}))
		c.Next()
	})
	weighbridge.RegisterManagementRoutes(management, h)
	request := func(method, path string, input any, unprivileged bool) *httptest.ResponseRecorder {
		body, err := json.Marshal(input)
		if err != nil {
			panic(err)
		}
		req := httptest.NewRequest(method, "/api/v1/weighbridge"+path, bytes.NewReader(body))
		if unprivileged {
			req.Header.Set("X-Test-Unprivileged", "1")
		}
		out := httptest.NewRecorder()
		router.ServeHTTP(out, req)
		return out
	}
	expect := func(out *httptest.ResponseRecorder, status int, text string) {
		t.Helper()
		if out.Code != status || !strings.Contains(out.Body.String(), text) {
			t.Fatalf("expected HTTP %d %q, got %d %s", status, text, out.Code, out.Body.String())
		}
	}

	const code = "T-P-550e8400-e29b-41d4-a716-446655440000"
	const registerPath = "/sync/temporary-parties"
	const managementPath = "/master/temporary-parties"
	issuedAt := time.Date(2026, 11, 10, 4, 0, 0, 0, time.UTC)
	for i := range 6 {
		siteCode, partyCode, name := "TP-A", code, "开单时临时名"
		if i >= 3 && i <= 4 {
			partyCode, name = formal.Code, formal.Name
		}
		if i == 5 {
			siteCode = "TP-B"
		}
		ticket := statementTicket(siteCode, fmt.Sprintf("%s-T%d", siteCode, i), fmt.Sprintf("temp-change-%d", i),
			"inbound", partyCode, name, "M1", "高粱", 30000, 10000, 0, issuedAt.Add(time.Duration(i)*time.Minute))
		if _, err := repo.ApplyChange(ctx, ticket); err != nil {
			t.Fatal(err)
		}
	}
	ticketPath := "/tickets?siteCode=TP-A&direction=inbound&partyCode="
	expect(request(http.MethodGet, ticketPath+code, nil, false), 200, `"total":3`)
	expect(request(http.MethodGet, ticketPath+formal.Code, nil, false), 200, `"total":2`)

	yes, no := true, false
	upload := weighbridge.TemporaryPartyInput{
		SchemaVersion: 1, SiteCode: "TP-A", TemporaryCode: code, Version: 1,
		Name: "临时供货方", Nature: "individual", IsSupplier: &yes, IsCustomer: &no, IsCarrier: &no,
	}
	invalid := upload
	invalid.IsCarrier = nil
	expect(request(http.MethodPost, registerPath, invalid, false), 400, `"kind":"invalid"`)
	invalid = upload
	invalid.SiteCode = "UNKNOWN"
	expect(request(http.MethodPost, registerPath, invalid, false), 401, `"kind":"invalid_site"`)

	const attempts = 8
	var wg sync.WaitGroup
	responses := make(chan *httptest.ResponseRecorder, attempts)
	for range attempts {
		wg.Go(func() { responses <- request(http.MethodPost, registerPath, upload, false) })
	}
	wg.Wait()
	close(responses)
	for response := range responses {
		expect(response, 200, `"version":1,"status":"pending"`)
	}
	rows, err := repo.TemporaryParties(ctx, 1)
	if err != nil || len(rows) != 1 || rows[0].SiteCode != "TP-A" || rows[0].SiteName != "TP-A厂" {
		t.Fatalf("idempotent registration: %+v, %v", rows, err)
	}
	decisionPath := fmt.Sprintf("%s/%d/decision", managementPath, rows[0].ID)
	merge := weighbridge.TemporaryPartyDecision{Version: 1, Status: "merged", FormalPartyCode: formal.Code}
	expect(request(http.MethodGet, managementPath, nil, true), 403, "无权维护总部往来主体")
	expect(request(http.MethodPost, decisionPath, merge, true), 403, "无权维护总部往来主体")
	expect(request(http.MethodPost, decisionPath, weighbridge.TemporaryPartyDecision{
		Version: 1, Status: "needs_info", Reason: "请补充身份依据",
	}, false), 200, `"code":200`)
	expect(request(http.MethodPost, registerPath, upload, false), 200, `"status":"needs_info"`)
	expect(request(http.MethodGet, "/sync/master?siteCode=TP-A", nil, false), 200, `"temporaryPartyResults":[]`)

	corrected := upload
	corrected.Version = 2
	corrected.Name = "更正登记名称"
	corrected.IsCustomer = &yes
	expect(request(http.MethodPost, registerPath, corrected, false), 200, `"version":2,"status":"pending"`)
	expect(request(http.MethodPost, registerPath, upload, false), 200, `"version":2,"status":"pending"`)
	different := corrected
	different.Name = "同版本不同内容"
	expect(request(http.MethodPost, registerPath, different, false), 409, `"kind":"version_conflict"`)
	expect(request(http.MethodPost, decisionPath, merge, false), 409, "登记资料已更新")
	merge.Version = 2
	expect(request(http.MethodPost, decisionPath, merge, false), 400, "覆盖临时主体的业务身份")

	other := upload
	other.SiteCode = "TP-B"
	expect(request(http.MethodPost, registerPath, other, false), 200, `"status":"pending"`)
	if _, err := repo.SaveParty(ctx, formal.Code, weighbridge.PartyInput{
		Name: formal.Name, Nature: "enterprise", IsSupplier: true, IsCustomer: true, Enabled: true,
	}, event); err != nil {
		t.Fatal(err)
	}
	expect(request(http.MethodPost, decisionPath, merge, false), 200, `"code":200`)
	expect(request(http.MethodPost, decisionPath, merge, false), 409, "已归并或停用")
	expect(request(http.MethodPost, registerPath, corrected, false), 200, `"version":2,"status":"merged"`)
	newer := corrected
	newer.Version++
	expect(request(http.MethodPost, registerPath, newer, false), 409, `"kind":"finalized"`)

	type snapshotEnvelope struct {
		Data weighbridge.MasterSnapshot
	}
	for _, siteCode := range []string{"TP-A", "TP-B"} {
		out := request(http.MethodGet, "/sync/master?siteCode="+siteCode, nil, false)
		expect(out, 200, formal.Code)
		var envelope snapshotEnvelope
		if err := json.Unmarshal(out.Body.Bytes(), &envelope); err != nil {
			t.Fatal(err)
		}
		results := envelope.Data.TemporaryPartyResults
		if envelope.Data.SchemaVersion != 2 || results == nil {
			t.Fatalf("invalid master version or array: %s", out.Body.String())
		}
		if siteCode == "TP-B" {
			if len(results) != 0 {
				t.Fatalf("another site's result leaked: %+v", results)
			}
		} else if len(results) != 1 || results[0].TemporaryCode != code || results[0].Version != 2 || results[0].Status != "merged" ||
			results[0].FormalPartyCode == nil || *results[0].FormalPartyCode != formal.Code {
			t.Fatalf("expected merge result, got %+v", results)
		}
	}

	expect(request(http.MethodGet, ticketPath+formal.Code, nil, false), 200, `"total":5`)
	expect(request(http.MethodGet, ticketPath+formal.Code, nil, false), 200, `"partyName":"开单时临时名"`)
	expect(request(http.MethodGet, "/tickets?siteCode=TP-B&partyCode="+code, nil, false), 200, `"total":1`)
	detailPath := "/statements/parties/detail"
	params := "?direction=inbound&siteCode=TP-A&partyCode=" + formal.Code
	expect(request(http.MethodGet, "/statements/parties?direction=inbound&keyword="+formal.Code, nil, false), 200, `"ticketCount":5`)
	expect(request(http.MethodGet, detailPath+params, nil, false), 200, `"ticketCount":5`)
	expect(request(http.MethodGet, "/ticket-totals?siteCode=TP-A&direction=inbound", nil, false), 200, `"count":5`)
	partyRows, count, err := repo.AnalyticsPartyRows(ctx, weighbridge.AnalyticsQuery{
		SiteCode: "TP-A", Page: 1, PageSize: 10, PartyCode: formal.Code,
	})
	if err != nil || count != 1 || len(partyRows) != 1 || partyRows[0].TicketCount != 5 {
		t.Fatalf("party analytics: %+v, count %d, %v", partyRows, count, err)
	}
	export := request(http.MethodGet, detailPath+"/export"+params, nil, false)
	expect(export, 200, "开单时临时名")
	lines, err := csv.NewReader(strings.NewReader(strings.TrimPrefix(export.Body.String(), "\ufeff"))).ReadAll()
	if err != nil || len(lines) != 7 {
		t.Fatalf("expected headings, five tickets and totals, got %+v, %v", lines, err)
	}
	if lines[1][2] != code || lines[1][3] != "开单时临时名" || lines[6][2] != formal.Code || lines[6][15] != "100.000" {
		t.Fatalf("unexpected export data: %+v", lines)
	}
	rows, err = repo.TemporaryParties(ctx, 1)
	if err != nil || len(rows) != 2 {
		t.Fatalf("management rows: %+v, %v", rows, err)
	}
	for _, row := range rows {
		if row.SiteCode == "TP-A" && (row.ProcessedAt == nil || row.ProcessedBy == nil || *row.ProcessedBy != 1) {
			t.Fatalf("missing merge audit metadata: %+v", row)
		}
		if row.SiteCode == "TP-B" {
			disablePath := fmt.Sprintf("%s/%d/decision", managementPath, row.ID)
			expect(request(http.MethodPost, disablePath, weighbridge.TemporaryPartyDecision{Version: 1, Status: "disabled"}, false), 200, `"code":200`)
		}
	}
	expect(request(http.MethodGet, "/sync/master?siteCode=TP-B", nil, false), 200, `"status":"disabled","formalPartyCode":null`)
	expect(request(http.MethodGet, "/tickets?siteCode=TP-B&partyCode="+code, nil, false), 200, `"total":1`)

	if _, err := repo.SaveParty(ctx, formal.Code, weighbridge.PartyInput{
		Name: formal.Name, Nature: "enterprise", IsSupplier: true, IsCustomer: true, Enabled: false,
	}, event); err != nil {
		t.Fatal(err)
	}
	snapshot, err := repo.MasterSnapshot(ctx, "TP-A")
	if err != nil || len(snapshot.TemporaryPartyResults) != 1 || snapshot.TemporaryPartyResults[0].Status != "merged" {
		t.Fatalf("disabling the formal party changed the merge result: %+v, %v", snapshot.TemporaryPartyResults, err)
	}
	expect(request(http.MethodGet, detailPath+params, nil, false), 200, `"ticketCount":5`)

	if err := repo.UpdateSite(ctx, "TP-A", weighbridge.SiteInput{Code: "TP-RENAMED", Name: "更名厂"}, event); err != nil {
		t.Fatal(err)
	}
	expect(request(http.MethodPost, registerPath, corrected, false), 401, `"kind":"invalid_site"`)
	expect(request(http.MethodGet, "/sync/master?siteCode=TP-RENAMED", nil, false), 200, `"status":"merged"`)
	expect(request(http.MethodGet, "/tickets?siteCode=TP-RENAMED&partyCode="+formal.Code, nil, false), 200, `"total":5`)
}
