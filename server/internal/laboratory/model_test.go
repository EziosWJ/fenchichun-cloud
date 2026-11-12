package laboratory

import "testing"

func TestConfirmationValidation(t *testing.T) {
	complete := Input{SiteCode: "F001", Plate: "晋A12345", MaterialCode: "M1", PartyCode: "P1", Moisture: "14.10", BulkDensity: "750", Conclusion: "accept"}
	if err := complete.validate(true); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name   string
		change func(*Input)
	}{
		{"missing site", func(v *Input) { v.SiteCode = "" }},
		{"missing conclusion", func(v *Input) { v.Conclusion = "" }},
		{"missing supplier", func(v *Input) { v.PartyCode = "" }},
		{"missing moisture", func(v *Input) { v.Moisture = "" }},
		{"missing capacity", func(v *Input) { v.BulkDensity = "" }},
		{"reject without reason", func(v *Input) { v.Conclusion = "reject" }},
		{"negative", func(v *Input) { v.Moisture = "-1" }},
		{"percentage overflow", func(v *Input) { v.Moisture = "100.000001" }},
		{"zero capacity", func(v *Input) { v.BulkDensity = "0" }},
		{"exponent capacity", func(v *Input) { v.BulkDensity = "1e3" }},
		{"too precise", func(v *Input) { v.Moisture = "1.0000001" }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			v := complete
			tc.change(&v)
			if v.validate(true) == nil {
				t.Fatal("invalid confirmation accepted")
			}
		})
	}
}

func TestImpurityIsNotRequiredForConfirmation(t *testing.T) {
	value := Input{SiteCode: "F001", Plate: "晋A12345", MaterialCode: "M1", PartyCode: "P1", Moisture: "14.10", BulkDensity: "750", Conclusion: "accept"}
	if value.Impurity != "" {
		t.Fatal("test input should omit impurity")
	}
	if err := value.validate(true); err != nil {
		t.Fatalf("impurity should be optional: %v", err)
	}
}
