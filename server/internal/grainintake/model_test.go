package grainintake

import (
	"testing"
	"time"

	"fenchichun.local/server/internal/weighbridge"
)

func TestRegistrationAllowsUnverifiedSupplier(t *testing.T) {
	in := Input{SiteCode: " F001 ", Plate: " 晋a12345 ", MaterialCode: " M1 "}
	in.normalize()
	if in.Plate != "晋A12345" || in.SiteCode != "F001" || in.MaterialCode != "M1" {
		t.Fatal("normalization")
	}
	if err := in.validate(); err != nil {
		t.Fatalf("optional supplier/contract: %v", err)
	}
	in.Plate = ""
	if in.validate() == nil {
		t.Fatal("missing plate accepted")
	}
}
func TestQueryRejectsUnknownStage(t *testing.T) {
	if _, err := normalizeQuery(Query{Stage: "any-status"}); err == nil {
		t.Fatal("unknown stage accepted")
	}
	q, err := normalizeQuery(Query{Page: -1, PageSize: 1000})
	if err != nil || q.Page != 1 || q.PageSize != 100 {
		t.Fatalf("pagination: %+v %v", q, err)
	}
}

func TestTicketLinkReasonFollowsWeighingOrder(t *testing.T) {
	selected := time.Date(2026, 11, 6, 8, 0, 0, 0, time.UTC)
	confirmed := selected.Add(-time.Minute)
	unloaded := selected.Add(10 * time.Minute)
	effective := int64(11)
	base := Trip{EffectiveInspectionID: &effective, EffectiveSelectedAt: &selected, UnloadedAt: &unloaded}
	valid := weighbridge.TicketSnapshot{FirstConfirmedAt: selected.Add(time.Minute), SecondConfirmedAt: unloaded.Add(time.Minute)}
	if reason := ticketLinkReason(base, &confirmed, valid); reason != "" {
		t.Fatalf("valid order rejected: %s", reason)
	}
	cases := []struct {
		name string
		trip Trip
		snap weighbridge.TicketSnapshot
		want string
	}{
		{"no inspection", Trip{}, valid, "尚未选择生效化验单"},
		{"not unloaded", Trip{EffectiveInspectionID: &effective, EffectiveSelectedAt: &selected}, valid, "尚未确认卸粮"},
		{"first before inspection", base, weighbridge.TicketSnapshot{FirstConfirmedAt: confirmed.Add(-time.Minute), SecondConfirmedAt: unloaded.Add(time.Minute)}, "首磅早于化验生效"},
		{"first after unloading", base, weighbridge.TicketSnapshot{FirstConfirmedAt: unloaded.Add(time.Minute), SecondConfirmedAt: unloaded.Add(2 * time.Minute)}, "首磅晚于卸粮"},
		{"second before unloading", base, weighbridge.TicketSnapshot{FirstConfirmedAt: selected.Add(time.Minute), SecondConfirmedAt: unloaded.Add(-time.Minute)}, "回磅早于卸粮"},
	}
	for _, c := range cases {
		if reason := ticketLinkReason(c.trip, &confirmed, c.snap); reason != c.want {
			t.Errorf("%s: got %q want %q", c.name, reason, c.want)
		}
	}
}
