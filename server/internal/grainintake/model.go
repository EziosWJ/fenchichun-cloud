// Package grainintake manages grain delivery trips and their exit evidence.
package grainintake

import (
	"errors"
	"fenchichun.local/server/internal/laboratory"
	"fenchichun.local/server/internal/weighbridge"
	"fmt"
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

const TripPermission = "grain-intake:trips"
const PermitPermission = "grain-intake:permits"
const LabPermission = "laboratory:inspections"

type Input struct {
	SiteCode     string `json:"siteCode"`
	Plate        string `json:"plate"`
	MaterialCode string `json:"materialCode"`
	PartyCode    string `json:"partyCode"`
	Driver       string `json:"driver"`
	DriverPhone  string `json:"driverPhone"`
	ContractNo   string `json:"contractNo"`
	Remark       string `json:"remark"`
}

func (in *Input) normalize() {
	in.SiteCode = strings.TrimSpace(in.SiteCode)
	in.Plate = strings.ToUpper(strings.TrimSpace(in.Plate))
	in.MaterialCode = strings.TrimSpace(in.MaterialCode)
	in.PartyCode = strings.TrimSpace(in.PartyCode)
}
func (in Input) validate() error {
	if in.SiteCode == "" || in.Plate == "" || in.MaterialCode == "" {
		return fmt.Errorf("%w：厂区、车牌和粮种必填", ErrInvalid)
	}
	for _, f := range []struct {
		s string
		n int
	}{{in.SiteCode, 80}, {in.Plate, 40}, {in.MaterialCode, 80}, {in.PartyCode, 80}, {in.Driver, 100}, {in.DriverPhone, 50}, {in.ContractNo, 100}, {in.Remark, 2000}} {
		if utf8.RuneCountInString(f.s) > f.n {
			return ErrInvalid
		}
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
	CreatedBy             int64      `json:"createdBy"`
	CreatedAt             time.Time  `json:"createdAt"`
	UpdatedAt             time.Time  `json:"updatedAt"`
	ExitedAt              *time.Time `json:"exitedAt"`
	ExitedBy              *int64     `json:"exitedBy"`
	ExitBasis             string     `json:"exitBasis"`
	ExitInspectionID      *int64     `json:"exitInspectionId"`
	Stage                 string     `json:"stage" gorm:"->"`
	EffectiveConclusion   string     `json:"effectiveConclusion" gorm:"->"`
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
	Trip        Trip                      `json:"trip"`
	Inspections []laboratory.Inspection   `json:"inspections"`
	Permit      *Permit                   `json:"permit"`
	Ticket      *weighbridge.TicketResult `json:"ticket"`
	Events      []Event                   `json:"events"`
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
