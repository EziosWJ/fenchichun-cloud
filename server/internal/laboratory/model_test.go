package laboratory

import "testing"

func TestInspectionValidation(t *testing.T) {
	tripID := int64(1)
	complete := Input{TripID: &tripID, SiteCode: "F001", Plate: "晋A12345", MaterialCode: "M1", PartyCode: "P1", Moisture: "14.10", Impurity: "0", BulkDensity: "760.125", Conclusion: "accept"}
	if err := complete.validate(true); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name   string
		change func(*Input)
	}{
		{"missing conclusion", func(v *Input) { v.Conclusion = "" }},
		{"missing result", func(v *Input) { v.Impurity = "" }},
		{"reject without reason", func(v *Input) { v.Conclusion = "reject" }},
		{"negative", func(v *Input) { v.Moisture = "-1" }},
		{"percentage overflow", func(v *Input) { v.Moisture = "100.000001" }},
		{"density zero", func(v *Input) { v.BulkDensity = "0" }},
		{"exponent", func(v *Input) { v.BulkDensity = "1e3" }},
		{"too precise", func(v *Input) { v.Moisture = "1.0000001" }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			v := complete
			tc.change(&v)
			if v.validate(true) == nil {
				t.Fatal("invalid inspection accepted")
			}
		})
	}
}

func TestRejectRequiresReason(t *testing.T) {
	tripID := int64(1)
	in := Input{TripID: &tripID, SiteCode: "F001", Plate: "晋A12345", MaterialCode: "M1", PartyCode: "P1", Moisture: "14", Impurity: "0", BulkDensity: "760", Conclusion: "reject", Reason: "霉变"}
	if err := in.validate(true); err != nil {
		t.Fatal(err)
	}
	in.Reason = ""
	if in.validate(true) == nil {
		t.Fatal("reject without reason accepted")
	}
}
