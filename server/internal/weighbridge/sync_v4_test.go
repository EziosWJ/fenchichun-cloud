package weighbridge

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

type digestVectorFile struct {
	RulesVersion int `json:"rulesVersion"`
	Vectors      []struct {
		Name           string   `json:"name"`
		Purpose        string   `json:"purpose"`
		Change         ChangeV4 `json:"change"`
		ExpectedDigest string   `json:"expectedDigest"`
	} `json:"vectors"`
}

func loadDigestVectors(t *testing.T) digestVectorFile {
	t.Helper()
	body, err := os.ReadFile("testdata/digest_v1_vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var file digestVectorFile
	if err := json.Unmarshal(body, &file); err != nil {
		t.Fatal(err)
	}
	return file
}

func TestDigestRulesVectors(t *testing.T) {
	file := loadDigestVectors(t)
	if file.RulesVersion != DigestRulesVersion {
		t.Fatalf("vector rules version = %d, want %d", file.RulesVersion, DigestRulesVersion)
	}
	if len(file.Vectors) < 10 {
		t.Fatalf("expected issue, void, reopen and boundary vectors, got %d", len(file.Vectors))
	}
	for _, vector := range file.Vectors {
		vector := vector
		t.Run(vector.Name, func(t *testing.T) {
			if _, err := vector.Change.Validate(); err != nil {
				t.Fatalf("vector is not a valid change: %v", err)
			}
			got, err := CanonicalChangeDigest(vector.Change)
			if err != nil {
				t.Fatal(err)
			}
			if got != vector.ExpectedDigest {
				t.Fatalf("digest = %s, want %s", got, vector.ExpectedDigest)
			}
			if vector.Change.Digest != vector.ExpectedDigest {
				t.Fatalf("vector change digest = %s, want %s", vector.Change.Digest, vector.ExpectedDigest)
			}
		})
	}
}

func TestDigestVectorsNormalizeEquivalentContent(t *testing.T) {
	file := loadDigestVectors(t)
	digests := map[string]string{}
	for _, vector := range file.Vectors {
		digests[vector.Name] = vector.ExpectedDigest
	}
	for _, group := range [][]string{
		{"issue-basic", "issue-normalized"},
		{"issue-adjusted", "issue-adjusted-truncated"},
		{"void-basic", "void-normalized"},
	} {
		if digests[group[0]] == "" || digests[group[0]] != digests[group[1]] {
			t.Fatalf("%s and %s must share a digest: %q %q", group[0], group[1], digests[group[0]], digests[group[1]])
		}
	}
	for _, pair := range [][2]string{
		{"issue-basic", "issue-empty-adjusted-by"},
		{"reopen-same-site", "reopen-cross-site"},
	} {
		if digests[pair[0]] == digests[pair[1]] {
			t.Fatalf("%s and %s must not share a digest", pair[0], pair[1])
		}
	}
}

func TestCanonicalDigestIgnoresSuppliedDigest(t *testing.T) {
	file := loadDigestVectors(t)
	change := file.Vectors[0].Change
	change.Digest = strings.Repeat("f", 64)
	got, err := CanonicalChangeDigest(change)
	if err != nil {
		t.Fatal(err)
	}
	if got != file.Vectors[0].ExpectedDigest {
		t.Fatalf("supplied digest changed the canonical digest: %s", got)
	}
}

func TestDigestWeightBoundaries(t *testing.T) {
	for _, test := range []struct {
		value  string
		signed bool
		want   string
	}{
		{"30", false, "30.000"},
		{"30.0", false, "30.000"},
		{"30.000", false, "30.000"},
		{"030", false, "30.000"},
		{"0", false, "0.000"},
		{"-0.5", true, "-0.500"},
		{"-0", true, "0.000"},
		{"0.001", true, "0.001"},
	} {
		got, err := canonicalDigestWeight(test.value, test.signed)
		if err != nil || got != test.want {
			t.Fatalf("canonicalDigestWeight(%q, %v) = %q, %v; want %q", test.value, test.signed, got, err, test.want)
		}
	}
	for _, test := range []struct {
		value  string
		signed bool
	}{
		{"", false},
		{" 30", false},
		{"30 ", false},
		{"30.", false},
		{"30.0000", false},
		{"-30", false},
		{"1e3", false},
		{"3O", false},
	} {
		if _, err := canonicalDigestWeight(test.value, test.signed); err == nil {
			t.Fatalf("expected %q to be rejected", test.value)
		}
	}
}

func TestDigestTimeNormalization(t *testing.T) {
	base := time.Date(2026, 10, 30, 8, 0, 0, 123456789, time.FixedZone("Asia/Shanghai", 8*60*60))
	for _, value := range []time.Time{
		base,
		time.Date(2026, 10, 30, 0, 0, 0, 123456789, time.UTC),
		time.Date(2026, 10, 30, 0, 0, 0, 123999999, time.UTC),
	} {
		if got := canonicalDigestTime(value); got != "2026-10-30T00:00:00.123Z" {
			t.Fatalf("canonicalDigestTime(%v) = %s", value, got)
		}
	}
}

func TestChangeV4Validation(t *testing.T) {
	file := loadDigestVectors(t)
	issue := file.Vectors[0].Change
	issueBase := func() ChangeV4 {
		change := issue
		ticket := *issue.Ticket
		change.Ticket = &ticket
		return change
	}
	reopen := func() ChangeV4 {
		for _, vector := range file.Vectors {
			if vector.Name == "reopen-same-site" {
				change := vector.Change
				ticket := *change.Ticket
				change.Ticket = &ticket
				return change
			}
		}
		t.Fatal("reopen vector missing")
		return ChangeV4{}
	}
	for _, test := range []struct {
		name   string
		base   func() ChangeV4
		mutate func(*ChangeV4)
	}{
		{"schema version", issueBase, func(c *ChangeV4) { c.SchemaVersion = 3 }},
		{"digest version", issueBase, func(c *ChangeV4) { c.DigestVersion = 0 }},
		{"digest uppercase", issueBase, func(c *ChangeV4) { c.Digest = strings.Repeat("A", 64) }},
		{"digest length", issueBase, func(c *ChangeV4) { c.Digest = "abc" }},
		{"site code", issueBase, func(c *ChangeV4) { c.SiteCode = "" }},
		{"unknown change type", issueBase, func(c *ChangeV4) { c.Type = "cancel" }},
		{"issue with previous ticket", issueBase, func(c *ChangeV4) { c.Ticket.PreviousTicketNo = strPtr("OTHER") }},
		{"issue with previous site", issueBase, func(c *ChangeV4) { c.PreviousSiteCode = "F000" }},
		{"void with ticket", issueBase, func(c *ChangeV4) {
			c.Type = "void"
			c.Void = &VoidInfo{Reason: "x", Actor: "y", At: time.Now()}
		}},
		{"void without actor", issueBase, func(c *ChangeV4) {
			c.Type = "void"
			c.Ticket = nil
			c.Void = &VoidInfo{Reason: "x", At: time.Now()}
		}},
		{"final net mismatch", issueBase, func(c *ChangeV4) { c.Ticket.FinalNet = "19.4" }},
		{"negative issue adjustment", issueBase, func(c *ChangeV4) {
			c.Ticket.FinalNet = "20.5"
			c.Ticket.NetAdjustment = "-0.5"
		}},
		{"reopen without previous site", reopen, func(c *ChangeV4) { c.PreviousSiteCode = "" }},
		{"reopen without previous ticket", reopen, func(c *ChangeV4) { c.Ticket.PreviousTicketNo = nil }},
		{"reopen without previous net", reopen, func(c *ChangeV4) { c.Ticket.PreviousNetAdjustment = nil }},
	} {
		t.Run(test.name, func(t *testing.T) {
			change := test.base()
			test.mutate(&change)
			if _, err := change.Validate(); err == nil {
				t.Fatalf("expected rejection: %+v", change)
			}
		})
	}
	t.Run("valid reopen accepts negative adjustment", func(t *testing.T) {
		if _, err := reopen().Validate(); err != nil {
			t.Fatalf("valid reopen rejected: %v", err)
		}
	})
	t.Run("valid void", func(t *testing.T) {
		for _, vector := range file.Vectors {
			if vector.Name == "void-basic" {
				if _, err := vector.Change.Validate(); err != nil {
					t.Fatalf("valid void rejected: %v", err)
				}
				return
			}
		}
		t.Fatal("void vector missing")
	})
}

func TestChangeV4DigestIsNotRecomputedByValidation(t *testing.T) {
	file := loadDigestVectors(t)
	change := file.Vectors[0].Change
	change.Digest = strings.Repeat("0", 64)
	if _, err := change.Validate(); err != nil {
		t.Fatalf("an arbitrary well-formed digest must be accepted: %v", err)
	}
}

func TestWriteSyncErrorUnknownFailureIsTemporary(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	writeSyncError(context, errors.New("database unavailable"))
	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusServiceUnavailable)
	}
	var body struct {
		Code int       `json:"code"`
		Data SyncError `json:"data"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Code != http.StatusServiceUnavailable || body.Data.Category != SyncCategoryTemporary || !body.Data.Retryable {
		t.Fatalf("temporary failure body = %+v", body)
	}
}
