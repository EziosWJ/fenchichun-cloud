package weighbridge

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type cloudTicketChange struct {
	ID             int64
	IssuedSiteCode string
	TicketNo       string
	ChangeType     string
	Digest         string
	DigestVersion  int
	SchemaVersion  int
	TicketID       int64
	ReceivedAt     time.Time
}

func (cloudTicketChange) TableName() string { return "wb_cloud_ticket_change" }

// ApplyChangeV4 stores one digest-protocol change together with its ticket
// result in a single transaction. The digest is taken from the request and is
// never recomputed.
func (r *Repository) ApplyChangeV4(ctx context.Context, c ChangeV4) (ChangeReceiptV4, error) {
	net, err := c.Validate()
	if err != nil {
		return ChangeReceiptV4{}, newSyncError(SyncCategoryConfigOrData, "invalid_request", "变化报文不符合新协议")
	}
	receivedAt := time.Now().UTC()
	receipt := ChangeReceiptV4{Digest: c.Digest, TicketNo: c.TicketNo, ChangeType: c.Type, ReceivedAt: receivedAt}
	err = r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var s site
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("code = ? AND enabled = ?", c.SiteCode, true).Take(&s).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return newSyncError(SyncCategoryConfigOrData, "site_not_found_or_disabled", "厂区编码不存在或已停用，请联系管理员")
			}
			return err
		}

		var existing cloudTicketChange
		err := tx.Where("digest = ?", c.Digest).Take(&existing).Error
		if err == nil {
			if existing.IssuedSiteCode != c.SiteCode || existing.TicketNo != c.TicketNo || existing.ChangeType != c.Type {
				return newSyncError(SyncCategoryConflict, "digest_reused", "变化摘要已被其他变化使用")
			}
			receipt = ChangeReceiptV4{Digest: existing.Digest, TicketNo: existing.TicketNo, ChangeType: existing.ChangeType, ReceivedAt: existing.ReceivedAt, Duplicate: true}
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		var samePosition cloudTicketChange
		err = tx.Where("issued_site_code = ? AND ticket_no = ? AND change_type = ?", c.SiteCode, c.TicketNo, c.Type).Take(&samePosition).Error
		if err == nil {
			return newSyncError(SyncCategoryConflict, "change_conflict", "同一单据的同类变化已有其他摘要，不能覆盖")
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}

		var ticketID int64
		switch c.Type {
		case "issue":
			if err := ensureTicketAbsent(tx, c.SiteCode, c.TicketNo); err != nil {
				return err
			}
			ticket, err := createTicketV4(tx, &s, c, net, receivedAt)
			if err != nil {
				return err
			}
			ticketID = ticket.ID
		case "void":
			ticket, err := lockTicketV4(tx, c.SiteCode, c.TicketNo, "ticket_missing", "前序出单尚未在云端创建，等待前序变化")
			if err != nil {
				return err
			}
			if ticket.Status != "valid" {
				return newSyncError(SyncCategoryConflict, "ticket_not_valid", "单据已作废，不能重复作废")
			}
			if err := tx.Model(&cloudTicket{}).Where("id = ?", ticket.ID).Updates(map[string]any{
				"status":             "void",
				"void_reason":        c.Void.Reason,
				"voided_by":          c.Void.Actor,
				"voided_at":          c.Void.At,
				"latest_digest":      c.Digest,
				"latest_change_type": c.Type,
				"latest_received_at": receivedAt,
			}).Error; err != nil {
				return err
			}
			ticketID = ticket.ID
		case "reopen":
			if err := ensureTicketAbsent(tx, c.SiteCode, c.TicketNo); err != nil {
				return err
			}
			var known int64
			if err := tx.Table("wb_cloud_site_code").Where("code = ?", c.PreviousSiteCode).Count(&known).Error; err != nil {
				return err
			}
			if known == 0 {
				return newSyncError(SyncCategoryConfigOrData, "previous_site_not_found", "原单厂区编码不存在，请联系管理员")
			}
			original, err := lockTicketV4(tx, c.PreviousSiteCode, *c.Ticket.PreviousTicketNo, "original_missing", "原单尚未在云端创建，等待出单确认")
			if err != nil {
				return err
			}
			if original.Status != "void" {
				return newSyncError(SyncCategoryPredecessorPending, "original_not_void", "原单尚未确认作废，等待作废确认")
			}
			var reopened int64
			if err := tx.Model(&cloudTicket{}).Where("previous_site_code = ? AND previous_ticket_no = ?", c.PreviousSiteCode, *c.Ticket.PreviousTicketNo).Count(&reopened).Error; err != nil {
				return err
			}
			if reopened != 0 {
				return newSyncError(SyncCategoryConflict, "original_already_reopened", "原单已重开，不能重复重开")
			}
			ticket, err := createTicketV4(tx, &s, c, net, receivedAt)
			if err != nil {
				return err
			}
			ticketID = ticket.ID
		default:
			return newSyncError(SyncCategoryConfigOrData, "invalid_request", "未知变化类型")
		}

		change := cloudTicketChange{IssuedSiteCode: c.SiteCode, TicketNo: c.TicketNo, ChangeType: c.Type, Digest: c.Digest, DigestVersion: c.DigestVersion, SchemaVersion: c.SchemaVersion, TicketID: ticketID, ReceivedAt: receivedAt}
		if err := tx.Create(&change).Error; err != nil {
			if siteError(err) == ErrConflict {
				return newSyncError(SyncCategoryConflict, "concurrent_change", "同一变化已被并发处理，请重试确认")
			}
			return err
		}
		return nil
	})
	if err != nil {
		var syncErr *SyncError
		if errors.As(err, &syncErr) {
			return ChangeReceiptV4{}, syncErr
		}
		return ChangeReceiptV4{}, err
	}
	return receipt, nil
}

