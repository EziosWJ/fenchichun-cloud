package grainoutbound

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	platformhttp "fenchichun.local/server/internal/platform/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	maxMobileReprints  = 2
	mobileScanTTL      = 5 * time.Minute
	mobileUnknownAfter = 30 * time.Second

	printPending   = "pending"
	printClaimed   = "claimed"
	printPrinting  = "printing"
	printPrinted   = "printed"
	printFailed    = "failed"
	printUnknown   = "unknown"
	printCancelled = "cancelled"
	printExpired   = "expired"
)

type cloudPrintScan struct {
	ID         int64      `gorm:"column:id"`
	TokenHash  string     `gorm:"column:token_hash"`
	SiteCode   string     `gorm:"column:site_code"`
	TicketNo   string     `gorm:"column:ticket_no"`
	WeighingID int64      `gorm:"column:weighing_id"`
	UserID     int64      `gorm:"column:user_id"`
	DriverName string     `gorm:"column:driver_name"`
	Reason     string     `gorm:"column:reason"`
	ExpiresAt  time.Time  `gorm:"column:expires_at"`
	UsedAt     *time.Time `gorm:"column:used_at"`
	CreatedAt  time.Time  `gorm:"column:created_at"`
}

func (cloudPrintScan) TableName() string { return "wb_cloud_print_scan" }

type cloudPrintCommand struct {
	ID               int64      `gorm:"column:id"`
	RequestID        string     `gorm:"column:request_id"`
	SiteCode         string     `gorm:"column:site_code"`
	TicketNo         string     `gorm:"column:ticket_no"`
	WeighingID       int64      `gorm:"column:weighing_id"`
	UserID           int64      `gorm:"column:user_id"`
	DriverName       string     `gorm:"column:driver_name"`
	Origin           string     `gorm:"column:origin"`
	Action           string     `gorm:"column:action"`
	Reason           string     `gorm:"column:reason"`
	ScanVerified     bool       `gorm:"column:scan_verified"`
	ScanTokenHash    string     `gorm:"column:scan_token_hash"`
	RetryAsReprint   bool       `gorm:"column:retry_as_reprint"`
	Status           string     `gorm:"column:status"`
	FactoryAttemptID *int64     `gorm:"column:factory_attempt_id"`
	FactoryIntent    string     `gorm:"column:factory_intent"`
	VerifyResult     string     `gorm:"column:verify_result"`
	Message          string     `gorm:"column:message"`
	CreatedAt        time.Time  `gorm:"column:created_at"`
	UpdatedAt        time.Time  `gorm:"column:updated_at"`
	ClaimedAt        *time.Time `gorm:"column:claimed_at"`
	FinishedAt       *time.Time `gorm:"column:finished_at"`
}

func (cloudPrintCommand) TableName() string { return "wb_cloud_print_command" }

type cloudPrintAttempt struct {
	ID               int64      `gorm:"column:id"`
	SiteCode         string     `gorm:"column:site_code"`
	TicketNo         string     `gorm:"column:ticket_no"`
	FactoryAttemptID int64      `gorm:"column:factory_attempt_id"`
	AttemptNo        int64      `gorm:"column:attempt_no"`
	Intent           string     `gorm:"column:intent"`
	Status           string     `gorm:"column:status"`
	Source           string     `gorm:"column:source"`
	ActorName        string     `gorm:"column:actor_name"`
	Reason           string     `gorm:"column:reason"`
	ScanVerified     bool       `gorm:"column:scan_verified"`
	CloudRequestID   string     `gorm:"column:cloud_request_id"`
	InitiatedAt      time.Time  `gorm:"column:initiated_at"`
	ResolvedAt       *time.Time `gorm:"column:resolved_at"`
	ResolutionSource string     `gorm:"column:resolution_source"`
	CloseReason      string     `gorm:"column:close_reason"`
	UpdatedAt        time.Time  `gorm:"column:updated_at"`
}

func (cloudPrintAttempt) TableName() string { return "wb_cloud_print_attempt" }

type PrintAttemptView struct {
	ID               int64      `json:"id"`
	AttemptNo        int64      `json:"attemptNo"`
	Intent           string     `json:"intent"`
	Status           string     `json:"status"`
	Source           string     `json:"source"`
	ActorName        string     `json:"actorName"`
	Reason           string     `json:"reason"`
	ScanVerified     bool       `json:"scanVerified"`
	InitiatedAt      time.Time  `json:"initiatedAt"`
	ResolvedAt       *time.Time `json:"resolvedAt"`
	ResolutionSource string     `json:"resolutionSource"`
	CloseReason      string     `json:"closeReason"`
}

