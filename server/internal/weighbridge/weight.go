// Package weighbridge contains the cloud-side weighing synchronization domain.
package weighbridge

import (
	"errors"
	"strconv"
	"strings"
)

var ErrInvalidWeight = errors.New("重量格式不正确")

// ParseTonnes converts a decimal tonne value into exact thousandths of a tonne.
// Negative values are allowed only for differences, not measurements.
func ParseTonnes(value string, signed bool) (int64, error) {
	if value == "" || value != strings.TrimSpace(value) {
		return 0, ErrInvalidWeight
	}
	negative := strings.HasPrefix(value, "-")
	if negative {
		if !signed {
			return 0, ErrInvalidWeight
		}
		value = value[1:]
	}
	parts := strings.Split(value, ".")
	if len(parts) > 2 || parts[0] == "" || (len(parts) == 2 && (len(parts[1]) == 0 || len(parts[1]) > 3)) {
		return 0, ErrInvalidWeight
	}
	for _, part := range parts {
		for _, digit := range part {
			if digit < '0' || digit > '9' {
				return 0, ErrInvalidWeight
			}
		}
	}
	fraction := "000"
	if len(parts) == 2 {
		fraction = (parts[1] + "000")[:3]
	}
	whole, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil || whole > (int64(^uint64(0)>>1)-999)/1000 {
		return 0, ErrInvalidWeight
	}
	decimal, _ := strconv.ParseInt(fraction, 10, 64)
	result := whole*1000 + decimal
	if negative {
		result = -result
	}
	return result, nil
}
