package grainintake

import "testing"

func TestRegistrationRequiresSupplierAndValidPlate(t *testing.T) {
	in := Input{SiteCode: " F001 ", Plate: " 晋a12345 ", MaterialCode: " M1 ", PartyCode: " P1 "}
	in.normalize()
	if in.Plate != "晋A12345" || in.SiteCode != "F001" || in.MaterialCode != "M1" {
		t.Fatal("normalization")
	}
	if err := in.validate(); err != nil {
		t.Fatalf("valid registration: %v", err)
	}
	in.PartyCode = ""
	if in.validate() == nil {
		t.Fatal("missing supplier accepted")
	}
	in.PartyCode = "P1"
	in.Plate = ""
	if in.validate() == nil {
		t.Fatal("missing plate accepted")
	}
	in.Plate = "12345"
	if in.validate() == nil {
		t.Fatal("invalid plate accepted")
	}
}
func TestQueryRejectsUnknownStage(t *testing.T) {
	if _, err := normalizeQuery(Query{Stage: "any-status"}); err == nil {
		t.Fatal("unknown stage accepted")
	}
	q, err := normalizeQuery(Query{Page: -1, PageSize: 1000})
	if err != nil || q.Page != 1 || q.PageSize != 100 {
		t.Fatalf("pagination: %+v %v", q, err)
	}
}
