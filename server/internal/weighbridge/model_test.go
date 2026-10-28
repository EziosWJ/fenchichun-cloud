package weighbridge

import (
	"testing"
	"time"
)

func validIssue() Change {
	now := time.Date(2026, 10, 27, 3, 0, 0, 0, time.UTC)
	return Change{SchemaVersion: 1, ChangeID: "change-1", SiteCode: "F001", ScaleCode: "WB01", TicketNo: "F001-20261027-0001", Type: "issue", Ticket: &TicketSnapshot{TicketNo: "F001-20261027-0001", ScaleCode: "WB01", Title: "酒厂过磅单", Plate: "晋A12345", Direction: "inbound", MaterialCode: "C-M-0001", MaterialName: "高粱", PartyCode: "C-P-0001", PartyName: "供货方", FirstConfirmedAt: now, SecondConfirmedAt: now, IssuedAt: now, IssuerName: "操作员", OriginalGross: "30", OriginalTare: "9", FinalGross: "30", FinalTare: "10"}}
}

func TestChangeValidation(t *testing.T) {
	t.Run("adjusted final net", func(t *testing.T) {
		c := validIssue()
		got, err := c.Validate()
		if err != nil || got != 20000 {
			t.Fatalf("net=%d err=%v", got, err)
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
