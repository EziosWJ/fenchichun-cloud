package weighbridge

import (
	"errors"
	"time"
)

var (
	ErrInvalid      = errors.New("参数错误")
	ErrUnauthorized = errors.New("厂端身份无效")
	ErrConflict     = errors.New("变化冲突或前序变化尚未完成")
)

type TicketSnapshot struct {
	TicketNo           string     `json:"ticketNo"`
	PreviousTicketNo   *string    `json:"previousTicketNo"`
	Title              string     `json:"title"`
	Plate              string     `json:"plate"`
	Direction          string     `json:"direction"`
	MaterialCode       string     `json:"materialCode"`
	MaterialName       string     `json:"materialName"`
	MaterialSpec       string     `json:"materialSpec"`
	PartyCode          string     `json:"partyCode"`
	PartyName          string     `json:"partyName"`
	FirstConfirmedAt   time.Time  `json:"firstConfirmedAt"`
	SecondConfirmedAt  time.Time  `json:"secondConfirmedAt"`
	IssuedAt           time.Time  `json:"issuedAt"`
	IssuerName         string     `json:"issuerName"`
	OriginalGross      string     `json:"originalGross"`
	OriginalTare       string     `json:"originalTare"`
	FinalGross         string     `json:"finalGross"`
	FinalTare          string     `json:"finalTare"`
	PreviousFinalGross *string    `json:"previousFinalGross"`
	PreviousFinalTare  *string    `json:"previousFinalTare"`
	GrossSource        string     `json:"grossSource"`
	TareSource         string     `json:"tareSource"`
	AdjustmentRemark   string     `json:"adjustmentRemark"`
	AdjustedBy         *string    `json:"adjustedBy"`
	AdjustedAt         *time.Time `json:"adjustedAt"`
	Driver             string     `json:"driver"`
	DriverPhone        string     `json:"driverPhone"`
	ContactName        string     `json:"contactName"`
	ContactPhone       string     `json:"contactPhone"`
}

type Change struct {
	SchemaVersion    int             `json:"schemaVersion"`
	ChangeID         string          `json:"changeId"`
	SiteCode         string          `json:"siteCode"`
	PreviousSiteCode string          `json:"previousSiteCode,omitempty"`
	TicketNo         string          `json:"ticketNo"`
	Type             string          `json:"type"`
	Ticket           *TicketSnapshot `json:"ticket,omitempty"`
	Void             *VoidInfo       `json:"void,omitempty"`
}

type VoidInfo struct {
	Reason string    `json:"reason"`
	Actor  string    `json:"actor"`
	At     time.Time `json:"at"`
}

func (c Change) Validate() (int64, error) {
	if c.SchemaVersion != 2 || c.ChangeID == "" || len(c.ChangeID) > 200 || !identityCode.MatchString(c.SiteCode) || c.TicketNo == "" || len(c.TicketNo) > 200 {
		return 0, ErrInvalid
	}
	if c.Type == "void" {
		if c.PreviousSiteCode != "" || c.Ticket != nil || c.Void == nil || c.Void.Reason == "" || c.Void.Actor == "" || c.Void.At.IsZero() {
			return 0, ErrInvalid
		}
		return 0, nil
	}
	if (c.Type != "issue" && c.Type != "reopen") || c.Ticket == nil || c.Void != nil {
		return 0, ErrInvalid
	}
	t := c.Ticket
	if t.TicketNo != c.TicketNo || t.MaterialCode == "" || t.MaterialName == "" || t.PartyCode == "" || t.PartyName == "" || t.Plate == "" || t.Title == "" || t.IssuerName == "" || t.IssuedAt.IsZero() || t.FirstConfirmedAt.IsZero() || t.SecondConfirmedAt.IsZero() || (t.Direction != "inbound" && t.Direction != "outbound") {
		return 0, ErrInvalid
	}
	if c.Type == "reopen" && (t.PreviousTicketNo == nil || *t.PreviousTicketNo == "" || !identityCode.MatchString(c.PreviousSiteCode) || (c.PreviousSiteCode == c.SiteCode && *t.PreviousTicketNo == c.TicketNo)) {
		return 0, ErrInvalid
	}
	if c.Type == "issue" && (t.PreviousTicketNo != nil || c.PreviousSiteCode != "") {
		return 0, ErrInvalid
	}
	og, e1 := ParseTonnes(t.OriginalGross, false)
	ot, e2 := ParseTonnes(t.OriginalTare, false)
	fg, e3 := ParseTonnes(t.FinalGross, false)
	ft, e4 := ParseTonnes(t.FinalTare, false)
	if e1 != nil || e2 != nil || e3 != nil || e4 != nil || ot <= 0 || og <= ot || ft <= 0 || fg <= ft {
		return 0, ErrInvalid
	}
	if (t.PreviousFinalGross == nil) != (t.PreviousFinalTare == nil) {
		return 0, ErrInvalid
	}
	if t.PreviousFinalGross != nil {
		pg, err1 := ParseTonnes(*t.PreviousFinalGross, false)
		pt, err2 := ParseTonnes(*t.PreviousFinalTare, false)
		if err1 != nil || err2 != nil || pt <= 0 || pg <= pt {
			return 0, ErrInvalid
		}
	}
	return fg - ft, nil
}