type PrintCommandView struct {
	ID               int64      `json:"id"`
	Status           string     `json:"status"`
	Origin           string     `json:"origin"`
	Action           string     `json:"action"`
	Reason           string     `json:"reason"`
	ScanVerified     bool       `json:"scanVerified"`
	FactoryAttemptID *int64     `json:"factoryAttemptId,omitempty"`
	FactoryIntent    string     `json:"factoryIntent,omitempty"`
	Message          string     `json:"message"`
	CreatedAt        time.Time  `json:"createdAt"`
	UpdatedAt        time.Time  `json:"updatedAt"`
	FinishedAt       *time.Time `json:"finishedAt,omitempty"`
}

type PrintScanView struct {
	ID        int64     `json:"id"`
	ExpiresAt time.Time `json:"expiresAt"`
}

type PrintStatusView struct {
	TicketNo       string             `json:"ticketNo"`
	SiteCode       string             `json:"siteCode"`
	Plate          string             `json:"plate"`
	NetMilliTonne  int64              `json:"netMilliTonne"`
	PrintStatus    string             `json:"printStatus"`
	ReprintCount   int                `json:"reprintCount"`
	MaxReprints    int                `json:"maxReprints"`
	CanPrint       bool               `json:"canPrint"`
	ScanRequired   bool               `json:"scanRequired"`
	RetryAsReprint bool               `json:"retryAsReprint"`
	NeedsVerify    bool               `json:"needsVerify"`
	LastAttempt    *PrintAttemptView  `json:"lastAttempt,omitempty"`
	Attempts       []PrintAttemptView `json:"attempts"`
	ActiveCommand  *PrintCommandView  `json:"activeCommand,omitempty"`
	PendingScan    *PrintScanView     `json:"pendingScan,omitempty"`
}

type PrintScanInput struct {
	Reason string `json:"reason"`
}

type PrintVerifyInput struct {
	Result string `json:"result"`
}

type PrintClaimInput struct {
	SiteCode string `json:"siteCode"`
}

type PrintScanClaimInput struct {
	SiteCode string `json:"siteCode"`
	Token    string `json:"token"`
}

type PrintResultInput struct {
	SiteCode       string `json:"siteCode"`
	Status         string `json:"status"`
	FactoryAttempt int64  `json:"factoryAttemptId"`
	FactoryIntent  string `json:"factoryIntent"`
	Message        string `json:"message"`
}

type PrintAttemptSyncInput struct {
	SiteCode         string     `json:"siteCode"`
	FactoryAttemptID int64      `json:"factoryAttemptId"`
	TicketNo         string     `json:"ticketNo"`
	AttemptNo        int64      `json:"attemptNo"`
	Intent           string     `json:"intent"`
	Status           string     `json:"status"`
	Source           string     `json:"source"`
	ActorName        string     `json:"actorName"`
	Reason           string     `json:"reason"`
	ScanVerified     bool       `json:"scanVerified"`
	CloudRequestID   string     `json:"cloudRequestId"`
	InitiatedAt      time.Time  `json:"initiatedAt"`
	ResolvedAt       *time.Time `json:"resolvedAt"`
	ResolutionSource string     `json:"resolutionSource"`
	CloseReason      string     `json:"closeReason"`
}

type MobilePrintCommandView struct {
	ID             int64     `json:"id"`
	RequestID      string    `json:"requestId"`
	SiteCode       string    `json:"siteCode"`
	TicketNo       string    `json:"ticketNo"`
	WeighingID     int64     `json:"weighingId"`
	DriverName     string    `json:"driverName"`
	Origin         string    `json:"origin"`
	Action         string    `json:"action"`
	Reason         string    `json:"reason"`
	ScanVerified   bool      `json:"scanVerified"`
	ScanTokenHash  string    `json:"scanTokenHash"`
	RetryAsReprint bool      `json:"retryAsReprint"`
	VerifyResult   string    `json:"verifyResult"`
	Status         string    `json:"status"`
	Message        string    `json:"message"`
	CreatedAt      time.Time `json:"createdAt"`
}

func newPrintRequestID() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func (r *Repository) latestPrintCommand(ctx context.Context, siteCode, ticketNo string) (*cloudPrintCommand, error) {
	var row cloudPrintCommand
	result := r.db.WithContext(ctx).Where("site_code = ? AND ticket_no = ?", siteCode, ticketNo).
		Order("id DESC").Limit(1).Find(&row)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, nil
	}
	return &row, nil
}

