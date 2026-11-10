package miniprogram

import "context"

type Service struct{ repository *Repository }

func NewService(repository *Repository) *Service {
	return &Service{repository: repository}
}

func (s *Service) Dictionary(ctx context.Context) (Dictionary, error) {
	return s.repository.Load(ctx)
}
