package weighbridge

import "testing"

func TestParseTonnes(t *testing.T) {
	tests := []struct {
		value  string
		signed bool
		want   int64
		valid  bool
	}{
		{"30", false, 30000, true}, {"9.012", false, 9012, true},
		{"0.001", false, 1, true}, {"-1.5", true, -1500, true},
		{"-1.5", false, 0, false}, {"1.0001", true, 0, false},
		{"1e3", true, 0, false}, {".1", true, 0, false},
		{"1.", true, 0, false}, {" 1", true, 0, false},
		{"9223372036854776", true, 0, false},
	}
	for _, tt := range tests {
		t.Run(tt.value, func(t *testing.T) {
			got, err := ParseTonnes(tt.value, tt.signed)
			if (err == nil) != tt.valid || (err == nil && got != tt.want) {
				t.Fatalf("ParseTonnes(%q, %v) = %d, %v; want %d, valid=%v", tt.value, tt.signed, got, err, tt.want, tt.valid)
			}
		})
	}
}