func (r *Repository) activePrintCommand(ctx context.Context, siteCode, ticketNo string) (*cloudPrintCommand, error) {
	var row cloudPrintCommand
	result := r.db.WithContext(ctx).Where("site_code = ? AND ticket_no = ? AND status IN ?", siteCode, ticketNo, []string{printPending, printClaimed, printPrinting}).
		Order("id DESC").Limit(1).Find(&row)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, nil
	}
	return &row, nil
}

func (r *Repository) printAttempts(ctx context.Context, siteCode, ticketNo string) ([]cloudPrintAttempt, error) {
	rows := []cloudPrintAttempt{}
	err := r.db.WithContext(ctx).Where("site_code = ? AND ticket_no = ?", siteCode, ticketNo).
		Order("attempt_no DESC").Limit(20).Find(&rows).Error
	return rows, err
}

func (r *Repository) pendingPrintScan(ctx context.Context, weighingID, userID int64) (*cloudPrintScan, error) {
	now := time.Now()
	var row cloudPrintScan
	result := r.db.WithContext(ctx).Where("weighing_id = ? AND user_id = ? AND used_at IS NULL AND expires_at > ?", weighingID, userID, now).
		Order("id DESC").Limit(1).Find(&row)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, nil
	}
	return &row, nil
}

func printAttemptView(row cloudPrintAttempt) PrintAttemptView {
	return PrintAttemptView{
		ID: row.ID, AttemptNo: row.AttemptNo, Intent: row.Intent, Status: row.Status,
		Source: row.Source, ActorName: row.ActorName, Reason: row.Reason,
		ScanVerified: row.ScanVerified, InitiatedAt: row.InitiatedAt, ResolvedAt: row.ResolvedAt,
		ResolutionSource: row.ResolutionSource, CloseReason: row.CloseReason,
	}
}

func printCommandView(row cloudPrintCommand) PrintCommandView {
	return PrintCommandView{
		ID: row.ID, Status: row.Status, Origin: row.Origin, Action: row.Action,
		Reason: row.Reason, ScanVerified: row.ScanVerified, FactoryAttemptID: row.FactoryAttemptID,
		FactoryIntent: row.FactoryIntent, Message: row.Message, CreatedAt: row.CreatedAt,
		UpdatedAt: row.UpdatedAt, FinishedAt: row.FinishedAt,
	}
}

func mobilePrintCommandView(row cloudPrintCommand) MobilePrintCommandView {
	return MobilePrintCommandView{
		ID: row.ID, RequestID: row.RequestID, SiteCode: row.SiteCode, TicketNo: row.TicketNo,
		WeighingID: row.WeighingID, DriverName: row.DriverName, Origin: row.Origin, Action: row.Action,
		Reason: row.Reason, ScanVerified: row.ScanVerified, ScanTokenHash: row.ScanTokenHash,
		RetryAsReprint: row.RetryAsReprint,
		VerifyResult:   row.VerifyResult, Status: row.Status, Message: row.Message, CreatedAt: row.CreatedAt,
	}
}

