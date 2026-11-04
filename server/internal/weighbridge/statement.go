package weighbridge

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"
)

var statementZone = time.FixedZone("Asia/Shanghai", 8*60*60)

// StatementQuery selects issued, currently valid tickets for a counterparty
// statement. The cloud stores the full ticket snapshot as JSON text, so the
// service aggregates it in Go instead of requiring derived database columns.
type StatementQuery struct {
	Page         int
	PageSize     int
	SiteCode     string
	Direction    string
	PartyCode    string
	PartyKeyword string
	MaterialCode string
	From         *time.Time
	Until        *time.Time
}

type StatementTotals struct {
	TicketCount             int64 `json:"ticketCount"`
	GrossMilliTonne         int64 `json:"grossMilliTonne"`
	TareMilliTonne          int64 `json:"tareMilliTonne"`
	NetAdjustmentMilliTonne int64 `json:"netAdjustmentMilliTonne"`
	NetMilliTonne           int64 `json:"netMilliTonne"`
}

func (t *StatementTotals) add(gross, tare, adjustment, net int64) {
	t.TicketCount++
	t.GrossMilliTonne += gross
	t.TareMilliTonne += tare
	t.NetAdjustmentMilliTonne += adjustment
	t.NetMilliTonne += net
}

type StatementParty struct {
	SiteCode  string `json:"siteCode"`
	SiteName  string `json:"siteName"`
	PartyCode string `json:"partyCode"`
	PartyName string `json:"partyName"`
	StatementTotals
	FirstIssuedAt time.Time `json:"firstIssuedAt"`
	LastIssuedAt  time.Time `json:"lastIssuedAt"`
}

type StatementPageSummary struct {
	PartyCount int64 `json:"partyCount"`
	StatementTotals
}

type StatementPartyPage struct {
	Records  []StatementParty     `json:"records"`
	Total    int64                `json:"total"`
	Page     int                  `json:"page"`
	PageSize int                  `json:"pageSize"`
	Summary  StatementPageSummary `json:"summary"`
}

type StatementMaterial struct {
	MaterialCode string `json:"materialCode"`
	MaterialName string `json:"materialName"`
	MaterialSpec string `json:"materialSpec"`
	StatementTotals
}

type StatementDaily struct {
	Date string `json:"date"`
	StatementTotals
}

type StatementDetail struct {
	SiteCode  string `json:"siteCode"`
	SiteName  string `json:"siteName"`
	PartyCode string `json:"partyCode"`
	PartyName string `json:"partyName"`
	Direction string `json:"direction"`
	From      string `json:"from"`
	To        string `json:"to"`
	StatementTotals
	Materials []StatementMaterial `json:"materials"`
	Daily     []StatementDaily    `json:"daily"`
}

// StatementTicket is one valid ticket inside a counterparty statement. It is
// also the source for the detail CSV export.
type StatementTicket struct {
	SiteCode                string    `json:"siteCode"`
	SiteName                string    `json:"siteName"`
	PartyCode               string    `json:"partyCode"`
	PartyName               string    `json:"partyName"`
	TicketNo                string    `json:"ticketNo"`
	Plate                   string    `json:"plate"`
	MaterialCode            string    `json:"materialCode"`
	MaterialName            string    `json:"materialName"`
	MaterialSpec            string    `json:"materialSpec"`
	Direction               string    `json:"direction"`
	Status                  string    `json:"status"`
	IssuedAt                time.Time `json:"issuedAt"`
	GrossMilliTonne         int64     `json:"grossMilliTonne"`
	TareMilliTonne          int64     `json:"tareMilliTonne"`
	NetAdjustmentMilliTonne int64     `json:"netAdjustmentMilliTonne"`
	NetMilliTonne           int64     `json:"netMilliTonne"`
}

type statementRow struct {
	SiteCode           string
	SiteName           string
	PartyCode          string
	MaterialCode       string
	Direction          string
	IssuedAt           time.Time
	FinalNetMilliTonne int64
	Snapshot           string
}

