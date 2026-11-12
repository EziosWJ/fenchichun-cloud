package deduction

import (
	"context"
	"math/big"
	"strings"

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

func (s *Service) Delete(ctx context.Context, actor, id int64, e audit.Event) error {
	return s.store.Delete(ctx, actor, id, e)
}

// Evaluate is used by the site-facing trip query. It never mutates a rule.
func (s *Service) Evaluate(ctx context.Context, materialCode, moisture, impurity string) ([]Evaluation, error) {
	return s.store.Evaluate(ctx, materialCode, moisture, impurity)
}

// PreviewMoisture resolves only the moisture-based rules for a material. It
// powers the laboratory inspection form preview; fixed-amount and impurity
// rules are intentionally excluded because impurity is decided at the weighing
// site during the second weigh.
func (s *Service) PreviewMoisture(ctx context.Context, materialCode, moisture string) ([]Evaluation, error) {
	materialCode = strings.TrimSpace(materialCode)
	moisture = strings.TrimSpace(moisture)
	if materialCode == "" || moisture == "" || !decimal.MatchString(moisture) {
		return nil, ErrInvalid
	}
	value, ok := new(big.Rat).SetString(moisture)
	if !ok || value.Cmp(big.NewRat(100, 1)) > 0 {
		return nil, ErrInvalid
	}
	items, err := s.store.Evaluate(ctx, materialCode, moisture, "")
	if err != nil {
		return nil, err
	}
	return filterMoistureEvaluations(items), nil
}

func filterMoistureEvaluations(items []Evaluation) []Evaluation {
	result := []Evaluation{}
	for _, item := range items {
		if item.BasisField == BasisMoisture {
			result = append(result, item)
		}
	}
	return result
}
