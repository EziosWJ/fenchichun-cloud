package weighbridge

// Version 5 keeps the digest-protocol envelope of version 4 and replaces the
// whole-ticket single net adjustment with an ordered detail array. The cloud
// accepts both versions side by side; existing version 4 data is not migrated.
const (
	SyncSchemaVersionV5 = 5
	SyncDigestVersion3  = 3
)

// ChangeV5 is one issue, void or reopen change of schema version 5. The digest
// is computed by the factory and is the change identity; the cloud stores it
// verbatim and never recomputes it.
type ChangeV5 struct {
	SchemaVersion    int             `json:"schemaVersion"`
	DigestVersion    int             `json:"digestVersion"`
	Digest           string          `json:"digest"`
	SiteCode         string          `json:"siteCode"`
	TicketNo         string          `json:"ticketNo"`
	TripID           *int64          `json:"tripId,omitempty"`
	Type             string          `json:"type"`
	PreviousSiteCode string          `json:"previousSiteCode,omitempty"`
	Ticket           *TicketSnapshot `json:"ticket,omitempty"`
	Void             *VoidInfo       `json:"void,omitempty"`
}

// ChangeReceiptV5 has the same acknowledgement shape as version 4.
type ChangeReceiptV5 = ChangeReceiptV4

func (c ChangeV5) Validate() (int64, error) {
	if c.SchemaVersion != SyncSchemaVersionV5 || c.DigestVersion != SyncDigestVersion3 || !digestPattern.MatchString(c.Digest) || !identityCode.MatchString(c.SiteCode) || c.TicketNo == "" || len(c.TicketNo) > 200 {
		return 0, ErrInvalid
	}
	if (c.Type != "issue" && c.Type != "reopen" && c.Type != "void") || c.Ticket == nil {
		return 0, ErrInvalid
	}
	if c.TripID != nil && *c.TripID <= 0 {
		return 0, ErrInvalid
	}
	t := c.Ticket
	changeType := c.Type
	if c.Type == "void" {
		if c.Void == nil || c.Void.Reason == "" || c.Void.Actor == "" || c.Void.At.IsZero() {
			return 0, ErrInvalid
		}
		changeType = "issue"
		if t.PreviousTicketNo != nil {
			changeType = "reopen"
		}
	} else if c.Void != nil {
		return 0, ErrInvalid
	}
	if t.TicketNo != c.TicketNo || t.MaterialCode == "" || t.MaterialName == "" || t.PartyCode == "" || t.PartyName == "" || t.Plate == "" || t.Title == "" || t.IssuerName == "" || t.IssuedAt.IsZero() || t.FirstConfirmedAt.IsZero() || t.SecondConfirmedAt.IsZero() || (t.Direction != "inbound" && t.Direction != "outbound") {
		return 0, ErrInvalid
	}
	if changeType == "reopen" && (t.PreviousTicketNo == nil || *t.PreviousTicketNo == "" || !identityCode.MatchString(c.PreviousSiteCode) || (c.PreviousSiteCode == c.SiteCode && *t.PreviousTicketNo == c.TicketNo)) {
		return 0, ErrInvalid
	}
	if changeType == "issue" && (t.PreviousTicketNo != nil || t.PreviousFinalGross != nil || t.PreviousFinalTare != nil || t.PreviousFinalNet != nil || t.PreviousNetAdjustment != nil || c.PreviousSiteCode != "") {
		return 0, ErrInvalid
	}
	return validateTicketWeightsV5(t, changeType)
}
