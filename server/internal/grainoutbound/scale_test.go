package grainoutbound

import "testing"

func TestParseTonneString(t *testing.T) {
	for _, tc := range []struct {
		value string
		want  int64
	}{
		{"32.5", 32500},
		{"32.500", 32500},
		{"8.2", 8200},
		{"0.001", 1},
		{"100", 100000},
		{"-1.5", -1500},
	} {
		got, err := parseTonneString(tc.value)
		if err != nil || got != tc.want {
			t.Fatalf("%s: got %d, %v", tc.value, got, err)
		}
	}
	if _, err := parseTonneString("1.2345"); err == nil {
		t.Fatal("four decimals should be rejected")
	}
}

func TestFormatTonnes(t *testing.T) {
	if got := formatTonnes(32500); got != "32.500" {
		t.Fatalf("formatTonnes = %s", got)
	}
	if got := formatTonnes(8200); got != "8.200" {
		t.Fatalf("formatTonnes = %s", got)
	}
}
