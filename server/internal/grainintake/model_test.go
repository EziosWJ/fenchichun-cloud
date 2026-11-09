package grainintake

import "testing"

func TestRegistrationAllowsUnverifiedSupplier(t *testing.T) {
	in := Input{SiteCode: " F001 ", Plate: " 晋a12345 ", MaterialCode: " M1 "}
	in.normalize()
	if in.Plate != "晋A12345" || in.SiteCode != "F001" || in.MaterialCode != "M1" {
		t.Fatal("normalization")
	}
	if err := in.validate(); err != nil {
		t.Fatalf("optional supplier/contract: %v", err)
	}
	in.Plate = ""
	if in.validate() == nil {
		t.Fatal("missing plate accepted")
	}
}
func TestQueryRejectsUnknownStage(t *testing.T) {
	if _, err := normalizeQuery(Query{Stage: "any-status"}); err == nil {
		t.Fatal("unknown stage accepted")
	}
	if _, err := normalizeQuery(Query{Order: "any-order"}); err == nil {
		t.Fatal("unknown order accepted")
	}
	if _, err := normalizeQuery(Query{Method: "any-method"}); err == nil {
		t.Fatal("unknown method accepted")
	}
	q, err := normalizeQuery(Query{Page: -1, PageSize: 1000})
	if err != nil || q.Page != 1 || q.PageSize != 100 {
		t.Fatalf("pagination: %+v %v", q, err)
	}
}
