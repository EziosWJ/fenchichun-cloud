// Package grainintake manages grain delivery trips and their exit evidence.
package grainintake

import (
	"errors"
	"fenchichun.local/server/internal/deduction"
	"fenchichun.local/server/internal/laboratory"
	"fenchichun.local/server/internal/weighbridge"
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

var (
	ErrInvalid   = errors.New("流转单参数不正确")
	ErrConflict  = errors.New("记录已变化或前置条件不满足，请刷新核对")
	ErrNotFound  = errors.New("记录不存在")
	ErrForbidden = errors.New("没有对应业务操作权限")
)

// platePattern covers mainland civilian plates, including new-energy plates
// and the common 挂/学/警/港/澳/领 suffixes.
var platePattern = regexp.MustCompile(`^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领][A-HJ-NP-Z]([A-HJ-NP-Z0-9]{4}[A-HJ-NP-Z0-9挂学警港澳领]|[0-9]{5}[DF]|[DF][A-HJ-NP-Z0-9][0-9]{4})$`)

const TripPermission = "grain-intake:trips"
const PermitPermission = "grain-intake:permits"
const LabPermission = "laboratory:inspections"

type Input struct {
	SiteCode        string `json:"siteCode"`
	Plate           string `json:"plate"`
	MaterialCode    string `json:"materialCode"`
	PartyCode       string `json:"partyCode"`
	Driver          string `json:"driver"`
	DriverPhone     string `json:"driverPhone"`
	ContractNo      string `json:"contractNo"`
	Remark          string `json:"remark"`
	ClientRequestID string `json:"clientRequestId"`
}

func (in *Input) normalize() {
	in.SiteCode = strings.TrimSpace(in.SiteCode)
	in.Plate = strings.ToUpper(strings.TrimSpace(in.Plate))
	in.MaterialCode = strings.TrimSpace(in.MaterialCode)
	in.PartyCode = strings.TrimSpace(in.PartyCode)
	in.ClientRequestID = strings.TrimSpace(in.ClientRequestID)
}
func (in Input) validate() error {
	if in.SiteCode == "" || in.Plate == "" || in.MaterialCode == "" || in.PartyCode == "" {
		return fmt.Errorf("%w：厂区、车牌、粮种和供应商必填", ErrInvalid)
	}
	for _, f := range []struct {
		s string
		n int
	}{{in.SiteCode, 80}, {in.Plate, 40}, {in.MaterialCode, 80}, {in.PartyCode, 80}, {in.Driver, 100}, {in.DriverPhone, 50}, {in.ContractNo, 100}, {in.Remark, 2000}, {in.ClientRequestID, 64}} {
		if utf8.RuneCountInString(f.s) > f.n {
			return ErrInvalid
		}
	}
	if !platePattern.MatchString(in.Plate) {
		return fmt.Errorf("%w：车牌号格式不正确", ErrInvalid)
	}
	return nil
}

type Trip struct {
	ID                    int64  `json:"id"`
	Number                string `json:"number"`
	Version               int64  `json:"version"`
	Input                 `gorm:"embedded"`
	InspectionMethod      string     `json:"inspectionMethod"`
	VisualConclusion      string     `json:"visualConclusion"`
	VisualReason          string     `json:"visualReason"`
	VisualInspectedAt     *time.Time `json:"visualInspectedAt"`
	VisualInspectedBy     *int64     `json:"visualInspectedBy"`
	MaterialName          string     `json:"materialName"`
	PartyName             string     `json:"partyName"`
	EffectiveInspectionID *int64     `json:"effectiveInspectionId"`
	EffectiveSelectedAt   *time.Time `json:"effectiveSelectedAt"`
	EffectiveSelectedBy   *int64     `json:"effectiveSelectedBy"`
	UnloadingLocation     string     `json:"unloadingLocation"`
	UnloadedAt            *time.Time `json:"unloadedAt"`
	UnloadedBy            *int64     `json:"unloadedBy"`
	TicketID              *int64     `json:"ticketId"`
	TicketConfirmedAt     *time.Time `json:"ticketConfirmedAt"`
	TicketConfirmedBy     *int64     `json:"ticketConfirmedBy"`
	CreatedBy             int64      `json:"createdBy"`
	CreatedAt             time.Time  `json:"createdAt"`
	UpdatedAt             time.Time  `json:"updatedAt"`
	ExitedAt              *time.Time `json:"exitedAt"`
	ExitedBy              *int64     `json:"exitedBy"`
	ExitBasis             string     `json:"exitBasis"`
	ExitInspectionID      *int64     `json:"exitInspectionId"`
	Stage                 string     `json:"stage" gorm:"->"`
	EffectiveConclusion   string     `json:"effectiveConclusion" gorm:"->"`
	InspectionID          *int64     `json:"inspectionId" gorm:"->"`
	InspectionConclusion  string     `json:"inspectionConclusion" gorm:"->"`
}

func (Trip) TableName() string { return "grain_trip" }

type Permit struct {
	ID           int64      `json:"id"`
	Number       string     `json:"number"`
	TripID       int64      `json:"tripId"`
	Version      int64      `json:"version"`
	Status       string     `json:"status"`
	InspectionID *int64     `json:"inspectionId"`
	TicketID     int64      `json:"ticketId"`
	CreatedBy    int64      `json:"createdBy"`
	CreatedAt    time.Time  `json:"createdAt"`
	ApprovedBy   *int64     `json:"approvedBy"`
	ApprovedAt   *time.Time `json:"approvedAt"`
	TripNumber   string     `json:"tripNumber" gorm:"->"`
	Plate        string     `json:"plate" gorm:"->"`
	SiteCode     string     `json:"siteCode" gorm:"->"`
	ExitedAt     *time.Time `json:"exitedAt" gorm:"->"`
	Stage        string     `json:"stage" gorm:"->"`
}

func (Permit) TableName() string { return "grain_exit_permit" }

type Event struct {
	ID          int64     `json:"id"`
	TripID      int64     `json:"tripId"`
	Action      string    `json:"action"`
	Description string    `json:"description"`
	ActorID     *int64    `json:"actorId"`
	ActorName   string    `json:"actorName" gorm:"->"`
	CreatedAt   time.Time `json:"createdAt"`
}

func (Event) TableName() string { return "grain_trip_event" }

type Detail struct {
	Trip          Trip                      `json:"trip"`
	Inspections   []laboratory.Inspection   `json:"inspections"`
	Permit        *Permit                   `json:"permit"`
	Ticket        *weighbridge.TicketResult `json:"ticket"`
	Events        []Event                   `json:"events"`
	Deductions    []deduction.Evaluation    `json:"deductions"`
	TicketWarning string                    `json:"ticketWarning"`
}

// TicketCandidate is a cloud ticket that matches this trip's site, plate,
// material and supplier. Linkable reports whether the weighing order also
// satisfies the link-ticket time rules.
type TicketCandidate struct {
	SiteCode           string    `json:"siteCode"`
	TicketNo           string    `json:"ticketNo"`
	Plate              string    `json:"plate"`
	MaterialCode       string    `json:"materialCode"`
	MaterialName       string    `json:"materialName"`
	PartyCode          string    `json:"partyCode"`
	PartyName          string    `json:"partyName"`
	FinalGross         string    `json:"finalGross"`
	FinalTare          string    `json:"finalTare"`
	FinalNet           string    `json:"finalNet"`
	FinalNetMilliTonne int64     `json:"finalNetMilliTonne"`
	FirstConfirmedAt   time.Time `json:"firstConfirmedAt"`
	SecondConfirmedAt  time.Time `json:"secondConfirmedAt"`
	IssuedAt           time.Time `json:"issuedAt"`
	Linkable           bool      `json:"linkable"`
	Reason             string    `json:"reason"`
}

type Query struct {
	Page, PageSize int
	Keyword, Stage string
	Order          string
	Method         string
	SiteCode       string
	MaterialCode   string
	Result         string
	DateFrom       string
	DateTo         string
	DateFromAt     *time.Time
	DateToAt       *time.Time
	Gate           bool
}
type TripPage struct {
	Records  []Trip `json:"records"`
	Total    int64  `json:"total"`
	Page     int    `json:"page"`
	PageSize int    `json:"pageSize"`
}
type PermitPage struct {
	Records  []Permit `json:"records"`
	Total    int64    `json:"total"`
	Page     int      `json:"page"`
	PageSize int      `json:"pageSize"`
}
type Command struct {
	Conclusion        string `json:"conclusion"`
	Reason            string `json:"reason"`
	Version           int64  `json:"version"`
	InspectionID      int64  `json:"inspectionId"`
	InspectionVersion int64  `json:"inspectionVersion"`
	Location          string `json:"location"`
	TicketSiteCode    string `json:"ticketSiteCode"`
	TicketNo          string `json:"ticketNo"`
	Basis             string `json:"basis"`
	PermitID          int64  `json:"permitId"`
}
