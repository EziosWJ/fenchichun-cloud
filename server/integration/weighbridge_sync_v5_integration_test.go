//go:build integration

package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"testing"
	"time"

	"fenchichun.local/server/internal/audit"
	"fenchichun.local/server/internal/weighbridge"
	"github.com/gin-gonic/gin"
)

func v5Rate(value int) *int { return &value }

func v5Items() []weighbridge.NetAdjustmentItem {
	return []weighbridge.NetAdjustmentItem{
		{Mode: "percent", Amount: "0.2", RateBP: v5Rate(100), Category: "WATER", CategoryName: "水分大", Remark: "水分大"},
		{Mode: "amount", Amount: "0.5", Category: "IMPURITY", CategoryName: "杂质多"},
	}
}

func v5Ticket(number string) *weighbridge.TicketSnapshot {
	now := time.Date(2026, 11, 7, 1, 0, 0, 0, time.UTC)
	items := v5Items()
	return &weighbridge.TicketSnapshot{
		TicketNo: number, Title: "酒厂过磅单", Plate: "晋A12345", Direction: "inbound",
		MaterialCode: "C-M-0001", MaterialName: "高粱", PartyCode: "C-P-0001", PartyName: "供货方",
		FirstConfirmedAt: now, SecondConfirmedAt: now.Add(10 * time.Minute), IssuedAt: now.Add(11 * time.Minute), IssuerName: "操作员",
		OriginalGross: "30", OriginalTare: "10", FinalGross: "30", FinalTare: "10",
		FinalNet: "19.3", NetAdjustment: "0.7", NetAdjustments: &items,
		GrossSource: "collected", TareSource: "collected",
		Driver: "测试司机", DriverPhone: "13800000000",
	}
}

func v5Issue(site, number, digest string) weighbridge.ChangeV5 {
	return weighbridge.ChangeV5{SchemaVersion: weighbridge.SyncSchemaVersionV5, DigestVersion: weighbridge.SyncDigestVersion3, Digest: digest, SiteCode: site, TicketNo: number, Type: "issue", Ticket: v5Ticket(number)}
}

func v5Void(site, number, digest string) weighbridge.ChangeV5 {
	return weighbridge.ChangeV5{SchemaVersion: weighbridge.SyncSchemaVersionV5, DigestVersion: weighbridge.SyncDigestVersion3, Digest: digest, SiteCode: site, TicketNo: number, Type: "void", Ticket: v5Ticket(number), Void: &weighbridge.VoidInfo{Reason: "更正", Actor: "操作员", At: time.Date(2026, 11, 7, 2, 0, 0, 0, time.UTC)}}
}

func v5Reopen(site, number, previousSite, previousNumber, digest string) weighbridge.ChangeV5 {
	now := time.Date(2026, 11, 7, 3, 0, 0, 0, time.UTC)
	items := []weighbridge.NetAdjustmentItem{{Mode: "amount", Amount: "-0.5", Category: "WATER", CategoryName: "水分大"}}
	previous := previousNumber
	return weighbridge.ChangeV5{
		SchemaVersion: weighbridge.SyncSchemaVersionV5, DigestVersion: weighbridge.SyncDigestVersion3,
		Digest: digest, SiteCode: site, TicketNo: number, Type: "reopen", PreviousSiteCode: previousSite,
		Ticket: &weighbridge.TicketSnapshot{
			TicketNo: number, PreviousTicketNo: &previous, Title: "酒厂过磅单", Plate: "晋A12345", Direction: "inbound",
			MaterialCode: "C-M-0001", MaterialName: "高粱", PartyCode: "C-P-0001", PartyName: "供货方",
			FirstConfirmedAt: now, SecondConfirmedAt: now.Add(10 * time.Minute), IssuedAt: now.Add(11 * time.Minute), IssuerName: "操作员",
			OriginalGross: "30", OriginalTare: "10", FinalGross: "30", FinalTare: "10",
			FinalNet: "20.5", NetAdjustment: "-0.5", NetAdjustments: &items,
			PreviousFinalGross: strPtrV5("30"), PreviousFinalTare: strPtrV5("10"), PreviousFinalNet: strPtrV5("19.3"), PreviousNetAdjustment: strPtrV5("0.7"),
			GrossSource: "collected", TareSource: "collected",
		},
	}
}

func strPtrV5(value string) *string { return &value }