func (h *Handler) printRecord(c *gin.Context) (*Weighing, Account, bool) {
	account, ok := h.account(c)
	if !ok {
		return nil, Account{}, false
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id < 1 {
		platformhttp.WriteError(c, http.StatusBadRequest, platformhttp.CodeBadRequest, "单据参数错误", nil)
		return nil, Account{}, false
	}
	row, err := h.repo.WeighingByID(c.Request.Context(), account.UserID, id)
	if err != nil {
		platformhttp.WriteError(c, http.StatusInternalServerError, platformhttp.CodeInternalError, "读取过磅记录失败", nil)
		return nil, Account{}, false
	}
	if row == nil {
		platformhttp.WriteError(c, http.StatusNotFound, http.StatusNotFound, "过磅记录不存在", nil)
		return nil, Account{}, false
	}
	if row.Status != statusCompleted || strings.TrimSpace(row.TicketNo) == "" {
		platformhttp.WriteError(c, http.StatusConflict, http.StatusConflict, "厂端尚未出单，暂不能打印", nil)
		return nil, Account{}, false
	}
	return row, account, true
}

func (h *Handler) expireStalePrintCommands(ctx context.Context, siteCode, ticketNo string) {
	cutoff := time.Now().Add(-mobileUnknownAfter)
	var stale []cloudPrintCommand
	if err := h.repo.db.WithContext(ctx).
		Where("site_code = ? AND ticket_no = ? AND status IN ? AND updated_at < ?", siteCode, ticketNo, []string{printPending, printClaimed, printPrinting}, cutoff).
		Order("id").Limit(10).Find(&stale).Error; err != nil {
		return
	}
	for _, command := range stale {
		now := time.Now()
		status, message := printUnknown, "打印结果未回执，请核实"
		if command.FactoryAttemptID == nil || *command.FactoryAttemptID <= 0 {
			// No factory attempt means no sheet could have been produced: this is
			// a plain failure, so the driver may retry with a scanned reprint.
			status, message = printFailed, "厂端未接收打印任务，请重新补打"
		}
		_ = h.repo.db.WithContext(ctx).Model(&cloudPrintCommand{}).Where("id = ? AND status IN ?", command.ID, []string{printPending, printClaimed, printPrinting}).Updates(map[string]any{
			"status": status, "message": message, "updated_at": now, "finished_at": now,
		}).Error
		if command.FactoryAttemptID != nil && *command.FactoryAttemptID > 0 {
			_ = h.repo.db.WithContext(ctx).Model(&cloudPrintAttempt{}).
				Where("site_code = ? AND factory_attempt_id = ? AND status = ?", siteCode, *command.FactoryAttemptID, "initiated").
				Updates(map[string]any{"status": printUnknown, "updated_at": now}).Error
		}
	}
}

// printStatus returns the cloud mirror plus the factory-backed print policy.
func (h *Handler) printStatus(c *gin.Context) {
	row, account, ok := h.printRecord(c)
	if !ok {
		return
	}
	ctx := c.Request.Context()
	h.expireStalePrintCommands(ctx, row.SiteCode, row.TicketNo)
	command, err := h.repo.latestPrintCommand(ctx, row.SiteCode, row.TicketNo)
	if err != nil {
		platformhttp.WriteError(c, http.StatusInternalServerError, platformhttp.CodeInternalError, "读取打印状态失败", nil)
		return
	}
	active, err := h.repo.activePrintCommand(ctx, row.SiteCode, row.TicketNo)
	if err != nil {
		platformhttp.WriteError(c, http.StatusInternalServerError, platformhttp.CodeInternalError, "读取打印状态失败", nil)
		return
	}
	attempts, err := h.repo.printAttempts(ctx, row.SiteCode, row.TicketNo)
	if err != nil {
		platformhttp.WriteError(c, http.StatusInternalServerError, platformhttp.CodeInternalError, "读取打印记录失败", nil)
		return
	}
	pendingScan, err := h.repo.pendingPrintScan(ctx, row.ID, account.UserID)
	if err != nil {
		platformhttp.WriteError(c, http.StatusInternalServerError, platformhttp.CodeInternalError, "读取补打二维码失败", nil)
		return
	}
	contextValue := c.Query("context")
	if contextValue != "history" && contextValue != "completion" {
		contextValue = "completion"
	}
	view := buildPrintStatus(row, contextValue, command, active, attempts, pendingScan)
	platformhttp.OK(c, view)
}

func buildPrintStatus(row *Weighing, contextValue string, command, active *cloudPrintCommand, attempts []cloudPrintAttempt, pendingScan *cloudPrintScan) PrintStatusView {
	view := PrintStatusView{
		TicketNo: row.TicketNo, SiteCode: row.SiteCode, Plate: row.Plate,
		NetMilliTonne: row.NetMilliTonne, MaxReprints: maxMobileReprints,
		Attempts: []PrintAttemptView{}, PrintStatus: "unprinted",
	}
	reprintCount := 0
	for _, attempt := range attempts {
		view.Attempts = append(view.Attempts, printAttemptView(attempt))
		if attempt.Intent == "reprint" {
			reprintCount++
		}
	}
	view.ReprintCount = reprintCount
	if len(attempts) > 0 {
		last := attempts[0]
		attemptView := printAttemptView(last)
		view.LastAttempt = &attemptView
		view.PrintStatus = last.Status
	}
	if pendingScan != nil {
		view.PendingScan = &PrintScanView{ID: pendingScan.ID, ExpiresAt: pendingScan.ExpiresAt}
	}
	if active != nil {
		activeView := printCommandView(*active)
		view.ActiveCommand = &activeView
		view.PrintStatus = "printing"
		view.CanPrint = false
		return view
	}
	if command != nil && command.Origin == "verify" && (command.Status == printPrinted || command.Status == printFailed) {
		attemptNewer := len(attempts) > 0 && attempts[0].UpdatedAt.After(command.UpdatedAt)
		if !attemptNewer {
			view.PrintStatus = command.Status
			view.NeedsVerify = false
			if command.Status == printFailed && reprintCount < maxMobileReprints {
				view.CanPrint = true
				view.ScanRequired = true
			}
			return view
		}
	}
	if command != nil && (command.Status == printPrinted || command.Status == printFailed || command.Status == printUnknown) {
		// The attempt mirror normally carries these; the command covers the gap
		// before the first attempt snapshot arrives.
		if len(attempts) == 0 {
			view.PrintStatus = command.Status
			if command.Status == printUnknown {
				view.NeedsVerify = true
				return view
			}
			if command.Status == printFailed {
				// A failed first print is retried like a reprint: scan and reason.
				view.CanPrint = true
				view.ScanRequired = true
				view.RetryAsReprint = true
			}
			return view
		}
	}
	if view.PrintStatus == printUnknown {
		view.NeedsVerify = true
		return view
	}
	if reprintCount >= maxMobileReprints && view.LastAttempt != nil && view.LastAttempt.Status != printPrinted {
		return view
	}
	if view.LastAttempt == nil {
		view.CanPrint = true
		view.ScanRequired = contextValue == "history"
		return view
	}
	if view.LastAttempt.Status == printPrinted || view.LastAttempt.Status == printFailed {
		if reprintCount < maxMobileReprints {
			view.CanPrint = true
			view.ScanRequired = true
		}
	}
	return view
}

func (h *Handler) startInitialPrint(c *gin.Context) {
	row, account, ok := h.printRecord(c)
	if !ok {
		return
	}
	ctx := c.Request.Context()
	h.expireStalePrintCommands(ctx, row.SiteCode, row.TicketNo)
	active, err := h.repo.activePrintCommand(ctx, row.SiteCode, row.TicketNo)
	if err != nil {
		platformhttp.WriteError(c, http.StatusInternalServerError, platformhttp.CodeInternalError, "读取打印状态失败", nil)
		return
	}
	if active != nil {
		platformhttp.WriteError(c, http.StatusConflict, http.StatusConflict, "打印任务正在处理中", nil)
		return
	}
	attempts, err := h.repo.printAttempts(ctx, row.SiteCode, row.TicketNo)
	if err != nil {
		platformhttp.WriteError(c, http.StatusInternalServerError, http.StatusInternalServerError, "读取打印记录失败", nil)
		return
	}
	if len(attempts) > 0 {
		platformhttp.WriteError(c, http.StatusConflict, http.StatusConflict, "已有打印记录，请从历史记录扫码补打", nil)
		return
	}
	var priorCommands int64
	if err := h.repo.db.WithContext(ctx).Model(&cloudPrintCommand{}).
		Where("site_code = ? AND ticket_no = ?", row.SiteCode, row.TicketNo).
		Count(&priorCommands).Error; err != nil {
		platformhttp.WriteError(c, http.StatusInternalServerError, platformhttp.CodeInternalError, "读取打印状态失败", nil)
		return
	}
	if priorCommands > 0 {
		platformhttp.WriteError(c, http.StatusConflict, http.StatusConflict, "首次打印已发起过，请从打印记录扫码补打", nil)
		return
	}
	requestID, err := newPrintRequestID()
	if err != nil {
		platformhttp.WriteError(c, http.StatusInternalServerError, platformhttp.CodeInternalError, "创建打印请求失败", nil)
		return
	}
	command := cloudPrintCommand{
		RequestID: requestID, SiteCode: row.SiteCode, TicketNo: row.TicketNo,
		WeighingID: row.ID, UserID: account.UserID, DriverName: account.PartyName,
		Origin: "completion", Action: "print", Status: printPending,
	}
	if err := h.repo.db.WithContext(ctx).Create(&command).Error; err != nil {
		platformhttp.WriteError(c, http.StatusInternalServerError, platformhttp.CodeInternalError, "创建打印请求失败", nil)
		return
	}
	platformhttp.OK(c, printCommandView(command))
}

func (h *Handler) startPrintScan(c *gin.Context) {
	row, account, ok := h.printRecord(c)
	if !ok {
		return
	}
	var in PrintScanInput
	if c.ShouldBindJSON(&in) != nil || !validPrintReason(in.Reason) {
		platformhttp.WriteError(c, http.StatusBadRequest, platformhttp.CodeBadRequest, "请填写补打原因", nil)
		return
	}
	ctx := c.Request.Context()
	h.expireStalePrintCommands(ctx, row.SiteCode, row.TicketNo)
	active, err := h.repo.activePrintCommand(ctx, row.SiteCode, row.TicketNo)
	if err != nil {
		platformhttp.WriteError(c, http.StatusInternalServerError, platformhttp.CodeInternalError, "读取打印状态失败", nil)
		return
	}
	if active != nil {
		platformhttp.WriteError(c, http.StatusConflict, http.StatusConflict, "打印任务正在处理中", nil)
		return
	}
	attempts, err := h.repo.printAttempts(ctx, row.SiteCode, row.TicketNo)
	if err != nil {
		platformhttp.WriteError(c, http.StatusInternalServerError, platformhttp.CodeInternalError, "读取打印记录失败", nil)
		return
	}
	reprintCount := 0
	for _, attempt := range attempts {
		if attempt.Intent == "reprint" {
			reprintCount++
		}
	}
	if latest, lookupErr := h.repo.latestPrintCommand(ctx, row.SiteCode, row.TicketNo); lookupErr == nil && latest != nil && latest.Status == printUnknown {
		platformhttp.WriteError(c, http.StatusConflict, http.StatusConflict, "上次打印结果未知，请先核实", nil)
		return
	}
	if len(attempts) > 0 {
		if attempts[0].Status == printUnknown {
			platformhttp.WriteError(c, http.StatusConflict, http.StatusConflict, "上次打印结果未知，请先核实", nil)
			return
		}
		if reprintCount >= maxMobileReprints {
			platformhttp.WriteError(c, http.StatusConflict, http.StatusConflict, "补打次数已达上限，最多补打2次", nil)
			return
		}
	}
	token, tokenHash, err := newHandoffToken()
	if err != nil {
		platformhttp.WriteError(c, http.StatusInternalServerError, platformhttp.CodeInternalError, "生成补打二维码失败", nil)
		return
	}
	now := time.Now()
	scan := cloudPrintScan{
		TokenHash: tokenHash, SiteCode: row.SiteCode, TicketNo: row.TicketNo,
		WeighingID: row.ID, UserID: account.UserID, DriverName: account.PartyName,
		Reason: strings.TrimSpace(in.Reason), ExpiresAt: now.Add(mobileScanTTL), CreatedAt: now,
	}
	err = h.repo.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec("UPDATE wb_cloud_print_scan SET used_at = ? WHERE weighing_id = ? AND user_id = ? AND used_at IS NULL", now, row.ID, account.UserID).Error; err != nil {
			return err
		}
		return tx.Create(&scan).Error
	})
	if err != nil {
		platformhttp.WriteError(c, http.StatusInternalServerError, platformhttp.CodeInternalError, "生成补打二维码失败", nil)
		return
	}
	platformhttp.OK(c, gin.H{
		"value":     "fc-print:" + token,
		"expiresAt": scan.ExpiresAt,
	})
}

