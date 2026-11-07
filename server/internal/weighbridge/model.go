package weighbridge

import (
	"errors"
	"math"
	"time"
)

var (
	ErrInvalid      = errors.New("参数错误")
	ErrUnauthorized = errors.New("厂端身份无效")
	ErrConflict     = errors.New("变化冲突或前序变化尚未完成")
)

// NetAdjustmentItem is one signed deduction or uplift inside a version 5
// ticket. Amount is the resolved signed tonne string; RateBP is set only for
// percent items and is the ratio in 0.01% units. Category and CategoryName are
// the dictionary snapshot taken when the factory issued the ticket.
type NetAdjustmentItem struct {
	Mode         string `json:"mode"`
	Amount       string `json:"amount"`
	RateBP       *int   `json:"rateBp"`
	Category     string `json:"category"`
	CategoryName string `json:"categoryName"`
	Remark       string `json:"remark"`
}

type TicketSnapshot struct {
	TicketNo                  string    `json:"ticketNo"`
	PreviousTicketNo          *string   `json:"previousTicketNo"`
	Title                     string    `json:"title"`
	Plate                     string    `json:"plate"`
	Direction                 string    `json:"direction"`
	MaterialCode              string    `json:"materialCode"`
	MaterialName              string    `json:"materialName"`
	MaterialSpec              string    `json:"materialSpec"`
	PartyCode                 string    `json:"partyCode"`
	PartyName                 string    `json:"partyName"`
	FirstConfirmedAt          time.Time `json:"firstConfirmedAt"`
	SecondConfirmedAt         time.Time `json:"secondConfirmedAt"`
	IssuedAt                  time.Time `json:"issuedAt"`
	IssuerName                string    `json:"issuerName"`
	OriginalGross             string    `json:"originalGross"`
	OriginalTare              string    `json:"originalTare"`
	FinalGross                string    `json:"finalGross"`
	FinalTare                 string    `json:"finalTare"`
	FinalNet                  string    `json:"finalNet,omitempty"`
	NetAdjustment             string    `json:"netAdjustment,omitempty"`
	NetAdjustmentMode         string    `json:"netAdjustmentMode,omitempty"`
	NetAdjustmentRateBP       *int      `json:"netAdjustmentRateBp,omitempty"`
	NetAdjustmentCategory     string    `json:"netAdjustmentCategory,omitempty"`
	NetAdjustmentCategoryName string    `json:"netAdjustmentCategoryName,omitempty"`
	// NetAdjustments is present for schema version 5 snapshots and absent for
	// older protocols. A pointer distinguishes a missing array (invalid in
	// version 5) from an empty array (no adjustment).
	NetAdjustments        *[]NetAdjustmentItem `json:"netAdjustments,omitempty"`
	PreviousFinalGross    *string              `json:"previousFinalGross"`
	PreviousFinalTare     *string              `json:"previousFinalTare"`
	PreviousFinalNet      *string              `json:"previousFinalNet,omitempty"`
	PreviousNetAdjustment *string              `json:"previousNetAdjustment,omitempty"`
	GrossSource           string               `json:"grossSource"`
	TareSource            string               `json:"tareSource"`
	AdjustmentRemark      string               `json:"adjustmentRemark"`
	AdjustedBy            *string              `json:"adjustedBy"`
	AdjustedAt            *time.Time           `json:"adjustedAt"`
	Driver                string               `json:"driver"`
	DriverPhone           string               `json:"driverPhone"`
	ContactName           string               `json:"contactName"`
	ContactPhone          string               `json:"contactPhone"`
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
	if (c.SchemaVersion != 2 && c.SchemaVersion != 3) || c.ChangeID == "" || len(c.ChangeID) > 200 || !identityCode.MatchString(c.SiteCode) || c.TicketNo == "" || len(c.TicketNo) > 200 {
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
	if c.Type == "issue" && (t.PreviousTicketNo != nil || t.PreviousFinalGross != nil || t.PreviousFinalTare != nil || t.PreviousFinalNet != nil || t.PreviousNetAdjustment != nil || c.PreviousSiteCode != "") {
		return 0, ErrInvalid
	}
	return validateTicketWeights(t, c.Type, c.SchemaVersion)
}

// validateTicketWeights applies the shared weight and adjustment rules for
// version 2, 3 and 4 tickets. Version 4 uses the version 3 field semantics.
func validateTicketWeights(t *TicketSnapshot, changeType string, schemaVersion int) (int64, error) {
	if schemaVersion < SyncSchemaVersionV5 && t.NetAdjustments != nil {
		return 0, ErrInvalid
	}
	og, e1 := ParseTonnes(t.OriginalGross, false)
	ot, e2 := ParseTonnes(t.OriginalTare, false)
	fg, e3 := ParseTonnes(t.FinalGross, false)
	ft, e4 := ParseTonnes(t.FinalTare, false)
	if e1 != nil || e2 != nil || e3 != nil || e4 != nil || ot <= 0 || og <= ot || ft <= 0 || fg <= ft {
		return 0, ErrInvalid
	}
	finalNet := fg - ft
	if schemaVersion >= 3 {
		if t.FinalNet == "" || t.NetAdjustment == "" || t.NetAdjustmentMode == "" {
			return 0, ErrInvalid
		}
		net, err := ParseTonnes(t.FinalNet, false)
		if err != nil || net <= 0 || net >= fg {
			return 0, ErrInvalid
		}
		adjustment, err := ParseTonnes(t.NetAdjustment, true)
		if err != nil || fg-ft-adjustment != net {
			return 0, ErrInvalid
		}
		if err := validateNetAdjustment(t, adjustment, changeType); err != nil {
			return 0, err
		}
		finalNet = net
	} else if t.FinalNet != "" || t.NetAdjustment != "" || t.NetAdjustmentMode != "" || t.NetAdjustmentRateBP != nil || t.NetAdjustmentCategory != "" || t.NetAdjustmentCategoryName != "" || t.PreviousFinalNet != nil || t.PreviousNetAdjustment != nil {
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
		if schemaVersion >= 3 {
			if t.PreviousFinalNet == nil || t.PreviousNetAdjustment == nil {
				return 0, ErrInvalid
			}
			previousNet, err1 := ParseTonnes(*t.PreviousFinalNet, false)
			previousAdjustment, err2 := ParseTonnes(*t.PreviousNetAdjustment, true)
			if err1 != nil || err2 != nil || previousNet <= 0 || previousNet >= pg || pg-pt-previousAdjustment != previousNet {
				return 0, ErrInvalid
			}
		}
	} else if schemaVersion >= 3 && changeType == "reopen" {
		return 0, ErrInvalid
	}
	return finalNet, nil
}

// validateNetAdjustment mirrors the factory-side rules for a version 3 ticket.
func validateNetAdjustment(t *TicketSnapshot, adjustment int64, changeType string) error {
	switch t.NetAdjustmentMode {
	case "amount":
		if t.NetAdjustmentRateBP != nil {
			return ErrInvalid
		}
	case "percent":
		if t.NetAdjustmentRateBP == nil || *t.NetAdjustmentRateBP < -10000 || *t.NetAdjustmentRateBP > 10000 {
			return ErrInvalid
		}
	default:
		return ErrInvalid
	}
	if adjustment != 0 && t.NetAdjustmentCategory == "" {
		return ErrInvalid
	}
	if adjustment < 0 && changeType != "reopen" {
		return ErrInvalid
	}
	return nil
}

// validateTicketWeightsV5 applies the multi-item rules of schema version 5.
// It checks that each detail item, the rounded percent resolution, the signed
// total and the final net agree. The cloud never recomputes the factory
// digest, so this is an internal-consistency check only.
func validateTicketWeightsV5(t *TicketSnapshot, changeType string) (int64, error) {
	og, e1 := ParseTonnes(t.OriginalGross, false)
	ot, e2 := ParseTonnes(t.OriginalTare, false)
	fg, e3 := ParseTonnes(t.FinalGross, false)
	ft, e4 := ParseTonnes(t.FinalTare, false)
	if e1 != nil || e2 != nil || e3 != nil || e4 != nil || ot <= 0 || og <= ot || ft <= 0 || fg <= ft {
		return 0, ErrInvalid
	}
	base := fg - ft
	if t.FinalNet == "" || t.NetAdjustment == "" {
		return 0, ErrInvalid
	}
	net, err := ParseTonnes(t.FinalNet, false)
	if err != nil || net <= 0 || net >= fg {
		return 0, ErrInvalid
	}
	adjustment, err := ParseTonnes(t.NetAdjustment, true)
	if err != nil || base-adjustment != net {
		return 0, ErrInvalid
	}
	// Version 5 replaced the whole-ticket single-item fields with the detail
	// array. A version 5 ticket must not carry both descriptions.
	if t.NetAdjustmentMode != "" || t.NetAdjustmentRateBP != nil || t.NetAdjustmentCategory != "" || t.NetAdjustmentCategoryName != "" {
		return 0, ErrInvalid
	}
	if t.NetAdjustments == nil {
		return 0, ErrInvalid
	}
	items := *t.NetAdjustments
	var total int64
	for _, item := range items {
		amount, err := ParseTonnes(item.Amount, true)
		if err != nil || amount == 0 {
			return 0, ErrInvalid
		}
		if amount < 0 && changeType != "reopen" {
			return 0, ErrInvalid
		}
		if item.Category == "" {
			return 0, ErrInvalid
		}
		switch item.Mode {
		case "amount":
			if item.RateBP != nil {
				return 0, ErrInvalid
			}
		case "percent":
			if item.RateBP == nil || *item.RateBP == 0 || *item.RateBP < -10000 || *item.RateBP > 10000 {
				return 0, ErrInvalid
			}
			if *item.RateBP < 0 && changeType != "reopen" {
				return 0, ErrInvalid
			}
			if base > math.MaxInt64/10000 {
				return 0, ErrInvalid
			}
			if roundRatio(base*int64(*item.RateBP), 10000) != amount {
				return 0, ErrInvalid
			}
		default:
			return 0, ErrInvalid
		}
		total += amount
	}
	if total != adjustment {
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
		if t.PreviousFinalNet == nil || t.PreviousNetAdjustment == nil {
			return 0, ErrInvalid
		}
		previousNet, err1 := ParseTonnes(*t.PreviousFinalNet, false)
		previousAdjustment, err2 := ParseTonnes(*t.PreviousNetAdjustment, true)
		if err1 != nil || err2 != nil || previousNet <= 0 || previousNet >= pg || pg-pt-previousAdjustment != previousNet {
			return 0, ErrInvalid
		}
	} else if changeType == "reopen" {
		return 0, ErrInvalid
	}
	return net, nil
}

// roundRatio rounds half away from zero, matching the factory's percent
// resolution to 0.001 tonne.
func roundRatio(numerator, denominator int64) int64 {
	if numerator >= 0 {
		return (numerator + denominator/2) / denominator
	}
	return -((-numerator + denominator/2) / denominator)
}