type statementTicket struct {
	siteCode     string
	siteName     string
	partyCode    string
	partyName    string
	ticketNo     string
	plate        string
	materialCode string
	materialName string
	materialSpec string
	direction    string
	status       string
	issuedAt     time.Time
	gross        int64
	tare         int64
	adjustment   int64
	net          int64
}

func parseStatementTicket(row statementRow) (statementTicket, error) {
	var snapshot TicketSnapshot
	if err := json.Unmarshal([]byte(row.Snapshot), &snapshot); err != nil {
		return statementTicket{}, err
	}
	gross, err := ParseTonnes(snapshot.FinalGross, false)
	if err != nil {
		return statementTicket{}, err
	}
	tare, err := ParseTonnes(snapshot.FinalTare, false)
	if err != nil {
		return statementTicket{}, err
	}
	adjustment := int64(0)
	if snapshot.NetAdjustment != "" {
		adjustment, err = ParseTonnes(snapshot.NetAdjustment, true)
		if err != nil {
			return statementTicket{}, err
		}
	}
	partyName := strings.TrimSpace(snapshot.PartyName)
	if partyName == "" {
		partyName = row.PartyCode
	}
	materialName := strings.TrimSpace(snapshot.MaterialName)
	if materialName == "" {
		materialName = row.MaterialCode
	}
	siteName := strings.TrimSpace(row.SiteName)
	if siteName == "" {
		siteName = row.SiteCode
	}
	return statementTicket{
		siteCode: row.SiteCode, siteName: siteName, partyCode: row.PartyCode, partyName: partyName,
		ticketNo: snapshot.TicketNo, plate: snapshot.Plate,
		materialCode: row.MaterialCode, materialName: materialName, materialSpec: snapshot.MaterialSpec,
		direction: row.Direction, status: "valid", issuedAt: row.IssuedAt,
		gross: gross, tare: tare, adjustment: adjustment, net: row.FinalNetMilliTonne,
	}, nil
}

func aggregateStatementParties(tickets []statementTicket, keyword string) ([]StatementParty, StatementPageSummary) {
	groups := make(map[string]*StatementParty)
	for _, ticket := range tickets {
		key := ticket.siteCode + "\x00" + ticket.partyCode
		party := groups[key]
		if party == nil {
			party = &StatementParty{
				SiteCode: ticket.siteCode, SiteName: ticket.siteName,
				PartyCode: ticket.partyCode, PartyName: ticket.partyName,
				FirstIssuedAt: ticket.issuedAt, LastIssuedAt: ticket.issuedAt,
			}
			groups[key] = party
		}
		party.StatementTotals.add(ticket.gross, ticket.tare, ticket.adjustment, ticket.net)
		if ticket.issuedAt.Before(party.FirstIssuedAt) {
			party.FirstIssuedAt = ticket.issuedAt
		}
		if ticket.issuedAt.After(party.LastIssuedAt) || party.LastIssuedAt.IsZero() {
			party.LastIssuedAt = ticket.issuedAt
			party.PartyName = ticket.partyName
			party.SiteName = ticket.siteName
		}
	}

	needle := strings.ToLower(strings.TrimSpace(keyword))
	parties := make([]StatementParty, 0, len(groups))
	for _, party := range groups {
		if needle != "" &&
			!strings.Contains(strings.ToLower(party.PartyName), needle) &&
			!strings.Contains(strings.ToLower(party.PartyCode), needle) {
			continue
		}
		parties = append(parties, *party)
	}
	sort.Slice(parties, func(i, j int) bool {
		if parties[i].NetMilliTonne != parties[j].NetMilliTonne {
			return parties[i].NetMilliTonne > parties[j].NetMilliTonne
		}
		if parties[i].SiteCode != parties[j].SiteCode {
			return parties[i].SiteCode < parties[j].SiteCode
		}
		return parties[i].PartyCode < parties[j].PartyCode
	})

	summary := StatementPageSummary{PartyCount: int64(len(parties))}
	for _, party := range parties {
		summary.TicketCount += party.TicketCount
		summary.GrossMilliTonne += party.GrossMilliTonne
		summary.TareMilliTonne += party.TareMilliTonne
		summary.NetAdjustmentMilliTonne += party.NetAdjustmentMilliTonne
		summary.NetMilliTonne += party.NetMilliTonne
	}
	return parties, summary
}

