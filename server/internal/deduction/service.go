package deduction

import (
	"context"

	"fenchichun.local/server/internal/audit"
)

type Service struct{ store *Repository }

func NewService(store *Repository) *Service { return &Service{store: store} }

func (s *Service) Categories(ctx context.Context) ([]Category, error) {
	return s.store.Categories(ctx)
}

func (s *Service) Rules(ctx context.Context, actor int64, materialCode string) ([]Rule, error) {
	return s.store.List(ctx, actor, materialCode)
}

func (s *Service) Save(ctx context.Context, actor, id int64, in Input, e audit.Event) (Rule, error) {
	return s.store.Save(ctx, actor, id, in, e)
}

// Evaluate is used by the site-facing trip query. It never mutates a rule.
func (s *Service) Evaluate(ctx context.Context, materialCode, moisture, impurity string) ([]Evaluation, error) {
	return s.store.Evaluate(ctx, materialCode, moisture, impurity)
}
