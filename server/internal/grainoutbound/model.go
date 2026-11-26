package grainoutbound

import (
	"fmt"
	"time"
)

func formatTonnes(milliTonne int64) string {
	return fmt.Sprintf("%d.%03d", milliTonne/1000, milliTonne%1000)
}

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

// HandoffQR is returned only when a new one-time QR token is issued. The token
// itself is not stored in plaintext; the mobile keeps this value on screen and
// polls the session for the factory result.
type HandoffQR struct {
	Value     string    `json:"value"`
	ExpiresAt time.Time `json:"expiresAt"`
}

// Weighing is one mobile weighing session. First is the tare for an outbound
// load and second is the gross; the factory is the source of the official
// values and the official ticket number.
type Weighing struct {
	ID                     int64      `json:"id"`
	Status                 string     `json:"status"`
	Source                 string     `json:"source"`
	Plate                  string     `json:"plate"`
	PartyCode              string     `json:"partyCode"`
	PartyName              string     `json:"partyName"`
	SiteCode               string     `json:"siteCode"`
	SiteName               string     `json:"siteName"`
	ScaleCode              string     `json:"scaleCode"`
	FirstWeightMilliTonne  int64      `json:"firstWeightMilliTonne"`
	FirstAt                time.Time  `json:"firstAt"`
	SecondWeightMilliTonne int64      `json:"secondWeightMilliTonne"`
	SecondAt               *time.Time `json:"secondAt,omitempty"`
	NetMilliTonne          int64      `json:"netMilliTonne"`
	TicketNo               string     `json:"ticketNo"`
	FactoryTaskNo          string     `json:"factoryTaskNo"`
	CaptureStatus          string     `json:"captureStatus"`
	Message                string     `json:"message"`
	ExpiresAt              *time.Time `json:"expiresAt,omitempty"`
	QR                     *HandoffQR `json:"qr,omitempty" gorm:"-"`
}

type Profile struct {
	Account
	Current *Weighing `json:"current,omitempty"`
}

// HistoryWeighing is one mobile weighing session shown in the account's
// history. Mobile-direct rows generated before the handoff flow keep their old
// gross-then-tare meaning and are marked with Source=mobile_direct.
type HistoryWeighing struct {
	ID                     int64      `json:"id"`
	TicketNo               string     `json:"ticketNo,omitempty"`
	Status                 string     `json:"status"`
	Source                 string     `json:"source"`
	Plate                  string     `json:"plate"`
	FirstWeightMilliTonne  int64      `json:"firstWeightMilliTonne"`
	SecondWeightMilliTonne int64      `json:"secondWeightMilliTonne"`
	NetMilliTonne          int64      `json:"netMilliTonne"`
	FirstAt                time.Time  `json:"firstAt"`
	SecondAt               *time.Time `json:"secondAt,omitempty"`
	FactoryTaskNo          string     `json:"factoryTaskNo,omitempty"`
}

type HistoryPage struct {
	Records []HistoryWeighing `json:"records"`
}

// ScaleReading is the cloud-safe view of the local site device state. The
// phone only sees whether the reading can be used for a preview.
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

// ClaimRequest is sent by the factory scanner before it captures a weigh.
type ClaimRequest struct {
	Token     string `json:"token"`
	SiteCode  string `json:"siteCode"`
	ScaleCode string `json:"scaleCode"`
}

// ClaimResponse gives the factory the session context. The factory still owns
// the official weight, photos and ticket.
type ClaimResponse struct {
	HandoffID             int64     `json:"handoffId"`
	WeighingID            int64     `json:"weighingId"`
	Action                string    `json:"action"`
	Status                string    `json:"status"`
	Plate                 string    `json:"plate"`
	PartyCode             string    `json:"partyCode"`
	PartyName             string    `json:"partyName"`
	MaterialCode          string    `json:"materialCode"`
	MobileAccount         string    `json:"mobileAccount"`
	SiteCode              string    `json:"siteCode"`
	ScaleCode             string    `json:"scaleCode"`
	FactoryTaskNo         string    `json:"factoryTaskNo,omitempty"`
	FirstWeightMilliTonne int64     `json:"firstWeightMilliTonne,omitempty"`
	FirstAt               time.Time `json:"firstAt,omitempty"`
	ExpiresAt             time.Time `json:"expiresAt"`
}

// ResultRequest is sent by the factory after first/second capture. Token is the
// same one-time token that was scanned, proving possession of the handoff.
type ResultRequest struct {
	Token                  string    `json:"token"`
	SiteCode               string    `json:"siteCode"`
	ScaleCode              string    `json:"scaleCode"`
	Action                 string    `json:"action"`
	Status                 string    `json:"status"`
	FactoryTaskNo          string    `json:"factoryTaskNo"`
	FactoryTicketNo        string    `json:"factoryTicketNo"`
	FirstWeightMilliTonne  int64     `json:"firstWeightMilliTonne"`
	FirstAt                time.Time `json:"firstAt"`
	SecondWeightMilliTonne int64     `json:"secondWeightMilliTonne"`
	SecondAt               time.Time `json:"secondAt"`
	NetMilliTonne          int64     `json:"netMilliTonne"`
	CaptureStatus          string    `json:"captureStatus"`
	Message                string    `json:"message"`
}

// TerminateRequest is sent when the factory operator terminates an awaiting
// first/second task on the factory PC. It has no QR token because the operator
// may be acting after the handoff token expired.
type TerminateRequest struct {
	SiteCode      string `json:"siteCode"`
	FactoryTaskNo string `json:"factoryTaskNo"`
	Reason        string `json:"reason"`
}
