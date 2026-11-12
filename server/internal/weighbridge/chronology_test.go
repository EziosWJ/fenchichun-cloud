package weighbridge

import (
	"testing"
	"time"
)

func TestInspectionOrderReason(t *testing.T) {
	selected := time.Date(2026, 11, 6, 8, 0, 0, 0, time.UTC)
	confirmed := selected.Add(-time.Minute)
	first := selected.Add(time.Minute)
	cases := []struct {
		name      string
		method    string
		accepted  bool
		confirmed *time.Time
		selected  *time.Time
		first     time.Time
		want      string
	}{
		{"visual accepted", "visual", true, &confirmed, nil, first, ""},
		{"visual not accepted", "visual", false, &confirmed, nil, first, "尚未确认目测接收"},
		{"visual missing time", "visual", true, nil, nil, first, "尚未确认目测接收"},
		{"lab valid", "lab", true, &confirmed, &selected, first, ""},
		{"lab missing selection", "lab", true, &confirmed, nil, first, "尚未选择生效化验单"},
		{"first before inspection", "lab", true, &confirmed, &selected, confirmed.Add(-time.Minute), "首磅早于化验生效"},
		{"first before selection", "lab", true, &confirmed, &selected, selected.Add(-time.Second), "首磅早于化验生效"},
	}
	for _, c := range cases {
		if got := InspectionOrderReason(c.method, c.accepted, c.confirmed, c.selected, c.first); got != c.want {
			t.Errorf("%s: got %q want %q", c.name, got, c.want)
		}
	}
}

func TestUnloadOrderReason(t *testing.T) {
	unloaded := time.Date(2026, 11, 6, 8, 30, 0, 0, time.UTC)
	first := unloaded.Add(-time.Minute)
	second := unloaded.Add(time.Minute)
	if got := UnloadOrderReason(nil, first, second); got != "" {
		t.Fatalf("unconfirmed unloading: %q", got)
	}
	if got := UnloadOrderReason(&unloaded, first, second); got != "" {
		t.Fatalf("valid order: %q", got)
	}
	if got := UnloadOrderReason(&unloaded, unloaded.Add(time.Minute), second.Add(time.Minute)); got != "首磅晚于卸粮" {
		t.Fatalf("first after unloading: %q", got)
	}
	if got := UnloadOrderReason(&unloaded, first, unloaded.Add(-time.Minute)); got != "回磅早于卸粮" {
		t.Fatalf("second before unloading: %q", got)
	}
}