func (h *Handler) verifyPrint(c *gin.Context) {
	row, account, ok := h.printRecord(c)
	if !ok {
		return
	}
	var in PrintVerifyInput
	if c.ShouldBindJSON(&in) != nil || (in.Result != "printed" && in.Result != "not_printed") {
		platformhttp.WriteError(c, http.StatusBadRequest, platformhttp.CodeBadRequest, "核实结果无效", nil)
		return
	}
	ctx := c.Request.Context()
	h.expireStalePrintCommands(ctx, row.SiteCode, row.TicketNo)
	attempts, err := h.repo.printAttempts(ctx, row.SiteCode, row.TicketNo)
	if err != nil {
		platformhttp.WriteError(c, http.StatusInternalServerError, platformhttp.CodeInternalError, "读取打印记录失败", nil)
		return
	}
	if len(attempts) == 0 || attempts[0].Status != printUnknown {
		platformhttp.WriteError(c, http.StatusConflict, http.StatusConflict, "当前没有待核实的打印记录", nil)
		return
	}
	active, err := h.repo.activePrintCommand(ctx, row.SiteCode, row.TicketNo)
	if err != nil || active != nil {
		platformhttp.WriteError(c, http.StatusConflict, http.StatusConflict, "打印任务正在处理中", nil)
		return
	}
	requestID, err := newPrintRequestID()
	if err != nil {
		platformhttp.WriteError(c, http.StatusInternalServerError, platformhttp.CodeInternalError, "创建核实请求失败", nil)
		return
	}
	command := cloudPrintCommand{
		RequestID: requestID, SiteCode: row.SiteCode, TicketNo: row.TicketNo,
		WeighingID: row.ID, UserID: account.UserID, Origin: "verify", Action: "verify",
		VerifyResult: in.Result, Status: printPending,
	}
	if err := h.repo.db.WithContext(ctx).Create(&command).Error; err != nil {
		platformhttp.WriteError(c, http.StatusInternalServerError, platformhttp.CodeInternalError, "创建核实请求失败", nil)
		return
	}
	platformhttp.OK(c, printCommandView(command))
}

