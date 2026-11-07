//go:build integration

package integration

import (
	"context"
	"encoding/json"
	"errors"
	"fenchichun.local/server/internal/audit"
	"fenchichun.local/server/internal/laboratory"
	"fenchichun.local/server/internal/weighbridge"
	"strings"
	"testing"
)

func TestPostgresLaboratoryLifecycle(t *testing.T) {
	tmp := startMigratedPostgres(t)
	db := openTemporaryDatabase(t, tmp.dsn)
	defer db.Close()
	ctx := context.Background()
	service := laboratory.NewService(laboratory.NewRepository(db.GORM))
	e := audit.Event{Action: "inspection.save", Resource: "weighbridge-master", Metadata: audit.Metadata{ActorID: 1}}
	if _, err := service.List(ctx, 99999, laboratory.Query{}); !errors.Is(err, laboratory.ErrForbidden) {
		t.Fatalf("access: %v", err)
	}
	if err := db.GORM.Exec("INSERT INTO wb_cloud_site(code,name) VALUES ('LAB','测试厂')").Error; err != nil {
		t.Fatal(err)
	}
	draft, err := service.Save(ctx, 0, 0, laboratory.Input{}, e)
	if err != nil || draft.ID == 0 {
		t.Fatalf("create: %+v %v", draft, err)
	}
	if _, err := service.Transition(ctx, draft.ID, draft.Version, "confirm", "", e); !errors.Is(err, laboratory.ErrInvalid) {
		t.Fatalf("empty confirm: %v", err)
	}
	input := laboratory.Input{SiteCode: "LAB", Plate: "晋A12345", MaterialCode: "C-M-0010", PartyCode: "C-P-0001", Moisture: "14.1", Impurity: "1", BulkDensity: "750", Conclusion: "reject", Reason: "水分偏高"}
	updated, err := service.Save(ctx, draft.ID, draft.Version, input, e)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.Save(ctx, draft.ID, draft.Version, input, e); !errors.Is(err, laboratory.ErrConflict) {
		t.Fatalf("stale update: %v", err)
	}
	confirmed, err := service.Transition(ctx, updated.ID, updated.Version, "confirm", "", e)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.Save(ctx, confirmed.ID, confirmed.Version, input, e); !errors.Is(err, laboratory.ErrConflict) {
		t.Fatalf("confirmed edit: %v", err)
	}
	if _, err := service.Transition(ctx, confirmed.ID, confirmed.Version, "delete", "", e); !errors.Is(err, laboratory.ErrConflict) {
		t.Fatalf("confirmed delete: %v", err)
	}
	retest, err := service.Retest(ctx, confirmed.ID, confirmed.Version, e)
	if err != nil || retest.OriginalID == nil || *retest.OriginalID != confirmed.ID || retest.Moisture != "" || retest.Status != "draft" {
		t.Fatalf("retest: %+v %v", retest, err)
	}
	if _, err := service.Transition(ctx, confirmed.ID, confirmed.Version, "void", "", e); !errors.Is(err, laboratory.ErrInvalid) {
		t.Fatalf("void reason: %v", err)
	}
	voided, err := service.Transition(ctx, confirmed.ID, confirmed.Version, "void", "录入错误", e)
	if err != nil || voided.Moisture != input.Moisture || voided.VoidReason == "" {
		t.Fatalf("void: %+v %v", voided, err)
	}
	if _, err := service.Transition(ctx, retest.ID, retest.Version, "delete", "", e); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Detail(ctx, 1, retest.ID); !errors.Is(err, laboratory.ErrNotFound) {
		t.Fatalf("deleted: %v", err)
	}
	page, err := service.List(ctx, 1, laboratory.Query{Status: "void", Keyword: "晋A"})
	if err != nil || page.Total != 1 {
		t.Fatalf("page: %+v %v", page, err)
	}
	var count int64
	if err := db.GORM.Table("sys_oper_log").Where("module_name=?", "laboratory-inspection").Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 6 {
		t.Fatalf("audit writes: %d", count)
	}
	// Verify supplier identity uniqueness and that personal identity is not exported.
	repo := weighbridge.NewRepository(db.GORM)
	partyInput := weighbridge.PartyInput{Name: "测试个人", Nature: "individual", IsSupplier: true, Enabled: true, IdentityNumber: "11010519491231002X"}
	party, err := repo.SaveParty(ctx, "", partyInput, e)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repo.SaveParty(ctx, "", partyInput, e); !errors.Is(err, weighbridge.ErrConflict) {
		t.Fatalf("duplicate identity: %v", err)
	}
	payload, _ := json.Marshal(party)
	if strings.Contains(string(payload), partyInput.IdentityNumber) {
		t.Fatal("identity exposed")
	}
	snapshot, err := repo.MasterSnapshot(ctx, "LAB")
	if err != nil {
		t.Fatal(err)
	}
	payload, _ = json.Marshal(snapshot)
	if strings.Contains(string(payload), partyInput.IdentityNumber) {
		t.Fatal("identity exported")
	}
}
