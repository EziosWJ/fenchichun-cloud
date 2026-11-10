package miniprogram

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"

	"gorm.io/gorm"
)

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

// Load returns the enabled dictionaries in the same order as the management
// pages: sites and materials by code, suppliers by code and granaries by name.
func (r *Repository) Load(ctx context.Context) (Dictionary, error) {
	result := Dictionary{
		Sites:     []Site{},
		Materials: []Material{},
		Suppliers: []Supplier{},
		Granaries: []Granary{},
	}
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Table("wb_cloud_site").
			Select("code, name").
			Where("enabled = ?", true).
			Order("code").
			Find(&result.Sites).Error; err != nil {
			return err
		}
		if err := tx.Table("wb_cloud_material").
			Select("code, name, inspection_method").
			Where("enabled = ?", true).
			Order("code").
			Find(&result.Materials).Error; err != nil {
			return err
		}
		if err := tx.Table("wb_cloud_party").
			Select("code, name").
			Where("enabled = ? AND is_supplier = ?", true, true).
			Order("code").
			Find(&result.Suppliers).Error; err != nil {
			return err
		}
		return tx.Table("grain_granary").
			Select("id, name").
			Where("enabled = ?", true).
			Order("name").
			Find(&result.Granaries).Error
	})
	if err != nil {
		return Dictionary{}, err
	}
	version, err := hashDictionary(result)
	if err != nil {
		return Dictionary{}, err
	}
	result.Version = version
	return result, nil
}

func hashDictionary(value Dictionary) (string, error) {
	payload, err := json.Marshal(struct {
		Sites     []Site     `json:"sites"`
		Materials []Material `json:"materials"`
		Suppliers []Supplier `json:"suppliers"`
		Granaries []Granary  `json:"granaries"`
	}{value.Sites, value.Materials, value.Suppliers, value.Granaries})
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])[:16], nil
}
