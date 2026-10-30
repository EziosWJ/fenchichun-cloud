//go:build integration

package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"testing"
	"time"

	"fenchichun.local/server/internal/audit"
	"fenchichun.local/server/internal/weighbridge"
	"github.com/gin-gonic/gin"
)

func TestPostgresWeighbridgeChanges(t *testing.T) {
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
	if _, err := repo.CreateSite(ctx, weighbridge.SiteInput{Code: "A", Name: "重复"}, event); !errors.Is(err, weighbridge.ErrConflict) {
		t.Fatalf("duplicate site: %v", err)
	}
	if err := repo.UpdateSite(ctx, "A", weighbridge.SiteInput{Code: "B", Name: "甲"}, event); !errors.Is(err, weighbridge.ErrConflict) {
		t.Fatalf("duplicate update: %v", err)
	}
	if err := db.GORM.Exec(`INSERT INTO wb_cloud_category (code,name) VALUES ('C-C-0001','谷物'); INSERT INTO wb_cloud_material (code,name,category_id) SELECT 'C-M-0001','高粱',id FROM wb_cloud_category; INSERT INTO wb_cloud_party (code,name,nature,is_supplier) VALUES ('C-P-0001','供货方','enterprise',true); INSERT INTO wb_cloud_contact (party_id,name,is_default) SELECT id,'联系人',true FROM wb_cloud_party`).Error; err != nil {
		t.Fatal(err)
	}
	snapshot, err := repo.MasterSnapshot(ctx, "A")
	if err != nil || snapshot.SchemaVersion != 2 || snapshot.SiteCode != "A" || len(snapshot.Categories) != 1 || len(snapshot.Materials) != 1 || *snapshot.Materials[0].CategoryCode != "C-C-0001" || len(snapshot.Parties) != 1 || len(snapshot.Parties[0].Contacts) != 1 {
		t.Fatalf("snapshot %+v %v", snapshot, err)
	}
	if err := db.GORM.Exec(`UPDATE wb_cloud_site SET enabled=false WHERE code='B'`).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := repo.MasterSnapshot(ctx, "B"); !errors.Is(err, weighbridge.ErrUnauthorized) {
		t.Fatalf("disabled: %v", err)
	}
	if err := db.GORM.Exec(`UPDATE wb_cloud_site SET enabled=true WHERE code='B'`).Error; err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 10, 27, 3, 0, 0, 0, time.UTC)
	makeIssue := func(site, number, id string) weighbridge.Change {
		return weighbridge.Change{SchemaVersion: 2, SiteCode: site, TicketNo: number, ChangeID: id, Type: "issue", Ticket: &weighbridge.TicketSnapshot{TicketNo: number, Title: "过磅单", Plate: "晋A12345", Direction: "inbound", MaterialCode: "C-M-0001", MaterialName: "高粱", PartyCode: "C-P-0001", PartyName: "供货方", FirstConfirmedAt: now, SecondConfirmedAt: now, IssuedAt: now, IssuerName: "操作员", OriginalGross: "30", OriginalTare: "9", FinalGross: "30", FinalTare: "10"}}
	}
	a := makeIssue("A", "T1", "C1")
	b := makeIssue("B", "T1", "C1")
	// 物理来源不参与协议；不同厂端互换编码时只按各自请求编码归属。
	for _, c := range []weighbridge.Change{b, a} {
		if _, err := repo.ApplyChange(ctx, c); err != nil {
			t.Fatal(err)
		}
	}
	concurrent := make(chan error, 8)
	for i := 0; i < cap(concurrent); i++ {
		go func() { _, err := repo.ApplyChange(ctx, a); concurrent <- err }()
	}
	for i := 0; i < cap(concurrent); i++ {
		if err := <-concurrent; err != nil {
			t.Fatal(err)
		}
	}
	changed := makeIssue("A", "T1", "C1")
	changed.Ticket.Plate = "different"
	if _, err := repo.ApplyChange(ctx, changed); !errors.Is(err, weighbridge.ErrConflict) {
		t.Fatalf("change conflict: %v", err)
	}
	duplicate := makeIssue("A", "T1", "other")
	if _, err := repo.ApplyChange(ctx, duplicate); !errors.Is(err, weighbridge.ErrConflict) {
		t.Fatalf("ticket conflict: %v", err)
	}
	old := "T1"
	next := makeIssue("B", "T2", "C2")
	next.Type = "reopen"
	next.PreviousSiteCode = "A"
	next.Ticket.PreviousTicketNo = &old
	if _, err := repo.ApplyChange(ctx, next); !errors.Is(err, weighbridge.ErrConflict) {
		t.Fatalf("reopen before void: %v", err)
	}
	void := weighbridge.Change{SchemaVersion: 2, SiteCode: "A", ChangeID: "V1", TicketNo: old, Type: "void", Void: &weighbridge.VoidInfo{Reason: "更正", Actor: "操作员", At: now}}
	if _, err := repo.ApplyChange(ctx, void); err != nil {
		t.Fatal(err)
	}
	if err := repo.UpdateSite(ctx, "A", weighbridge.SiteInput{Code: "C", Name: "甲厂"}, event); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.ApplyChange(ctx, void); !errors.Is(err, weighbridge.ErrUnauthorized) {
		t.Fatalf("old code accepted: %v", err)
	}
	if _, err := repo.MasterSnapshot(ctx, "A"); !errors.Is(err, weighbridge.ErrUnauthorized) {
		t.Fatalf("old master accepted: %v", err)
	}
	if _, err := repo.CreateSite(ctx, weighbridge.SiteInput{Code: "A", Name: "第三厂"}, event); !errors.Is(err, weighbridge.ErrConflict) {
		t.Fatalf("reused history: %v", err)
	}
	if _, err := repo.ApplyChange(ctx, next); err != nil {
		t.Fatalf("cross code reopen: %v", err)
	}
	next2 := next
	next2.ChangeID = "C3"
	next2.TicketNo = "T3"
	ticket := *next.Ticket
	ticket.TicketNo = "T3"
	next2.Ticket = &ticket
	if _, err := repo.ApplyChange(ctx, next2); !errors.Is(err, weighbridge.ErrConflict) {
		t.Fatalf("second reopen: %v", err)
	}
	page, err := repo.TicketPage(ctx, weighbridge.TicketQuery{Page: 1, PageSize: 10, SiteCode: "C"})
	if err != nil || page.Total != 1 || page.Records[0].SiteCode != "A" || page.Records[0].Status != "void" {
		t.Fatalf("historical ownership: %+v %v", page, err)
	}
	totals, err := repo.TicketTotals(ctx, weighbridge.TicketQuery{})
	if err != nil || len(totals) != 1 || totals[0].Count != 2 || totals[0].NetMilliTonne != 40000 {
		t.Fatalf("totals: %+v %v", totals, err)
	}
	v3 := makeIssue("C", "V3-1", "V3C1")
	v3.SchemaVersion = 3
	v3.Ticket.FinalNet = "19.5"
	v3.Ticket.NetAdjustment = "0.5"
	v3.Ticket.NetAdjustmentMode = "amount"
	v3.Ticket.NetAdjustmentCategory = "QUALITY"
	v3.Ticket.NetAdjustmentCategoryName = "质量差"
	if _, err := repo.ApplyChange(ctx, v3); err != nil {
		t.Fatalf("version 3 issue: %v", err)
	}
	totals, err = repo.TicketTotals(ctx, weighbridge.TicketQuery{})
	if err != nil || len(totals) != 1 || totals[0].Count != 3 || totals[0].NetMilliTonne != 59500 {
		t.Fatalf("version 3 totals: %+v %v", totals, err)
	}
	router := gin.New()
	weighbridge.RegisterRoutes(router.Group("/api/v1"), weighbridge.NewHandler(weighbridge.NewService(repo)))
	request := func(method, path string, body []byte) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		req := httptest.NewRequest(method, path, bytes.NewReader(body))
		router.ServeHTTP(w, req)
		return w
	}
	w := request(http.MethodGet, "/api/v1/weighbridge/sync/master?siteCode=C", nil)
	if w.Code != 200 || !bytes.Contains(w.Body.Bytes(), []byte(`"schemaVersion":2`)) || bytes.Contains(w.Body.Bytes(), []byte("scaleCodes")) {
		t.Fatalf("HTTP master: %s", w.Body.String())
	}
	body, _ := json.Marshal(next)
	w = request(http.MethodPost, "/api/v1/weighbridge/sync/changes", body)
	if w.Code != 200 {
		t.Fatalf("HTTP duplicate: %s", w.Body.String())
	}
	v3Body, _ := json.Marshal(v3)
	w = request(http.MethodPost, "/api/v1/weighbridge/sync/changes", v3Body)
	if w.Code != 200 {
		t.Fatalf("HTTP version 3 duplicate: %s", w.Body.String())
	}
	invalid := []byte(fmt.Sprintf(`{"schemaVersion":2,"siteCode":"B","scaleCode":"X"}`))
	w = request(http.MethodPost, "/api/v1/weighbridge/sync/changes", invalid)
	if w.Code != 400 {
		t.Fatalf("legacy field accepted: %s", w.Body.String())
	}
}
