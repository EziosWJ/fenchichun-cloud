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
	ID      int64
	Code    string
	Name    string
	Enabled bool
}

func (site) TableName() string { return "wb_cloud_site" }

type cloudTicket struct {
	ID                 int64
	SiteID             int64
	ScaleCode          string
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
	ID          int64
	SiteID      int64
	ChangeID    string
	PayloadHash string
	TicketID    int64
}

func (cloudChange) TableName() string { return "wb_cloud_change" }

type ChangeReceipt struct {
	ChangeID string `json:"changeId"`
	TicketNo string `json:"ticketNo"`
}

func (r *Repository) ApplyChange(ctx context.Context, token string, c Change) (ChangeReceipt, error) {
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
	tokenDigest := sha256.Sum256([]byte(token))
	tokenHash := hex.EncodeToString(tokenDigest[:])
	receipt := ChangeReceipt{ChangeID: c.ChangeID, TicketNo: c.TicketNo}
	err = r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var s site
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Table("wb_cloud_site").Select("wb_cloud_site.*").Joins("JOIN wb_cloud_credential c ON c.site_id = wb_cloud_site.id").Where("c.token_hash = ? AND c.revoked_at IS NULL AND wb_cloud_site.enabled = ?", tokenHash, true).Take(&s).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrUnauthorized
			}
			return err
		}
		if s.Code != c.SiteCode {
			return ErrUnauthorized
		}
		var count int64
		if err := tx.Table("wb_cloud_scale").Where("site_id = ? AND code = ? AND enabled = ?", s.ID, c.ScaleCode, true).Count(&count).Error; err != nil {
			return err
		}
		if count != 1 {
			return ErrUnauthorized
		}
		var previous cloudChange
		err := tx.Where("site_id = ? AND change_id = ?", s.ID, c.ChangeID).Take(&previous).Error
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
			if err := tx.Where("site_id = ? AND ticket_no = ?", s.ID, c.TicketNo).Take(&ticket).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return ErrConflict
				}
				return err
			}
			if ticket.Status != "valid" || ticket.ScaleCode != c.ScaleCode {
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
				if err := tx.Where("site_id = ? AND ticket_no = ?", s.ID, *t.PreviousTicketNo).Take(&old).Error; err != nil {
					if errors.Is(err, gorm.ErrRecordNotFound) {
						return ErrConflict
					}
					return err
				}
				if old.Status != "void" || old.ScaleCode != c.ScaleCode {
					return ErrConflict
				}
				if err := tx.Model(&cloudTicket{}).Where("site_id = ? AND previous_ticket_no = ?", s.ID, *t.PreviousTicketNo).Count(&count).Error; err != nil {
					return err
				}
				if count != 0 {
					return ErrConflict
				}
			}
			if err := tx.Model(&cloudTicket{}).Where("site_id = ? AND ticket_no = ?", s.ID, c.TicketNo).Count(&count).Error; err != nil {
				return err
			}
			if count != 0 {
				return ErrConflict
			}
			snapshot, err := json.Marshal(t)
			if err != nil {
				return ErrInvalid
			}
			ticket = cloudTicket{SiteID: s.ID, ScaleCode: c.ScaleCode, TicketNo: c.TicketNo, PreviousTicketNo: t.PreviousTicketNo, Status: "valid", Direction: t.Direction, Plate: t.Plate, IssuedAt: t.IssuedAt, MaterialCode: t.MaterialCode, PartyCode: t.PartyCode, FinalNetMilliTonne: net, Snapshot: string(snapshot)}
			if err := tx.Create(&ticket).Error; err != nil {
				return err
			}
		}
		return tx.Create(&cloudChange{SiteID: s.ID, ChangeID: c.ChangeID, PayloadHash: hash, TicketID: ticket.ID}).Error
	})
	if err != nil {
		return ChangeReceipt{}, err
	}
	return receipt, nil
}
