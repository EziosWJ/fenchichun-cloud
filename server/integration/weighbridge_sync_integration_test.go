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

func syncDigest(value int) string { return fmt.Sprintf("%064x", value) }

func syncTicket(site, number string) *weighbridge.TicketSnapshot {
	now := time.Date(2026, 10, 31, 2, 0, 0, 0, time.UTC)
	return &weighbridge.TicketSnapshot{
		TicketNo: number, Title: "酒厂过磅单", Plate: "晋A12345", Direction: "inbound",
		MaterialCode: "C-M-0001", MaterialName: "高粱", PartyCode: "C-P-0001", PartyName: "供货方",
		FirstConfirmedAt: now, SecondConfirmedAt: now, IssuedAt: now, IssuerName: "操作员",
		OriginalGross: "30", OriginalTare: "9", FinalGross: "30", FinalTare: "10",
		FinalNet: "20", NetAdjustment: "0", NetAdjustmentMode: "amount",
	}
}

func syncIssue(site, number string, digest string) weighbridge.ChangeV4 {
	return weighbridge.ChangeV4{SchemaVersion: 4, DigestVersion: 1, Digest: digest, SiteCode: site, TicketNo: number, Type: "issue", Ticket: syncTicket(site, number)}
}

func syncVoid(site, number, digest string) weighbridge.ChangeV4 {
	return weighbridge.ChangeV4{SchemaVersion: 4, DigestVersion: 1, Digest: digest, SiteCode: site, TicketNo: number, Type: "void", Void: &weighbridge.VoidInfo{Reason: "更正", Actor: "操作员", At: time.Date(2026, 10, 31, 2, 30, 0, 0, time.UTC)}}
}

func syncReopen(site, number, previousSite, previousNumber, digest string) weighbridge.ChangeV4 {
	ticket := syncTicket(site, number)
	previous := previousNumber
	previousGross, previousTare, previousNet, previousAdjustment := "30", "10", "19.5", "0.5"
	ticket.PreviousTicketNo = &previous
	ticket.PreviousFinalGross = &previousGross
	ticket.PreviousFinalTare = &previousTare
	ticket.PreviousFinalNet = &previousNet
	ticket.PreviousNetAdjustment = &previousAdjustment
	return weighbridge.ChangeV4{SchemaVersion: 4, DigestVersion: 1, Digest: digest, SiteCode: site, TicketNo: number, Type: "reopen", PreviousSiteCode: previousSite, Ticket: ticket}
}

func wantSyncFailure(t *testing.T, err error, category, reason string) {
	t.Helper()
	var syncErr *weighbridge.SyncError
	if !errors.As(err, &syncErr) || syncErr.Category != category || syncErr.Reason != reason {
		t.Fatalf("error = %v; want %s/%s", err, category, reason)
	}
}

