package weighbridge

import "time"

// ticketAnalyticsFields mirrors the read-model columns derived from a ticket
// snapshot. The snapshot remains the source of truth; these fields exist so
// analytics queries can aggregate without parsing JSON text row by row.
type ticketAnalyticsFields struct {
	OriginalGrossMilliTonne    *int64
	OriginalTareMilliTonne     *int64
	FinalGrossMilliTonne       *int64
	FinalTareMilliTonne        *int64
	PreAdjustmentNetMilliTonne *int64
	NetAdjustmentMilliTonne    *int64
	AdjustmentKnown            bool
	Adjusted                   bool
	AdjustmentMode             *string
	AdjustmentCategory         *string
	AdjustmentCategoryName     *string
	FirstConfirmedAt           *time.Time
	SecondConfirmedAt          *time.Time
	WeighIntervalSeconds       *int64
	IssuedLagSeconds           *int64
	CrossDay                   bool
	GrossSource                *string
	TareSource                 *string
	IssuerName                 *string
	Driver                     *string
	DriverPhone                *string
	ContactName                *string
	ContactPhone               *string
	MaterialName               *string
	MaterialSpec               *string
	PartyName                  *string
	IssuedDate                 *time.Time
}

func (f ticketAnalyticsFields) apply(ticket *cloudTicket) {
	ticket.OriginalGrossMilliTonne = f.OriginalGrossMilliTonne
	ticket.OriginalTareMilliTonne = f.OriginalTareMilliTonne
	ticket.FinalGrossMilliTonne = f.FinalGrossMilliTonne
	ticket.FinalTareMilliTonne = f.FinalTareMilliTonne
	ticket.PreAdjustmentNetMilliTonne = f.PreAdjustmentNetMilliTonne
	ticket.NetAdjustmentMilliTonne = f.NetAdjustmentMilliTonne
	ticket.AdjustmentKnown = f.AdjustmentKnown
	ticket.Adjusted = f.Adjusted
	ticket.AdjustmentMode = f.AdjustmentMode
	ticket.AdjustmentCategory = f.AdjustmentCategory
	ticket.AdjustmentCategoryName = f.AdjustmentCategoryName
	ticket.FirstConfirmedAt = f.FirstConfirmedAt
	ticket.SecondConfirmedAt = f.SecondConfirmedAt
	ticket.WeighIntervalSeconds = f.WeighIntervalSeconds
	ticket.IssuedLagSeconds = f.IssuedLagSeconds
	ticket.CrossDay = f.CrossDay
	ticket.GrossSource = f.GrossSource
	ticket.TareSource = f.TareSource
	ticket.IssuerName = f.IssuerName
	ticket.Driver = f.Driver
	ticket.DriverPhone = f.DriverPhone
	ticket.ContactName = f.ContactName
	ticket.ContactPhone = f.ContactPhone
	ticket.MaterialName = f.MaterialName
	ticket.MaterialSpec = f.MaterialSpec
	ticket.PartyName = f.PartyName
	ticket.IssuedDate = f.IssuedDate
}

