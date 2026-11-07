package weighbridge

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"fenchichun.local/server/internal/audit"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"gorm.io/gorm/logger"
)

type PartyInput struct {
	IdentityNumber string    `json:"identityNumber"`
	Name           string    `json:"name"`
	ShortName      string    `json:"shortName"`
	Nature         string    `json:"nature"`
	IsSupplier     bool      `json:"isSupplier"`
	IsCustomer     bool      `json:"isCustomer"`
	IsCarrier      bool      `json:"isCarrier"`
	Phone          string    `json:"phone"`
	Address        string    `json:"address"`
	CreditCode     string    `json:"creditCode"`
	Remark         string    `json:"remark"`
	Enabled        bool      `json:"enabled"`
	Contacts       []Contact `json:"contacts"`
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
	in.IdentityNumber = strings.ToUpper(strings.TrimSpace(in.IdentityNumber))
	in.CreditCode = strings.ToUpper(strings.TrimSpace(in.CreditCode))
	if in.IdentityNumber != "" && (in.Nature != "individual" || !validIdentityNumber(in.IdentityNumber)) {
		return Party{}, fmt.Errorf("%w：身份证号码格式或校验位不正确", ErrInvalid)
	}
	if in.CreditCode != "" && (in.Nature != "enterprise" || !regexp.MustCompile(`^[0-9A-HJ-NPQRTUWXY]{18}$`).MatchString(in.CreditCode)) {
		return Party{}, fmt.Errorf("%w：统一社会信用代码须为18位有效字符", ErrInvalid)
	}
	var p Party
	err := r.db.WithContext(ctx).Session(&gorm.Session{Logger: r.db.Logger.LogMode(logger.Silent)}).Transaction(func(tx *gorm.DB) error {
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
			p.IdentityNumber = in.IdentityNumber
			p.Remark = in.Remark
			p.Enabled = in.Enabled
			if in.IsSupplier && ((in.Nature == "individual" && in.IdentityNumber == "") || (in.Nature == "enterprise" && in.CreditCode == "")) {
				return fmt.Errorf("%w：供应商须填写对应证件号码", ErrInvalid)
			}
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
			if in.IdentityNumber == "" && in.Nature == p.Nature {
				in.IdentityNumber = p.IdentityNumber
			}
			if in.Nature == "enterprise" {
				in.IdentityNumber = ""
			}
			if in.IsSupplier && ((in.Nature == "individual" && in.IdentityNumber == "") || (in.Nature == "enterprise" && in.CreditCode == "")) {
				return fmt.Errorf("%w：供应商须填写对应证件号码", ErrInvalid)
			}
			changes := map[string]any{"identity_number": in.IdentityNumber, "name": in.Name, "short_name": in.ShortName, "nature": in.Nature, "is_supplier": in.IsSupplier, "is_customer": in.IsCustomer, "is_carrier": in.IsCarrier, "phone": in.Phone, "address": in.Address, "credit_code": in.CreditCode, "remark": in.Remark, "enabled": in.Enabled}
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
	if errors.Is(err, gorm.ErrDuplicatedKey) || (err != nil && strings.Contains(err.Error(), "SQLSTATE 23505")) {
		return Party{}, fmt.Errorf("%w：证件号码或信用代码已存在", ErrConflict)
	}
	p.HasIdentityNumber = p.IdentityNumber != ""
	return p, err
}

// validIdentityNumber validates the 18-character structure, birth date and check digit.
func validIdentityNumber(value string) bool {
	if !regexp.MustCompile(`^[1-9][0-9]{16}[0-9X]$`).MatchString(value) {
		return false
	}
	birth, err := time.Parse("20060102", value[6:14])
	if err != nil || birth.After(time.Now()) {
		return false
	}
	weights := []int{7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2}
	sum := 0
	for i, w := range weights {
		sum += int(value[i]-'0') * w
	}
	return value[17] == "10X98765432"[sum%11]
}
