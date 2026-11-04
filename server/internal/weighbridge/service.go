package weighbridge

import (
	"context"

	"fenchichun.local/server/internal/audit"
)

type Store interface {
	ApplyChange(context.Context, Change) (ChangeReceipt, error)
	MasterSnapshot(context.Context, string) (MasterSnapshot, error)
	CreateSite(context.Context, SiteInput, audit.Event) (SiteView, error)
	Sites(context.Context) ([]SiteView, error)
	UpdateSite(context.Context, string, SiteInput, audit.Event) error
	Categories(context.Context) ([]Category, error)
	Materials(context.Context) ([]Material, error)
	Parties(context.Context) ([]Party, error)
	SaveCategory(context.Context, string, CategoryInput, audit.Event) (Category, error)
	SaveMaterial(context.Context, string, MaterialInput, audit.Event) (Material, error)
	SaveParty(context.Context, string, PartyInput, audit.Event) (Party, error)
	TicketPage(context.Context, TicketQuery) (TicketPage, error)
	TicketTotals(context.Context, TicketQuery) ([]DirectionTotal, error)
	StatementParties(context.Context, StatementQuery) (StatementPartyPage, error)
	StatementPartiesAll(context.Context, StatementQuery) ([]StatementParty, StatementPageSummary, error)
	StatementDetail(context.Context, StatementQuery) (StatementDetail, error)
	StatementTickets(context.Context, StatementQuery) ([]StatementTicket, error)
	ApplyChangeV4(context.Context, ChangeV4) (ChangeReceiptV4, error)
	ReconcileTicket(context.Context, string, string) (TicketReconcile, error)
	ReconcileTickets(context.Context, []TicketRef) (BatchTicketReconcile, error)
	LookupChange(context.Context, string, string) (ChangeLookup, error)
	SiteReceipts(context.Context, int64) ([]SiteReceipt, error)
	TicketReceipt(context.Context, int64, string, string) (TicketReceipt, error)
}

func (s *Service) TicketPage(ctx context.Context, q TicketQuery) (TicketPage, error) {
	return s.store.TicketPage(ctx, q)
}
func (s *Service) TicketTotals(ctx context.Context, q TicketQuery) ([]DirectionTotal, error) {
	return s.store.TicketTotals(ctx, q)
}
func (s *Service) StatementParties(ctx context.Context, q StatementQuery) (StatementPartyPage, error) {
	return s.store.StatementParties(ctx, q)
}
func (s *Service) StatementPartiesAll(ctx context.Context, q StatementQuery) ([]StatementParty, StatementPageSummary, error) {
	return s.store.StatementPartiesAll(ctx, q)
}
func (s *Service) StatementDetail(ctx context.Context, q StatementQuery) (StatementDetail, error) {
	return s.store.StatementDetail(ctx, q)
}
func (s *Service) StatementTickets(ctx context.Context, q StatementQuery) ([]StatementTicket, error) {
	return s.store.StatementTickets(ctx, q)
}

type Service struct{ store Store }

func NewService(store Store) *Service { return &Service{store: store} }
func (s *Service) ApplyChange(ctx context.Context, c Change) (ChangeReceipt, error) {
	return s.store.ApplyChange(ctx, c)
}
func (s *Service) MasterSnapshot(ctx context.Context, token string) (MasterSnapshot, error) {
	return s.store.MasterSnapshot(ctx, token)
}
func (s *Service) CreateSite(ctx context.Context, in SiteInput, e audit.Event) (SiteView, error) {
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

func (s *Service) UpdateSite(ctx context.Context, code string, in SiteInput, event audit.Event) error {
	return s.store.UpdateSite(ctx, code, in, event)
}

func (s *Service) ApplyChangeV4(ctx context.Context, c ChangeV4) (ChangeReceiptV4, error) {
	return s.store.ApplyChangeV4(ctx, c)
}

func (s *Service) ReconcileTicket(ctx context.Context, siteCode, ticketNo string) (TicketReconcile, error) {
	return s.store.ReconcileTicket(ctx, siteCode, ticketNo)
}

func (s *Service) ReconcileTickets(ctx context.Context, items []TicketRef) (BatchTicketReconcile, error) {
	return s.store.ReconcileTickets(ctx, items)
}

func (s *Service) LookupChange(ctx context.Context, siteCode, digest string) (ChangeLookup, error) {
	return s.store.LookupChange(ctx, siteCode, digest)
}

func (s *Service) SiteReceipts(ctx context.Context, actorID int64) ([]SiteReceipt, error) {
	return s.store.SiteReceipts(ctx, actorID)
}

func (s *Service) TicketReceipt(ctx context.Context, actorID int64, siteCode, ticketNo string) (TicketReceipt, error) {
	return s.store.TicketReceipt(ctx, actorID, siteCode, ticketNo)
}