func aggregateStatementDetail(q StatementQuery, tickets []statementTicket) StatementDetail {
	detail := StatementDetail{
		SiteCode: q.SiteCode, PartyCode: q.PartyCode, Direction: q.Direction,
		From: statementFrom(q), To: statementTo(q),
		Materials: []StatementMaterial{}, Daily: []StatementDaily{},
	}
	materials := make(map[string]*StatementMaterial)
	daily := make(map[string]*StatementDaily)
	var latest time.Time
	for _, ticket := range tickets {
		if ticket.issuedAt.After(latest) || latest.IsZero() {
			latest = ticket.issuedAt
			detail.SiteCode = ticket.siteCode
			detail.SiteName = ticket.siteName
			detail.PartyCode = ticket.partyCode
			detail.PartyName = ticket.partyName
		}
		detail.StatementTotals.add(ticket.gross, ticket.tare, ticket.adjustment, ticket.net)

		materialKey := ticket.materialCode + "\x00" + ticket.materialName + "\x00" + ticket.materialSpec
		material := materials[materialKey]
		if material == nil {
			material = &StatementMaterial{
				MaterialCode: ticket.materialCode, MaterialName: ticket.materialName, MaterialSpec: ticket.materialSpec,
			}
			materials[materialKey] = material
		}
		material.StatementTotals.add(ticket.gross, ticket.tare, ticket.adjustment, ticket.net)

		date := ticket.issuedAt.In(statementZone).Format("2006-01-02")
		day := daily[date]
		if day == nil {
			day = &StatementDaily{Date: date}
			daily[date] = day
		}
		day.StatementTotals.add(ticket.gross, ticket.tare, ticket.adjustment, ticket.net)
	}
	for _, material := range materials {
		detail.Materials = append(detail.Materials, *material)
	}
	sort.Slice(detail.Materials, func(i, j int) bool {
		if detail.Materials[i].NetMilliTonne != detail.Materials[j].NetMilliTonne {
			return detail.Materials[i].NetMilliTonne > detail.Materials[j].NetMilliTonne
		}
		return detail.Materials[i].MaterialCode < detail.Materials[j].MaterialCode
	})
	for _, day := range daily {
		detail.Daily = append(detail.Daily, *day)
	}
	sort.Slice(detail.Daily, func(i, j int) bool { return detail.Daily[i].Date < detail.Daily[j].Date })
	if detail.PartyName == "" {
		detail.PartyName = detail.PartyCode
	}
	if detail.SiteName == "" {
		detail.SiteName = detail.SiteCode
	}
	return detail
}

func pageStatementParties(parties []StatementParty, page, pageSize int) []StatementParty {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	start := (page - 1) * pageSize
	if start >= len(parties) {
		return []StatementParty{}
	}
	end := start + pageSize
	if end > len(parties) {
		end = len(parties)
	}
	return parties[start:end]
}

func statementFrom(q StatementQuery) string {
	if q.From == nil {
		return ""
	}
	return q.From.In(statementZone).Format("2006-01-02")
}

func statementTo(q StatementQuery) string {
	if q.Until == nil {
		return ""
	}
	return q.Until.AddDate(0, 0, -1).In(statementZone).Format("2006-01-02")
}

// FormatMilliTonne renders an exact thousandth-of-a-tonne value for CSV output.
func FormatMilliTonne(value int64) string {
	negative := value < 0
	if negative {
		value = -value
	}
	result := fmt.Sprintf("%d.%03d", value/1000, value%1000)
	if negative {
		return "-" + result
	}
	return result
}

func statementDate(value time.Time) string {
	return value.In(statementZone).Format("2006-01-02 15:04:05")
}

func statementCSVText(value string) string {
	if value != "" && strings.ContainsRune("=+-@\t\r\n", rune(value[0])) {
		return "'" + value
	}
	return value
}