func validPrintReason(value string) bool {
	value = strings.TrimSpace(value)
	return len(value) > 0 && len(value) <= 500
}

func (h *Handler) claimPrintCommands(c *gin.Context) {
	var in PrintClaimInput
	if c.ShouldBindJSON(&in) != nil || strings.TrimSpace(in.SiteCode) == "" {
		platformhttp.WriteError(c, http.StatusBadRequest, http.StatusBadRequest, "厂区参数错误", nil)
		return
	}
	siteCode := strings.TrimSpace(in.SiteCode)
	ctx := c.Request.Context()
	var commands []cloudPrintCommand
	err := h.repo.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var siteCount int64
		if err := tx.Table("wb_cloud_site").Where("code = ? AND enabled = TRUE", siteCode).Count(&siteCount).Error; err != nil {
			return err
		}
		if siteCount == 0 {
			return errors.New("site disabled")
		}
		now := time.Now()
		if err := tx.Raw(`SELECT * FROM wb_cloud_print_command
			WHERE site_code = ? AND (status = 'pending' OR (status = 'claimed' AND claimed_at < ?))
			ORDER BY id LIMIT 10 FOR UPDATE SKIP LOCKED`, siteCode, now.Add(-2*time.Minute)).Scan(&commands).Error; err != nil {
			return err
		}
		if len(commands) == 0 {
			return nil
		}
		ids := make([]int64, 0, len(commands))
		for _, command := range commands {
			ids = append(ids, command.ID)
		}
		return tx.Model(&cloudPrintCommand{}).Where("id IN ?", ids).Updates(map[string]any{"status": printClaimed, "claimed_at": now, "updated_at": now}).Error
	})
	if err != nil {
		platformhttp.WriteError(c, http.StatusConflict, http.StatusConflict, "厂区无效或打印命令不可领取", nil)
		return
	}
	out := make([]MobilePrintCommandView, 0, len(commands))
	for _, command := range commands {
		out = append(out, mobilePrintCommandView(command))
	}
	platformhttp.OK(c, out)
}

