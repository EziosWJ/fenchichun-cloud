package laboratory

import (
	"context"
	"fenchichun.local/server/internal/audit"
	"fmt"
	"strings"
	"unicode/utf8"
)

type Store interface {
	List(context.Context, int64, Query) (Page, error)
	Detail(context.Context, int64, int64) (Inspection, error)
	Save(context.Context, int64, int64, Input, audit.Event) (Inspection, error)
	Transition(context.Context, int64, int64, string, string, audit.Event) (Inspection, error)
	Retest(context.Context, int64, int64, audit.Event) (Inspection, error)
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
func (s *Service) Save(ctx context.Context, id, version int64, in Input, e audit.Event) (Inspection, error) {
	in.normalize()
	if err := in.validate(false); err != nil {
		return Inspection{}, err
	}
	return s.store.Save(ctx, id, version, in, e)
}
func (s *Service) Transition(ctx context.Context, id, version int64, action, reason string, e audit.Event) (Inspection, error) {
	reason = strings.TrimSpace(reason)
	if action != "confirm" && action != "void" && action != "delete" {
		return Inspection{}, ErrInvalid
	}
	if action == "void" && (reason == "" || utf8.RuneCountInString(reason) > 2000) {
		return Inspection{}, fmt.Errorf("%w：请填写作废原因（最多2000字）", ErrInvalid)
	}
	return s.store.Transition(ctx, id, version, action, reason, e)
}
func (s *Service) Retest(ctx context.Context, id, version int64, e audit.Event) (Inspection, error) {
	return s.store.Retest(ctx, id, version, e)
}