func TestPostgresWeighbridgeSyncReceipts(t *testing.T) {
	if _, err := exec.LookPath("docker"); err != nil {
		t.Skip("Docker is required")
	}
	tmp := startMigratedPostgres(t)
	db := openTemporaryDatabase(t, tmp.dsn)
	defer db.Close()
	ctx := context.Background()
	repo := weighbridge.NewRepository(db.GORM)
	event := audit.Event{Action: "save", Resource: "weighbridge-site", Metadata: audit.Metadata{ActorID: 1}}
	var syncMenu struct {
		Component      string
		PermissionCode string
	}
	if err := db.GORM.Table("sys_menu").Select("component, permission_code").Where("permission_code = ?", "weighbridge:sync").Take(&syncMenu).Error; err != nil {
		t.Fatalf("sync menu seed: %v", err)
	}
	if syncMenu.Component != "weighbridge/sync/index" {
		t.Fatalf("sync menu component = %q", syncMenu.Component)
	}
	var adminMenus int64
	if err := db.GORM.Table("sys_role_menu rm").Joins("JOIN sys_role r ON r.id = rm.role_id").Joins("JOIN sys_menu m ON m.id = rm.menu_id").Where("r.role_code = 'ADMIN' AND r.deleted = 0 AND m.permission_code = ?", "weighbridge:sync").Count(&adminMenus).Error; err != nil || adminMenus != 1 {
		t.Fatalf("sync menu ADMIN assignment = %d, %v", adminMenus, err)
	}
	for _, site := range []weighbridge.SiteInput{{Code: "A", Name: "甲厂"}, {Code: "B", Name: "乙厂"}} {
		if _, err := repo.CreateSite(ctx, site, event); err != nil {
			t.Fatal(err)
		}
	}

	issue := syncIssue("A", "T1", syncDigest(1))
	first, err := repo.ApplyChangeV4(ctx, issue)
	if err != nil || first.Duplicate || first.Digest != syncDigest(1) || first.TicketNo != "T1" {
		t.Fatalf("issue receipt = %+v, %v", first, err)
	}
	duplicate, err := repo.ApplyChangeV4(ctx, issue)
	if err != nil || !duplicate.Duplicate {
		t.Fatalf("duplicate issue = %+v, %v", duplicate, err)
	}
	if delta := duplicate.ReceivedAt.Sub(first.ReceivedAt); delta > time.Millisecond || delta < -time.Millisecond {
		t.Fatalf("duplicate receivedAt = %v, first = %v", duplicate.ReceivedAt, first.ReceivedAt)
	}
	if _, err := repo.ApplyChangeV4(ctx, syncIssue("A", "T1", syncDigest(2))); err == nil {
		t.Fatal("a second issue with another digest must conflict")
	} else {
		wantSyncFailure(t, err, weighbridge.SyncCategoryConflict, "change_conflict")
	}

	if _, err := repo.ApplyChangeV4(ctx, syncVoid("A", "T0", syncDigest(3))); err == nil {
		t.Fatal("void before issue must wait")
	} else {
		wantSyncFailure(t, err, weighbridge.SyncCategoryPredecessorPending, "ticket_missing")
	}
	if _, err := repo.ApplyChangeV4(ctx, syncIssue("A", "T0", syncDigest(4))); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.ApplyChangeV4(ctx, syncVoid("A", "T0", syncDigest(5))); err != nil {
		t.Fatal(err)
	}

	if _, err := repo.ApplyChangeV4(ctx, syncReopen("B", "T2", "A", "T1", syncDigest(6))); err == nil {
		t.Fatal("reopen before void must wait")
	} else {
		wantSyncFailure(t, err, weighbridge.SyncCategoryPredecessorPending, "original_not_void")
	}
	if _, err := repo.ApplyChangeV4(ctx, syncVoid("A", "T1", syncDigest(7))); err != nil {
		t.Fatal(err)
	}

	// A delayed duplicate of the issue must confirm without moving the ticket
	// back from void to valid.
	if receipt, err := repo.ApplyChangeV4(ctx, issue); err != nil || !receipt.Duplicate {
		t.Fatalf("late duplicate issue = %+v, %v", receipt, err)
	}
	t1, err := repo.ReconcileTicket(ctx, "A", "T1")
	if err != nil || !t1.Found || t1.Status != "void" || t1.LatestDigest == nil || *t1.LatestDigest != syncDigest(7) || t1.LatestDigestVersion == nil || *t1.LatestDigestVersion != 1 || len(t1.Changes) != 2 {
		t.Fatalf("ticket after duplicates = %+v, %v", t1, err)
	}
	if _, err := repo.ApplyChangeV4(ctx, syncIssue("A", "T1", syncDigest(8))); err == nil {
		t.Fatal("a late issue with different content must conflict")
	} else {
		wantSyncFailure(t, err, weighbridge.SyncCategoryConflict, "change_conflict")
	}
	t1, err = repo.ReconcileTicket(ctx, "A", "T1")
	if err != nil || t1.Status != "void" || *t1.LatestDigest != syncDigest(7) {
		t.Fatalf("older change overwrote newer state: %+v, %v", t1, err)
	}

	reopen := syncReopen("B", "T2", "A", "T1", syncDigest(9))
	if _, err := repo.ApplyChangeV4(ctx, reopen); err != nil {
		t.Fatalf("cross code reopen: %v", err)
	}
	duplicateReopen, err := repo.ApplyChangeV4(ctx, reopen)
	if err != nil || !duplicateReopen.Duplicate {
		t.Fatalf("duplicate reopen = %+v, %v", duplicateReopen, err)
	}
	if _, err := repo.ApplyChangeV4(ctx, syncReopen("B", "T3", "A", "T1", syncDigest(10))); err == nil {
		t.Fatal("original must not be reopened twice")
	} else {
		wantSyncFailure(t, err, weighbridge.SyncCategoryConflict, "original_already_reopened")
	}

	original, err := repo.ReconcileTicket(ctx, "A", "T1")
	if err != nil || original.ReopenedBy == nil || original.ReopenedBy.SiteCode != "B" || original.ReopenedBy.TicketNo != "T2" {
		t.Fatalf("original association = %+v, %v", original, err)
	}
	reopened, err := repo.ReconcileTicket(ctx, "B", "T2")
	if err != nil || !reopened.Found || reopened.PreviousSiteCode == nil || *reopened.PreviousSiteCode != "A" || reopened.PreviousTicketNo == nil || *reopened.PreviousTicketNo != "T1" || len(reopened.Changes) != 1 {
		t.Fatalf("reopen association = %+v, %v", reopened, err)
	}

	lookup, err := repo.LookupChange(ctx, "A", syncDigest(1))
	if err != nil || !lookup.Found || lookup.Confirmation == nil || lookup.Confirmation.ChangeType != "issue" {
		t.Fatalf("historical confirmation = %+v, %v", lookup, err)
	}
	if lookup, err = repo.LookupChange(ctx, "A", syncDigest(8)); err != nil || lookup.Found {
		t.Fatalf("rejected change must not be confirmed: %+v, %v", lookup, err)
	}

	if err := repo.UpdateSite(ctx, "A", weighbridge.SiteInput{Code: "C", Name: "甲厂"}, event); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.ApplyChangeV4(ctx, syncIssue("A", "T4", syncDigest(11))); err == nil {
		t.Fatal("old site code must reject new writes")
	} else {
		wantSyncFailure(t, err, weighbridge.SyncCategoryConfigOrData, "site_not_found_or_disabled")
	}
	t1, err = repo.ReconcileTicket(ctx, "A", "T1")
	if err != nil || !t1.Found || len(t1.Changes) != 2 {
		t.Fatalf("old code history must stay readable: %+v, %v", t1, err)
	}
	if lookup, err = repo.LookupChange(ctx, "A", syncDigest(7)); err != nil || !lookup.Found {
		t.Fatalf("old code digest must stay readable: %+v, %v", lookup, err)
	}
	if receipt, err := repo.ApplyChangeV4(ctx, syncIssue("C", "T4", syncDigest(12))); err != nil || receipt.Duplicate {
		t.Fatalf("new code issue = %+v, %v", receipt, err)
	}
	if _, err := repo.ApplyChangeV4(ctx, syncIssue("C", "T9", syncDigest(1))); err == nil {
		t.Fatal("one digest must not identify another change")
	} else {
		wantSyncFailure(t, err, weighbridge.SyncCategoryConflict, "digest_reused")
	}
	if _, err := repo.ReconcileTicket(ctx, "Z", "T1"); err == nil {
		t.Fatal("unknown site code must fail reconciliation")
	} else {
		wantSyncFailure(t, err, weighbridge.SyncCategoryConfigOrData, "site_not_found")
	}

	receipts, err := repo.SiteReceipts(ctx, 1)
	if err != nil {
		t.Fatal(err)
	}
	byCode := map[string]weighbridge.SiteReceipt{}
	for _, item := range receipts {
		byCode[item.SiteCode] = item
	}
	if byCode["A"].SiteCode != "" {
		t.Fatal("renamed code must not remain a current site")
	}
	// T1 and T0 were issued under the old code A; their history follows the
	// renamed current site C. T4 was issued under C after the rename.
	if c := byCode["C"]; c.ReceivedChanges != 5 || c.LastTicketNo == nil || *c.LastTicketNo != "T4" || c.LastReceivedAt == nil {
		t.Fatalf("site C receipts = %+v", c)
	}
	if b := byCode["B"]; b.ReceivedChanges != 1 || b.LastTicketNo == nil || *b.LastTicketNo != "T2" {
		t.Fatalf("site B receipts = %+v", b)
	}

	if err := db.GORM.Exec(`UPDATE wb_cloud_site SET enabled=false WHERE code='B'`).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := repo.ApplyChangeV4(ctx, syncIssue("B", "T5", syncDigest(13))); err == nil {
		t.Fatal("disabled site must reject writes")
	} else {
		wantSyncFailure(t, err, weighbridge.SyncCategoryConfigOrData, "site_not_found_or_disabled")
	}
	if _, err := repo.ReconcileTicket(ctx, "B", "T2"); err != nil {
		t.Fatalf("disabled site history must stay readable: %v", err)
	}
	if err := db.GORM.Exec(`UPDATE wb_cloud_site SET enabled=true WHERE code='B'`).Error; err != nil {
		t.Fatal(err)
	}

	if _, err := repo.SiteReceipts(ctx, 999); !errors.Is(err, weighbridge.ErrForbiddenSync) {
		t.Fatalf("non-admin site receipts: %v", err)
	}
	if _, err := repo.TicketReceipt(ctx, 999, "A", "T1"); !errors.Is(err, weighbridge.ErrForbiddenSync) {
		t.Fatalf("non-admin ticket receipt: %v", err)
	}
	detail, err := repo.TicketReceipt(ctx, 1, "A", "T1")
	if err != nil || !detail.Found || detail.Ticket == nil || len(detail.Changes) != 2 || detail.ReopenedBy == nil || detail.ReopenedBy.TicketNo != "T2" || detail.VoidReason == nil {
		t.Fatalf("ticket receipt detail = %+v, %v", detail, err)
	}
	if missing, err := repo.TicketReceipt(ctx, 1, "A", "NOPE"); err != nil || missing.Found {
		t.Fatalf("missing ticket receipt = %+v, %v", missing, err)
	}

	router := gin.New()
	weighbridge.RegisterRoutes(router.Group("/api/v1"), weighbridge.NewHandler(weighbridge.NewService(repo)))
	request := func(method, path string, body []byte) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		req := httptest.NewRequest(method, path, bytes.NewReader(body))
		router.ServeHTTP(w, req)
		return w
	}
	body, _ := json.Marshal(syncIssue("C", "T4", syncDigest(12)))
	if w := request(http.MethodPost, "/api/v1/weighbridge/sync/v4/changes", body); w.Code != 200 || !bytes.Contains(w.Body.Bytes(), []byte(`"duplicate":true`)) {
		t.Fatalf("HTTP duplicate: %s", w.Body.String())
	}
	if w := request(http.MethodPost, "/api/v1/weighbridge/sync/v4/changes", []byte(`{"schemaVersion":4,"unknown":true}`)); w.Code != 400 || !bytes.Contains(w.Body.Bytes(), []byte(`"category":"config_or_data"`)) {
		t.Fatalf("HTTP invalid: %s", w.Body.String())
	}
	voidBody, _ := json.Marshal(syncVoid("C", "MISSING", syncDigest(14)))
	if w := request(http.MethodPost, "/api/v1/weighbridge/sync/v4/changes", voidBody); w.Code != 409 || !bytes.Contains(w.Body.Bytes(), []byte(`"category":"predecessor_pending"`)) {
		t.Fatalf("HTTP predecessor: %s", w.Body.String())
	}
	if w := request(http.MethodGet, "/api/v1/weighbridge/sync/v4/tickets?siteCode=A&ticketNo=T1", nil); w.Code != 200 || !bytes.Contains(w.Body.Bytes(), []byte(`"found":true`)) {
		t.Fatalf("HTTP reconcile: %s", w.Body.String())
	}
	if w := request(http.MethodGet, "/api/v1/weighbridge/sync/v4/changes?siteCode=A&digest="+syncDigest(1), nil); w.Code != 200 || !bytes.Contains(w.Body.Bytes(), []byte(`"found":true`)) {
		t.Fatalf("HTTP lookup: %s", w.Body.String())
	}
	if w := request(http.MethodGet, "/api/v1/weighbridge/sync/v4/changes?siteCode=Z&digest="+syncDigest(1), nil); w.Code != 400 || !bytes.Contains(w.Body.Bytes(), []byte(`"category":"config_or_data"`)) {
		t.Fatalf("HTTP unknown code: %s", w.Body.String())
	}
}

