// Package deduction manages material-specific deduction rules: moisture-based
// percentage bands and fixed-amount categories. Impurity is entered by the
// weighing site during the second weigh and is not configured here.
package deduction

import (
	"errors"
	"fmt"
	"math/big"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

var (
	ErrInvalid   = errors.New("扣减规则参数不正确")
	ErrNotFound  = errors.New("扣减规则不存在")
	ErrForbidden = errors.New("没有扣减规则维护权限")
	ErrConflict  = errors.New("扣减规则状态已变化，请刷新后重试")
)

const ManagePermission = "grain-intake:deduction-rules"

const (
	ModeAmount  = "amount"
	ModePercent = "percent"

	BasisMoisture = "moisture"
	BasisImpurity = "impurity"
)

var decimal = regexp.MustCompile(`^(0|[1-9][0-9]{0,5})(\.[0-9]{1,6})?$`)

// Category is the configurable dictionary of deduction reasons.
type Category struct {
	Code      string `json:"code"`
	Name      string `json:"name"`
	Enabled   bool   `json:"enabled"`
	SortOrder int    `json:"sortOrder"`
}

func (Category) TableName() string { return "grain_deduction_category" }

// Range is one percentage band for a percent rule. MinValue is inclusive and
// MaxValue is exclusive; an empty MaxValue means no upper bound.
type Range struct {
	MinValue  string  `json:"minValue"`
	MaxValue  *string `json:"maxValue"`
	RateBP    int     `json:"rateBp"`
	SortOrder int     `json:"sortOrder"`
}

func (Range) TableName() string { return "grain_deduction_rule_range" }

// Rule is one deduction reason for a material. Several rules may apply to the
// same material, combining moisture percentage bands with fixed-amount
// categories.
type Rule struct {
	ID               int64     `json:"id"`
	Code             string    `json:"code"`
	MaterialCode     string    `json:"materialCode"`
	MaterialName     string    `json:"materialName" gorm:"->"`
	CategoryCode     string    `json:"categoryCode"`
	CategoryName     string    `json:"categoryName" gorm:"->"`
	Mode             string    `json:"mode"`
	BasisField       string    `json:"basisField"`
	AmountMilliTonne int64     `json:"amountMilliTonne"`
	Version          int64     `json:"version"`
	EffectiveFrom    time.Time `json:"effectiveFrom"`
	Enabled          bool      `json:"enabled"`
	Remark           string    `json:"remark"`
	Ranges           []Range   `json:"ranges" gorm:"-"`
	CreatedAt        time.Time `json:"createdAt"`
	UpdatedAt        time.Time `json:"updatedAt"`
}

func (Rule) TableName() string { return "grain_deduction_rule" }

type RangeInput struct {
	MinValue string `json:"minValue"`
	MaxValue string `json:"maxValue"`
	RateBP   int    `json:"rateBp"`
}

type Input struct {
	Code             string       `json:"code"`
	MaterialCode     string       `json:"materialCode"`
	CategoryCode     string       `json:"categoryCode"`
	Mode             string       `json:"mode"`
	BasisField       string       `json:"basisField"`
	AmountMilliTonne int64        `json:"amountMilliTonne"`
	EffectiveFrom    string       `json:"effectiveFrom"`
	Enabled          bool         `json:"enabled"`
	Remark           string       `json:"remark"`
	Ranges           []RangeInput `json:"ranges"`
}

// Evaluation is one resolved deduction item returned to the weighing client.
// Amount rules carry AmountMilliTonne; percent rules carry RateBP and leave
// the tonne conversion to the client so it can use the final net weight.
type Evaluation struct {
	RuleID           int64  `json:"ruleId"`
	RuleCode         string `json:"ruleCode"`
	RuleVersion      int64  `json:"ruleVersion"`
	CategoryCode     string `json:"categoryCode"`
	CategoryName     string `json:"categoryName"`
	Mode             string `json:"mode"`
	BasisField       string `json:"basisField,omitempty"`
	BasisValue       string `json:"basisValue,omitempty"`
	AmountMilliTonne int64  `json:"amountMilliTonne"`
	RateBP           *int   `json:"rateBp,omitempty"`
	Explanation      string `json:"explanation,omitempty"`
}

func (in *Input) normalize() {
	in.Code = strings.TrimSpace(in.Code)
	in.MaterialCode = strings.TrimSpace(in.MaterialCode)
	in.CategoryCode = strings.TrimSpace(in.CategoryCode)
	in.Mode = strings.TrimSpace(in.Mode)
	in.BasisField = strings.TrimSpace(in.BasisField)
	in.EffectiveFrom = strings.TrimSpace(in.EffectiveFrom)
	in.Remark = strings.TrimSpace(in.Remark)
	for i := range in.Ranges {
		in.Ranges[i].MinValue = strings.TrimSpace(in.Ranges[i].MinValue)
		in.Ranges[i].MaxValue = strings.TrimSpace(in.Ranges[i].MaxValue)
	}
}

func (in Input) validate() error {
	if in.MaterialCode == "" {
		return fmt.Errorf("%w：请选择物料", ErrInvalid)
	}
	if in.CategoryCode == "" {
		return fmt.Errorf("%w：请选择扣减类别", ErrInvalid)
	}
	if utf8.RuneCountInString(in.Code) > 40 || utf8.RuneCountInString(in.Remark) > 500 || utf8.RuneCountInString(in.MaterialCode) > 80 || utf8.RuneCountInString(in.CategoryCode) > 40 {
		return fmt.Errorf("%w：字段长度超限", ErrInvalid)
	}
	switch in.Mode {
	case ModeAmount:
		if in.AmountMilliTonne <= 0 {
			return fmt.Errorf("%w：按吨扣减须填写大于零的扣减重量", ErrInvalid)
		}
		if in.BasisField != "" {
			return fmt.Errorf("%w：按吨扣减不需要检测值依据", ErrInvalid)
		}
		if len(in.Ranges) > 0 {
			return fmt.Errorf("%w：按吨扣减不能配置比例区间", ErrInvalid)
		}
	case ModePercent:
		if in.AmountMilliTonne != 0 {
			return fmt.Errorf("%w：按比例扣减不能填写固定扣减重量", ErrInvalid)
		}
		switch in.BasisField {
		case BasisMoisture:
		default:
			return fmt.Errorf("%w：按比例扣减须选择水分依据", ErrInvalid)
		}
		if len(in.Ranges) == 0 {
			return fmt.Errorf("%w：按比例扣减至少配置一个区间", ErrInvalid)
		}
		if err := validateRanges(in.Ranges); err != nil {
			return err
		}
	default:
		return fmt.Errorf("%w：扣减方式须为按吨或按比例", ErrInvalid)
	}
	if in.EffectiveFrom != "" {
		if _, err := parseTime(in.EffectiveFrom); err != nil {
			return fmt.Errorf("%w：生效时间格式不正确", ErrInvalid)
		}
	}
	return nil
}

func validateRanges(ranges []RangeInput) error {
	previousMax := (*big.Rat)(nil)
	for i, item := range ranges {
		min, ok := new(big.Rat).SetString(item.MinValue)
		if !ok || min.Sign() < 0 || !decimal.MatchString(item.MinValue) {
			return fmt.Errorf("%w：第 %d 个区间起点无效", ErrInvalid, i+1)
		}
		var max *big.Rat
		if item.MaxValue != "" {
			value, ok := new(big.Rat).SetString(item.MaxValue)
			if !ok || value.Cmp(min) <= 0 || !decimal.MatchString(item.MaxValue) {
				return fmt.Errorf("%w：第 %d 个区间终点须大于起点", ErrInvalid, i+1)
			}
			max = value
		}
		if item.RateBP < 0 || item.RateBP > 10000 {
			return fmt.Errorf("%w：第 %d 个区间扣减比例须在 0 至 100%% 之间", ErrInvalid, i+1)
		}
		if previousMax != nil && min.Cmp(previousMax) < 0 {
			return fmt.Errorf("%w：扣减区间不能重叠，请按从小到大排列", ErrInvalid)
		}
		if max == nil && i != len(ranges)-1 {
			return fmt.Errorf("%w：只有最后一个区间可以不设终点", ErrInvalid)
		}
		previousMax = max
	}
	return nil
}

func parseTime(value string) (time.Time, error) {
	if parsed, err := time.Parse(time.RFC3339, value); err == nil {
		return parsed, nil
	}
	return time.ParseInLocation("2006-01-02", value, time.FixedZone("CST", 8*3600))
}
