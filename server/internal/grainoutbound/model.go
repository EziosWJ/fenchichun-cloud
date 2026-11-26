package grainoutbound

import "time"

// Account is the party and plate bound to one 酒糟出库 account. The mobile
// weighing page never trusts client supplied plate/party values.
type Account struct {
	UserID    int64  `json:"-"`
	PartyCode string `json:"partyCode"`
	PartyName string `json:"partyName"`
	Plate     string `json:"plate"`
	SiteCode  string `json:"siteCode"`
	SiteName  string `json:"siteName"`
	ScaleCode string `json:"scaleCode"`
}

type PendingWeighing struct {
	ID                    int64     `json:"id"`
	FirstWeightMilliTonne int64     `json:"firstWeightMilliTonne"`
	FirstAt               time.Time `json:"firstAt"`
}

// HistoryWeighing is one completed cloud ticket owned by the signed-in account.
type HistoryWeighing struct {
	TicketNo               string    `json:"ticketNo"`
	Plate                  string    `json:"plate"`
	FirstWeightMilliTonne  int64     `json:"firstWeightMilliTonne"`
	SecondWeightMilliTonne int64     `json:"secondWeightMilliTonne"`
	NetMilliTonne          int64     `json:"netMilliTonne"`
	FirstAt                time.Time `json:"firstAt"`
	SecondAt               time.Time `json:"secondAt"`
}

type Profile struct {
	Account
	Pending *PendingWeighing `json:"pending,omitempty"`
}

// ScaleReading is the cloud-safe view of the local site device state. The
// phone only sees whether the reading can be used for a confirmation.
type ScaleReading struct {
	Available        bool       `json:"available"`
	Online           bool       `json:"online"`
	Stable           bool       `json:"stable"`
	DeviceOK         bool       `json:"deviceOk"`
	WeightMilliTonne int64      `json:"weightMilliTonne"`
	ReceivedAt       *time.Time `json:"receivedAt,omitempty"`
	Mock             bool       `json:"mock"`
	Message          string     `json:"message"`
}

type TicketResult struct {
	TicketNo               string    `json:"ticketNo"`
	FirstWeightMilliTonne  int64     `json:"firstWeightMilliTonne"`
	SecondWeightMilliTonne int64     `json:"secondWeightMilliTonne"`
	NetMilliTonne          int64     `json:"netMilliTonne"`
	IssuedAt               time.Time `json:"issuedAt"`
	Mock                   bool      `json:"mock"`
}
