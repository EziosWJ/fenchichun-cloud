package weighbridge

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"
)

func intPtr(value int) *int { return &value }

func strPtr(value string) *string { return &value }

func validIssue() Change {
	now := time.Date(2026, 10, 27, 3, 0, 0, 0, time.UTC)
	return Change{SchemaVersion: 2, ChangeID: "change-1", SiteCode: "F001", TicketNo: "F001-20261027-0001", Type: "issue", Ticket: &TicketSnapshot{TicketNo: "F001-20261027-0001", Title: "酒厂过磅单", Plate: "晋A12345", Direction: "inbound", MaterialCode: "C-M-0001", MaterialName: "高粱", PartyCode: "C-P-0001", PartyName: "供货方", FirstConfirmedAt: now, SecondConfirmedAt: now, IssuedAt: now, IssuerName: "操作员", OriginalGross: "30", OriginalTare: "9", FinalGross: "30", FinalTare: "10"}}
}

func validIssueV3() Change {
	c := validIssue()
	c.SchemaVersion = 3
	c.Ticket.FinalNet = "19.5"
	c.Ticket.NetAdjustment = "0.5"
	c.Ticket.NetAdjustmentMode = "amount"
	c.Ticket.NetAdjustmentCategory = "QUALITY"
	c.Ticket.NetAdjustmentCategoryName = "质量差"
	return c
}

func TestVersion3FactoryPayload(t *testing.T) {
	body, err := os.ReadFile("testdata/change_v3_issue.json")
	if err != nil {
		t.Fatal(err)
	}
	var c Change
	if err := json.Unmarshal(body, &c); err != nil {
		t.Fatal(err)
	}
	net, err := c.Validate()
	if err != nil || net != 500 || c.Ticket.FinalNet != "0.5" || c.Ticket.NetAdjustment != "0.1" || c.Ticket.NetAdjustmentCategory != "QUALITY" {
		t.Fatalf("payload: net=%d err=%v ticket=%+v", net, err, c.Ticket)
	}
}

func TestVersion2JSONKeepsRetryHash(t *testing.T) {
	body, err := json.Marshal(validIssue())
	if err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{"finalNet", "netAdjustment", "previousFinalNet", "previousNetAdjustment"} {
		if strings.Contains(string(body), field) {
			t.Fatalf("version 2 payload contains %s: %s", field, body)
		}
	}
	sum := sha256.Sum256(body)
	const previousHash = "4ee6dc0012dc7e1d224e8aec19630b235f942ffcdb27496566f178a5866ae55e"
	if got := hex.EncodeToString(sum[:]); got != previousHash {
		t.Fatalf("version 2 retry hash changed: %s", got)
	}
}

func TestChangeValidation(t *testing.T) {
	t.Run("adjusted final net", func(t *testing.T) {
		c := validIssue()
		got, err := c.Validate()
		if err != nil || got != 20000 {
			t.Fatalf("net=%d err=%v", got, err)
		}
	})
	t.Run("version 3 net adjustment", func(t *testing.T) {
		c := validIssueV3()
		got, err := c.Validate()
		if err != nil || got != 19500 {
			t.Fatalf("net=%d err=%v", got, err)
		}
	})
	t.Run("version 3 final net must match weights", func(t *testing.T) {
		c := validIssueV3()
		c.Ticket.FinalNet = "19.4"
		if _, err := c.Validate(); err == nil {
			t.Fatal("expected inconsistent final net rejection")
		}
	})
	t.Run("version 3 zero adjustment", func(t *testing.T) {
		c := validIssueV3()
		c.Ticket.FinalNet = "20"
		c.Ticket.NetAdjustment = "0"
		c.Ticket.NetAdjustmentCategory = ""
		c.Ticket.NetAdjustmentCategoryName = ""
		if got, err := c.Validate(); err != nil || got != 20000 {
			t.Fatalf("net=%d err=%v", got, err)
		}
	})
	t.Run("version 3 percentage adjustment", func(t *testing.T) {
		c := validIssueV3()
		c.Ticket.FinalNet = "19.7"
		c.Ticket.NetAdjustment = "0.3"
		c.Ticket.NetAdjustmentMode = "percent"
		c.Ticket.NetAdjustmentRateBP = intPtr(150)
		if got, err := c.Validate(); err != nil || got != 19700 {
			t.Fatalf("net=%d err=%v", got, err)
		}
	})
	t.Run("version 3 adjustment needs category", func(t *testing.T) {
		c := validIssueV3()
		c.Ticket.NetAdjustmentCategory = ""
		if _, err := c.Validate(); err == nil {
			t.Fatal("expected missing category rejection")
		}
	})
	t.Run("version 3 upward adjustment only on reopen", func(t *testing.T) {
		c := validIssueV3()
		c.Ticket.FinalNet = "20.5"
		c.Ticket.NetAdjustment = "-0.5"
		if _, err := c.Validate(); err == nil {
			t.Fatal("expected issue upward adjustment rejection")
		}
	})
	t.Run("version 3 reopen carries previous net", func(t *testing.T) {
		c := validIssueV3()
		c.Type = "reopen"
		old := "F001-20261026-0001"
		oldGross, oldTare, oldNet, oldAdjustment := "30", "10", "19.5", "0.5"
		c.Ticket.PreviousTicketNo = &old
		c.Ticket.PreviousFinalGross = &oldGross
		c.Ticket.PreviousFinalTare = &oldTare
		c.Ticket.PreviousFinalNet = &oldNet
		c.Ticket.PreviousNetAdjustment = &oldAdjustment
		c.PreviousSiteCode = "F001"
		if _, err := c.Validate(); err != nil {
			t.Fatal(err)
		}
		c.Ticket.PreviousFinalNet = strPtr("19.4")
		if _, err := c.Validate(); err == nil {
			t.Fatal("expected inconsistent previous net rejection")
		}
	})
	t.Run("version 2 rejects version 3 fields", func(t *testing.T) {
		c := validIssue()
		c.Ticket.FinalNet = "19.5"
		if _, err := c.Validate(); err == nil {
			t.Fatal("expected mixed version rejection")
		}
	})
	t.Run("version 3 void", func(t *testing.T) {
		c := validIssue()
		c.SchemaVersion = 3
		c.Type = "void"
		c.Ticket = nil
		c.Void = &VoidInfo{Reason: "更正", Actor: "操作员", At: time.Now()}
		if _, err := c.Validate(); err != nil {
			t.Fatal(err)
		}
	})
	t.Run("invalid original cannot be hidden by adjustment", func(t *testing.T) {
		c := validIssue()
		c.Ticket.OriginalGross = "8"
		if _, err := c.Validate(); err == nil {
			t.Fatal("expected invalid original weights")
		}
	})
	t.Run("reopen needs distinct previous ticket", func(t *testing.T) {
		c := validIssue()
		c.Type = "reopen"
		if _, err := c.Validate(); err == nil {
			t.Fatal("expected previous ticket")
		}
		old := "F001-20261026-0001"
		c.Ticket.PreviousTicketNo = &old
		c.PreviousSiteCode = "F001"
		if _, err := c.Validate(); err != nil {
			t.Fatal(err)
		}
	})
	t.Run("void cannot rewrite snapshot", func(t *testing.T) {
		c := validIssue()
		c.Type = "void"
		c.Void = &VoidInfo{Reason: "更正", Actor: "操作员", At: time.Now()}
		if _, err := c.Validate(); err == nil {
			t.Fatal("expected rejection")
		}
		c.Ticket = nil
		if _, err := c.Validate(); err != nil {
			t.Fatal(err)
		}
	})
}
