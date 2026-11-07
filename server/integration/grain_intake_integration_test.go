//go:build integration

package integration

import (
	"context"
	"errors"
	"fenchichun.local/server/internal/audit"
	"fenchichun.local/server/internal/auth"
	"fenchichun.local/server/internal/grainintake"
	"fenchichun.local/server/internal/laboratory"
	"fenchichun.local/server/internal/weighbridge"
	"fmt"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestPostgresGrainIntakeLifecycle(t *testing.T) {
	tmp := startMigratedPostgres(t)
	db := openTemporaryDatabase(t, tmp.dsn)
	defer db.Close()
	exerciseGrainIntake(t, db.GORM)
}

// Also exercised locally in an outer transaction when Docker is unavailable.
func exerciseGrainIntake(t *testing.T, db *gorm.DB) {
	t.Helper()
	ctx := context.Background()
	flow := grainintake.NewService(grainintake.NewRepository(db))
	lab := laboratory.NewService(laboratory.NewRepository(db))
	wb := weighbridge.NewRepository(db)
	e := audit.Event{Action: "trip.test", Resource: "grain-intake", Metadata: audit.Metadata{ActorID: 1}}
	check := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	if _, err := wb.CreateSite(ctx, weighbridge.SiteInput{Code: "GRAIN-TEST", Name: "原粮验证厂"}, e); err != nil {
		t.Fatal(err)
	}
	if _, err := flow.Trips(ctx, 999999, grainintake.Query{}); !errors.Is(err, grainintake.ErrForbidden) {
		t.Fatalf("ungranted trip access: %v", err)
	}
	// A gate-only user may read evidence and confirm exits, but cannot approve permits.
	var gateActor, gateRole int64
	check(db.Raw("INSERT INTO sys_user(username,nickname,password) VALUES ('grain_gate_test','验证门卫','unused') RETURNING id").Scan(&gateActor).Error)
	check(db.Raw("INSERT INTO sys_role(role_name,role_code) VALUES ('验证门卫','GRAIN_GATE_TEST') RETURNING id").Scan(&gateRole).Error)
	check(db.Exec("INSERT INTO sys_user_role(user_id,role_id) VALUES (?,?)", gateActor, gateRole).Error)
	check(db.Exec("INSERT INTO sys_role_menu(role_id,menu_id) SELECT ?,id FROM sys_menu WHERE permission_code='grain-intake:permits'", gateRole).Error)
	gateEvent := e
	gateEvent.Metadata.ActorID = gateActor
	if _, err := flow.Trips(ctx, gateActor, grainintake.Query{}); !errors.Is(err, grainintake.ErrForbidden) {
		t.Fatalf("gate trip management: %v", err)
	}
	number := 0
	createTrip := func(plate string) grainintake.Detail {
		v, err := flow.Save(ctx, 0, 0, grainintake.Input{SiteCode: "GRAIN-TEST", Plate: plate, MaterialCode: "C-M-0010", PartyCode: "C-P-0001"}, e)
		check(err)
		return v
	}
	createInspection := func(v grainintake.Detail, conclusion string) laboratory.Inspection {
		in := laboratory.Input{TripID: &v.Trip.ID, Moisture: "14.1", Impurity: "0", BulkDensity: "750", Conclusion: conclusion, Reason: "人工判定"}
		i, err := lab.Save(ctx, 0, 0, in, e)
		check(err)
		if i.SiteCode != v.Trip.SiteCode || i.Plate != v.Trip.Plate || i.PartyCode != v.Trip.PartyCode {
			t.Fatal("trip information not inherited")
		}
		i, err = lab.Transition(ctx, i.ID, i.Version, "confirm", "", e)
		check(err)
		return i
	}
	read := func(id int64) grainintake.Detail {
		v, err := flow.Detail(ctx, 1, id, grainintake.TripPermission)
		check(err)
		return v
	}
	command := func(v grainintake.Detail, action string, in grainintake.Command) grainintake.Detail {
		in.Version = v.Trip.Version
		next, err := flow.Command(ctx, v.Trip.ID, action, in, e)
		check(err)
		return next
	}
	selectInspection := func(v grainintake.Detail, i laboratory.Inspection) grainintake.Detail {
		return command(read(v.Trip.ID), "select-inspection", grainintake.Command{InspectionID: i.ID, InspectionVersion: i.Version})
	}
	makeReady := func(plate string) (grainintake.Detail, weighbridge.Change) {
		number++
		v := createTrip(plate)
		i := createInspection(v, "accept")
		v = selectInspection(v, i)
		v = command(v, "confirm-unloading", grainintake.Command{Location: "1号仓 / 东侧"})
		if _, err := flow.Command(ctx, v.Trip.ID, "link-ticket", grainintake.Command{Version: v.Trip.Version, TicketSiteCode: "GRAIN-TEST", TicketNo: "not-synced"}, e); !errors.Is(err, grainintake.ErrConflict) {
			t.Fatalf("unsynced ticket: %v", err)
		}
		no := fmt.Sprintf("GRAIN-TICKET-%d", number)
		first := v.Trip.EffectiveSelectedAt.Add(time.Microsecond)
		second := v.Trip.UnloadedAt.Add(time.Microsecond)
		change := weighbridge.Change{SchemaVersion: 2, ChangeID: no, SiteCode: "GRAIN-TEST", TicketNo: no, Type: "issue", Ticket: &weighbridge.TicketSnapshot{TicketNo: no, Title: "验证磅单", Plate: plate, Direction: "inbound", MaterialCode: v.Trip.MaterialCode, MaterialName: v.Trip.MaterialName, PartyCode: v.Trip.PartyCode, PartyName: v.Trip.PartyName, FirstConfirmedAt: first, SecondConfirmedAt: second, IssuedAt: second, IssuerName: "验证库管", OriginalGross: "30", OriginalTare: "10", FinalGross: "30", FinalTare: "10"}}
		_, err := wb.ApplyChange(ctx, change)
		check(err)
		v = command(v, "link-ticket", grainintake.Command{TicketSiteCode: "GRAIN-TEST", TicketNo: no})
		if v.Trip.Stage != "ready" {
			t.Fatalf("ready stage: %s", v.Trip.Stage)
		}
		return v, change
	}
	// Multiple inspections: explicit selection changes the one effective pointer, not historical results.
	multiple := createTrip("晋A复检")
	initial := createInspection(multiple, "accept")
	multiple = selectInspection(multiple, initial)
	retest, err := lab.Retest(ctx, initial.ID, initial.Version, e)
	check(err)
	if retest.TripID == nil || *retest.TripID != multiple.Trip.ID || retest.OriginalID == nil || *retest.OriginalID != initial.ID {
		t.Fatal("retest lost ownership")
	}
	retest.Moisture = "13.5"
	retest.Impurity = "0"
	retest.BulkDensity = "760"
	retest.Conclusion = "accept"
	retest, err = lab.Save(ctx, retest.ID, retest.Version, retest.Input, e)
	check(err)
	retest, err = lab.Transition(ctx, retest.ID, retest.Version, "confirm", "", e)
	check(err)
	before := read(multiple.Trip.ID)
	if *before.Trip.EffectiveInspectionID != initial.ID {
		t.Fatal("retest automatically replaced effective result")
	}
	multiple = selectInspection(before, retest)
	if len(multiple.Inspections) != 2 || *multiple.Trip.EffectiveInspectionID != retest.ID {
		t.Fatal("one effective result or history lost")
	}
	_, err = lab.Transition(ctx, retest.ID, retest.Version, "void", "录错", e)
	check(err)
	multiple = read(multiple.Trip.ID)
	if multiple.Trip.EffectiveInspectionID != nil || multiple.Trip.Stage != "pending_inspection" {
		t.Fatal("void did not clear effective result")
	}
	// Independent confirmed inspection can be linked; a mismatch and cross-trip reuse are rejected.
	independent, err := lab.Save(ctx, 0, 0, laboratory.Input{SiteCode: multiple.Trip.SiteCode, Plate: multiple.Trip.Plate, MaterialCode: multiple.Trip.MaterialCode, PartyCode: multiple.Trip.PartyCode, Moisture: "12", Impurity: "0", BulkDensity: "750", Conclusion: "accept"}, e)
	check(err)
	independent, err = lab.Transition(ctx, independent.ID, independent.Version, "confirm", "", e)
	check(err)
	multiple = command(multiple, "link-inspection", grainintake.Command{InspectionID: independent.ID, InspectionVersion: independent.Version})
	other := createTrip("晋B不同车")
	_, err = flow.Command(ctx, other.Trip.ID, "link-inspection", grainintake.Command{Version: other.Trip.Version, InspectionID: independent.ID, InspectionVersion: independent.Version}, e)
	if !errors.Is(err, grainintake.ErrConflict) {
		t.Fatalf("cross-trip association: %v", err)
	}
	// An inspection from another site cannot be linked even when plate, material and supplier match.
	if _, err := wb.CreateSite(ctx, weighbridge.SiteInput{Code: "GRAIN-OTHER", Name: "其他厂"}, e); err != nil {
		t.Fatal(err)
	}
	foreign, err := lab.Save(ctx, 0, 0, laboratory.Input{SiteCode: "GRAIN-OTHER", Plate: multiple.Trip.Plate, MaterialCode: multiple.Trip.MaterialCode, PartyCode: multiple.Trip.PartyCode, Moisture: "12", Impurity: "0", BulkDensity: "750", Conclusion: "accept"}, e)
	check(err)
	foreign, err = lab.Transition(ctx, foreign.ID, foreign.Version, "confirm", "", e)
	check(err)
	_, err = flow.Command(ctx, other.Trip.ID, "link-inspection", grainintake.Command{Version: other.Trip.Version, InspectionID: foreign.ID, InspectionVersion: foreign.Version}, e)
	if !errors.Is(err, grainintake.ErrConflict) {
		t.Fatalf("cross-site inspection: %v", err)
	}
	// A void before the permit is issued detaches the ticket so the trip can be linked again.
	detached, detachedChange := makeReady("晋A作废恢复")
	beforeVoid := read(detached.Trip.ID)
	_, err = wb.ApplyChange(ctx, weighbridge.Change{SchemaVersion: 2, ChangeID: detachedChange.ChangeID + "-void", SiteCode: detachedChange.SiteCode, TicketNo: detachedChange.TicketNo, Type: "void", Void: &weighbridge.VoidInfo{Reason: "选错磅单", Actor: "库管", At: time.Now().UTC()}})
	check(err)
	detached = read(detached.Trip.ID)
	if detached.Trip.TicketID != nil || detached.Trip.Stage != "accepted" || detached.Trip.Version != beforeVoid.Trip.Version+1 {
		t.Fatalf("void did not detach ticket: stage=%s ticket=%v version=%d", detached.Trip.Stage, detached.Trip.TicketID, detached.Trip.Version)
	}
	if len(detached.Events) == 0 || detached.Events[0].Action != "trip.ticket-voided" || detached.Events[0].ActorID != nil {
		t.Fatalf("missing system event: %+v", detached.Events)
	}
	number++
	no := fmt.Sprintf("GRAIN-TICKET-%d", number)
	first := detached.Trip.EffectiveSelectedAt.Add(time.Microsecond)
	second := detached.Trip.UnloadedAt.Add(time.Microsecond)
	_, err = wb.ApplyChange(ctx, weighbridge.Change{SchemaVersion: 2, ChangeID: no, SiteCode: "GRAIN-TEST", TicketNo: no, Type: "issue", Ticket: &weighbridge.TicketSnapshot{TicketNo: no, Title: "重开磅单", Plate: detached.Trip.Plate, Direction: "inbound", MaterialCode: detached.Trip.MaterialCode, MaterialName: detached.Trip.MaterialName, PartyCode: detached.Trip.PartyCode, PartyName: detached.Trip.PartyName, FirstConfirmedAt: first, SecondConfirmedAt: second, IssuedAt: second, IssuerName: "验证库管", OriginalGross: "30", OriginalTare: "10", FinalGross: "30", FinalTare: "10"}})
	check(err)
	detached = command(detached, "link-ticket", grainintake.Command{TicketSiteCode: "GRAIN-TEST", TicketNo: no})
	if detached.Trip.Stage != "ready" || detached.Trip.TicketID == nil {
		t.Fatalf("relink after void: stage=%s", detached.Trip.Stage)
	}
	// Complete normal exit, preserving the distinction between approval and actual departure.
	normal, _ := makeReady("晋A正常")
	normal = command(normal, "issue-permit", grainintake.Command{})
	if normal.Permit == nil || normal.Trip.ExitedAt != nil {
		t.Fatal("issue permit state")
	}
	_, err = flow.Command(ctx, normal.Trip.ID, "approve-permit", grainintake.Command{Version: normal.Trip.Version, PermitID: normal.Permit.ID}, gateEvent)
	if !errors.Is(err, grainintake.ErrForbidden) {
		t.Fatalf("gate can approve: %v", err)
	}
	normal = command(normal, "approve-permit", grainintake.Command{PermitID: normal.Permit.ID})
	if normal.Trip.Stage != "permit_approved" || normal.Trip.ExitedAt != nil {
		t.Fatal("approval marked departure")
	}
	_, err = lab.Transition(ctx, *normal.Trip.EffectiveInspectionID, normal.Inspections[0].Version, "void", "不能改", e)
	if !errors.Is(err, laboratory.ErrConflict) {
		t.Fatalf("approved evidence mutable: %v", err)
	}
	exit := grainintake.Command{Version: normal.Trip.Version, Basis: "permit", PermitID: normal.Permit.ID}
	departed, err := flow.Command(ctx, normal.Trip.ID, "confirm-exit", exit, gateEvent)
	check(err)
	repeated, err := flow.Command(ctx, normal.Trip.ID, "confirm-exit", exit, gateEvent)
	check(err)
	if repeated.Trip.ExitedAt == nil || !repeated.Trip.ExitedAt.Equal(*departed.Trip.ExitedAt) || repeated.Trip.Version != departed.Trip.Version {
		t.Fatal("repeated exit changed history")
	}
	// A void received after approval blocks the gate; no new ticket or override is fabricated.
	blocked, change := makeReady("晋A阻断")
	blocked = command(blocked, "issue-permit", grainintake.Command{})
	blocked = command(blocked, "approve-permit", grainintake.Command{PermitID: blocked.Permit.ID})
	_, err = wb.ApplyChange(ctx, weighbridge.Change{SchemaVersion: 2, ChangeID: change.ChangeID + "-void", SiteCode: change.SiteCode, TicketNo: change.TicketNo, Type: "void", Void: &weighbridge.VoidInfo{Reason: "验证作废", Actor: "库管", At: time.Now().UTC()}})
	check(err)
	blocked = read(blocked.Trip.ID)
	if blocked.Trip.Stage != "blocked" {
		t.Fatalf("invalid ticket stage: %s", blocked.Trip.Stage)
	}
	_, err = flow.Command(ctx, blocked.Trip.ID, "confirm-exit", grainintake.Command{Version: blocked.Trip.Version, Basis: "permit", PermitID: blocked.Permit.ID}, gateEvent)
	if !errors.Is(err, grainintake.ErrConflict) {
		t.Fatalf("void ticket released: %v", err)
	}
	// Rejection needs neither ticket nor normal exit permit; gate-only users retain history.
	rejected := createTrip("晋A拒收")
	ri := createInspection(rejected, "reject")
	rejected = selectInspection(rejected, ri)
	_, err = flow.Command(ctx, rejected.Trip.ID, "issue-permit", grainintake.Command{Version: rejected.Trip.Version}, e)
	if !errors.Is(err, grainintake.ErrConflict) {
		t.Fatalf("normal permit on rejection: %v", err)
	}
	rejected, err = flow.Command(ctx, rejected.Trip.ID, "confirm-exit", grainintake.Command{Version: rejected.Trip.Version, Basis: "rejection", InspectionID: ri.ID, InspectionVersion: ri.Version}, gateEvent)
	check(err)
	if rejected.Permit != nil || rejected.Ticket != nil || rejected.Trip.ExitBasis != "rejection" {
		t.Fatal("rejection fabricated a permit/ticket")
	}
	page, err := flow.Rejections(ctx, gateActor, grainintake.Query{Stage: "exited", Keyword: rejected.Trip.Number})
	check(err)
	if page.Total != 1 {
		t.Fatal("gate cannot find rejected departure history")
	}
	if _, err := flow.Detail(ctx, gateActor, rejected.Trip.ID, grainintake.PermitPermission); err != nil {
		t.Fatal(err)
	}
	permits, err := flow.Permits(ctx, gateActor, grainintake.Query{})
	check(err)
	if permits.Total != 2 {
		t.Fatalf("permit list: %d", permits.Total)
	}
	// Visual inspection supports both rejection at the gate and the normal permit path.
	check(db.Exec("INSERT INTO wb_cloud_material(code,name,inspection_method) VALUES ('WOOD-TEST','木片','visual')").Error)
	createWood := func(plate string) grainintake.Detail {
		v, err := flow.Save(ctx, 0, 0, grainintake.Input{SiteCode: "GRAIN-TEST", Plate: plate, MaterialCode: "WOOD-TEST", PartyCode: "C-P-0001"}, e)
		check(err)
		return v
	}
	wood := createWood("晋A木拒")
	if wood.Trip.InspectionMethod != "visual" || wood.Trip.Stage != "pending_inspection" {
		t.Fatalf("visual registration: %+v", wood.Trip)
	}
	_, err = flow.Command(ctx, wood.Trip.ID, "record-visual", grainintake.Command{Version: wood.Trip.Version, Conclusion: "reject"}, e)
	if !errors.Is(err, grainintake.ErrInvalid) {
		t.Fatalf("missing rejection reason: %v", err)
	}
	_, err = flow.Command(ctx, wood.Trip.ID, "confirm-unloading", grainintake.Command{Version: wood.Trip.Version, Location: "仓库"}, e)
	if !errors.Is(err, grainintake.ErrConflict) {
		t.Fatalf("uninspected unloading: %v", err)
	}
	wood = command(wood, "record-visual", grainintake.Command{Conclusion: "reject", Reason: "夹杂异物"})
	if wood.Trip.Stage != "rejected" {
		t.Fatalf("visual rejection stage: %s", wood.Trip.Stage)
	}
	page, err = flow.Rejections(ctx, gateActor, grainintake.Query{Keyword: wood.Trip.Number})
	check(err)
	if page.Total != 1 {
		t.Fatal("visual rejection missing from gate list")
	}
	wood, err = flow.Command(ctx, wood.Trip.ID, "confirm-exit", grainintake.Command{Version: wood.Trip.Version, Basis: "rejection"}, gateEvent)
	check(err)
	if wood.Trip.ExitedAt == nil || wood.Permit != nil || wood.Ticket != nil || wood.Trip.ExitInspectionID != nil {
		t.Fatal("visual rejection evidence")
	}

	wood = createWood("晋A木收")
	wood = command(wood, "record-visual", grainintake.Command{Conclusion: "accept"})
	firstWood := wood.Trip.VisualInspectedAt.Add(time.Microsecond)
	wood = command(wood, "confirm-unloading", grainintake.Command{Location: "木片场"})
	secondWood := wood.Trip.UnloadedAt.Add(time.Microsecond)
	woodTicket := weighbridge.Change{SchemaVersion: 2, ChangeID: "WOOD-TICKET", SiteCode: "GRAIN-TEST", TicketNo: "WOOD-TICKET", Type: "issue", Ticket: &weighbridge.TicketSnapshot{TicketNo: "WOOD-TICKET", Title: "木片磅单", Plate: wood.Trip.Plate, Direction: "inbound", MaterialCode: wood.Trip.MaterialCode, MaterialName: wood.Trip.MaterialName, PartyCode: wood.Trip.PartyCode, PartyName: wood.Trip.PartyName, FirstConfirmedAt: firstWood, SecondConfirmedAt: secondWood, IssuedAt: secondWood, IssuerName: "库管", OriginalGross: "30", OriginalTare: "10", FinalGross: "30", FinalTare: "10"}}
	_, err = wb.ApplyChange(ctx, woodTicket)
	check(err)
	wood = command(wood, "link-ticket", grainintake.Command{TicketSiteCode: "GRAIN-TEST", TicketNo: "WOOD-TICKET"})
	wood = command(wood, "issue-permit", grainintake.Command{})
	if wood.Permit.InspectionID != nil {
		t.Fatal("visual permit has lab evidence")
	}
	wood = command(wood, "approve-permit", grainintake.Command{PermitID: wood.Permit.ID})
	wood, err = flow.Command(ctx, wood.Trip.ID, "confirm-exit", grainintake.Command{Version: wood.Trip.Version, Basis: "permit", PermitID: wood.Permit.ID}, gateEvent)
	check(err)
	if wood.Trip.ExitedAt == nil {
		t.Fatal("visual accepted trip did not exit")
	}
	if len(departed.Events) == 0 {
		t.Fatal("missing process history")
	}
	// Exercise the real handlers and action authorization with a gate principal.
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Request = c.Request.WithContext(auth.ContextWithPrincipal(c.Request.Context(), auth.Principal{UserID: gateActor}))
		c.Next()
	})
	grainintake.NewHandler(flow).Register(router.Group("/api/v1"))
	for _, path := range []string{"/api/v1/grain-intake/permits", fmt.Sprintf("/api/v1/grain-intake/exit-basis/%d", rejected.Trip.ID), "/api/v1/grain-intake/rejections?stage=exited"} {
		out := httptest.NewRecorder()
		router.ServeHTTP(out, httptest.NewRequest(http.MethodGet, path, nil))
		if out.Code != 200 {
			t.Fatalf("HTTP %s: %d %s", path, out.Code, out.Body.String())
		}
	}
	out := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/grain-intake/trips/%d/approve-permit", blocked.Trip.ID), strings.NewReader(`{"version":1}`))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(out, req)
	if out.Code != 403 {
		t.Fatalf("gate HTTP approval: %d %s", out.Code, out.Body.String())
	}

}
