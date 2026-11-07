package weighbridge

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

type digestV3VectorFile struct {
	RulesVersion int `json:"rulesVersion"`
	Vectors      []struct {
		Name           string   `json:"name"`
		Purpose        string   `json:"purpose"`
		Change         ChangeV5 `json:"change"`
		ExpectedDigest string   `json:"expectedDigest"`
	} `json:"vectors"`
}

func loadDigestV3Vectors(t *testing.T) digestV3VectorFile {
	t.Helper()
	body, err := os.ReadFile("testdata/digest_v3_vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var file digestV3VectorFile
	if err := json.Unmarshal(body, &file); err != nil {
		t.Fatal(err)
	}
	return file
}

func cloneV5Change(c ChangeV5) ChangeV5 {
	out := c
	if c.Ticket == nil {
		return out
	}
	ticket := *c.Ticket
	if c.Ticket.NetAdjustments != nil {
		items := append([]NetAdjustmentItem(nil), (*c.Ticket.NetAdjustments)...)
		ticket.NetAdjustments = &items
	}
	if c.Ticket.PreviousTicketNo != nil {
		value := *c.Ticket.PreviousTicketNo
		ticket.PreviousTicketNo = &value
	}
	for _, value := range []**string{&ticket.PreviousFinalGross, &ticket.PreviousFinalTare, &ticket.PreviousFinalNet, &ticket.PreviousNetAdjustment, &ticket.AdjustedBy} {
		if *value != nil {
			copied := **value
			*value = &copied
		}
	}
	if c.Ticket.AdjustedAt != nil {
		value := *c.Ticket.AdjustedAt
		ticket.AdjustedAt = &value
	}
	out.Ticket = &ticket
	return out
}

func v5Vector(t *testing.T, name string) ChangeV5 {
	t.Helper()
	for _, vector := range loadDigestV3Vectors(t).Vectors {
		if vector.Name == name {
			change := cloneV5Change(vector.Change)
			change.Digest = strings.Repeat("0", 64)
			return change
		}
	}
	t.Fatalf("vector %s missing", name)
	return ChangeV5{}
}

// v5ConsistentMulti returns the shared multi-item sample. The published vector
// is self-consistent (items sum to netAdjustment and finalNet follows), so the
// same payload serves both digest and business validation tests.
func v5ConsistentMulti(t *testing.T) ChangeV5 {
	t.Helper()
	return v5Vector(t, "issue-multi-items")
}

func v5ReopenUpward(t *testing.T) ChangeV5 {
	t.Helper()
	change := v5ConsistentMulti(t)
	change.Type = "reopen"
	change.PreviousSiteCode = "F001"
	change.TicketNo = "F001-20261107-0009"
	change.Ticket.TicketNo = change.TicketNo
	change.Ticket.PreviousTicketNo = strPtr("F001-20261107-0001")
	change.Ticket.PreviousFinalGross = strPtr("30")
	change.Ticket.PreviousFinalTare = strPtr("10")
	change.Ticket.PreviousFinalNet = strPtr("19.5")
	change.Ticket.PreviousNetAdjustment = strPtr("0.5")
	items := []NetAdjustmentItem{{Mode: "amount", Amount: "-0.5", Category: "WATER", CategoryName: "水分大"}}
	change.Ticket.NetAdjustments = &items
	change.Ticket.NetAdjustment = "-0.5"
	change.Ticket.FinalNet = "20.5"
	return change
}

func v5IndependentPercentRounding(t *testing.T) ChangeV5 {
	t.Helper()
	change := v5Vector(t, "issue-basic")
	change.Ticket.OriginalGross = "1.2"
	change.Ticket.OriginalTare = "0.2"
	change.Ticket.FinalGross = "1.2"
	change.Ticket.FinalTare = "0.2"
	change.Ticket.FinalNet = "0.998"
	change.Ticket.NetAdjustment = "0.002"
	items := []NetAdjustmentItem{
		{Mode: "percent", Amount: "0.001", RateBP: intPtr(5), Category: "WATER", CategoryName: "水分"},
		{Mode: "percent", Amount: "0.001", RateBP: intPtr(5), Category: "IMPURITY", CategoryName: "杂质"},
	}
	change.Ticket.NetAdjustments = &items
	return change
}

func TestDigestRulesV3VectorPayloads(t *testing.T) {
	file := loadDigestV3Vectors(t)
	if file.RulesVersion != SyncDigestVersion3 {
		t.Fatalf("vector rules version = %d, want %d", file.RulesVersion, SyncDigestVersion3)
	}
	if len(file.Vectors) < 2 {
		t.Fatalf("expected empty and multi-item vectors, got %d", len(file.Vectors))
	}
	for _, vector := range file.Vectors {
		vector := vector
		t.Run(vector.Name, func(t *testing.T) {
			if vector.ExpectedDigest == "" {
				t.Fatal("expectedDigest is empty")
			}
			got, err := CanonicalChangeDigestV3(vector.Change)
			if err != nil {
				t.Fatal(err)
			}
			if got != vector.ExpectedDigest {
				t.Fatalf("digest = %s, want %s", got, vector.ExpectedDigest)
			}
		})
	}
}

func vectorExpectedDigest(t *testing.T, name string) string {
	t.Helper()
	for _, vector := range loadDigestV3Vectors(t).Vectors {
		if vector.Name == name {
			return vector.ExpectedDigest
		}
	}
	t.Fatalf("vector %s missing", name)
	return ""
}

func TestDigestV3CoversItemOrderAndContent(t *testing.T) {
	base := v5ConsistentMulti(t)
	baseDigest, err := CanonicalChangeDigestV3(base)
	if err != nil {
		t.Fatal(err)
	}
	reordered := cloneV5Change(base)
	items := *reordered.Ticket.NetAdjustments
	items[0], items[1] = items[1], items[0]
	reordered.Ticket.NetAdjustments = &items
	reorderedDigest, err := CanonicalChangeDigestV3(reordered)
	if err != nil {
		t.Fatalf("reordered items keep the same total and must be valid: %v", err)
	}
	if baseDigest == reorderedDigest {
		t.Fatal("item order must participate in the digest")
	}
	empty := v5Vector(t, "issue-basic")
	emptyDigest, err := CanonicalChangeDigestV3(empty)
	if err != nil {
		t.Fatal(err)
	}
	if baseDigest == emptyDigest {
		t.Fatal("empty and multi-item tickets must not share a digest")
	}
}

func TestDigestV3IgnoresSuppliedDigest(t *testing.T) {
	change := v5Vector(t, "issue-multi-items")
	change.Digest = strings.Repeat("f", 64)
	got, err := CanonicalChangeDigestV3(change)
	if err != nil {
		t.Fatal(err)
	}
	if want := vectorExpectedDigest(t, "issue-multi-items"); got != want {
		t.Fatalf("digest = %s, want %s", got, want)
	}
}

func TestChangeV5Validation(t *testing.T) {
	base := func() ChangeV5 { return v5ConsistentMulti(t) }
	for _, test := range []struct {
		name   string
		base   func() ChangeV5
		mutate func(*ChangeV5)
	}{
		{"schema version", base, func(c *ChangeV5) { c.SchemaVersion = 4 }},
		{"digest version", base, func(c *ChangeV5) { c.DigestVersion = 2 }},
		{"digest format", base, func(c *ChangeV5) { c.Digest = "abc" }},
		{"missing details", base, func(c *ChangeV5) { c.Ticket.NetAdjustments = nil }},
		{"details sum mismatch", base, func(c *ChangeV5) { items := *c.Ticket.NetAdjustments; items[1].Amount = "0.6" }},
		{"final net mismatch", base, func(c *ChangeV5) { c.Ticket.FinalNet = "18.4" }},
		{"total mismatch", base, func(c *ChangeV5) { c.Ticket.NetAdjustment = "1.4" }},
		{"percent amount not rounded", base, func(c *ChangeV5) {
			items := *c.Ticket.NetAdjustments
			items[0].Amount = "0.3"
			c.Ticket.NetAdjustments = &items
		}},
		{"percent without rate", base, func(c *ChangeV5) {
			items := *c.Ticket.NetAdjustments
			items[0].RateBP = nil
			c.Ticket.NetAdjustments = &items
		}},
		{"amount with rate", base, func(c *ChangeV5) {
			items := *c.Ticket.NetAdjustments
			items[1].RateBP = intPtr(100)
			c.Ticket.NetAdjustments = &items
		}},
		{"zero amount item", base, func(c *ChangeV5) {
			items := *c.Ticket.NetAdjustments
			items[1].Amount = "0"
			c.Ticket.NetAdjustments = &items
		}},
		{"negative item on issue", base, func(c *ChangeV5) {
			items := []NetAdjustmentItem{{Mode: "amount", Amount: "-1.5", Category: "WATER", CategoryName: "水分"}}
			c.Ticket.NetAdjustments = &items
			c.Ticket.NetAdjustment = "-1.5"
			c.Ticket.FinalNet = "21.5"
		}},
		{"legacy mode present", base, func(c *ChangeV5) { c.Ticket.NetAdjustmentMode = "amount" }},
		{"legacy rate present", base, func(c *ChangeV5) { c.Ticket.NetAdjustmentRateBP = intPtr(100) }},
		{"legacy category present", base, func(c *ChangeV5) { c.Ticket.NetAdjustmentCategory = "WATER" }},
		{"void without ticket", base, func(c *ChangeV5) {
			c.Type = "void"
			c.Ticket = nil
			c.Void = &VoidInfo{Reason: "更正", Actor: "操作员", At: time.Now()}
		}},
		{"void without reason", base, func(c *ChangeV5) {
			c.Type = "void"
			c.Void = &VoidInfo{Reason: "", Actor: "操作员", At: time.Now()}
		}},
		{"reopen without previous site", func() ChangeV5 { return v5ReopenUpward(t) }, func(c *ChangeV5) { c.PreviousSiteCode = "" }},
		{"reopen without previous net", func() ChangeV5 { return v5ReopenUpward(t) }, func(c *ChangeV5) { c.Ticket.PreviousFinalNet = nil }},
	} {
		t.Run(test.name, func(t *testing.T) {
			change := test.base()
			test.mutate(&change)
			if _, err := change.Validate(); err == nil {
				t.Fatalf("expected rejection: %+v", change)
			}
		})
	}
	for _, test := range []struct {
		name string
		base func() ChangeV5
	}{
		{"empty details", func() ChangeV5 { return v5Vector(t, "issue-basic") }},
		{"multi details", base},
		{"reopen allows uplift", func() ChangeV5 { return v5ReopenUpward(t) }},
		{"independent percent rounding", func() ChangeV5 { return v5IndependentPercentRounding(t) }},
	} {
		t.Run("valid "+test.name, func(t *testing.T) {
			if _, err := test.base().Validate(); err != nil {
				t.Fatalf("valid change rejected: %v", err)
			}
		})
	}
}

func TestChangeV5DigestIsNotRecomputedByValidation(t *testing.T) {
	change := v5Vector(t, "issue-basic")
	change.Digest = strings.Repeat("a", 64)
	if _, err := change.Validate(); err != nil {
		t.Fatalf("an arbitrary well-formed digest must be accepted: %v", err)
	}
}

func TestChangeV4RejectsNetAdjustments(t *testing.T) {
	change := loadDigestVectors(t).Vectors[0].Change
	ticket := *change.Ticket
	empty := []NetAdjustmentItem{}
	ticket.NetAdjustments = &empty
	change.Ticket = &ticket
	if _, err := change.Validate(); err == nil {
		t.Fatal("version 4 change accepted a netAdjustments array")
	}
}

func TestSyncV5RejectsUnknownFields(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	RegisterSyncV5Routes(router, &Handler{})
	body := `{"schemaVersion":5,"digestVersion":3,"unknown":true}`
	request := httptest.NewRequest(http.MethodPost, "/weighbridge/sync/v5/changes", strings.NewReader(body))
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("unknown field status = %d, want %d", response.Code, http.StatusBadRequest)
	}
}

