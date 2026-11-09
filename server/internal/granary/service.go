package granary

import "context"

type Service struct{ store *Repository }

func NewService(store *Repository) *Service { return &Service{store: store} }

func (s *Service) List(ctx context.Context, actor int64, siteCode string, onlyEnabled bool) ([]Granary, error) {
	return s.store.List(ctx, actor, siteCode, onlyEnabled)
}

func (s *Service) Create(ctx context.Context, actor int64, in Input) (Granary, error) {
	return s.store.Create(ctx, actor, in)
}

func (s *Service) Update(ctx context.Context, actor, id int64, in Input) (Granary, error) {
	return s.store.Update(ctx, actor, id, in)
}

func (s *Service) Delete(ctx context.Context, actor, id int64) error {
	return s.store.Delete(ctx, actor, id)
}
