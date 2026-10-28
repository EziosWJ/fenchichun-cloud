package weighbridge

import (
	"context"
	"database/sql"
	"errors"

	"gorm.io/gorm"
)

type Category struct {
	ID      int64  `json:"-"`
	Code    string `json:"code"`
	Name    string `json:"name"`
	Enabled bool   `json:"enabled"`
}

func (Category) TableName() string { return "wb_cloud_category" }

type Material struct {
	ID           int64   `json:"-"`
	Code         string  `json:"code"`
	Name         string  `json:"name"`
	CategoryID   *int64  `json:"-"`
	CategoryCode *string `json:"categoryCode" gorm:"->"`
	Spec         string  `json:"spec"`
	Remark       string  `json:"remark"`
	Enabled      bool    `json:"enabled"`
}

func (Material) TableName() string { return "wb_cloud_material" }

type Party struct {
	ID         int64     `json:"-"`
	Code       string    `json:"code"`
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
	Contacts   []Contact `json:"contacts" gorm:"-"`
}

func (Party) TableName() string { return "wb_cloud_party" }

type Contact struct {
	ID        int64  `json:"id"`
	PartyID   int64  `json:"-"`
	Name      string `json:"name"`
	Phone     string `json:"phone"`
	Purpose   string `json:"purpose"`
	Remark    string `json:"remark"`
	IsDefault bool   `json:"isDefault"`
}

func (Contact) TableName() string { return "wb_cloud_contact" }

type MasterSnapshot struct {
	SchemaVersion int        `json:"schemaVersion"`
	SiteCode      string     `json:"siteCode"`
	Categories    []Category `json:"categories"`
	Materials     []Material `json:"materials"`
	Parties       []Party    `json:"parties"`
}

// MasterSnapshot reads all four related lists in one repeatable-read transaction.
func (r *Repository) MasterSnapshot(ctx context.Context, code string) (MasterSnapshot, error) {
	result := MasterSnapshot{SchemaVersion: 2, Categories: []Category{}, Materials: []Material{}, Parties: []Party{}}
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var bound site
		if err := tx.Where("code = ? AND enabled = ?", code, true).Take(&bound).Error; err != nil {
			return err
		}
		result.SiteCode = bound.Code
		if err := tx.Order("code").Find(&result.Categories).Error; err != nil {
			return err
		}
		if err := tx.Table("wb_cloud_material m").Select("m.*, c.code AS category_code").Joins("LEFT JOIN wb_cloud_category c ON c.id = m.category_id").Order("m.code").Scan(&result.Materials).Error; err != nil {
			return err
		}
		if err := tx.Order("code").Find(&result.Parties).Error; err != nil {
			return err
		}
		contacts := []Contact{}
		if err := tx.Order("id").Find(&contacts).Error; err != nil {
			return err
		}
		byParty := make(map[int64][]Contact)
		for _, contact := range contacts {
			byParty[contact.PartyID] = append(byParty[contact.PartyID], contact)
		}
		for i := range result.Parties {
			result.Parties[i].Contacts = byParty[result.Parties[i].ID]
			if result.Parties[i].Contacts == nil {
				result.Parties[i].Contacts = []Contact{}
			}
		}
		return nil
	}, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return MasterSnapshot{}, ErrUnauthorized
		}
		return MasterSnapshot{}, err
	}
	return result, nil
}

func (r *Repository) Materials(ctx context.Context) ([]Material, error) {
	values := []Material{}
	err := r.db.WithContext(ctx).Table("wb_cloud_material m").Select("m.*, c.code AS category_code").Joins("LEFT JOIN wb_cloud_category c ON c.id = m.category_id").Order("m.code").Scan(&values).Error
	return values, err
}

func (r *Repository) Parties(ctx context.Context) ([]Party, error) {
	parties := []Party{}
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Order("code").Find(&parties).Error; err != nil {
			return err
		}
		contacts := []Contact{}
		if err := tx.Order("id").Find(&contacts).Error; err != nil {
			return err
		}
		byParty := map[int64][]Contact{}
		for _, c := range contacts {
			byParty[c.PartyID] = append(byParty[c.PartyID], c)
		}
		for i := range parties {
			parties[i].Contacts = byParty[parties[i].ID]
			if parties[i].Contacts == nil {
				parties[i].Contacts = []Contact{}
			}
		}
		return nil
	}, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	return parties, err
}