func (h *Handler) claimPrintScan(c *gin.Context) {
	var in PrintScanClaimInput
	if c.ShouldBindJSON(&in) != nil || strings.TrimSpace(in.SiteCode) == "" || strings.TrimSpace(in.Token) == "" {
		platformhttp.WriteError(c, http.StatusBadRequest, http.StatusBadRequest, "扫码参数错误", nil)
		return
	}
	siteCode := strings.TrimSpace(in.SiteCode)
	tokenHash := hashToken(strings.TrimSpace(in.Token))
	ctx := c.Request.Context()
	var command cloudPrintCommand
	err := h.repo.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var scan cloudPrintScan
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("token_hash = ?", tokenHash).Take(&scan).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrHandoff
			}
			return err
		}
		if scan.SiteCode != siteCode || scan.UsedAt != nil || scan.ExpiresAt.Before(time.Now()) {
			return ErrHandoff
		}
		var weighing Weighing
		if err := tx.Table("grain_outbound_weighing").Where("id = ?", scan.WeighingID).Take(&weighing).Error; err != nil {
			return err
		}
		if weighing.UserID != scan.UserID || weighing.Status != statusCompleted || weighing.TicketNo != scan.TicketNo {
			return ErrHandoff
		}
		now := time.Now()
		if err := tx.Model(&cloudPrintScan{}).Where("id = ?", scan.ID).Update("used_at", now).Error; err != nil {
			return err
		}
		var failedBefore int64
		if err := tx.Model(&cloudPrintCommand{}).
			Where("site_code = ? AND ticket_no = ? AND status = ?", scan.SiteCode, scan.TicketNo, printFailed).
			Count(&failedBefore).Error; err != nil {
			return err
		}
		requestID, err := newPrintRequestID()
		if err != nil {
			return err
		}
		command = cloudPrintCommand{
			RequestID: requestID, SiteCode: scan.SiteCode, TicketNo: scan.TicketNo,
			WeighingID: scan.WeighingID, UserID: scan.UserID, DriverName: scan.DriverName,
			Origin: "history", Action: "print", Reason: scan.Reason, ScanVerified: true,
			ScanTokenHash: scan.TokenHash, RetryAsReprint: failedBefore > 0,
			Status: printClaimed, ClaimedAt: &now,
		}
		return tx.Create(&command).Error
	})
	if err != nil {
		platformhttp.WriteError(c, http.StatusConflict, http.StatusConflict, "补打二维码已失效，请重新生成", nil)
		return
	}
	platformhttp.OK(c, mobilePrintCommandView(command))
}

