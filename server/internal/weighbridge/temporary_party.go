package weighbridge

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"fenchichun.local/server/internal/audit"
	"fenchichun.local/server/internal/auth"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	temporaryPartySchema = 1
	temporaryPending     = "pending"
	temporaryNeedsInfo   = "needs_info"
	temporaryMerged      = "merged"
	temporaryDisabled    = "disabled"
)

var (
	temporaryCodePattern     = regexp.MustCompile(`^T-P-[A-Za-z0-9-]{1,36}$`)
	errTemporaryPartyVersion = errors.New("相同登记版本的资料不一致")
	errTemporaryPartyFinal   = errors.New("临时主体已归并或停用")
	errTemporaryPartyDenied  = errors.New("无权维护总部往来主体")
)

type TemporaryPartyInput struct {
	SchemaVersion int    `json:"schemaVersion"`
	SiteCode      string `json:"siteCode"`
	TemporaryCode string `json:"temporaryCode"`
	Version       int32  `json:"version"`
	Name          string `json:"name"`
	Nature        string `json:"nature"`
	IsSupplier    *bool  `json:"isSupplier"`
	IsCustomer    *bool  `json:"isCustomer"`
	IsCarrier     *bool  `json:"isCarrier"`
}

type TemporaryPartyReceipt struct {
	SchemaVersion int    `json:"schemaVersion"`
	SiteCode      string `json:"siteCode"`
	TemporaryCode string `json:"temporaryCode"`
	Version       int32  `json:"version"`
	Status        string `json:"status"`
}

type TemporaryPartyResult struct {
	TemporaryCode   string  `json:"temporaryCode"`
	Version         int32   `json:"version"`
	Status          string  `json:"status"`
	FormalPartyCode *string `json:"formalPartyCode"`
}

type TemporaryParty struct {
	TemporaryPartyResult `gorm:"embedded"`
	ID                   int64      `json:"id"`
	SiteCode             string     `json:"siteCode"`
	SiteName             string     `json:"siteName" gorm:"->"`
	Name                 string     `json:"name"`
	Nature               string     `json:"nature"`
	IsSupplier           bool       `json:"isSupplier"`
	IsCustomer           bool       `json:"isCustomer"`
	IsCarrier            bool       `json:"isCarrier"`
	Reason               string     `json:"reason"`
	ReceivedAt           time.Time  `json:"receivedAt"`
	ProcessedBy          *int64     `json:"processedBy"`
	ProcessedAt          *time.Time `json:"processedAt"`
}

func (TemporaryParty) TableName() string { return "wb_cloud_temporary_party" }

func (p TemporaryParty) finalized() bool {
	return p.Status == temporaryMerged || p.Status == temporaryDisabled
}

func (r *Repository) RegisterTemporaryParty(ctx context.Context, in TemporaryPartyInput) (TemporaryPartyReceipt, error) {
	in.Name = strings.TrimSpace(in.Name)
	if in.SchemaVersion != temporaryPartySchema || in.Version < 1 || !temporaryCodePattern.MatchString(in.TemporaryCode) ||
		in.IsSupplier == nil || in.IsCustomer == nil || in.IsCarrier == nil || strings.ContainsRune(in.Name, 0) {
		return TemporaryPartyReceipt{}, ErrInvalid
	}
	if err := validateParty(PartyInput{
		Name: in.Name, Nature: in.Nature, IsSupplier: *in.IsSupplier, IsCustomer: *in.IsCustomer, IsCarrier: *in.IsCarrier,
	}); err != nil {
		return TemporaryPartyReceipt{}, err
	}
	if !identityCode.MatchString(in.SiteCode) {
		return TemporaryPartyReceipt{}, ErrUnauthorized
	}

	next := TemporaryParty{
		TemporaryPartyResult: TemporaryPartyResult{TemporaryCode: in.TemporaryCode, Version: in.Version, Status: temporaryPending},
		SiteCode:             in.SiteCode, Name: in.Name, Nature: in.Nature, IsSupplier: *in.IsSupplier,
		IsCustomer: *in.IsCustomer, IsCarrier: *in.IsCarrier, ReceivedAt: time.Now().UTC(),
	}
	var receipt TemporaryPartyReceipt
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var bound site
		err := tx.Clauses(clause.Locking{Strength: "SHARE"}).Where("code = ? AND enabled", in.SiteCode).Take(&bound).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrUnauthorized
		}
		if err != nil {
			return err
		}

		insert := tx.Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "site_code"}, {Name: "temporary_code"}}, DoNothing: true,
		}).Create(&next)
		if insert.Error != nil {
			return insert.Error
		}
		current := next
		if insert.RowsAffected == 0 {
			err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
				Where("site_code = ? AND temporary_code = ?", bound.Code, in.TemporaryCode).Take(&current).Error
			if err != nil {
				return err
			}
			switch {
			case next.Version == current.Version:
				if next.Name != current.Name || next.Nature != current.Nature || next.IsSupplier != current.IsSupplier ||
					next.IsCustomer != current.IsCustomer || next.IsCarrier != current.IsCarrier {
					return errTemporaryPartyVersion
				}
			case next.Version > current.Version:
				if current.finalized() {
					return errTemporaryPartyFinal
				}
				if err := tx.Model(&current).Updates(map[string]any{
					"version": next.Version, "name": next.Name, "nature": next.Nature, "is_supplier": next.IsSupplier,
					"is_customer": next.IsCustomer, "is_carrier": next.IsCarrier, "received_at": next.ReceivedAt,
					"status": temporaryPending, "reason": "", "processed_by": nil, "processed_at": nil,
				}).Error; err != nil {
					return err
				}
				current = next
			}
		}
		receipt = TemporaryPartyReceipt{temporaryPartySchema, bound.Code, current.TemporaryCode, current.Version, current.Status}
		return nil
	})
	return receipt, err
}