func ensureTicketAbsent(tx *gorm.DB, siteCode, ticketNo string) error {
	var count int64
	if err := tx.Model(&cloudTicket{}).Where("issued_site_code = ? AND ticket_no = ?", siteCode, ticketNo).Count(&count).Error; err != nil {
		return err
	}
	if count != 0 {
		return newSyncError(SyncCategoryConflict, "ticket_exists", "该单号已在云端存在，不能重复出单")
	}
	return nil
}

func lockTicketV4(tx *gorm.DB, siteCode, ticketNo, reason, message string) (cloudTicket, error) {
	var ticket cloudTicket
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("issued_site_code = ? AND ticket_no = ?", siteCode, ticketNo).Take(&ticket).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return cloudTicket{}, newSyncError(SyncCategoryPredecessorPending, reason, message)
		}
		return cloudTicket{}, err
	}
	return ticket, nil
}

func createTicketV4(tx *gorm.DB, s *site, c ChangeV4, net int64, receivedAt time.Time) (cloudTicket, error) {
	snapshot, err := json.Marshal(c.Ticket)
	if err != nil {
		return cloudTicket{}, err
	}
	var previousSiteCode *string
	if c.Type == "reopen" {
		previousSiteCode = &c.PreviousSiteCode
	}
	ticket := cloudTicket{
		SiteCode:           s.Code,
		IssuedSiteCode:     c.SiteCode,
		PreviousSiteCode:   previousSiteCode,
		TicketNo:           c.TicketNo,
		PreviousTicketNo:   c.Ticket.PreviousTicketNo,
		Status:             "valid",
		Direction:          c.Ticket.Direction,
		Plate:              c.Ticket.Plate,
		IssuedAt:           c.Ticket.IssuedAt,
		MaterialCode:       c.Ticket.MaterialCode,
		PartyCode:          c.Ticket.PartyCode,
		FinalNetMilliTonne: net,
		Snapshot:           string(snapshot),
		LatestDigest:       &c.Digest,
		LatestChangeType:   &c.Type,
		LatestReceivedAt:   &receivedAt,
	}
	if err := tx.Create(&ticket).Error; err != nil {
		if siteError(err) == ErrConflict {
			return cloudTicket{}, newSyncError(SyncCategoryConflict, "ticket_conflict", "单据或原单关联已被其他变化占用")
		}
		return cloudTicket{}, err
	}
	return ticket, nil
}

func requireKnownSiteCode(tx *gorm.DB, code string) error {
	var count int64
	if err := tx.Table("wb_cloud_site_code").Where("code = ?", code).Count(&count).Error; err != nil {
		return err
	}
	if count == 0 {
		return newSyncError(SyncCategoryConfigOrData, "site_not_found", "厂区编码不存在")
	}
	return nil
}

