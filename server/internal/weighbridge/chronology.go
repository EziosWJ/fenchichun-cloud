package weighbridge

import "time"

// InspectionOrderReason checks the ordering rules that can be evaluated from
// the effective inspection and the first weighing time. The authenticated
// link-ticket command and the automatic trip association both use it so a
// ticket cannot pass one path and fail the other.
func InspectionOrderReason(method string, accepted bool, confirmedAt, selectedAt *time.Time, first time.Time) string {
	if method == "visual" {
		if !accepted || confirmedAt == nil {
			return "尚未确认目测接收"
		}
	} else if confirmedAt == nil || selectedAt == nil {
		return "尚未选择生效化验单"
	}
	if first.Before(*confirmedAt) || (method != "visual" && first.Before(*selectedAt)) {
		return "首磅早于化验生效"
	}
	return ""
}

// UnloadOrderReason checks that the store confirmed unloading between the two
// weighings. A nil unloadedAt means that confirmation has not happened yet.
func UnloadOrderReason(unloadedAt *time.Time, first, second time.Time) string {
	if unloadedAt == nil {
		return ""
	}
	if first.After(*unloadedAt) {
		return "首磅晚于卸粮"
	}
	if second.Before(*unloadedAt) {
		return "回磅早于卸粮"
	}
	return ""
}
