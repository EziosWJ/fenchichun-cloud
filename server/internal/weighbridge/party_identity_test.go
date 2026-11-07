package weighbridge

import "testing"

func TestIdentityNumber(t *testing.T) {
	if !validIdentityNumber("11010519491231002X") {
		t.Fatal("valid check digit rejected")
	}
	for _, v := range []string{"110105194912310020", "11010519490230002X", "11010599991231002X", "11010519491231002", "11010519491231002x"} {
		if validIdentityNumber(v) {
			t.Fatalf("invalid number accepted: %s", v)
		}
	}
}
