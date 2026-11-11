package grainintake

import (
	"context"
	"testing"
	"time"

	"fenchichun.local/server/internal/deduction"
)

func TestSyncTripBlockers(t *testing.T) {
	row := syncTripRow{TripNo: "LZ-1", Plate: "晋A12345", InspectionMethod: "lab", EffectiveInspectionID: ptrInt64(9), Stage: "pending_unload"}
	trip := SyncTrip{Inspection: &SyncInspection{ID: 9, Status: "confirmed", Conclusion: "accept", Moisture: "13.5"}}
	if blockers := syncTripBlockers(row, trip); len(blockers) != 0 {
		t.Fatalf("unexpected blockers: %+v", blockers)
	}
	linked := row
	linked.TicketNo = "T-1"
	if blockers := syncTripBlockers(linked, trip); len(blockers) != 1 {
		t.Fatalf("ticket blocker: %+v", blockers)
	}
	missing := row
	missing.EffectiveInspectionID = nil
	if blockers := syncTripBlockers(missing, SyncTrip{}); len(blockers) != 1 {
		t.Fatalf("missing inspection blocker: %+v", blockers)
	}
	rejected := trip
	rejected.Inspection = &SyncInspection{ID: 9, Status: "confirmed", Conclusion: "reject"}
	if blockers := syncTripBlockers(row, rejected); len(blockers) != 1 {
		t.Fatalf("rejected blocker: %+v", blockers)
	}
	visual := syncTripRow{InspectionMethod: "visual", VisualConclusion: "accept", Stage: "pending_unload"}
	if blockers := syncTripBlockers(visual, SyncTrip{}); len(blockers) != 0 {
		t.Fatalf("visual accept blockers: %+v", blockers)
	}
	exited := row
	exited.ExitedAt = ptrTime(time.Now())
	if blockers := syncTripBlockers(exited, trip); len(blockers) != 1 {
		t.Fatalf("exited blocker: %+v", blockers)
	}
}

func TestSyncTripDecorateDeductions(t *testing.T) {
	service := NewSyncService(nil, fakeEvaluator{})
	values, err := service.decorate(context.Background(), []SyncTrip{{MaterialCode: "C-M-0010", Inspection: &SyncInspection{Conclusion: "accept", Moisture: "13.5"}}})
	if err != nil {
		t.Fatal(err)
	}
	if len(values[0].Deductions) != 1 || values[0].Deductions[0].RateBP == nil || *values[0].Deductions[0].RateBP != 100 {
		t.Fatalf("deductions: %+v", values[0].Deductions)
	}
}

type fakeEvaluator struct{}

func (fakeEvaluator) Evaluate(context.Context, string, string, string) ([]deduction.Evaluation, error) {
	rate := 100
	return []deduction.Evaluation{{RuleCode: "DR-1", CategoryCode: "WATER", CategoryName: "水分", Mode: deduction.ModePercent, RateBP: &rate}}, nil
}

func ptrInt64(value int64) *int64        { return &value }
func ptrTime(value time.Time) *time.Time { return &value }
