package weighbridge

import (
	"testing"
	"time"
)

func TestTaskBatchValidation(t *testing.T) {
	now := time.Now()
	item := TaskItem{TaskNo: "T1", Version: 1, Status: "awaiting_second", Plate: "A1", Direction: "inbound", MaterialCode: "M", MaterialName: "粮", PartyCode: "P", PartyName: "客户", FirstWeighedAt: now}
	batch := TaskBatch{SchemaVersion: 1, SiteCode: "A", Items: []TaskItem{item}}
	if err := batch.validate(); err != nil {
		t.Fatal(err)
	}
	batch.Items = append(batch.Items, item)
	if batch.validate() == nil {
		t.Fatal("duplicate tasks accepted")
	}
	batch.Items = []TaskItem{}
	if batch.validate() != nil {
		t.Fatal("empty heartbeat rejected")
	}
	item.Status = "completed"
	batch.Items = []TaskItem{item}
	if batch.validate() == nil {
		t.Fatal("missing ticket accepted")
	}
	item.Ticket = &TaskTicket{SiteCode: "A", TicketNo: "H1"}
	batch.Items = []TaskItem{item}
	if batch.validate() != nil {
		t.Fatal("valid completion rejected")
	}
}
