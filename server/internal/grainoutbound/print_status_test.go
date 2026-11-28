package grainoutbound

import (
	"testing"
	"time"
)

func TestBuildPrintStatusFailedFirstPrintAllowsScannedRetry(t *testing.T) {
	row := &Weighing{TicketNo: "SITE01-20261126-0010", SiteCode: "SITE01", NetMilliTonne: 600}
	command := &cloudPrintCommand{Status: printFailed, Origin: "completion", UpdatedAt: time.Now()}
	scan := &cloudPrintScan{ID: 1, ExpiresAt: time.Now().Add(time.Minute)}
	view := buildPrintStatus(row, "history", command, nil, nil, scan)
	if !view.CanPrint || !view.ScanRequired || !view.RetryAsReprint {
		t.Fatalf("failed first print must retry by scan: %+v", view)
	}
	if view.PendingScan == nil {
		t.Fatal("an existing scan must stay visible before it is used")
	}
}

func TestBuildPrintStatusUnknownNeedsVerify(t *testing.T) {
	row := &Weighing{TicketNo: "SITE01-20261126-0010", SiteCode: "SITE01"}
	now := time.Now()
	attempts := []cloudPrintAttempt{{AttemptNo: 1, Intent: "initial", Status: printUnknown, UpdatedAt: now}}
	view := buildPrintStatus(row, "completion", nil, nil, attempts, nil)
	if !view.NeedsVerify || view.CanPrint {
		t.Fatalf("unknown attempt must ask the driver to verify: %+v", view)
	}
}

func TestBuildPrintStatusReprintLimit(t *testing.T) {
	row := &Weighing{TicketNo: "SITE01-20261126-0010", SiteCode: "SITE01"}
	attempts := []cloudPrintAttempt{
		{AttemptNo: 3, Intent: "reprint", Status: printPrinted},
		{AttemptNo: 2, Intent: "reprint", Status: printPrinted},
		{AttemptNo: 1, Intent: "initial", Status: printPrinted},
	}
	view := buildPrintStatus(row, "history", nil, nil, attempts, nil)
	if view.ReprintCount != 2 || view.CanPrint {
		t.Fatalf("two reprints must exhaust the limit: %+v", view)
	}
}

func TestBuildPrintStatusPrintedAllowsScannedReprint(t *testing.T) {
	row := &Weighing{TicketNo: "SITE01-20261126-0010", SiteCode: "SITE01"}
	attempts := []cloudPrintAttempt{{AttemptNo: 1, Intent: "initial", Status: printPrinted}}
	view := buildPrintStatus(row, "history", nil, nil, attempts, nil)
	if !view.CanPrint || !view.ScanRequired {
		t.Fatalf("history printing after the first print must scan: %+v", view)
	}
}
