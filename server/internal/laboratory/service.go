package laboratory

import (
	"context"
	"fenchichun.local/server/internal/audit"
	"unicode/utf8"
)

type Store interface {
	List(context.Context, int64, Query) (Page, error)
	Detail(context.Context, int64, int64) (Inspection, error)
	Create(context.Context, Input, audit.Event) (Inspection, error)
}
type Service struct{ store Store }

func NewService(store Store) *Service { return &Service{store: store} }
func (s *Service) List(ctx context.Context, actor int64, q Query) (Page, error) {
	if q.Page < 1 {
		q.Page = 1
	}
	if q.PageSize < 1 {
		q.PageSize = 10
	}
	if q.PageSize > 100 {
		q.PageSize = 100
	}
	if q.Status != "" && q.Status != "draft" && q.Status != "confirmed" && q.Status != "void" {
		return Page{}, ErrInvalid
	}
	if utf8.RuneCountInString(q.Keyword) > 100 {
		return Page{}, ErrInvalid
	}
	return s.store.List(ctx, actor, q)
}
func (s *Service) Detail(ctx context.Context, actor, id int64) (Inspection, error) {
	return s.store.Detail(ctx, actor, id)
}

// Create 一条流转单只允许一条化验结果，结果提交即生效，不再有草稿与复检。
func (s *Service) Create(ctx context.Context, in Input, e audit.Event) (Inspection, error) {
	in.normalize()
	return s.store.Create(ctx, in, e)
}
