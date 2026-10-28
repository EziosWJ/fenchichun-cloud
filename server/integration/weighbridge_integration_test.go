//go:build integration

package integration

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
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
		t.Skip("Docker is required for PostgreSQL integration tests")
	}
	temporary := startMigratedPostgres(t)
	database := openTemporaryDatabase(t, temporary.dsn)
	defer func() { _ = database.Close() }()
	hash := sha256.Sum256([]byte("site-secret"))
	if err := database.GORM.Exec(`INSERT INTO wb_cloud_site (code, name) VALUES ('F001','一厂'); INSERT INTO wb_cloud_scale (site_id, code, name) SELECT id,'WB01','地磅' FROM wb_cloud_site WHERE code='F001';`).Error; err != nil {
		t.Fatal(err)
	}
	if err := database.GORM.Exec(`INSERT INTO wb_cloud_credential (site_id, token_hash) SELECT id,? FROM wb_cloud_site WHERE code='F001'`, hex.EncodeToString(hash[:])).Error; err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 10, 27, 3, 0, 0, 0, time.UTC)
	ticket := &weighbridge.TicketSnapshot{TicketNo: "F001-20261027-0001", ScaleCode: "WB01", Title: "酒厂过磅单", Plate: "晋A12345", Direction: "inbound", MaterialCode: "C-M-0001", MaterialName: "高粱", PartyCode: "C-P-0001", PartyName: "供货方", FirstConfirmedAt: now, SecondConfirmedAt: now, IssuedAt: now, IssuerName: "操作员", OriginalGross: "30", OriginalTare: "9", FinalGross: "30", FinalTare: "10"}
	c := weighbridge.Change{SchemaVersion: 1, ChangeID: "c1", SiteCode: "F001", ScaleCode: "WB01", TicketNo: ticket.TicketNo, Type: "issue", Ticket: ticket}
	repo := weighbridge.NewRepository(database.GORM)
	credential, err := repo.CreateSite(context.Background(), weighbridge.SiteInput{Code: "F002", Name: "二厂", ScaleCode: "WB01", ScaleName: "地磅"}, audit.Event{Action: "create", Resource: "weighbridge-site", Metadata: audit.Metadata{ActorID: 1}})
	if err != nil || credential.Token == "" {
		t.Fatalf("create site: %+v, %v", credential, err)
	}
	updateEvent := audit.Event{Action: "update", Resource: "weighbridge-site", Metadata: audit.Metadata{ActorID: 1}}
	if err := repo.UpdateSite(context.Background(), "F002", "WB01", weighbridge.SiteInput{Code: "F002", ScaleCode: "WB01", Name: "新二厂", ScaleName: "新地磅"}, updateEvent); err != nil {
		t.Fatalf("update site: %v", err)
	}
	views, err := repo.Sites(context.Background())
	if err != nil || len(views) != 2 || views[1].Name != "新二厂" || views[1].ScaleName != "新地磅" {
		t.Fatalf("updated site: %+v, %v", views, err)
	}
	if err := repo.UpdateSite(context.Background(), "F002", "missing", weighbridge.SiteInput{Code: "F002", ScaleCode: "missing", Name: "不应保存", ScaleName: "地磅"}, updateEvent); !errors.Is(err, weighbridge.ErrInvalid) {
		t.Fatalf("missing scale: %v", err)
	}
	if err := repo.UpdateSite(context.Background(), "F002", "WB01", weighbridge.SiteInput{Code: "F002", ScaleCode: "WB01", Name: "不应保存", ScaleName: "地磅"}, audit.Event{}); !errors.Is(err, weighbridge.ErrForbidden) {
		t.Fatalf("non-admin update: %v", err)
	}
	storedCredential, err := repo.Credential(context.Background(), "F002", 1)
	if err != nil || storedCredential.Token != credential.Token {
		t.Fatalf("view credential: %+v, %v", storedCredential, err)
	}
	if _, err := repo.Credential(context.Background(), "F001", 1); !errors.Is(err, weighbridge.ErrCredentialUnavailable) {
		t.Fatalf("legacy credential: %v", err)
	}
	if _, err := repo.Credential(context.Background(), "F002", 0); !errors.Is(err, weighbridge.ErrForbidden) {
		t.Fatalf("credential access: %v", err)
	}
	emptySnapshot, err := repo.MasterSnapshot(context.Background(), credential.Token)
	if err != nil || emptySnapshot.SiteCode != "F002" || len(emptySnapshot.ScaleCodes) != 1 || emptySnapshot.ScaleCodes[0] != "WB01" || emptySnapshot.Categories == nil || emptySnapshot.Materials == nil || emptySnapshot.Parties == nil {
		t.Fatalf("new credential and empty snapshot: %+v, %v", emptySnapshot, err)
	}
	if err := repo.UpdateSite(context.Background(), "F002", "WB01", weighbridge.SiteInput{Code: "F003", Name: "新二厂", ScaleCode: "WB02", ScaleName: "新地磅"}, updateEvent); err != nil {
		t.Fatalf("update codes: %v", err)
	}
	changedSnapshot, err := repo.MasterSnapshot(context.Background(), credential.Token)
	if err != nil || changedSnapshot.SiteCode != "F003" || len(changedSnapshot.ScaleCodes) != 1 || changedSnapshot.ScaleCodes[0] != "WB02" {
		t.Fatalf("updated identity: %+v, %v", changedSnapshot, err)
	}
	if err := repo.UpdateSite(context.Background(), "F003", "WB02", weighbridge.SiteInput{Code: "F002", Name: "新二厂", ScaleCode: "WB01", ScaleName: "新地磅"}, updateEvent); err != nil {
		t.Fatalf("restore codes: %v", err)
	}
	rotated, err := repo.RotateCredential(context.Background(), "F002", audit.Event{Action: "rotate", Resource: "weighbridge-site", Metadata: audit.Metadata{ActorID: 1}})
	if err != nil {
		t.Fatalf("rotate credential: %v", err)
	}
	if _, err := repo.MasterSnapshot(context.Background(), credential.Token); !errors.Is(err, weighbridge.ErrUnauthorized) {
		t.Fatalf("old credential still valid: %v", err)
	}
	if _, err := repo.MasterSnapshot(context.Background(), rotated.Token); err != nil {
		t.Fatalf("rotated credential: %v", err)
	}
	if err := database.GORM.Exec(`INSERT INTO wb_cloud_category (code, name) VALUES ('C-C-0001', '谷物'); INSERT INTO wb_cloud_material (code, name, category_id) SELECT 'C-M-0001', '高粱', id FROM wb_cloud_category WHERE code = 'C-C-0001'; INSERT INTO wb_cloud_party (code, name, nature, is_supplier) VALUES ('C-P-0001', '供货方', 'enterprise', true); INSERT INTO wb_cloud_contact (party_id, name, is_default) SELECT id, '联系人', true FROM wb_cloud_party WHERE code = 'C-P-0001';`).Error; err != nil {
		t.Fatal(err)
	}
	snapshot, err := repo.MasterSnapshot(context.Background(), "site-secret")
	if err != nil || snapshot.SiteCode != "F001" || len(snapshot.ScaleCodes) != 1 || snapshot.ScaleCodes[0] != "WB01" || len(snapshot.Categories) != 1 || len(snapshot.Materials) != 1 || snapshot.Materials[0].CategoryCode == nil || *snapshot.Materials[0].CategoryCode != "C-C-0001" || len(snapshot.Parties) != 1 || len(snapshot.Parties[0].Contacts) != 1 {
		t.Fatalf("master snapshot = %+v, %v", snapshot, err)
	}
	if err := database.GORM.Exec(`UPDATE wb_cloud_scale SET enabled = false WHERE site_id = (SELECT id FROM wb_cloud_site WHERE code = 'F001')`).Error; err != nil {
		t.Fatal(err)
	}
	disabledSnapshot, err := repo.MasterSnapshot(context.Background(), "site-secret")
	if err != nil || disabledSnapshot.ScaleCodes == nil || len(disabledSnapshot.ScaleCodes) != 0 {
		t.Fatalf("disabled scale snapshot = %+v, %v", disabledSnapshot, err)
	}
	if err := database.GORM.Exec(`UPDATE wb_cloud_scale SET enabled = true WHERE site_id = (SELECT id FROM wb_cloud_site WHERE code = 'F001')`).Error; err != nil {
		t.Fatal(err)
	}
	if err := database.GORM.Exec(`INSERT INTO wb_cloud_sequence (kind, value) VALUES ('category',1), ('material',1), ('party',1)`).Error; err != nil {
		t.Fatal(err)
	}
	event := audit.Event{Action: "save", Resource: "weighbridge-master", Metadata: audit.Metadata{ActorID: 1}}
	category, err := repo.SaveCategory(context.Background(), "", weighbridge.CategoryInput{Name: "分类二", Enabled: true}, event)
	if err != nil || category.Code != "C-C-0002" {
		t.Fatalf("category = %+v, %v", category, err)
	}
	material, err := repo.SaveMaterial(context.Background(), "", weighbridge.MaterialInput{Name: "物料二", CategoryCode: &category.Code, Enabled: true}, event)
	if err != nil || material.Code != "C-M-0002" {
		t.Fatalf("material = %+v, %v", material, err)
	}
	party, err := repo.SaveParty(context.Background(), "", weighbridge.PartyInput{Name: "主体二", Nature: "enterprise", IsSupplier: true, Enabled: true, Contacts: []weighbridge.Contact{{Name: "联系人", IsDefault: true}}}, event)
	if err != nil || party.Code != "C-P-0002" || len(party.Contacts) != 1 || party.Contacts[0].ID == 0 {
		t.Fatalf("party = %+v, %v", party, err)
	}
	contactID := party.Contacts[0].ID
	party, err = repo.SaveParty(context.Background(), party.Code, weighbridge.PartyInput{Name: "主体二", Nature: "enterprise", IsSupplier: true, Enabled: true, Contacts: []weighbridge.Contact{{ID: contactID, Name: "修改后", IsDefault: true}}}, event)
	if err != nil || len(party.Contacts) != 1 || party.Contacts[0].ID != contactID {
		t.Fatalf("contact stable ID: %+v, %v", party, err)
	}
	party, err = repo.SaveParty(context.Background(), party.Code, weighbridge.PartyInput{Name: "主体二", Nature: "enterprise", IsSupplier: true, Enabled: true}, event)
	if err != nil || len(party.Contacts) != 0 {
		t.Fatalf("remove contact: %+v, %v", party, err)
	}
	concurrent := make(chan error, 8)
	for i := 0; i < cap(concurrent); i++ {
		go func() {
			_, err := repo.ApplyChange(context.Background(), "site-secret", c)
			concurrent <- err
		}()
	}
	for i := 0; i < cap(concurrent); i++ {
		if err := <-concurrent; err != nil {
			t.Fatalf("concurrent duplicate: %v", err)
		}
	}
	if _, err := repo.ApplyChange(context.Background(), "site-secret", c); err != nil {
		t.Fatalf("duplicate: %v", err)
	}
	router := gin.New()
	weighbridge.RegisterRoutes(router.Group("/api/v1"), weighbridge.NewHandler(weighbridge.NewService(repo)))
	masterRequest := httptest.NewRequest(http.MethodGet, "/api/v1/weighbridge/sync/master", nil)
	masterRequest.Header.Set("Authorization", "Bearer site-secret")
	masterResponse := httptest.NewRecorder()
	router.ServeHTTP(masterResponse, masterRequest)
	var masterEnvelope struct {
		Code int                        `json:"code"`
		Data weighbridge.MasterSnapshot `json:"data"`
	}
	if err := json.Unmarshal(masterResponse.Body.Bytes(), &masterEnvelope); err != nil || masterResponse.Code != http.StatusOK || masterEnvelope.Code != 200 || masterEnvelope.Data.SiteCode != "F001" || len(masterEnvelope.Data.ScaleCodes) != 1 || masterEnvelope.Data.ScaleCodes[0] != "WB01" {
		t.Fatalf("master HTTP response: %d %s (%v)", masterResponse.Code, masterResponse.Body.String(), err)
	}
	for _, badToken := range []string{"site-invalid", credential.Token} {
		rejected := httptest.NewRecorder()
		badRequest := httptest.NewRequest(http.MethodGet, "/api/v1/weighbridge/sync/master", nil)
		badRequest.Header.Set("Authorization", "Bearer "+badToken)
		router.ServeHTTP(rejected, badRequest)
		if rejected.Code != http.StatusUnauthorized {
			t.Fatalf("invalid or revoked master credential accepted: %d %s", rejected.Code, rejected.Body.String())
		}
	}
	body, err := json.Marshal(c)
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/v1/weighbridge/sync/changes", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer site-secret")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK || !bytes.Contains(response.Body.Bytes(), []byte(`"code":200`)) {
		t.Fatalf("duplicate HTTP receipt: %d %s", response.Code, response.Body.String())
	}
	changed := c
	modified := *ticket
	modified.Plate = "晋A99999"
	changed.Ticket = &modified
	if _, err := repo.ApplyChange(context.Background(), "site-secret", changed); !errors.Is(err, weighbridge.ErrConflict) {
		t.Fatalf("same change ID with different payload: %v", err)
	}
	if _, err := repo.ApplyChange(context.Background(), "bad-secret", c); !errors.Is(err, weighbridge.ErrUnauthorized) {
		t.Fatalf("auth: %v", err)
	}
	old := ticket.TicketNo
	next := *ticket
	next.TicketNo = "F001-20261027-0002"
	next.PreviousTicketNo = &old
	reopen := weighbridge.Change{SchemaVersion: 1, ChangeID: "c3", SiteCode: "F001", ScaleCode: "WB01", TicketNo: next.TicketNo, Type: "reopen", Ticket: &next}
	if _, err := repo.ApplyChange(context.Background(), "site-secret", reopen); !errors.Is(err, weighbridge.ErrConflict) {
		t.Fatalf("reopen before void: %v", err)
	}
	void := weighbridge.Change{SchemaVersion: 1, ChangeID: "c2", SiteCode: "F001", ScaleCode: "WB01", TicketNo: old, Type: "void", Void: &weighbridge.VoidInfo{Reason: "更正", Actor: "操作员", At: now}}
	if _, err := repo.ApplyChange(context.Background(), "site-secret", void); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.ApplyChange(context.Background(), "site-secret", reopen); err != nil {
		t.Fatal(err)
	}
	var count int64
	if err := database.GORM.Table("wb_cloud_ticket").Where("status = ?", "valid").Count(&count).Error; err != nil || count != 1 {
		t.Fatalf("valid count=%d err=%v", count, err)
	}
	page, err := repo.TicketPage(context.Background(), weighbridge.TicketQuery{Page: 1, PageSize: 10})
	if err != nil || page.Total != 2 || len(page.Records) != 2 {
		t.Fatalf("page = %+v, %v", page, err)
	}
	totals, err := repo.TicketTotals(context.Background(), weighbridge.TicketQuery{})
	if err != nil || len(totals) != 1 || totals[0].Count != 1 || totals[0].NetMilliTonne != 20000 {
		t.Fatalf("totals = %+v, %v", totals, err)
	}
}
