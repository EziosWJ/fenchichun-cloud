package deduction

import "testing"

func TestFilterMoistureEvaluations(t *testing.T) {
	rate := 100
	values := []Evaluation{
		{RuleCode: "WATER", CategoryCode: "WATER", Mode: ModePercent, BasisField: BasisMoisture, RateBP: &rate},
		{RuleCode: "IMPURITY", CategoryCode: "IMPURITY", Mode: ModeAmount, AmountMilliTonne: 50},
		{RuleCode: "IMPURITY-PERCENT", CategoryCode: "IMPURITY", Mode: ModePercent, BasisField: BasisImpurity, RateBP: &rate},
	}
	result := filterMoistureEvaluations(values)
	if len(result) != 1 || result[0].RuleCode != "WATER" {
		t.Fatalf("moisture preview: %+v", result)
	}
	if empty := filterMoistureEvaluations(nil); empty == nil || len(empty) != 0 {
		t.Fatalf("empty preview must be a non-nil slice: %+v", empty)
	}
}