func TestPostgresWeighbridgeSyncV5(t *testing.T) {
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

	issue := v5Issue("A", "V1", syncDigest(101))
	first, err := repo.ApplyChangeV5(ctx, issue)
	if err != nil || first.Duplicate || first.Digest != syncDigest(101) || first.TicketNo != "V1" {
		t.Fatalf("v5 issue receipt = %+v, %v", first, err)
	}
	duplicate, err := repo.ApplyChangeV5(ctx, issue)
	if err != nil || !duplicate.Duplicate {
		t.Fatalf("duplicate v5 issue = %+v, %v", duplicate, err)
	}
	if delta := duplicate.ReceivedAt.Sub(first.ReceivedAt); delta > time.Millisecond || delta < -time.Millisecond {
		t.Fatalf("duplicate receivedAt = %v, first = %v", duplicate.ReceivedAt, first.ReceivedAt)
	}
	reconciled, err := repo.ReconcileTicket(ctx, "A", "V1")
	if err != nil || !reconciled.Found || reconciled.Ticket == nil || reconciled.Ticket.NetAdjustments == nil || len(*reconciled.Ticket.NetAdjustments) != 2 {
		t.Fatalf("v5 reconcile = %+v, %v", reconciled, err)
	}
	if items := *reconciled.Ticket.NetAdjustments; items[0].Category != "WATER" || items[1].Category != "IMPURITY" || items[1].RateBP != nil {
		t.Fatalf("detail order or values changed: %+v", items)
	}
	if reconciled.Ticket.FinalNet != "19.3" || reconciled.Ticket.NetAdjustment != "0.7" {
		t.Fatalf("v5 totals = %+v", reconciled.Ticket)
	}

	empty := v5Issue("A", "V2", syncDigest(102))
	emptyItems := []weighbridge.NetAdjustmentItem{}
	empty.Ticket.NetAdjustments = &emptyItems
	empty.Ticket.NetAdjustment = "0"
	empty.Ticket.FinalNet = "20"
	if _, err := repo.ApplyChangeV5(ctx, empty); err != nil {
		t.Fatalf("empty detail array: %v", err)
	}

	rounding := v5Issue("A", "V3", syncDigest(103))
	roundingItems := []weighbridge.NetAdjustmentItem{
		{Mode: "percent", Amount: "0.001", RateBP: v5Rate(5), Category: "WATER", CategoryName: "水分"},
		{Mode: "percent", Amount: "0.001", RateBP: v5Rate(5), Category: "IMPURITY", CategoryName: "杂质"},
	}
	rounding.Ticket.OriginalGross, rounding.Ticket.FinalGross = "1.2", "1.2"
	rounding.Ticket.OriginalTare, rounding.Ticket.FinalTare = "0.2", "0.2"
	rounding.Ticket.FinalNet, rounding.Ticket.NetAdjustment = "0.998", "0.002"
	rounding.Ticket.NetAdjustments = &roundingItems
	if _, err := repo.ApplyChangeV5(ctx, rounding); err != nil {
		t.Fatalf("independent percent rounding: %v", err)
	}

	bad := v5Issue("A", "V4", syncDigest(104))
	badItems := []weighbridge.NetAdjustmentItem{{Mode: "percent", Amount: "0.3", RateBP: v5Rate(100), Category: "WATER", CategoryName: "水分大"}}
	bad.Ticket.NetAdjustments = &badItems
	bad.Ticket.NetAdjustment, bad.Ticket.FinalNet = "0.3", "19.7"
	if _, err := repo.ApplyChangeV5(ctx, bad); err == nil {
		t.Fatal("a percent amount that does not match the rounded ratio must be rejected")
	} else {
		wantSyncFailure(t, err, weighbridge.SyncCategoryConfigOrData, "invalid_request")
	}

	if _, err := repo.ApplyChangeV5(ctx, v5Void("A", "V1", syncDigest(105))); err != nil {
		t.Fatalf("v5 void: %v", err)
	}
	if _, err := repo.ApplyChangeV5(ctx, v5Reopen("B", "V9", "A", "V1", syncDigest(106))); err != nil {
		t.Fatalf("v5 reopen with uplift: %v", err)
	}
	// A delayed duplicate of the issue must confirm without restoring the
	// ticket from void to valid.
	late, err := repo.ApplyChangeV5(ctx, issue)
	if err != nil || !late.Duplicate {
		t.Fatalf("late duplicate issue = %+v, %v", late, err)
	}
	original, err := repo.ReconcileTicket(ctx, "A", "V1")
	if err != nil || original.Status != "void" || original.ReopenedBy == nil || original.ReopenedBy.SiteCode != "B" || original.ReopenedBy.TicketNo != "V9" {
		t.Fatalf("original after void/reopen = %+v, %v", original, err)
	}
	reopened, err := repo.ReconcileTicket(ctx, "B", "V9")
	if err != nil || !reopened.Found || reopened.PreviousSiteCode == nil || *reopened.PreviousSiteCode != "A" || reopened.PreviousTicketNo == nil || *reopened.PreviousTicketNo != "V1" {
		t.Fatalf("reopened ticket = %+v, %v", reopened, err)
	}
	if reopened.Ticket == nil || reopened.Ticket.NetAdjustments == nil || (*reopened.Ticket.NetAdjustments)[0].Amount != "-0.5" {
		t.Fatalf("reopen details = %+v", reopened.Ticket)
	}
	if _, err := repo.ApplyChangeV5(ctx, v5Reopen("B", "V10", "A", "V1", syncDigest(107))); err == nil {
		t.Fatal("original must not be reopened twice")
	} else {
		wantSyncFailure(t, err, weighbridge.SyncCategoryConflict, "original_already_reopened")
	}
}