func deriveTicketAnalytics(snapshot TicketSnapshot) (ticketAnalyticsFields, error) {
	var fields ticketAnalyticsFields

	originalGross, err := parseOptionalMilliTonne(snapshot.OriginalGross)
	if err != nil {
		return fields, err
	}
	originalTare, err := parseOptionalMilliTonne(snapshot.OriginalTare)
	if err != nil {
		return fields, err
	}
	finalGross, err := parseOptionalMilliTonne(snapshot.FinalGross)
	if err != nil {
		return fields, err
	}
	finalTare, err := parseOptionalMilliTonne(snapshot.FinalTare)
	if err != nil {
		return fields, err
	}
	fields.OriginalGrossMilliTonne = originalGross
	fields.OriginalTareMilliTonne = originalTare
	fields.FinalGrossMilliTonne = finalGross
	fields.FinalTareMilliTonne = finalTare
	if finalGross != nil && finalTare != nil {
		value := *finalGross - *finalTare
		fields.PreAdjustmentNetMilliTonne = &value
	}

	if snapshot.NetAdjustment != "" {
		adjustment, err := ParseTonnes(snapshot.NetAdjustment, true)
		if err != nil {
			return ticketAnalyticsFields{}, err
		}
		fields.AdjustmentKnown = true
		fields.NetAdjustmentMilliTonne = &adjustment
		fields.Adjusted = adjustment != 0
	}

	deriveAdjustmentClassification(&fields, snapshot)

	if !snapshot.FirstConfirmedAt.IsZero() {
		value := snapshot.FirstConfirmedAt
		fields.FirstConfirmedAt = &value
	}
	if !snapshot.SecondConfirmedAt.IsZero() {
		value := snapshot.SecondConfirmedAt
		fields.SecondConfirmedAt = &value
	}
	if fields.FirstConfirmedAt != nil && fields.SecondConfirmedAt != nil {
		value := fields.SecondConfirmedAt.Unix() - fields.FirstConfirmedAt.Unix()
		fields.WeighIntervalSeconds = &value
		fields.CrossDay = fields.FirstConfirmedAt.In(statementZone).Format("2006-01-02") !=
			fields.SecondConfirmedAt.In(statementZone).Format("2006-01-02")
	}
	if fields.SecondConfirmedAt != nil && !snapshot.IssuedAt.IsZero() {
		value := snapshot.IssuedAt.Unix() - fields.SecondConfirmedAt.Unix()
		fields.IssuedLagSeconds = &value
	}

	fields.GrossSource = textPointer(snapshot.GrossSource)
	fields.TareSource = textPointer(snapshot.TareSource)
	fields.IssuerName = textPointer(snapshot.IssuerName)
	fields.Driver = textPointer(snapshot.Driver)
	fields.DriverPhone = textPointer(snapshot.DriverPhone)
	fields.ContactName = textPointer(snapshot.ContactName)
	fields.ContactPhone = textPointer(snapshot.ContactPhone)
	fields.MaterialName = textPointer(snapshot.MaterialName)
	fields.MaterialSpec = textPointer(snapshot.MaterialSpec)
	fields.PartyName = textPointer(snapshot.PartyName)

	if !snapshot.IssuedAt.IsZero() {
		inBeijing := snapshot.IssuedAt.In(statementZone)
		value := time.Date(inBeijing.Year(), inBeijing.Month(), inBeijing.Day(), 0, 0, 0, 0, statementZone)
		fields.IssuedDate = &value
	}

	return fields, nil
}

func setTicketAnalytics(ticket *cloudTicket, snapshot TicketSnapshot) error {
	fields, err := deriveTicketAnalytics(snapshot)
	if err != nil {
		return err
	}
	fields.apply(ticket)
	return nil
}

// MultiAdjustmentCode marks a ticket whose net adjustment has more than one
// detail item. Reports group such tickets under 多项调整 and use the ticket's
// total adjustment instead of splitting it across categories.
const (
	MultiAdjustmentCode = "multi"
	MultiAdjustmentName = "多项调整"
)

// deriveAdjustmentClassification picks the report category and mode. A
// version 5 ticket is classified from its detail array; older snapshots keep
// using the whole-ticket single-item fields.
func deriveAdjustmentClassification(fields *ticketAnalyticsFields, snapshot TicketSnapshot) {
	if snapshot.NetAdjustments != nil {
		switch len(*snapshot.NetAdjustments) {
		case 0:
			return
		case 1:
			item := (*snapshot.NetAdjustments)[0]
			fields.AdjustmentMode = textPointer(item.Mode)
			fields.AdjustmentCategory = textPointer(item.Category)
			fields.AdjustmentCategoryName = textPointer(item.CategoryName)
		default:
			fields.AdjustmentMode = textPointer(MultiAdjustmentCode)
			fields.AdjustmentCategory = textPointer(MultiAdjustmentCode)
			fields.AdjustmentCategoryName = textPointer(MultiAdjustmentName)
		}
		return
	}
	fields.AdjustmentMode = textPointer(snapshot.NetAdjustmentMode)
	fields.AdjustmentCategory = textPointer(snapshot.NetAdjustmentCategory)
	fields.AdjustmentCategoryName = textPointer(snapshot.NetAdjustmentCategoryName)
}

func parseOptionalMilliTonne(value string) (*int64, error) {
	if value == "" {
		return nil, nil
	}
	parsed, err := ParseTonnes(value, false)
	if err != nil {
		return nil, err
	}
	return &parsed, nil
}

func textPointer(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}