func TestSyncV5RejectsOversizedReconcileBody(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	RegisterSyncV5Routes(router, &Handler{})
	body := `{"items":[{"siteCode":"F001","ticketNo":"` + strings.Repeat("x", 2<<20)
	request := httptest.NewRequest(http.MethodPost, "/weighbridge/sync/v5/reconcile", strings.NewReader(body))
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversized request status = %d, want %d", response.Code, http.StatusRequestEntityTooLarge)
	}
}

func TestBindSyncV5AcceptsFactoryPayload(t *testing.T) {
	change := v5ConsistentMulti(t)
	change.Digest = strings.Repeat("c", 64)
	body, err := json.Marshal(change)
	if err != nil {
		t.Fatal(err)
	}
	// The factory serializes the legacy single-item fields as empty values even
	// though version 5 does not use them. They must be accepted and ignored.
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatal(err)
	}
	ticket := payload["ticket"].(map[string]any)
	ticket["netAdjustmentMode"] = ""
	ticket["netAdjustmentRateBp"] = nil
	ticket["netAdjustmentCategory"] = ""
	ticket["netAdjustmentCategoryName"] = ""
	body, err = json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}

	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/weighbridge/sync/v5/changes", strings.NewReader(string(body)))
	var input ChangeV5
	if !bindSyncRequest(context, &input) {
		t.Fatalf("factory payload was rejected: %s", recorder.Body.String())
	}
	if _, err := input.Validate(); err != nil {
		t.Fatalf("factory payload did not validate: %v", err)
	}
	if input.Ticket.NetAdjustments == nil || len(*input.Ticket.NetAdjustments) != 2 {
		t.Fatalf("details lost: %+v", input.Ticket.NetAdjustments)
	}
}
