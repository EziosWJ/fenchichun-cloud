package weighbridge

import "time"

const (
	distillerGrainsMaterialCode = "C-M-0006"
	distillerGrainsMaxRangeDays = 366
)

// DistillerGrainsQuery is the read-only filter for the dedicated distiller
// grains (酒糟) outbound report. From and To are inclusive local dates.
type DistillerGrainsQuery struct {
	From           time.Time
	To             time.Time
	CustomerCode   string
	IncludeRecords bool
}

type DistillerGrainsDay struct {
	Date          string `json:"date"`
	TicketCount   int64  `json:"ticketCount"`
	NetMilliTonne int64  `json:"netMilliTonne"`
}

type DistillerGrainsRecord struct {
	TicketNo      string    `json:"ticketNo"`
	IssuedAt      time.Time `json:"issuedAt"`
	Plate         string    `json:"plate"`
	PartyCode     string    `json:"partyCode"`
	PartyName     string    `json:"partyName"`
	NetMilliTonne int64     `json:"netMilliTonne"`
}

type DistillerGrainsCustomer struct {
	Code string `json:"code"`
	Name string `json:"name"`
}

type DistillerGrainsStats struct {
	From               string                    `json:"from"`
	To                 string                    `json:"to"`
	TotalNetMilliTonne int64                     `json:"totalNetMilliTonne"`
	TicketCount        int64                     `json:"ticketCount"`
	Days               []DistillerGrainsDay      `json:"days"`
	Records            []DistillerGrainsRecord   `json:"records"`
	Customers          []DistillerGrainsCustomer `json:"customers"`
}

// DistillerGrainsRange returns the inclusive local-date window for today,
// this week and this month. Weeks start on Monday and every window ends on
// the current day.
func DistillerGrainsRange(now time.Time, period string) (time.Time, time.Time, bool) {
	local := now.In(statementZone)
	today := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, statementZone)
	switch period {
	case "today":
		return today, today, true
	case "yesterday":
		yesterday := today.AddDate(0, 0, -1)
		return yesterday, yesterday, true
	case "week":
		weekday := int(today.Weekday())
		if weekday == 0 {
			weekday = 7
		}
		return today.AddDate(0, 0, 1-weekday), today, true
	case "last-week":
		weekday := int(today.Weekday())
		if weekday == 0 {
			weekday = 7
		}
		thisMonday := today.AddDate(0, 0, 1-weekday)
		return thisMonday.AddDate(0, 0, -7), thisMonday.AddDate(0, 0, -1), true
	case "month":
		return time.Date(today.Year(), today.Month(), 1, 0, 0, 0, 0, statementZone), today, true
	case "last-month":
		thisMonth := time.Date(today.Year(), today.Month(), 1, 0, 0, 0, 0, statementZone)
		lastMonthEnd := thisMonth.AddDate(0, 0, -1)
		return time.Date(lastMonthEnd.Year(), lastMonthEnd.Month(), 1, 0, 0, 0, 0, statementZone), lastMonthEnd, true
	default:
		return time.Time{}, time.Time{}, false
	}
}