func loadConfirmations(tx *gorm.DB, ticketID int64) ([]ChangeConfirmation, error) {
	rows := []cloudTicketChange{}
	if err := tx.Where("ticket_id = ?", ticketID).Order("received_at, id").Find(&rows).Error; err != nil {
		return nil, err
	}
	result := make([]ChangeConfirmation, 0, len(rows))
	for _, row := range rows {
		result = append(result, ChangeConfirmation{Digest: row.Digest, TicketNo: row.TicketNo, ChangeType: row.ChangeType, DigestVersion: row.DigestVersion, SchemaVersion: row.SchemaVersion, ReceivedAt: row.ReceivedAt})
	}
	return result, nil
}

func ticketRef(ticket cloudTicket) *TicketRef {
	if ticket.TicketNo == "" {
		return nil
	}
	return &TicketRef{SiteCode: ticket.IssuedSiteCode, TicketNo: ticket.TicketNo}
}

// ReconcileTicket returns the cloud ticket, its latest digest and the received
// change history for one issuance site code and ticket number. Historical site
// codes are accepted for read-only reconciliation.
func (r *Repository) ReconcileTicket(ctx context.Context, siteCode, ticketNo string) (TicketReconcile, error) {
	if !identityCode.MatchString(siteCode) || ticketNo == "" || len(ticketNo) > 200 {
		return TicketReconcile{}, newSyncError(SyncCategoryConfigOrData, "invalid_request", "厂区编码或单号格式不正确")
	}
	result := TicketReconcile{SiteCode: siteCode, TicketNo: ticketNo, Changes: []ChangeConfirmation{}}
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := requireKnownSiteCode(tx, siteCode); err != nil {
			return err
		}
		var ticket cloudTicket
		if err := tx.Where("issued_site_code = ? AND ticket_no = ?", siteCode, ticketNo).Take(&ticket).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil
			}
			return err
		}
		result.Found = true
		result.Status = ticket.Status
		result.LatestDigest = ticket.LatestDigest
		result.LatestChangeType = ticket.LatestChangeType
		result.LatestReceivedAt = ticket.LatestReceivedAt
		result.PreviousSiteCode = ticket.PreviousSiteCode
		result.PreviousTicketNo = ticket.PreviousTicketNo
		var reopened cloudTicket
		if err := tx.Where("previous_site_code = ? AND previous_ticket_no = ?", siteCode, ticketNo).Take(&reopened).Error; err == nil {
			result.ReopenedBy = ticketRef(reopened)
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		changes, err := loadConfirmations(tx, ticket.ID)
		if err != nil {
			return err
		}
		result.Changes = changes
		if len(changes) > 0 {
			version := changes[len(changes)-1].DigestVersion
			result.LatestDigestVersion = &version
		}
		return nil
	}, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		return TicketReconcile{}, err
	}
	return result, nil
}

// LookupChange reports whether the cloud already stored one digest for an
// issuance site code. It is the read-only path for a lost confirmation after
// the site code changed.
func (r *Repository) LookupChange(ctx context.Context, siteCode, digest string) (ChangeLookup, error) {
	if !identityCode.MatchString(siteCode) || !digestPattern.MatchString(digest) {
		return ChangeLookup{}, newSyncError(SyncCategoryConfigOrData, "invalid_request", "厂区编码或摘要格式不正确")
	}
	result := ChangeLookup{SiteCode: siteCode, Digest: digest}
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := requireKnownSiteCode(tx, siteCode); err != nil {
			return err
		}
		var change cloudTicketChange
		if err := tx.Where("issued_site_code = ? AND digest = ?", siteCode, digest).Take(&change).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil
			}
			return err
		}
		result.Found = true
		result.Confirmation = &ChangeConfirmation{Digest: change.Digest, TicketNo: change.TicketNo, ChangeType: change.ChangeType, DigestVersion: change.DigestVersion, SchemaVersion: change.SchemaVersion, ReceivedAt: change.ReceivedAt}
		return nil
	}, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		return ChangeLookup{}, err
	}
	return result, nil
}

type siteReceiptCount struct {
	SiteCode        string
	ReceivedChanges int64
}

type siteLatestReceipt struct {
	SiteCode       string
	ReceivedAt     time.Time
	TicketNo       string
	ChangeType     string
	IssuedSiteCode string
}

