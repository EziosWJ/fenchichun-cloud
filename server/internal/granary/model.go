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
	ErrInvalid   = errors.New("仓库参数不正确")
	ErrNotFound  = errors.New("仓库不存在")
	ErrForbidden = errors.New("没有仓库维护权限")
	ErrConflict  = errors.New("仓库名称已存在")
)

const ManagePermission = "grain-intake:granaries:manage"
const UsePermission = "grain-intake:trips"

type Input struct {
	Name    string `json:"name"`
	Enabled bool   `json:"enabled"`
	Remark  string `json:"remark"`
}

type Granary struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	Enabled   bool      `json:"enabled"`
	Remark    string    `json:"remark"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (Granary) TableName() string { return "grain_granary" }

func (in *Input) normalize() {
	in.Name = strings.TrimSpace(in.Name)
	in.Remark = strings.TrimSpace(in.Remark)
}

func (in Input) validate() error {
	if in.Name == "" {
		return fmt.Errorf("%w：仓库名称必填", ErrInvalid)
	}
	if utf8.RuneCountInString(in.Name) > 100 || utf8.RuneCountInString(in.Remark) > 500 {
		return fmt.Errorf("%w：字段长度超限", ErrInvalid)
	}
	return nil
}
