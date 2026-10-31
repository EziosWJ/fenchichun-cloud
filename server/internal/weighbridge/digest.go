package weighbridge

import (
	"crypto/sha256"
	"encoding/hex"
	"strconv"
	"strings"
	"time"
)

const digestInputPrefix = "wb-change-digest\n"

// CanonicalChangeDigest is the reference implementation of digest rules
// version 1. The receive path never calls it: the cloud stores the digest
// uploaded by the factory and does not recompute it. It exists so that the
// published test vectors and both implementations can be checked against the
// same definition.
//
// Canonical input is the UTF-8 prefix "wb-change-digest\n" followed, in the
// documented order, by fields encoded as name + ":" + byte length + ":" +
// value + "\n". Absent nullable fields are encoded as name + ":null\n".
func CanonicalChangeDigest(c ChangeV4) (string, error) {
	if c.DigestVersion != DigestRulesVersion {
		return "", ErrInvalid
	}
	probe := c
	probe.Digest = strings.Repeat("0", 64)
	if _, err := probe.Validate(); err != nil {
		return "", err
	}
	var b strings.Builder
	b.WriteString(digestInputPrefix)
	writeDigestField(&b, "rulesVersion", strconv.Itoa(DigestRulesVersion))
	writeDigestField(&b, "siteCode", c.SiteCode)
	writeDigestField(&b, "ticketNo", c.TicketNo)
	writeDigestField(&b, "changeType", c.Type)
	if c.Type == "reopen" {
		writeDigestField(&b, "previousSiteCode", c.PreviousSiteCode)
		writeDigestField(&b, "previousTicketNo", *c.Ticket.PreviousTicketNo)
	} else {
		writeDigestNull(&b, "previousSiteCode")
		writeDigestNull(&b, "previousTicketNo")
	}
	if c.Type == "void" {
		writeDigestField(&b, "voidReason", c.Void.Reason)
		writeDigestField(&b, "voidActor", c.Void.Actor)
		writeDigestField(&b, "voidAt", canonicalDigestTime(c.Void.At))
	} else if err := writeTicketDigestFields(&b, c.Ticket); err != nil {
		return "", err
	}
	sum := sha256.Sum256([]byte(b.String()))
	return hex.EncodeToString(sum[:]), nil
}

func writeTicketDigestFields(b *strings.Builder, t *TicketSnapshot) error {
	for _, value := range []struct {
		name  string
		value string
	}{
		{"title", t.Title},
		{"plate", t.Plate},
		{"direction", t.Direction},
		{"materialCode", t.MaterialCode},
		{"materialName", t.MaterialName},
		{"materialSpec", t.MaterialSpec},
		{"partyCode", t.PartyCode},
		{"partyName", t.PartyName},
	} {
		writeDigestField(b, value.name, value.value)
	}
	for _, value := range []struct {
		name string
		time time.Time
	}{
		{"firstConfirmedAt", t.FirstConfirmedAt},
		{"secondConfirmedAt", t.SecondConfirmedAt},
		{"issuedAt", t.IssuedAt},
	} {
		writeDigestField(b, value.name, canonicalDigestTime(value.time))
	}
	writeDigestField(b, "issuerName", t.IssuerName)
	for _, value := range []struct {
		name   string
		value  string
		signed bool
	}{
		{"originalGross", t.OriginalGross, false},
		{"originalTare", t.OriginalTare, false},
		{"finalGross", t.FinalGross, false},
		{"finalTare", t.FinalTare, false},
		{"finalNet", t.FinalNet, false},
		{"netAdjustment", t.NetAdjustment, true},
	} {
		canonical, err := canonicalDigestWeight(value.value, value.signed)
		if err != nil {
			return err
		}
		writeDigestField(b, value.name, canonical)
	}
	writeDigestField(b, "netAdjustmentMode", t.NetAdjustmentMode)
	if t.NetAdjustmentRateBP == nil {
		writeDigestNull(b, "netAdjustmentRateBp")
	} else {
		writeDigestField(b, "netAdjustmentRateBp", strconv.Itoa(*t.NetAdjustmentRateBP))
	}
	writeDigestField(b, "netAdjustmentCategory", t.NetAdjustmentCategory)
	writeDigestField(b, "netAdjustmentCategoryName", t.NetAdjustmentCategoryName)
	for _, value := range []struct {
		name   string
		value  *string
		signed bool
	}{
		{"previousFinalGross", t.PreviousFinalGross, false},
		{"previousFinalTare", t.PreviousFinalTare, false},
		{"previousFinalNet", t.PreviousFinalNet, false},
		{"previousNetAdjustment", t.PreviousNetAdjustment, true},
	} {
		if value.value == nil {
			writeDigestNull(b, value.name)
			continue
		}
		canonical, err := canonicalDigestWeight(*value.value, value.signed)
		if err != nil {
			return err
		}
		writeDigestField(b, value.name, canonical)
	}
	writeDigestField(b, "grossSource", t.GrossSource)
	writeDigestField(b, "tareSource", t.TareSource)
	writeDigestField(b, "adjustmentRemark", t.AdjustmentRemark)
	if t.AdjustedBy == nil {
		writeDigestNull(b, "adjustedBy")
	} else {
		writeDigestField(b, "adjustedBy", *t.AdjustedBy)
	}
	if t.AdjustedAt == nil {
		writeDigestNull(b, "adjustedAt")
	} else {
		writeDigestField(b, "adjustedAt", canonicalDigestTime(*t.AdjustedAt))
	}
	writeDigestField(b, "driver", t.Driver)
	writeDigestField(b, "driverPhone", t.DriverPhone)
	writeDigestField(b, "contactName", t.ContactName)
	writeDigestField(b, "contactPhone", t.ContactPhone)
	return nil
}

func writeDigestField(b *strings.Builder, name, value string) {
	b.WriteString(name)
	b.WriteByte(':')
	b.WriteString(strconv.Itoa(len(value)))
	b.WriteByte(':')
	b.WriteString(value)
	b.WriteByte('\n')
}

func writeDigestNull(b *strings.Builder, name string) {
	b.WriteString(name)
	b.WriteString(":null\n")
}

func canonicalDigestWeight(value string, signed bool) (string, error) {
	milli, err := ParseTonnes(value, signed)
	if err != nil {
		return "", err
	}
	sign := ""
	if milli < 0 {
		sign = "-"
		milli = -milli
	}
	return sign + strconv.FormatInt(milli/1000, 10) + "." + padMilli(milli%1000), nil
}

func padMilli(value int64) string {
	text := strconv.FormatInt(value, 10)
	for len(text) < 3 {
		text = "0" + text
	}
	return text
}

func canonicalDigestTime(value time.Time) string {
	return value.UTC().Truncate(time.Millisecond).Format("2006-01-02T15:04:05.000Z")
}
