package grainintake

import (
	"time"

	"fenchichun.local/server/internal/deduction"
)

// SyncInspection is the effective laboratory result published to the weighing
// site. It intentionally omits internal audit fields.
type SyncInspection struct {
	ID          int64      `json:"id"`
	Version     int64      `json:"version"`
	Status      string     `json:"status"`
	Conclusion  string     `json:"conclusion"`
	Moisture    string     `json:"moisture"`
	Impurity    string     `json:"impurity"`
	Reason      string     `json:"reason,omitempty"`
	ConfirmedAt *time.Time `json:"confirmedAt,omitempty"`
}

// SyncTrip is the read model used by the weighing site before the first weigh
// and when it needs to refresh a trip. Deductions are already resolved to
// category, mode and rate; tonne conversion happens at the site.
type SyncTrip struct {
	TripNo              string                 `json:"tripNo"`
	TripID              int64                  `json:"tripId"`
	Version             int64                  `json:"version"`
	Stage               string                 `json:"stage"`
	Plate               string                 `json:"plate"`
	MaterialCode        string                 `json:"materialCode"`
	MaterialName        string                 `json:"materialName"`
	PartyCode           string                 `json:"partyCode"`
	PartyName           string                 `json:"partyName"`
	Driver              string                 `json:"driver,omitempty"`
	DriverPhone         string                 `json:"driverPhone,omitempty"`
	ContractNo          string                 `json:"contractNo,omitempty"`
	InspectionMethod    string                 `json:"inspectionMethod"`
	Inspection          *SyncInspection        `json:"inspection,omitempty"`
	EffectiveConclusion string                 `json:"effectiveConclusion,omitempty"`
	RegisteredAt        time.Time              `json:"registeredAt"`
	UnloadedAt          *time.Time             `json:"unloadedAt,omitempty"`
	TicketNo            string                 `json:"ticketNo,omitempty"`
	Linkable            bool                   `json:"linkable"`
	Blockers            []string               `json:"blockers"`
	Deductions          []deduction.Evaluation `json:"deductions"`
}

type syncTripRow struct {
	TripID                int64      `gorm:"column:id"`
	TripNo                string     `gorm:"column:number"`
	Version               int64      `gorm:"column:version"`
	Stage                 string     `gorm:"column:stage"`
	Plate                 string     `gorm:"column:plate"`
	MaterialCode          string     `gorm:"column:material_code"`
	MaterialName          string     `gorm:"column:material_name"`
	PartyCode             string     `gorm:"column:party_code"`
	PartyName             string     `gorm:"column:party_name"`
	Driver                string     `gorm:"column:driver"`
	DriverPhone           string     `gorm:"column:driver_phone"`
	ContractNo            string     `gorm:"column:contract_no"`
	InspectionMethod      string     `gorm:"column:inspection_method"`
	VisualConclusion      string     `gorm:"column:visual_conclusion"`
	VisualReason          string     `gorm:"column:visual_reason"`
	VisualInspectedAt     *time.Time `gorm:"column:visual_inspected_at"`
	EffectiveInspectionID *int64     `gorm:"column:effective_inspection_id"`
	RegisteredAt          time.Time  `gorm:"column:created_at"`
	UnloadedAt            *time.Time `gorm:"column:unloaded_at"`
	ExitedAt              *time.Time `gorm:"column:exited_at"`
	TicketID              *int64     `gorm:"column:ticket_id"`
	TicketNo              string     `gorm:"column:ticket_no"`
}