// SiteReceipts summarises what the cloud has successfully received for each
// current site. It never reports factory backlog or online state.
func (r *Repository) SiteReceipts(ctx context.Context, actorID int64) ([]SiteReceipt, error) {
	result := []SiteReceipt{}
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := requireSyncAdmin(tx, actorID); err != nil {
			return err
		}
		sites := []site{}
		if err := tx.Order("code").Find(&sites).Error; err != nil {
			return err
		}
		counts := []siteReceiptCount{}
		if err := tx.Table("wb_cloud_ticket_change c").
			Select("t.site_code AS site_code, COUNT(*) AS received_changes").
			Joins("JOIN wb_cloud_ticket t ON t.id = c.ticket_id").
			Group("t.site_code").Scan(&counts).Error; err != nil {
			return err
		}
		latest := []siteLatestReceipt{}
		if err := tx.Raw(`SELECT DISTINCT ON (t.site_code) t.site_code, c.received_at, c.ticket_no, c.change_type, c.issued_site_code
			FROM wb_cloud_ticket_change c JOIN wb_cloud_ticket t ON t.id = c.ticket_id
			ORDER BY t.site_code, c.received_at DESC, c.id DESC`).Scan(&latest).Error; err != nil {
			return err
		}
		countBySite := make(map[string]int64, len(counts))
		for _, row := range counts {
			countBySite[row.SiteCode] = row.ReceivedChanges
		}
		latestBySite := make(map[string]siteLatestReceipt, len(latest))
		for _, row := range latest {
			latestBySite[row.SiteCode] = row
		}
		for _, s := range sites {
			item := SiteReceipt{SiteCode: s.Code, SiteName: s.Name, Enabled: s.Enabled, ReceivedChanges: countBySite[s.Code]}
			if row, ok := latestBySite[s.Code]; ok {
				receivedAt, ticketNo, changeType, issuedSiteCode := row.ReceivedAt, row.TicketNo, row.ChangeType, row.IssuedSiteCode
				item.LastReceivedAt = &receivedAt
				item.LastTicketNo = &ticketNo
				item.LastChangeType = &changeType
				item.LastIssuedSiteCode = &issuedSiteCode
			}
			result = append(result, item)
		}
		return nil
	}, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	return result, err
}

// TicketReceipt is the administrator view for one received ticket, including
// the cloud snapshot needed to inspect a difference.
func (r *Repository) TicketReceipt(ctx context.Context, actorID int64, siteCode, ticketNo string) (TicketReceipt, error) {
	if !identityCode.MatchString(siteCode) || ticketNo == "" || len(ticketNo) > 200 {
		return TicketReceipt{}, newSyncError(SyncCategoryConfigOrData, "invalid_request", "厂区编码或单号格式不正确")
	}
	result := TicketReceipt{SiteCode: siteCode, TicketNo: ticketNo, Changes: []ChangeConfirmation{}}
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := requireSyncAdmin(tx, actorID); err != nil {
			return err
		}
		if err := requireKnownSiteCode(tx, siteCode); err != nil {
			return err
		}
		var ticket cloudTicket
		if err := tx.Where("issued_site_code = ? AND ticket_no = ?", siteCode, ticketNo).Take(&ticket).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil
			}
			return err
		}
		result.Found = true
		result.Status = &ticket.Status
		var snapshot TicketSnapshot
		if err := json.Unmarshal([]byte(ticket.Snapshot), &snapshot); err != nil {
			return err
		}
		result.Ticket = &snapshot
		result.VoidReason = ticket.VoidReason
		result.VoidedBy = ticket.VoidedBy
		result.VoidedAt = ticket.VoidedAt
		result.LatestDigest = ticket.LatestDigest
		result.LatestChangeType = ticket.LatestChangeType
		result.LatestReceivedAt = ticket.LatestReceivedAt
		result.PreviousSiteCode = ticket.PreviousSiteCode
		result.PreviousTicketNo = ticket.PreviousTicketNo
		var reopened cloudTicket
		if err := tx.Where("previous_site_code = ? AND previous_ticket_no = ?", siteCode, ticketNo).Take(&reopened).Error; err == nil {
			result.ReopenedBy = ticketRef(reopened)
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		changes, err := loadConfirmations(tx, ticket.ID)
		if err != nil {
			return err
		}
		result.Changes = changes
		if len(changes) > 0 {
			version := changes[len(changes)-1].DigestVersion
			result.LatestDigestVersion = &version
		}
		return nil
	}, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		return TicketReceipt{}, err
	}
	return result, nil
}

func requireSyncAdmin(tx *gorm.DB, actorID int64) error {
	count, err := adminCount(tx, actorID)
	if err != nil {
		return err
	}
	if count != 1 {
		return ErrForbiddenSync
	}
	return nil
}