func TestPostgresWeighbridgeSyncTransactionRollback(t *testing.T) {
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
	if _, err := repo.ApplyChangeV4(ctx, syncIssue("A", "T1", syncDigest(100))); err != nil {
		t.Fatal(err)
	}
	rejectDigest := syncDigest(101)
	if err := db.GORM.Exec(fmt.Sprintf(`
		CREATE FUNCTION reject_sync_change() RETURNS trigger AS $$
		BEGIN
			IF NEW.digest = '%s' THEN RAISE EXCEPTION 'injected sync failure'; END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql;
		CREATE TRIGGER reject_sync_change BEFORE INSERT ON wb_cloud_ticket_change
			FOR EACH ROW EXECUTE FUNCTION reject_sync_change();`, rejectDigest)).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := repo.ApplyChangeV4(ctx, syncVoid("A", "T1", rejectDigest)); err == nil {
		t.Fatal("injected failure was not returned")
	}
	var ticket struct {
		Status       string
		LatestDigest *string
	}
	if err := db.GORM.Table("wb_cloud_ticket").Select("status, latest_digest").Where("issued_site_code='A' AND ticket_no='T1'").Take(&ticket).Error; err != nil {
		t.Fatal(err)
	}
	if ticket.Status != "valid" || ticket.LatestDigest == nil || *ticket.LatestDigest != syncDigest(100) {
		t.Fatalf("void update leaked out of the failed transaction: %+v", ticket)
	}
	var count int64
	if err := db.GORM.Table("wb_cloud_ticket_change").Where("digest = ?", rejectDigest).Count(&count).Error; err != nil || count != 0 {
		t.Fatalf("failed change was persisted: count=%d err=%v", count, err)
	}
	if err := db.GORM.Exec(`DROP TRIGGER reject_sync_change ON wb_cloud_ticket_change; DROP FUNCTION reject_sync_change();`).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := repo.ApplyChangeV4(ctx, syncVoid("A", "T1", syncDigest(102))); err != nil {
		t.Fatalf("void after rollback: %v", err)
	}

	rejectIssue := syncDigest(103)
	if err := db.GORM.Exec(fmt.Sprintf(`
		CREATE FUNCTION reject_sync_issue() RETURNS trigger AS $$
		BEGIN
			IF NEW.digest = '%s' THEN RAISE EXCEPTION 'injected sync failure'; END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql;
		CREATE TRIGGER reject_sync_issue BEFORE INSERT ON wb_cloud_ticket_change
			FOR EACH ROW EXECUTE FUNCTION reject_sync_issue();`, rejectIssue)).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := repo.ApplyChangeV4(ctx, syncIssue("A", "T2", rejectIssue)); err == nil {
		t.Fatal("injected issue failure was not returned")
	}
	if err := db.GORM.Table("wb_cloud_ticket").Where("issued_site_code='A' AND ticket_no='T2'").Count(&count).Error; err != nil || count != 0 {
		t.Fatalf("failed issue persisted a ticket: count=%d err=%v", count, err)
	}
	if err := db.GORM.Exec(`DROP TRIGGER reject_sync_issue ON wb_cloud_ticket_change; DROP FUNCTION reject_sync_issue();`).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := repo.ApplyChangeV4(ctx, syncIssue("A", "T2", syncDigest(104))); err != nil {
		t.Fatalf("issue after rollback: %v", err)
	}
}
