// Package miniprogram exposes the read-only dictionaries used by the WeChat
// mini program. It intentionally has no write paths.
package miniprogram

import (
	"context"
)

type Site struct {
	Code string `json:"code" gorm:"column:code"`
	Name string `json:"name" gorm:"column:name"`
}

type Material struct {
	Code             string `json:"code" gorm:"column:code"`
	Name             string `json:"name" gorm:"column:name"`
	InspectionMethod string `json:"inspectionMethod" gorm:"column:inspection_method"`
}

type Supplier struct {
	Code string `json:"code" gorm:"column:code"`
	Name string `json:"name" gorm:"column:name"`
}

type Granary struct {
	ID   int64  `json:"id" gorm:"column:id"`
	Name string `json:"name" gorm:"column:name"`
}

// Dictionary is the complete snapshot consumed by the mini program. Version is
// a content hash so clients can refresh their local cache only when it changes.
type Dictionary struct {
	Version   string     `json:"version"`
	Sites     []Site     `json:"sites"`
	Materials []Material `json:"materials"`
	Suppliers []Supplier `json:"suppliers"`
	Granaries []Granary  `json:"granaries"`
}

// HandlerService is the read-only capability used by the HTTP handler.
type HandlerService interface {
	Dictionary(context.Context) (Dictionary, error)
}