func (h *Handler) printCommandResult(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id < 1 {
		platformhttp.WriteError(c, http.StatusBadRequest, http.StatusBadRequest, "打印命令参数错误", nil)
		return
	}
	var in PrintResultInput
	if c.ShouldBindJSON(&in) != nil || strings.TrimSpace(in.SiteCode) == "" {
		platformhttp.WriteError(c, http.StatusBadRequest, http.StatusBadRequest, "打印结果参数错误", nil)
		return
	}
	switch in.Status {
	case printPrinting, printPrinted, printFailed, printUnknown, printCancelled:
	default:
		platformhttp.WriteError(c, http.StatusBadRequest, http.StatusBadRequest, "打印结果状态无效", nil)
		return
	}
	now := time.Now()
	values := map[string]any{
		"status": in.Status, "message": strings.TrimSpace(in.Message),
		"factory_attempt_id": nullInt64(in.FactoryAttempt),
		"factory_intent":     strings.TrimSpace(in.FactoryIntent),
		"updated_at":         now,
	}
	if in.Status != printPrinting {
		values["finished_at"] = now
	}
	result := h.repo.db.WithContext(c.Request.Context()).Model(&cloudPrintCommand{}).
		Where("id = ? AND site_code = ?", id, strings.TrimSpace(in.SiteCode)).Updates(values)
	if result.Error != nil {
		platformhttp.WriteError(c, http.StatusInternalServerError, http.StatusInternalServerError, "保存打印结果失败", nil)
		return
	}
	if result.RowsAffected == 0 {
		platformhttp.WriteError(c, http.StatusNotFound, http.StatusNotFound, "打印命令不存在", nil)
		return
	}
	platformhttp.OK(c, nil)
}

func (h *Handler) syncPrintAttempt(c *gin.Context) {
	var in PrintAttemptSyncInput
	if c.ShouldBindJSON(&in) != nil || strings.TrimSpace(in.SiteCode) == "" || strings.TrimSpace(in.TicketNo) == "" || in.FactoryAttemptID <= 0 {
		platformhttp.WriteError(c, http.StatusBadRequest, http.StatusBadRequest, "打印记录参数错误", nil)
		return
	}
	now := time.Now()
	row := cloudPrintAttempt{
		SiteCode: strings.TrimSpace(in.SiteCode), TicketNo: strings.TrimSpace(in.TicketNo),
		FactoryAttemptID: in.FactoryAttemptID, AttemptNo: in.AttemptNo, Intent: in.Intent,
		Status: in.Status, Source: in.Source, ActorName: in.ActorName, Reason: in.Reason,
		ScanVerified: in.ScanVerified, CloudRequestID: in.CloudRequestID, InitiatedAt: in.InitiatedAt,
		ResolvedAt: in.ResolvedAt, ResolutionSource: in.ResolutionSource, CloseReason: in.CloseReason,
		UpdatedAt: now,
	}
	err := h.repo.db.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "site_code"}, {Name: "factory_attempt_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"ticket_no", "attempt_no", "intent", "status", "source", "actor_name", "reason", "scan_verified", "cloud_request_id", "initiated_at", "resolved_at", "resolution_source", "close_reason", "updated_at"}),
		}).Create(&row).Error; err != nil {
			return err
		}
		if strings.TrimSpace(in.CloudRequestID) == "" {
			return nil
		}
		status := printPrinting
		switch in.Status {
		case printPrinted, printFailed, printUnknown:
			status = in.Status
		}
		values := map[string]any{
			"status": status, "factory_attempt_id": in.FactoryAttemptID,
			"factory_intent": in.Intent, "updated_at": now,
		}
		if status != printPrinting {
			values["finished_at"] = now
		}
		return tx.Model(&cloudPrintCommand{}).Where("request_id = ?", in.CloudRequestID).Updates(values).Error
	})
	if err != nil {
		platformhttp.WriteError(c, http.StatusInternalServerError, http.StatusInternalServerError, "保存打印记录失败", nil)
		return
	}
	platformhttp.OK(c, nil)
}

func nullInt64(value int64) any {
	if value <= 0 {
		return nil
	}
	return value
}