type TemporaryPartyDecision struct {
	Version         int32  `json:"version"`
	Status          string `json:"status"`
	FormalPartyCode string `json:"formalPartyCode"`
	Reason          string `json:"reason"`
}

func requirePartyMaintenance(ctx context.Context, tx *gorm.DB, actorID int64) error {
	permissions, err := auth.NewRepository(tx).FindPermissionsByUserID(ctx, actorID)
	if err != nil {
		return err
	}
	if !slices.Contains(permissions, "weighbridge:parties") {
		return errTemporaryPartyDenied
	}
	return nil
}

func (r *Repository) TemporaryParties(ctx context.Context, actorID int64) ([]TemporaryParty, error) {
	tx := r.db.WithContext(ctx)
	if err := requirePartyMaintenance(ctx, tx, actorID); err != nil {
		return nil, err
	}
	rows := []TemporaryParty{}
	err := tx.Model(&TemporaryParty{}).Select("wb_cloud_temporary_party.*, s.name AS site_name").
		Joins("JOIN wb_cloud_site s ON s.code = wb_cloud_temporary_party.site_code").
		Order("received_at DESC, id DESC").Find(&rows).Error
	return rows, err
}

func (r *Repository) DecideTemporaryParty(ctx context.Context, id int64, in TemporaryPartyDecision, event audit.Event) error {
	in.Reason = strings.TrimSpace(in.Reason)
	if id < 1 || in.Version < 1 || utf8.RuneCountInString(in.Reason) > 500 || strings.ContainsRune(in.Reason, 0) {
		return ErrInvalid
	}
	switch in.Status {
	case temporaryMerged:
		if in.FormalPartyCode == "" || in.Reason != "" {
			return ErrInvalid
		}
	case temporaryNeedsInfo:
		if in.FormalPartyCode != "" || in.Reason == "" {
			return ErrInvalid
		}
	case temporaryDisabled:
		if in.FormalPartyCode != "" {
			return ErrInvalid
		}
	default:
		return ErrInvalid
	}

	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := requirePartyMaintenance(ctx, tx, event.Metadata.ActorID); err != nil {
			return err
		}
		var current TemporaryParty
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Take(&current, id).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return fmt.Errorf("%w：临时主体登记不存在", ErrInvalid)
		}
		if err != nil {
			return err
		}
		if current.Version != in.Version {
			return fmt.Errorf("%w：登记资料已更新，请重新核对后提交", ErrConflict)
		}
		if current.finalized() {
			return fmt.Errorf("%w：%s", ErrConflict, errTemporaryPartyFinal)
		}

		var formalCode *string
		if in.Status == temporaryMerged {
			var formal Party
			err := tx.Clauses(clause.Locking{Strength: "SHARE"}).Where("code = ?", in.FormalPartyCode).Take(&formal).Error
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return fmt.Errorf("%w：正式主体不存在", ErrInvalid)
			}
			if err != nil {
				return err
			}
			if !formal.Enabled || (current.IsSupplier && !formal.IsSupplier) ||
				(current.IsCustomer && !formal.IsCustomer) || (current.IsCarrier && !formal.IsCarrier) {
				return fmt.Errorf("%w：正式主体须已启用，并覆盖临时主体的业务身份", ErrInvalid)
			}
			formalCode = &formal.Code
		}
		if err := tx.Model(&current).Updates(map[string]any{
			"status": in.Status, "formal_party_code": formalCode, "reason": in.Reason,
			"processed_by": event.Metadata.ActorID, "processed_at": time.Now().UTC(),
		}).Error; err != nil {
			return err
		}
		event.ResourceID = id
		event.Summary = in.Status
		return audit.RecordOn(ctx, tx, event)
	})
}

// Keep site ownership in the join so the same temporary code from another factory stays independent.
const temporaryPartyJoin = `LEFT JOIN wb_cloud_temporary_party tp ON tp.site_code = t.site_code
	AND tp.temporary_code = t.party_code AND tp.status = 'merged'`
const reportingPartyCode = "COALESCE(tp.formal_party_code, t.party_code)"
const reportingPartyJoin = "LEFT JOIN wb_cloud_party p ON p.code = " + reportingPartyCode
const reportingPartyName = "COALESCE(p.name, t.party_name)"
