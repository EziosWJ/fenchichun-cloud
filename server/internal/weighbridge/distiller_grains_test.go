package weighbridge

import (
	"testing"
	"time"
)

func TestDistillerGrainsRange(t *testing.T) {
	now := time.Date(2026, 11, 24, 15, 30, 0, 0, statementZone) // Tuesday
	for _, tc := range []struct {
		period   string
		from     string
		to       string
		expected bool
	}{
		{"today", "2026-11-24", "2026-11-24", true},
		{"yesterday", "2026-11-23", "2026-11-23", true},
		{"week", "2026-11-23", "2026-11-24", true},
		{"last-week", "2026-11-16", "2026-11-22", true},
		{"month", "2026-11-01", "2026-11-24", true},
		{"last-month", "2026-10-01", "2026-10-31", true},
		{"range", "", "", false},
	} {
		from, to, ok := DistillerGrainsRange(now, tc.period)
		if ok != tc.expected {
			t.Fatalf("%s: ok = %v", tc.period, ok)
		}
		if !ok {
			continue
		}
		if got := from.Format("2006-01-02"); got != tc.from {
			t.Fatalf("%s: from = %s", tc.period, got)
		}
		if got := to.Format("2006-01-02"); got != tc.to {
			t.Fatalf("%s: to = %s", tc.period, got)
		}
	}
}

func TestDistillerGrainsWeekStartsOnMonday(t *testing.T) {
	sunday := time.Date(2026, 11, 29, 9, 0, 0, 0, statementZone)
	from, to, ok := DistillerGrainsRange(sunday, "week")
	if !ok {
		t.Fatal("week range rejected")
	}
	if got := from.Format("2006-01-02"); got != "2026-11-23" {
		t.Fatalf("sunday week start = %s", got)
	}
	if got := to.Format("2006-01-02"); got != "2026-11-29" {
		t.Fatalf("sunday week end = %s", got)
	}
}
