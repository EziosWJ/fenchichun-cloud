package weighbridge

import (
	"errors"
	"regexp"
	"time"
)

// New digest-based synchronization protocol. Version 4 replaces the random
// change identifier with a factory-computed SHA-256 digest and adds
// reconciliation reads. It does not depend on the version 2/3 change protocol.
const (
	SyncSchemaVersion  = 4
	DigestRulesVersion = 1
)

const (
	SyncCategoryTemporary          = "temporary"
	SyncCategoryPredecessorPending = "predecessor_pending"
	SyncCategoryConfigOrData       = "config_or_data"
	SyncCategoryConflict           = "conflict"
)

var digestPattern = regexp.MustCompile(`^[0-9a-f]{64}$`)

var ErrForbiddenSync = errors.New("无权查看厂云同步")

// SyncError classifies a rejected change so the factory can tell a transient
// failure, a pending predecessor, a configuration/data problem and a content
// conflict apart without inspecting messages.
type SyncError struct {
	Category  string `json:"category"`
	Reason    string `json:"reason"`
	Message   string `json:"-"`
	Retryable bool   `json:"retryable"`
}

func (e *SyncError) Error() string { return e.Message }

func newSyncError(category, reason, message string) *SyncError {
	return &SyncError{
		Category:  category,
		Reason:    reason,
		Message:   message,
		Retryable: category == SyncCategoryTemporary || category == SyncCategoryPredecessorPending,
	}
}

// ChangeV4 is one issue, void or reopen change in the digest protocol. The
// digest is computed by the factory and is the change identity; the cloud
// stores it verbatim and never recomputes it.
type ChangeV4 struct {
	SchemaVersion    int             `json:"schemaVersion"`
	DigestVersion    int             `json:"digestVersion"`
	Digest           string          `json:"digest"`
	SiteCode         string          `json:"siteCode"`
	TicketNo         string          `json:"ticketNo"`
	Type             string          `json:"type"`
	PreviousSiteCode string          `json:"previousSiteCode,omitempty"`
	Ticket           *TicketSnapshot `json:"ticket,omitempty"`
	Void             *VoidInfo       `json:"void,omitempty"`
}

func (c ChangeV4) Validate() (int64, error) {
	if c.SchemaVersion != SyncSchemaVersion || c.DigestVersion < 1 || !digestPattern.MatchString(c.Digest) || !identityCode.MatchString(c.SiteCode) || c.TicketNo == "" || len(c.TicketNo) > 200 {
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
	return validateTicketWeights(t, c.Type, SyncSchemaVersion)
}

type ChangeReceiptV4 struct {
	Digest     string    `json:"digest"`
	TicketNo   string    `json:"ticketNo"`
	ChangeType string    `json:"changeType"`
	ReceivedAt time.Time `json:"receivedAt"`
	Duplicate  bool      `json:"duplicate"`
}

type ChangeConfirmation struct {
	Digest        string    `json:"digest"`
	TicketNo      string    `json:"ticketNo"`
	ChangeType    string    `json:"changeType"`
	DigestVersion int       `json:"digestVersion"`
	SchemaVersion int       `json:"schemaVersion"`
	ReceivedAt    time.Time `json:"receivedAt"`
}

type TicketRef struct {
	SiteCode string `json:"siteCode"`
	TicketNo string `json:"ticketNo"`
}

type TicketReconcile struct {
	SiteCode            string               `json:"siteCode"`
	TicketNo            string               `json:"ticketNo"`
	Found               bool                 `json:"found"`
	Status              string               `json:"status,omitempty"`
	LatestDigest        *string              `json:"latestDigest"`
	LatestDigestVersion *int                 `json:"latestDigestVersion"`
	LatestChangeType    *string              `json:"latestChangeType"`
	LatestReceivedAt    *time.Time           `json:"latestReceivedAt"`
	PreviousSiteCode    *string              `json:"previousSiteCode"`
	PreviousTicketNo    *string              `json:"previousTicketNo"`
	ReopenedBy          *TicketRef           `json:"reopenedBy"`
	Changes             []ChangeConfirmation `json:"changes"`
}

type ChangeLookup struct {
	Found        bool                `json:"found"`
	SiteCode     string              `json:"siteCode"`
	Digest       string              `json:"digest"`
	Confirmation *ChangeConfirmation `json:"confirmation"`
}

type SiteReceipt struct {
	SiteCode           string     `json:"siteCode"`
	SiteName           string     `json:"siteName"`
	Enabled            bool       `json:"enabled"`
	ReceivedChanges    int64      `json:"receivedChanges"`
	LastReceivedAt     *time.Time `json:"lastReceivedAt"`
	LastTicketNo       *string    `json:"lastTicketNo"`
	LastChangeType     *string    `json:"lastChangeType"`
	LastIssuedSiteCode *string    `json:"lastIssuedSiteCode"`
}

// TicketReceipt is the administrator view of one received ticket, including
// the fields needed to inspect a difference. It is not exposed without
// authentication.
type TicketReceipt struct {
	Found               bool                 `json:"found"`
	SiteCode            string               `json:"siteCode"`
	TicketNo            string               `json:"ticketNo"`
	Status              *string              `json:"status"`
	Ticket              *TicketSnapshot      `json:"ticket"`
	VoidReason          *string              `json:"voidReason"`
	VoidedBy            *string              `json:"voidedBy"`
	VoidedAt            *time.Time           `json:"voidedAt"`
	LatestDigest        *string              `json:"latestDigest"`
	LatestDigestVersion *int                 `json:"latestDigestVersion"`
	LatestChangeType    *string              `json:"latestChangeType"`
	LatestReceivedAt    *time.Time           `json:"latestReceivedAt"`
	PreviousSiteCode    *string              `json:"previousSiteCode"`
	PreviousTicketNo    *string              `json:"previousTicketNo"`
	ReopenedBy          *TicketRef           `json:"reopenedBy"`
	Changes             []ChangeConfirmation `json:"changes"`
}
