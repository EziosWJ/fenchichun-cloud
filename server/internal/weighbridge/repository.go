package weighbridge

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

type site struct {
	Code    string
	Name    string
	Enabled bool
}

func (site) TableName() string { return "wb_cloud_site" }

type cloudTicket struct {
	ID                 int64
	SiteCode           string
	IssuedSiteCode     string
	PreviousSiteCode   *string
	TicketNo           string
	PreviousTicketNo   *string
	Status             string
	Direction          string
	Plate              string
	IssuedAt           time.Time
	MaterialCode       string
	PartyCode          string
	FinalNetMilliTonne int64
	Snapshot           string
	VoidReason         *string
	VoidedBy           *string
	VoidedAt           *time.Time
}

func (cloudTicket) TableName() string { return "wb_cloud_ticket" }

type cloudChange struct {
	ID             int64
	IssuedSiteCode string
	ChangeID       string
	PayloadHash    string
	TicketID       int64
}

func (cloudChange) TableName() string { return "wb_cloud_change" }

type ChangeReceipt struct {
	ChangeID string `json:"changeId"`
	TicketNo string `json:"ticketNo"`
}

func (r *Repository) ApplyChange(ctx context.Context, c Change) (ChangeReceipt, error) {
	net, err := c.Validate()
	if err != nil {
		return ChangeReceipt{}, err
	}
	payload, err := json.Marshal(c)
	if err != nil {
		return ChangeReceipt{}, ErrInvalid
	}
	digest := sha256.Sum256(payload)
	hash := hex.EncodeToString(digest[:])
	receipt := ChangeReceipt{ChangeID: c.ChangeID, TicketNo: c.TicketNo}
	err = r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var s site
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("code = ? AND enabled = ?", c.SiteCode, true).Take(&s).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrUnauthorized
			}
			return err
		}
		var count int64
		var previous cloudChange
		err := tx.Where("issued_site_code = ? AND change_id = ?", c.SiteCode, c.ChangeID).Take(&previous).Error
		if err == nil {
			if previous.PayloadHash != hash {
				return ErrConflict
			}
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		var ticket cloudTicket
		if c.Type == "void" {
			if err := tx.Where("issued_site_code = ? AND ticket_no = ?", c.SiteCode, c.TicketNo).Take(&ticket).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return ErrConflict
				}
				return err
			}
			if ticket.Status != "valid" || ticket.SiteCode != c.SiteCode {
				return ErrConflict
			}
			ticket.Status = "void"
			ticket.VoidReason = &c.Void.Reason
			ticket.VoidedBy = &c.Void.Actor
			ticket.VoidedAt = &c.Void.At
			if err := tx.Model(&ticket).Updates(map[string]any{"status": ticket.Status, "void_reason": ticket.VoidReason, "voided_by": ticket.VoidedBy, "voided_at": ticket.VoidedAt}).Error; err != nil {
				return err
			}
		} else {
			t := c.Ticket
			if c.Type == "reopen" {
				var old cloudTicket
				if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("issued_site_code = ? AND ticket_no = ?", c.PreviousSiteCode, *t.PreviousTicketNo).Take(&old).Error; err != nil {
					if errors.Is(err, gorm.ErrRecordNotFound) {
						return ErrConflict
					}
					return err
				}
				if old.Status != "void" {
					return ErrConflict
				}
				if err := tx.Model(&cloudTicket{}).Where("previous_site_code = ? AND previous_ticket_no = ?", c.PreviousSiteCode, *t.PreviousTicketNo).Count(&count).Error; err != nil {
					return err
				}
				if count != 0 {
					return ErrConflict
				}
			}
			if err := tx.Model(&cloudTicket{}).Where("issued_site_code = ? AND ticket_no = ?", c.SiteCode, c.TicketNo).Count(&count).Error; err != nil {
				return err
			}
			if count != 0 {
				return ErrConflict
			}
			snapshot, err := json.Marshal(t)
			if err != nil {
				return ErrInvalid
			}
			var previousSiteCode *string
			if c.Type == "reopen" {
				previousSiteCode = &c.PreviousSiteCode
			}
			ticket = cloudTicket{SiteCode: s.Code, IssuedSiteCode: c.SiteCode, PreviousSiteCode: previousSiteCode, TicketNo: c.TicketNo, PreviousTicketNo: t.PreviousTicketNo, Status: "valid", Direction: t.Direction, Plate: t.Plate, IssuedAt: t.IssuedAt, MaterialCode: t.MaterialCode, PartyCode: t.PartyCode, FinalNetMilliTonne: net, Snapshot: string(snapshot)}
			if err := tx.Create(&ticket).Error; err != nil {
				return err
			}
		}
		return tx.Create(&cloudChange{IssuedSiteCode: c.SiteCode, ChangeID: c.ChangeID, PayloadHash: hash, TicketID: ticket.ID}).Error
	})
	if err != nil {
		return ChangeReceipt{}, siteError(err)
	}
	return receipt, nil
}
