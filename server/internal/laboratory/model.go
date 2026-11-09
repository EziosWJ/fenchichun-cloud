package laboratory

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
	ErrInvalid   = errors.New("化验单参数不正确")
	ErrConflict  = errors.New("化验单状态或版本已变化，请刷新后重试")
	ErrNotFound  = errors.New("化验单不存在")
	ErrForbidden = errors.New("没有化验单操作权限")
)

type Input struct {
	TripID       *int64 `json:"tripId,omitempty"`
	Plate        string `json:"plate"`
	MaterialCode string `json:"materialCode"`
	PartyCode    string `json:"partyCode"`
	Driver       string `json:"driver"`
	DriverPhone  string `json:"driverPhone"`
	ContractNo   string `json:"contractNo"`
	Moisture     string `json:"moisture"`
	Impurity     string `json:"impurity"`
	BulkDensity  string `json:"bulkDensity"`
	Conclusion   string `json:"conclusion"`
	Reason       string `json:"reason"`
	Remark       string `json:"remark"`
}

type Inspection struct {
	ID           int64  `json:"id"`
	Number       string `json:"number"`
	Status       string `json:"status"`
	Version      int64  `json:"version"`
	OriginalID   *int64 `json:"originalId"`
	Input        `gorm:"embedded"`
	MaterialName string     `json:"materialName"`
	PartyName    string     `json:"partyName"`
	CreatedBy    int64      `json:"createdBy"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
	ConfirmedBy  *int64     `json:"confirmedBy"`
	ConfirmedAt  *time.Time `json:"confirmedAt"`
	VoidedBy     *int64     `json:"voidedBy"`
	VoidedAt     *time.Time `json:"voidedAt"`
	VoidReason   string     `json:"voidReason"`
}

func (Inspection) TableName() string { return "grain_inspection" }

type Query struct {
	Page, PageSize  int
	Keyword, Status string
	TripID          int64
	Unlinked        bool
}
type Page struct {
	Records  []Inspection `json:"records"`
	Total    int64        `json:"total"`
	Page     int          `json:"page"`
	PageSize int          `json:"pageSize"`
}

var decimal = regexp.MustCompile(`^(0|[1-9][0-9]{0,5})(\.[0-9]{1,6})?$`)

func (in *Input) normalize() {
	in.Plate = strings.ToUpper(strings.TrimSpace(in.Plate))
	in.MaterialCode = strings.TrimSpace(in.MaterialCode)
	in.PartyCode = strings.TrimSpace(in.PartyCode)
	in.Reason = strings.TrimSpace(in.Reason)
	in.Moisture = strings.TrimSpace(in.Moisture)
	in.Impurity = strings.TrimSpace(in.Impurity)
	in.BulkDensity = strings.TrimSpace(in.BulkDensity)
}
func (in Input) validate() error {
	if in.TripID == nil || *in.TripID <= 0 {
		return fmt.Errorf("%w：请先选择待化验的流转单", ErrInvalid)
	}
	for _, field := range []struct {
		value string
		limit int
	}{{in.Plate, 40}, {in.MaterialCode, 80}, {in.PartyCode, 80}, {in.Driver, 100}, {in.DriverPhone, 50}, {in.ContractNo, 100}, {in.Reason, 2000}, {in.Remark, 2000}} {
		if utf8.RuneCountInString(field.value) > field.limit {
			return fmt.Errorf("%w：字段长度超限", ErrInvalid)
		}
	}
	if in.Conclusion != "accept" && in.Conclusion != "reject" {
		return fmt.Errorf("%w：请选择接收或拒收", ErrInvalid)
	}
	for i, value := range []string{in.Moisture, in.Impurity, in.BulkDensity} {
		if value == "" {
			return fmt.Errorf("%w：请补齐三项检测值", ErrInvalid)
		}
		if !decimal.MatchString(value) {
			return fmt.Errorf("%w：检测值须为非负十进制数，最多6位小数", ErrInvalid)
		}
		n, ok := new(big.Rat).SetString(value)
		if !ok || (i < 2 && n.Cmp(big.NewRat(100, 1)) > 0) || (i == 2 && n.Sign() <= 0) {
			return fmt.Errorf("%w：水分、杂质范围为0至100，容重须大于0", ErrInvalid)
		}
	}
	if in.Conclusion == "reject" && in.Reason == "" {
		return fmt.Errorf("%w：拒收必须填写原因", ErrInvalid)
	}
	return nil
}
