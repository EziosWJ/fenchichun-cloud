// Package granary manages grain storage locations used by the unloading step.
package granary

import (
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"
)

var (
	ErrInvalid   = errors.New("粮仓参数不正确")
	ErrNotFound  = errors.New("粮仓不存在")
	ErrForbidden = errors.New("没有粮仓维护权限")
	ErrConflict  = errors.New("粮仓名称已存在")
)

const ManagePermission = "grain-intake:granaries:manage"
const UsePermission = "grain-intake:trips"

type Input struct {
	SiteCode string `json:"siteCode"`
	Name     string `json:"name"`
	Enabled  bool   `json:"enabled"`
	Remark   string `json:"remark"`
}

type Granary struct {
	ID        int64     `json:"id"`
	SiteCode  string    `json:"siteCode"`
	Name      string    `json:"name"`
	Enabled   bool      `json:"enabled"`
	Remark    string    `json:"remark"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (Granary) TableName() string { return "grain_granary" }

func (in *Input) normalize() {
	in.SiteCode = strings.TrimSpace(in.SiteCode)
	in.Name = strings.TrimSpace(in.Name)
	in.Remark = strings.TrimSpace(in.Remark)
}

func (in Input) validate() error {
	if in.SiteCode == "" || in.Name == "" {
		return fmt.Errorf("%w：厂区和粮仓名称必填", ErrInvalid)
	}
	if utf8.RuneCountInString(in.SiteCode) > 80 || utf8.RuneCountInString(in.Name) > 100 || utf8.RuneCountInString(in.Remark) > 500 {
		return fmt.Errorf("%w：字段长度超限", ErrInvalid)
	}
	return nil
}