func TestPostgresWeighbridgeSyncV5HTTP(t *testing.T) {
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
	gin.SetMode(gin.TestMode)
	router := gin.New()
	weighbridge.RegisterRoutes(router.Group("/api/v1"), weighbridge.NewHandler(weighbridge.NewService(repo)))

	issue := v5Issue("A", "H1", syncDigest(201))
	body, err := json.Marshal(issue)
	if err != nil {
		t.Fatal(err)
	}
	post := func(payload []byte, target string) *httptest.ResponseRecorder {
		request := httptest.NewRequest(http.MethodPost, target, bytes.NewReader(payload))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		return response
	}
	response := post(body, "/api/v1/weighbridge/sync/v5/changes")
	if response.Code != http.StatusOK {
		t.Fatalf("v5 issue status = %d, body = %s", response.Code, response.Body.String())
	}
	var receipt struct {
		Code int                         `json:"code"`
		Data weighbridge.ChangeReceiptV5 `json:"data"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &receipt); err != nil {
		t.Fatal(err)
	}
	if receipt.Code != http.StatusOK || receipt.Data.Digest != syncDigest(201) || receipt.Data.TicketNo != "H1" || receipt.Data.Duplicate {
		t.Fatalf("v5 issue receipt = %+v", receipt)
	}

	duplicate := post(body, "/api/v1/weighbridge/sync/v5/changes")
	if duplicate.Code != http.StatusOK {
		t.Fatalf("duplicate status = %d, body = %s", duplicate.Code, duplicate.Body.String())
	}
	if err := json.Unmarshal(duplicate.Body.Bytes(), &receipt); err != nil {
		t.Fatal(err)
	}
	if !receipt.Data.Duplicate {
		t.Fatalf("duplicate receipt = %+v", receipt)
	}

	reconcile := httptest.NewRecorder()
	router.ServeHTTP(reconcile, httptest.NewRequest(http.MethodGet, "/api/v1/weighbridge/sync/v5/tickets?siteCode=A&ticketNo=H1", nil))
	if reconcile.Code != http.StatusOK {
		t.Fatalf("v5 reconcile status = %d, body = %s", reconcile.Code, reconcile.Body.String())
	}
	var reconciled struct {
		Code int                         `json:"code"`
		Data weighbridge.TicketReconcile `json:"data"`
	}
	if err := json.Unmarshal(reconcile.Body.Bytes(), &reconciled); err != nil {
		t.Fatal(err)
	}
	if !reconciled.Data.Found || reconciled.Data.Ticket == nil || reconciled.Data.Ticket.NetAdjustments == nil || len(*reconciled.Data.Ticket.NetAdjustments) != 2 {
		t.Fatalf("v5 reconcile = %+v", reconciled.Data)
	}

	invalid := v5Issue("A", "H2", syncDigest(202))
	items := []weighbridge.NetAdjustmentItem{{Mode: "percent", Amount: "0.3", RateBP: v5Rate(100), Category: "WATER", CategoryName: "水分大"}}
	invalid.Ticket.NetAdjustments = &items
	invalid.Ticket.NetAdjustment, invalid.Ticket.FinalNet = "0.3", "19.7"
	payload, _ := json.Marshal(invalid)
	rejected := post(payload, "/api/v1/weighbridge/sync/v5/changes")
	if rejected.Code != http.StatusBadRequest {
		t.Fatalf("invalid v5 status = %d, body = %s", rejected.Code, rejected.Body.String())
	}
	var failure struct {
		Code int                   `json:"code"`
		Data weighbridge.SyncError `json:"data"`
	}
	if err := json.Unmarshal(rejected.Body.Bytes(), &failure); err != nil {
		t.Fatal(err)
	}
	if failure.Data.Category != weighbridge.SyncCategoryConfigOrData || failure.Data.Reason != "invalid_request" {
		t.Fatalf("invalid v5 failure = %+v", failure.Data)
	}
}
