package weighbridge

import (
	"context"
	"errors"
	"fenchichun.local/server/internal/config"
	"fenchichun.local/server/internal/platform/database"
	"os"
	"strings"
	"testing"
	"time"
)

func TestLocalPostgresTasksAndManualSupplement(t *testing.T) {
	if os.Getenv("WEIGHBRIDGE_LOCAL_DB_TEST") != "1" {
		t.Skip("local PostgreSQL test not requested")
	}
	cfg, e := config.LoadFromDir("../../configs")
	if e != nil {
		t.Fatal(e)
	}
	db, e := database.Open(context.Background(), cfg.Database)
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	tx := db.GORM.Begin()
	defer tx.Rollback()
	ctx := context.Background()
	repo := NewRepository(tx)
	siteCode := "TASK-TEST-ROLLBACK"
	if e = tx.Exec("INSERT INTO wb_cloud_site(code,name,enabled) VALUES (?, ?, true)", siteCode, "测试厂").Error; e != nil {
		t.Fatal(e)
	}
	if e = tx.Exec("INSERT INTO wb_cloud_site_code(code,site_code) VALUES (?,?)", siteCode, siteCode).Error; e != nil {
		t.Fatal(e)
	}
	var actor int64
	if e = tx.Raw("INSERT INTO sys_user(username,nickname,password) VALUES (?, ?, ?) RETURNING id", "task-test-rollback", "测试用户", "unused").Scan(&actor).Error; e != nil {
		t.Fatal(e)
	}
	if e = tx.Exec("INSERT INTO sys_user_role(user_id,role_id) SELECT ?,id FROM sys_role WHERE role_code='ADMIN'", actor).Error; e != nil {
		t.Fatal(e)
	}
	first := time.Date(2026, 11, 17, 8, 0, 0, 0, time.UTC)
	item := TaskItem{TaskNo: "TASK-1", Version: 1, Status: "awaiting_second", Plate: "晋A1", Direction: "inbound", MaterialCode: "M", MaterialName: "粮", PartyCode: "P", PartyName: "客户", FirstWeighedAt: first}
	batch := TaskBatch{SchemaVersion: 1, SiteCode: siteCode, Items: []TaskItem{item}}
	if _, e = repo.ReceiveTasks(ctx, batch); e != nil {
		t.Fatal(e)
	}
	if _, e = repo.ReceiveTasks(ctx, batch); e != nil {
		t.Fatal(e)
	}
	changed := item
	changed.Plate = "晋B1"
	batch.Items = []TaskItem{changed}
	if _, e = repo.ReceiveTasks(ctx, batch); !errors.Is(e, ErrConflict) {
		t.Fatalf("same version: %v", e)
	}
	item.Version = 2
	item.Status = "completed"
	item.Ticket = &TaskTicket{SiteCode: siteCode, TicketNo: "H1"}
	batch.Items = []TaskItem{item}
	if _, e = repo.ReceiveTasks(ctx, batch); e != nil {
		t.Fatal(e)
	}
	page, e := repo.TaskPage(ctx, actor, siteCode, "", "issued_pending_upload", 1, 10)
	if e != nil || page.Total != 1 {
		t.Fatalf("pending: %+v %v", page, e)
	}
	old := item
	old.Version = 1
	old.Status = "awaiting_second"
	old.Ticket = nil
	batch.Items = []TaskItem{old}
	receipt, e := repo.ReceiveTasks(ctx, batch)
	if e != nil || receipt.Items[0].Version != 2 {
		t.Fatalf("old retry: %+v %v", receipt, e)
	}
	c := v5ConsistentMulti(t)
	c.SchemaVersion = 6
	c.DigestVersion = 4
	c.SiteCode = siteCode
	c.TicketNo = "H1"
	c.Ticket.TicketNo = "H1"
	c.Ticket.EntryType = "manual_supplement"
	second := first.Add(time.Hour)
	c.Ticket.FirstWeighedAt = &first
	c.Ticket.SecondWeighedAt = &second
	c.Ticket.IssuedAt = second.Add(24 * time.Hour)
	c.Ticket.GrossSource = "manual"
	c.Ticket.TareSource = "manual"
	if _, e = repo.ApplyChangeV5(ctx, c); e != nil {
		t.Fatal(e)
	}
	if rec, e := repo.ApplyChangeV5(ctx, c); e != nil || !rec.Duplicate {
		t.Fatalf("replay: %+v %v", rec, e)
	}
	page, e = repo.TaskPage(ctx, actor, siteCode, "", "issued_pending_upload", 1, 10)
	if e != nil || page.Total != 0 {
		t.Fatalf("reconciled: %+v %v", page, e)
	}

	ahead := item
	ahead.TaskNo = "TASK-2"
	ahead.Version = 1
	batch.Items = []TaskItem{ahead}
	if _, e = repo.ReceiveTasks(ctx, batch); e != nil {
		t.Fatal(e)
	}
	page, e = repo.TaskPage(ctx, actor, siteCode, "", "issued_pending_upload", 1, 10)
	if e != nil || page.Total != 0 {
		t.Fatalf("ticket first: %+v %v", page, e)
	}
	ahead.Version = 2
	ahead.Status = "awaiting_second"
	ahead.Ticket = nil
	batch.Items = []TaskItem{ahead}
	if _, e = repo.ReceiveTasks(ctx, batch); !errors.Is(e, ErrConflict) {
		t.Fatalf("terminal transition: %v", e)
	}
	batch.Items = []TaskItem{}
	if _, e = repo.ReceiveTasks(ctx, batch); e != nil {
		t.Fatal(e)
	}
	statuses, e := repo.TaskStatus(ctx, actor)
	if e != nil {
		t.Fatal(e)
	}
	found := false
	for _, status := range statuses {
		if status.SiteCode == siteCode {
			found = true
			if status.LastSyncedAt == nil || status.AwaitingCount == nil || *status.AwaitingCount != 0 {
				t.Fatalf("freshness: %+v", status)
			}
		}
	}
	if !found {
		t.Fatal("site missing from freshness")
	}

	terminal := TaskItem{TaskNo: "TERM", Version: 1, Status: "terminated", Plate: "A", Direction: "inbound", MaterialCode: "M", MaterialName: "粮", PartyCode: "P", PartyName: "客户", FirstWeighedAt: first, Termination: &TaskTermination{At: second, Actor: "操作员", Reason: "取消"}}
	batch.Items = []TaskItem{terminal}
	if _, e = repo.ReceiveTasks(ctx, batch); e != nil {
		t.Fatal(e)
	}
	terminated, e := repo.TaskPage(ctx, actor, siteCode, "", "terminated", 1, 10)
	if e != nil || terminated.Total != 1 || terminated.Records[0].Termination.Reason != "取消" {
		t.Fatalf("terminated: %+v %v", terminated, e)
	}
	newItem := terminal
	newItem.TaskNo = "ROLLBACK"
	conflict := terminal
	conflict.Plate = "different"
	batch.Items = []TaskItem{newItem, conflict}
	if _, e = repo.ReceiveTasks(ctx, batch); !errors.Is(e, ErrConflict) {
		t.Fatalf("batch conflict: %v", e)
	}
	var count int64
	if e = tx.Table("wb_cloud_task").Where("site_code = ? AND task_no = ?", siteCode, "ROLLBACK").Count(&count).Error; e != nil || count != 0 {
		t.Fatalf("batch rollback: %d %v", count, e)
	}
	from := first.Add(-time.Hour)
	until := first.Add(12 * time.Hour)
	rows, e := repo.statementRows(ctx, StatementQuery{SiteCode: siteCode, Direction: c.Ticket.Direction, From: &from, Until: &until, Page: 1, PageSize: 10})
	if e != nil || len(rows) != 1 {
		t.Fatalf("business date rows %d: %v", len(rows), e)
	}

	detail, tickets, e := repo.StatementExport(ctx, StatementQuery{SiteCode: siteCode, PartyCode: c.Ticket.PartyCode, Direction: c.Ticket.Direction, From: &from, Until: &until, Page: 1, PageSize: 10})
	if e != nil || len(tickets) != 1 || !tickets[0].BusinessAt.Equal(second) || !tickets[0].IssuedAt.Equal(c.Ticket.IssuedAt) {
		t.Fatalf("statement export: %+v %v", tickets, e)
	}
	csv, e := statementDetailCSV(detail, tickets)
	if e != nil || !strings.Contains(string(csv), "2026-11-17") || !strings.Contains(string(csv), "2026-11-18") {
		t.Fatalf("cross-day CSV: %s %v", csv, e)
	}
}
