package grainintake

import (
	"context"

	"fenchichun.local/server/internal/deduction"
)

type DeductionEvaluator interface {
	Evaluate(context.Context, string, string, string) ([]deduction.Evaluation, error)
}

type SyncService struct {
	repo      *Repository
	deduction DeductionEvaluator
}

func NewSyncService(repo *Repository, evaluator DeductionEvaluator) *SyncService {
	return &SyncService{repo: repo, deduction: evaluator}
}

func (s *SyncService) Candidates(ctx context.Context, siteCode, plate string) ([]SyncTrip, error) {
	values, err := s.repo.SyncCandidates(ctx, siteCode, plate)
	if err != nil {
		return nil, err
	}
	return s.decorate(ctx, values)
}

func (s *SyncService) Trip(ctx context.Context, siteCode, tripNo string) (SyncTrip, error) {
	value, err := s.repo.SyncTrip(ctx, siteCode, tripNo)
	if err != nil {
		return SyncTrip{}, err
	}
	values, err := s.decorate(ctx, []SyncTrip{value})
	if err != nil {
		return SyncTrip{}, err
	}
	return values[0], nil
}

func (s *SyncService) LinkTicket(ctx context.Context, siteCode, tripNo, ticketNo string) error {
	return s.repo.LinkTicketBySystem(ctx, siteCode, tripNo, ticketNo)
}

func (s *SyncService) decorate(ctx context.Context, values []SyncTrip) ([]SyncTrip, error) {
	for i := range values {
		values[i].Deductions = []deduction.Evaluation{}
		if s.deduction == nil || values[i].Inspection == nil || values[i].Inspection.Conclusion != "accept" {
			continue
		}
		items, err := s.deduction.Evaluate(ctx, values[i].MaterialCode, values[i].Inspection.Moisture, values[i].Inspection.Impurity)
		if err != nil {
			return nil, err
		}
		if items == nil {
			items = []deduction.Evaluation{}
		}
		values[i].Deductions = items
	}
	return values, nil
}
