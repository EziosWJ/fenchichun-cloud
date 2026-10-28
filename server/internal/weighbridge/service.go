package weighbridge

import (
	"context"

	"fenchichun.local/server/internal/audit"
)

type Store interface {
	ApplyChange(context.Context, string, Change) (ChangeReceipt, error)
	MasterSnapshot(context.Context, string) (MasterSnapshot, error)
	CreateSite(context.Context, SiteInput, audit.Event) (SiteCredential, error)
	Sites(context.Context) ([]SiteView, error)
	UpdateSite(context.Context, string, string, SiteInput, audit.Event) error
	RotateCredential(context.Context, string, audit.Event) (SiteCredential, error)
	Credential(context.Context, string, int64) (SiteCredential, error)
	Categories(context.Context) ([]Category, error)
	Materials(context.Context) ([]Material, error)
	Parties(context.Context) ([]Party, error)
	SaveCategory(context.Context, string, CategoryInput, audit.Event) (Category, error)
	SaveMaterial(context.Context, string, MaterialInput, audit.Event) (Material, error)
	SaveParty(context.Context, string, PartyInput, audit.Event) (Party, error)
	TicketPage(context.Context, TicketQuery) (TicketPage, error)
	TicketTotals(context.Context, TicketQuery) ([]DirectionTotal, error)
}

func (s *Service) TicketPage(ctx context.Context, q TicketQuery) (TicketPage, error) {
	return s.store.TicketPage(ctx, q)
}
func (s *Service) TicketTotals(ctx context.Context, q TicketQuery) ([]DirectionTotal, error) {
	return s.store.TicketTotals(ctx, q)
}

type Service struct{ store Store }

func NewService(store Store) *Service { return &Service{store: store} }
func (s *Service) ApplyChange(ctx context.Context, token string, c Change) (ChangeReceipt, error) {
	return s.store.ApplyChange(ctx, token, c)
}
func (s *Service) MasterSnapshot(ctx context.Context, token string) (MasterSnapshot, error) {
	return s.store.MasterSnapshot(ctx, token)
}
func (s *Service) CreateSite(ctx context.Context, in SiteInput, e audit.Event) (SiteCredential, error) {
	return s.store.CreateSite(ctx, in, e)
}
func (s *Service) Categories(ctx context.Context) ([]Category, error) { return s.store.Categories(ctx) }
func (s *Service) Materials(ctx context.Context) ([]Material, error)  { return s.store.Materials(ctx) }
func (s *Service) Parties(ctx context.Context) ([]Party, error)       { return s.store.Parties(ctx) }
func (s *Service) SaveCategory(ctx context.Context, code string, in CategoryInput, e audit.Event) (Category, error) {
	return s.store.SaveCategory(ctx, code, in, e)
}
func (s *Service) SaveMaterial(ctx context.Context, code string, in MaterialInput, e audit.Event) (Material, error) {
	return s.store.SaveMaterial(ctx, code, in, e)
}
func (s *Service) SaveParty(ctx context.Context, code string, in PartyInput, e audit.Event) (Party, error) {
	return s.store.SaveParty(ctx, code, in, e)
}

func (s *Service) Sites(ctx context.Context) ([]SiteView, error) { return s.store.Sites(ctx) }

func (s *Service) RotateCredential(ctx context.Context, code string, event audit.Event) (SiteCredential, error) {
	return s.store.RotateCredential(ctx, code, event)
}

func (s *Service) UpdateSite(ctx context.Context, code, scaleCode string, in SiteInput, event audit.Event) error {
	return s.store.UpdateSite(ctx, code, scaleCode, in, event)
}

func (s *Service) Credential(ctx context.Context, code string, actorID int64) (SiteCredential, error) {
	return s.store.Credential(ctx, code, actorID)
}
