package weighbridge

import (
	"context"
	"fmt"
	"strings"
	"unicode/utf8"

	"fenchichun.local/server/internal/audit"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type PartyInput struct {
	Name       string    `json:"name"`
	ShortName  string    `json:"shortName"`
	Nature     string    `json:"nature"`
	IsSupplier bool      `json:"isSupplier"`
	IsCustomer bool      `json:"isCustomer"`
	IsCarrier  bool      `json:"isCarrier"`
	Phone      string    `json:"phone"`
	Address    string    `json:"address"`
	CreditCode string    `json:"creditCode"`
	Remark     string    `json:"remark"`
	Enabled    bool      `json:"enabled"`
	Contacts   []Contact `json:"contacts"`
}

func validateParty(in PartyInput) error {
	if strings.TrimSpace(in.Name) == "" || utf8.RuneCountInString(in.Name) > 100 || (in.Nature != "enterprise" && in.Nature != "individual") || (!in.IsSupplier && !in.IsCustomer && !in.IsCarrier) || utf8.RuneCountInString(in.ShortName) > 100 || utf8.RuneCountInString(in.Phone) > 50 || utf8.RuneCountInString(in.Address) > 500 || utf8.RuneCountInString(in.CreditCode) > 50 || utf8.RuneCountInString(in.Remark) > 2000 || len(in.Contacts) > 100 {
		return ErrInvalid
	}
	defaults := 0
	seen := map[int64]bool{}
	for _, c := range in.Contacts {
		if strings.TrimSpace(c.Name) == "" || utf8.RuneCountInString(c.Name) > 100 || utf8.RuneCountInString(c.Phone) > 50 || utf8.RuneCountInString(c.Purpose) > 200 || utf8.RuneCountInString(c.Remark) > 2000 || c.ID < 0 || (c.ID > 0 && seen[c.ID]) {
			return ErrInvalid
		}
		if c.ID > 0 {
			seen[c.ID] = true
		}
		if c.IsDefault {
			defaults++
		}
	}
	if len(in.Contacts) > 0 && defaults != 1 {
		return ErrInvalid
	}
	return nil
}

func (r *Repository) SaveParty(ctx context.Context, code string, in PartyInput, event audit.Event) (Party, error) {
	if err := validateParty(in); err != nil {
		return Party{}, err
	}
	var p Party
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if code == "" {
			var n int64
			if err := tx.Raw("INSERT INTO wb_cloud_sequence (kind, value) VALUES (?, 1) ON CONFLICT (kind) DO UPDATE SET value = wb_cloud_sequence.value + 1 RETURNING value", "party").Scan(&n).Error; err != nil {
				return err
			}
			p.Code = fmt.Sprintf("C-P-%04d", n)
			p.Name = in.Name
			p.Nature = in.Nature
			p.IsSupplier = in.IsSupplier
			p.IsCustomer = in.IsCustomer
			p.IsCarrier = in.IsCarrier
			p.ShortName = in.ShortName
			p.Phone = in.Phone
			p.Address = in.Address
			p.CreditCode = in.CreditCode
			p.Remark = in.Remark
			p.Enabled = in.Enabled
			if err := tx.Create(&p).Error; err != nil {
				return err
			}
		} else {
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("code = ?", code).Take(&p).Error; err != nil {
				if err == gorm.ErrRecordNotFound {
					return ErrInvalid
				}
				return err
			}
			changes := map[string]any{"name": in.Name, "short_name": in.ShortName, "nature": in.Nature, "is_supplier": in.IsSupplier, "is_customer": in.IsCustomer, "is_carrier": in.IsCarrier, "phone": in.Phone, "address": in.Address, "credit_code": in.CreditCode, "remark": in.Remark, "enabled": in.Enabled}
			if err := tx.Model(&p).Updates(changes).Error; err != nil {
				return err
			}
		}
		var existing []Contact
		if err := tx.Where("party_id = ?", p.ID).Find(&existing).Error; err != nil {
			return err
		}
		allowed := map[int64]bool{}
		for _, c := range existing {
			allowed[c.ID] = true
		}
		for _, c := range in.Contacts {
			if c.ID > 0 && !allowed[c.ID] {
				return ErrInvalid
			}
		}
		if err := tx.Model(&Contact{}).Where("party_id = ?", p.ID).Update("is_default", false).Error; err != nil {
			return err
		}
		keep := []int64{}
		for _, c := range in.Contacts {
			c.PartyID = p.ID
			if c.ID == 0 {
				if err := tx.Create(&c).Error; err != nil {
					return err
				}
			} else if err := tx.Model(&Contact{}).Where("id = ? AND party_id = ?", c.ID, p.ID).Updates(map[string]any{"name": c.Name, "phone": c.Phone, "purpose": c.Purpose, "remark": c.Remark, "is_default": c.IsDefault}).Error; err != nil {
				return err
			}
			keep = append(keep, c.ID)
		}
		q := tx.Where("party_id = ?", p.ID)
		if len(keep) > 0 {
			q = q.Where("id NOT IN ?", keep)
		}
		if err := q.Delete(&Contact{}).Error; err != nil {
			return err
		}
		if err := tx.Where("id = ?", p.ID).Take(&p).Error; err != nil {
			return err
		}
		p.Contacts = []Contact{}
		if err := tx.Where("party_id = ?", p.ID).Order("id").Find(&p.Contacts).Error; err != nil {
			return err
		}
		return audit.RecordOn(ctx, tx, event)
	})
	return p, err
}
