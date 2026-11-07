package laboratory

import "testing"

func TestConfirmationValidation(t *testing.T) {
	complete := Input{Plate: "晋A12345", MaterialCode: "M1", PartyCode: "P1", Moisture: "14.10", Impurity: "0", BulkDensity: "760.125", Conclusion: "accept"}
	if err := complete.validate(true); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name   string
		change func(*Input)
	}{
		{"missing supplier", func(v *Input) { v.PartyCode = "" }},
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
				t.Fatal("invalid confirmation accepted")
			}
		})
	}
}
func TestDraftAllowsMissingFieldsButNotInvalidValues(t *testing.T) {
	if err := (Input{}).validate(false); err != nil {
		t.Fatal(err)
	}
	if err := (Input{Moisture: "101"}).validate(false); err == nil {
		t.Fatal("invalid percentage accepted")
	}
}
