package grainintake

import (
	"context"
	"fenchichun.local/server/internal/audit"
	"strings"
	"unicode/utf8"
)

type Store interface {
	Trips(context.Context, int64, Query) (TripPage, error)
	Permits(context.Context, int64, Query) (PermitPage, error)
	Detail(context.Context, int64, int64, string) (Detail, error)
	TicketCandidates(context.Context, int64, int64) ([]TicketCandidate, error)
	Save(context.Context, int64, int64, Input, audit.Event) (Detail, error)
	Command(context.Context, int64, string, Command, audit.Event) (Detail, error)
	Defaults(context.Context, int64) (string, error)
}
type Service struct{ store Store }

func NewService(store Store) *Service { return &Service{store} }
func normalizeQuery(q Query) (Query, error) {
	if q.Page < 1 {
		q.Page = 1
	}
	if q.PageSize < 1 {
		q.PageSize = 10
	}
	if q.PageSize > 100 {
		q.PageSize = 100
	}
	if utf8.RuneCountInString(q.Keyword) > 100 {
		return q, ErrInvalid
	}
	switch q.Stage {
	case "", "pending_inspection", "pending_unload", "pending_ticket", "accepted", "rejected", "ready", "permit_pending", "permit_approved", "exited", "blocked":
	default:
		return q, ErrInvalid
	}
	switch q.Order {
	case "", "inspection_first":
	default:
		return q, ErrInvalid
	}
	switch q.Method {
	case "", "lab", "visual":
	default:
		return q, ErrInvalid
	}
	return q, nil
}
func (s *Service) Trips(ctx context.Context, actor int64, q Query) (TripPage, error) {
	q, err := normalizeQuery(q)
	if err != nil {
		return TripPage{}, err
	}
	return s.store.Trips(ctx, actor, q)
}
func (s *Service) Permits(ctx context.Context, actor int64, q Query) (PermitPage, error) {
	q, err := normalizeQuery(q)
	if err != nil {
		return PermitPage{}, err
	}
	return s.store.Permits(ctx, actor, q)
}
func (s *Service) Detail(ctx context.Context, actor, id int64, scope string) (Detail, error) {
	return s.store.Detail(ctx, actor, id, scope)
}
func (s *Service) TicketCandidates(ctx context.Context, actor, id int64) ([]TicketCandidate, error) {
	if id <= 0 {
		return nil, ErrInvalid
	}
	return s.store.TicketCandidates(ctx, actor, id)
}
func (s *Service) Save(ctx context.Context, id, version int64, in Input, e audit.Event) (Detail, error) {
	in.normalize()
	if err := in.validate(); err != nil {
		return Detail{}, err
	}
	return s.store.Save(ctx, id, version, in, e)
}
func (s *Service) Command(ctx context.Context, id int64, action string, in Command, e audit.Event) (Detail, error) {
	switch action {
	case "record-visual", "confirm-unloading", "link-ticket", "issue-permit", "approve-permit", "confirm-exit":
	default:
		return Detail{}, ErrInvalid
	}
	in.Location = strings.TrimSpace(in.Location)
	in.Reason = strings.TrimSpace(in.Reason)
	if action == "record-visual" && ((in.Conclusion != "accept" && in.Conclusion != "reject") || (in.Conclusion == "reject" && in.Reason == "") || utf8.RuneCountInString(in.Reason) > 2000) {
		return Detail{}, ErrInvalid
	}
	if action == "confirm-unloading" && (in.Location == "" || utf8.RuneCountInString(in.Location) > 200) {
		return Detail{}, ErrInvalid
	}
	if action == "link-ticket" && (in.TicketSiteCode == "" || in.TicketNo == "" || len(in.TicketSiteCode) > 80 || utf8.RuneCountInString(in.TicketNo) > 200) {
		return Detail{}, ErrInvalid
	}
	return s.store.Command(ctx, id, action, in, e)
}

func (s *Service) Rejections(ctx context.Context, actor int64, q Query) (TripPage, error) {
	q.Gate = true
	q, err := normalizeQuery(q)
	if err != nil {
		return TripPage{}, err
	}
	return s.store.Trips(ctx, actor, q)
}

// Defaults 返回当前用户最近一张流转单的厂区，供登记页作为默认值。
func (s *Service) Defaults(ctx context.Context, actor int64) (string, error) {
	return s.store.Defaults(ctx, actor)
}
