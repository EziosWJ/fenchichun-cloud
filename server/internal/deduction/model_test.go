package deduction

import "testing"

func TestInputValidate(t *testing.T) {
	base := Input{MaterialCode: "C-M-0010", CategoryCode: "WATER", Mode: ModePercent, BasisField: BasisMoisture, Enabled: true, Ranges: []RangeInput{{MinValue: "13", MaxValue: "14", RateBP: 100}}}
	if err := base.validate(); err != nil {
		t.Fatalf("valid percent rule rejected: %v", err)
	}
	overlap := base
	overlap.Ranges = []RangeInput{{MinValue: "13", MaxValue: "15", RateBP: 100}, {MinValue: "14", MaxValue: "16", RateBP: 200}}
	if err := overlap.validate(); err == nil {
		t.Fatal("overlapping ranges accepted")
	}
	missingBasis := base
	missingBasis.BasisField = ""
	if err := missingBasis.validate(); err == nil {
		t.Fatal("percent rule without basis accepted")
	}
	amountWithRanges := Input{MaterialCode: "C-M-0010", CategoryCode: "IMPURITY", Mode: ModeAmount, AmountMilliTonne: 50, Enabled: true, Ranges: []RangeInput{{MinValue: "0", MaxValue: "1", RateBP: 100}}}
	if err := amountWithRanges.validate(); err == nil {
		t.Fatal("amount rule with ranges accepted")
	}
	amount := Input{MaterialCode: "C-M-0010", CategoryCode: "IMPURITY", Mode: ModeAmount, AmountMilliTonne: 50, Enabled: true}
	if err := amount.validate(); err != nil {
		t.Fatalf("valid amount rule rejected: %v", err)
	}
}

func TestValidateRangesAdjacent(t *testing.T) {
	ranges := []RangeInput{{MinValue: "0", MaxValue: "13", RateBP: 0}, {MinValue: "13", MaxValue: "14", RateBP: 100}, {MinValue: "14", MaxValue: "", RateBP: 150}}
	if err := validateRanges(ranges); err != nil {
		t.Fatalf("adjacent ranges rejected: %v", err)
	}
}
