package weighbridge

import "time"

// AnalyticsQuery is the common filter for the read-only analytics endpoints.
// All date boundaries are converted by the handler to [From, Until).
type AnalyticsQuery struct {
	From          time.Time
	Until         time.Time
	SiteCode      string
	Direction     string
	MaterialCode  string
	CategoryCode  string
	CategoryCodes []string
	PartyCode     string
	IssuerName    string
	Keyword       string
	Granularity   string
	Compare       string
	TopN          int
	Page          int
	PageSize      int
	SortBy        string
	SortOrder     string
}

type AnalyticsFreshness struct {
	DataThrough    *time.Time             `json:"dataThrough"`
	LastReceivedAt *time.Time             `json:"lastReceivedAt"`
	HistoryStart   *time.Time             `json:"historyStart"`
	SiteReceipts   []AnalyticsSiteReceipt `json:"siteReceipts"`
}

type AnalyticsSiteReceipt struct {
	SiteCode        string     `json:"siteCode"`
	SiteName        string     `json:"siteName"`
	LastReceivedAt  *time.Time `json:"lastReceivedAt"`
	ReceivedChanges int64      `json:"receivedChanges"`
}

type AnalyticsComparisonMetric struct {
	Current  int64  `json:"current"`
	Previous int64  `json:"previous"`
	Delta    int64  `json:"delta"`
	DeltaBp  *int64 `json:"deltaBp"`
}

type AnalyticsComparisonSummary struct {
	ValidTickets            AnalyticsComparisonMetric `json:"validTickets"`
	InboundTickets          AnalyticsComparisonMetric `json:"inboundTickets"`
	OutboundTickets         AnalyticsComparisonMetric `json:"outboundTickets"`
	InboundNetMilliTonne    AnalyticsComparisonMetric `json:"inboundNetMilliTonne"`
	OutboundNetMilliTonne   AnalyticsComparisonMetric `json:"outboundNetMilliTonne"`
	NetFlowMilliTonne       AnalyticsComparisonMetric `json:"netFlowMilliTonne"`
	AdjustmentNetMilliTonne AnalyticsComparisonMetric `json:"adjustmentNetMilliTonne"`
	VoidTickets             AnalyticsComparisonMetric `json:"voidTickets"`
}

type AnalyticsComparison struct {
	Previous AnalyticsComparisonSummary `json:"previous"`
	Year     AnalyticsComparisonSummary `json:"year"`
}

type AnalyticsOverviewSummary struct {
	ValidTickets              int64  `json:"validTickets"`
	InboundTickets            int64  `json:"inboundTickets"`
	InboundNetMilliTonne      int64  `json:"inboundNetMilliTonne"`
	OutboundTickets           int64  `json:"outboundTickets"`
	OutboundNetMilliTonne     int64  `json:"outboundNetMilliTonne"`
	NetFlowMilliTonne         int64  `json:"netFlowMilliTonne"`
	ActiveSites               int64  `json:"activeSites"`
	ActiveSuppliers           int64  `json:"activeSuppliers"`
	ActiveCustomers           int64  `json:"activeCustomers"`
	AvgNetPerTicketMilliTonne *int64 `json:"avgNetPerTicketMilliTonne"`
	AdjustedTickets           int64  `json:"adjustedTickets"`
	AdjustmentNetMilliTonne   int64  `json:"adjustmentNetMilliTonne"`
	AdjustmentWeightRateBp    *int64 `json:"adjustmentWeightRateBp"`
	AdjustmentCoverageBp      *int64 `json:"adjustmentCoverageBp"`
	VoidTickets               int64  `json:"voidTickets"`
	VoidRateBp                *int64 `json:"voidRateBp"`
}

type AnalyticsTrendPoint struct {
	Period                    string `json:"period"`
	PeriodStart               string `json:"periodStart"`
	PeriodEnd                 string `json:"periodEnd"`
	InboundTickets            int64  `json:"inboundTickets"`
	InboundNetMilliTonne      int64  `json:"inboundNetMilliTonne"`
	OutboundTickets           int64  `json:"outboundTickets"`
	OutboundNetMilliTonne     int64  `json:"outboundNetMilliTonne"`
	NetFlowMilliTonne         int64  `json:"netFlowMilliTonne"`
	AvgNetPerTicketMilliTonne *int64 `json:"avgNetPerTicketMilliTonne"`
	VoidTickets               int64  `json:"voidTickets"`
	VoidRateBp                *int64 `json:"voidRateBp"`
	AdjustedTickets           int64  `json:"adjustedTickets,omitempty"`
	AdjustmentNetMilliTonne   int64  `json:"adjustmentNetMilliTonne,omitempty"`
	AdjustmentWeightRateBp    *int64 `json:"adjustmentWeightRateBp,omitempty"`
	ReopenedTickets           int64  `json:"reopenedTickets,omitempty"`
}

type AnalyticsTrend struct {
	Granularity string                `json:"granularity"`
	Points      []AnalyticsTrendPoint `json:"points"`
}

type AnalyticsStructureRow struct {
	Key           string `json:"key"`
	Label         string `json:"label"`
	NetMilliTonne int64  `json:"netMilliTonne"`
	ShareBp       *int64 `json:"shareBp"`
}

type AnalyticsTopRow struct {
	Code          string `json:"code"`
	Name          string `json:"name"`
	Direction     string `json:"direction,omitempty"`
	NetMilliTonne int64  `json:"netMilliTonne"`
	TicketCount   int64  `json:"ticketCount"`
	ShareBp       *int64 `json:"shareBp"`
}

type AnalyticsAlert struct {
	Type    string `json:"type"`
	Level   string `json:"level"`
	Count   int64  `json:"count"`
	Message string `json:"message"`
}

type AnalyticsOverviewData struct {
	Summary           AnalyticsOverviewSummary `json:"summary"`
	Comparison        AnalyticsComparison      `json:"comparison"`
	Trend             AnalyticsTrend           `json:"trend"`
	MaterialStructure []AnalyticsStructureRow  `json:"materialStructure"`
	TopMaterials      []AnalyticsTopRow        `json:"topMaterials"`
	TopParties        []AnalyticsTopRow        `json:"topParties"`
	Alerts            []AnalyticsAlert         `json:"alerts"`
	Freshness         AnalyticsFreshness       `json:"freshness"`
}

type AnalyticsFlowSummary struct {
	AnalyticsOverviewSummary
	InboundAvgNetMilliTonne  *int64 `json:"inboundAvgNetMilliTonne"`
	OutboundAvgNetMilliTonne *int64 `json:"outboundAvgNetMilliTonne"`
}

type AnalyticsFlowSiteRow struct {
	SiteCode                  string `json:"siteCode"`
	SiteName                  string `json:"siteName"`
	InboundTickets            int64  `json:"inboundTickets"`
	InboundNetMilliTonne      int64  `json:"inboundNetMilliTonne"`
	OutboundTickets           int64  `json:"outboundTickets"`
	OutboundNetMilliTonne     int64  `json:"outboundNetMilliTonne"`
	NetFlowMilliTonne         int64  `json:"netFlowMilliTonne"`
	AvgNetPerTicketMilliTonne *int64 `json:"avgNetPerTicketMilliTonne"`
	VoidTickets               int64  `json:"voidTickets"`
	VoidRateBp                *int64 `json:"voidRateBp"`
	AdjustedTickets           int64  `json:"adjustedTickets"`
	AdjustmentWeightRateBp    *int64 `json:"adjustmentWeightRateBp"`
	AdjustmentCoverageBp      *int64 `json:"adjustmentCoverageBp"`
}

type AnalyticsDuration struct {
	SampleTickets           int64    `json:"sampleTickets"`
	MedianSeconds           *float64 `json:"medianSeconds"`
	P90Seconds              *float64 `json:"p90Seconds"`
	MaxSeconds              *int64   `json:"maxSeconds"`
	CrossDayTickets         int64    `json:"crossDayTickets"`
	CrossDayRateBp          *int64   `json:"crossDayRateBp"`
	ReopenedExcludedTickets int64    `json:"reopenedExcludedTickets"`
}

type AnalyticsFlowData struct {
	Summary        AnalyticsFlowSummary   `json:"summary"`
	Comparison     AnalyticsComparison    `json:"comparison"`
	Trend          AnalyticsTrend         `json:"trend"`
	SiteComparison []AnalyticsFlowSiteRow `json:"siteComparison"`
	Duration       AnalyticsDuration      `json:"duration"`
	Freshness      AnalyticsFreshness     `json:"freshness"`
}

type AnalyticsMaterialSummary struct {
	MaterialCount           int64      `json:"materialCount"`
	InboundNetMilliTonne    int64      `json:"inboundNetMilliTonne"`
	OutboundNetMilliTonne   int64      `json:"outboundNetMilliTonne"`
	AdjustmentNetMilliTonne int64      `json:"adjustmentNetMilliTonne"`
	AdjustmentWeightRateBp  *int64     `json:"adjustmentWeightRateBp"`
	AdjustmentCoverageBp    *int64     `json:"adjustmentCoverageBp"`
	LastIssuedAt            *time.Time `json:"lastIssuedAt"`
}

type AnalyticsMaterialRow struct {
	MaterialCode              string     `json:"materialCode"`
	MaterialName              string     `json:"materialName"`
	MaterialSpec              string     `json:"materialSpec"`
	CategoryCode              string     `json:"categoryCode"`
	CategoryName              string     `json:"categoryName"`
	InboundTickets            int64      `json:"inboundTickets"`
	InboundNetMilliTonne      int64      `json:"inboundNetMilliTonne"`
	OutboundTickets           int64      `json:"outboundTickets"`
	OutboundNetMilliTonne     int64      `json:"outboundNetMilliTonne"`
	TotalTickets              int64      `json:"totalTickets"`
	TotalNetMilliTonne        int64      `json:"totalNetMilliTonne"`
	AvgNetPerTicketMilliTonne *int64     `json:"avgNetPerTicketMilliTonne"`
	ShareBp                   *int64     `json:"shareBp"`
	AdjustedTickets           int64      `json:"adjustedTickets"`
	AdjustmentNetMilliTonne   int64      `json:"adjustmentNetMilliTonne"`
	AdjustmentWeightRateBp    *int64     `json:"adjustmentWeightRateBp"`
	AdjustmentCoverageBp      *int64     `json:"adjustmentCoverageBp"`
	LastIssuedAt              *time.Time `json:"lastIssuedAt"`
}

type AnalyticsMaterialTrendSeries struct {
	MaterialCode string `json:"materialCode"`
	MaterialName string `json:"materialName"`
	Points       []struct {
		Period        string `json:"period"`
		NetMilliTonne int64  `json:"netMilliTonne"`
	} `json:"points"`
}

type AnalyticsMaterialsData struct {
	Summary        AnalyticsMaterialSummary       `json:"summary"`
	Records        []AnalyticsMaterialRow         `json:"records"`
	Total          int64                          `json:"total"`
	Page           int                            `json:"page"`
	PageSize       int                            `json:"pageSize"`
	Trend          []AnalyticsMaterialTrendSeries `json:"trend"`
	Structure      []AnalyticsStructureRow        `json:"structure"`
	TopAdjustments []AnalyticsMaterialRow         `json:"topAdjustments"`
	Freshness      AnalyticsFreshness             `json:"freshness"`
}

type AnalyticsPartySummary struct {
	ActiveParties            int64      `json:"activeParties"`
	TotalNetMilliTonne       int64      `json:"totalNetMilliTonne"`
	AvgNetPerPartyMilliTonne *int64     `json:"avgNetPerPartyMilliTonne"`
	NewParties               int64      `json:"newParties"`
	ReturningParties         int64      `json:"returningParties"`
	DormantParties           int64      `json:"dormantParties"`
	CoverageComplete         bool       `json:"coverageComplete"`
	HistoryStart             *time.Time `json:"historyStart"`
}

type AnalyticsPartyRow struct {
	PartyCode                 string     `json:"partyCode"`
	PartyName                 string     `json:"partyName"`
	Nature                    string     `json:"nature"`
	Direction                 string     `json:"direction"`
	TicketCount               int64      `json:"ticketCount"`
	NetMilliTonne             int64      `json:"netMilliTonne"`
	AvgNetPerTicketMilliTonne *int64     `json:"avgNetPerTicketMilliTonne"`
	ShareBp                   *int64     `json:"shareBp"`
	FirstIssuedAt             *time.Time `json:"firstIssuedAt"`
	LastIssuedAt              *time.Time `json:"lastIssuedAt"`
	AvgIntervalSeconds        *int64     `json:"avgIntervalSeconds"`
	MedianIntervalSeconds     *int64     `json:"medianIntervalSeconds"`
	ActiveMonths              int64      `json:"activeMonths"`
	MonthlyNetCvBp            *int64     `json:"monthlyNetCvBp"`
	AdjustedTickets           int64      `json:"adjustedTickets"`
	AdjustmentNetMilliTonne   int64      `json:"adjustmentNetMilliTonne"`
	AdjustmentWeightRateBp    *int64     `json:"adjustmentWeightRateBp"`
	AdjustmentCoverageBp      *int64     `json:"adjustmentCoverageBp"`
	VoidTickets               int64      `json:"voidTickets"`
	VoidRateBp                *int64     `json:"voidRateBp"`
}

type AnalyticsPartyConcentration struct {
	Label         string `json:"label"`
	NetMilliTonne int64  `json:"netMilliTonne"`
	ShareBp       *int64 `json:"shareBp"`
}

type AnalyticsPartiesData struct {
	Summary   AnalyticsPartySummary `json:"summary"`
	Records   []AnalyticsPartyRow   `json:"records"`
	Ranking   []AnalyticsPartyRow   `json:"ranking"`
	Total     int64                 `json:"total"`
	Page      int                   `json:"page"`
	PageSize  int                   `json:"pageSize"`
	Freshness AnalyticsFreshness    `json:"freshness"`
}

type AnalyticsPartyDetail struct {
	Party         AnalyticsPartyRow       `json:"party"`
	Trend         AnalyticsTrend          `json:"trend"`
	Materials     []AnalyticsMaterialRow  `json:"materials"`
	Sites         []AnalyticsPartySiteRow `json:"sites"`
	RecentTickets []AnalyticsRecentTicket `json:"recentTickets"`
}

type AnalyticsPartySiteRow struct {
	SiteCode      string `json:"siteCode"`
	SiteName      string `json:"siteName"`
	Tickets       int64  `json:"tickets"`
	NetMilliTonne int64  `json:"netMilliTonne"`
	ShareBp       *int64 `json:"shareBp"`
}

type AnalyticsRecentTicket struct {
	SiteCode             string    `json:"siteCode"`
	TicketNo             string    `json:"ticketNo"`
	IssuedAt             time.Time `json:"issuedAt"`
	Plate                string    `json:"plate"`
	MaterialName         string    `json:"materialName"`
	NetMilliTonne        int64     `json:"netMilliTonne"`
	AdjustmentMilliTonne int64     `json:"adjustmentMilliTonne"`
}

type AnalyticsQualitySummary struct {
	TotalTickets            int64  `json:"totalTickets"`
	ValidTickets            int64  `json:"validTickets"`
	VoidTickets             int64  `json:"voidTickets"`
	VoidRateBp              *int64 `json:"voidRateBp"`
	ReopenedTickets         int64  `json:"reopenedTickets"`
	ReopenRateBp            *int64 `json:"reopenRateBp"`
	AdjustedTickets         int64  `json:"adjustedTickets"`
	AdjustmentTicketRateBp  *int64 `json:"adjustmentTicketRateBp"`
	AdjustmentNetMilliTonne int64  `json:"adjustmentNetMilliTonne"`
	AdjustmentWeightRateBp  *int64 `json:"adjustmentWeightRateBp"`
	AdjustmentCoverageBp    *int64 `json:"adjustmentCoverageBp"`
	ManualWeightTickets     int64  `json:"manualWeightTickets"`
	ManualWeightRateBp      *int64 `json:"manualWeightRateBp"`
	CorrectionTickets       int64  `json:"correctionTickets"`
	AnomalyTickets          int64  `json:"anomalyTickets"`
}

type AnalyticsQualityVoid struct {
	Trend      AnalyticsTrend             `json:"trend"`
	Reasons    []AnalyticsReasonRow       `json:"reasons"`
	BySite     []AnalyticsQualityGroupRow `json:"bySite"`
	ByParty    []AnalyticsQualityGroupRow `json:"byParty"`
	ByMaterial []AnalyticsQualityGroupRow `json:"byMaterial"`
}

type AnalyticsReasonRow struct {
	Reason  string `json:"reason"`
	Tickets int64  `json:"tickets"`
	ShareBp *int64 `json:"shareBp"`
}

type AnalyticsQualityGroupRow struct {
	Code        string `json:"code"`
	Name        string `json:"name"`
	Tickets     int64  `json:"tickets"`
	VoidTickets int64  `json:"voidTickets"`
	VoidRateBp  *int64 `json:"voidRateBp"`
}

type AnalyticsReopenChain struct {
	OriginalTicketNo string     `json:"originalTicketNo"`
	NewTicketNo      string     `json:"newTicketNo"`
	SiteCode         string     `json:"siteCode"`
	OriginalIssuedAt *time.Time `json:"originalIssuedAt"`
	OriginalVoidedAt *time.Time `json:"originalVoidedAt"`
	NewIssuedAt      *time.Time `json:"newIssuedAt"`
	ReopenLagSeconds *int64     `json:"reopenLagSeconds"`
	CrossDay         bool       `json:"crossDay"`
}

type AnalyticsQualityReopen struct {
	Trend                  AnalyticsTrend         `json:"trend"`
	Chains                 []AnalyticsReopenChain `json:"chains"`
	MedianReopenLagSeconds *float64               `json:"medianReopenLagSeconds"`
}

type AnalyticsAdjustmentCategoryRow struct {
	Category                string `json:"category"`
	CategoryName            string `json:"categoryName"`
	Tickets                 int64  `json:"tickets"`
	AdjustmentNetMilliTonne int64  `json:"adjustmentNetMilliTonne"`
	RateBp                  *int64 `json:"rateBp"`
}

type AnalyticsAdjustmentModeRow struct {
	Mode    string `json:"mode"`
	Tickets int64  `json:"tickets"`
	ShareBp *int64 `json:"shareBp"`
}

type AnalyticsQualityAdjustment struct {
	ByCategory []AnalyticsAdjustmentCategoryRow `json:"byCategory"`
	ByMaterial []AnalyticsMaterialRow           `json:"byMaterial"`
	ByParty    []AnalyticsPartyRow              `json:"byParty"`
	Modes      []AnalyticsAdjustmentModeRow     `json:"modes"`
	Trend      AnalyticsTrend                   `json:"trend"`
}

type AnalyticsCorrectionSiteRow struct {
	SiteCode                  string `json:"siteCode"`
	SiteName                  string `json:"siteName"`
	Tickets                   int64  `json:"tickets"`
	GrossCorrectionMilliTonne int64  `json:"grossCorrectionMilliTonne"`
	TareCorrectionMilliTonne  int64  `json:"tareCorrectionMilliTonne"`
}

type AnalyticsQualityCorrection struct {
	Tickets                   int64                        `json:"tickets"`
	GrossCorrectionMilliTonne int64                        `json:"grossCorrectionMilliTonne"`
	TareCorrectionMilliTonne  int64                        `json:"tareCorrectionMilliTonne"`
	BySite                    []AnalyticsCorrectionSiteRow `json:"bySite"`
}

type AnalyticsMissingField struct {
	Field         string `json:"field"`
	Label         string `json:"label"`
	MissingCount  int64  `json:"missingCount"`
	MissingRateBp *int64 `json:"missingRateBp"`
}

type AnalyticsAnomaly struct {
	TicketNo string    `json:"ticketNo"`
	SiteCode string    `json:"siteCode"`
	IssuedAt time.Time `json:"issuedAt"`
	Type     string    `json:"type"`
	Detail   string    `json:"detail"`
}

type AnalyticsIssuerStat struct {
	IssuerName             string `json:"issuerName"`
	Tickets                int64  `json:"tickets"`
	VoidTickets            int64  `json:"voidTickets"`
	VoidRateBp             *int64 `json:"voidRateBp"`
	ReopenedTickets        int64  `json:"reopenedTickets"`
	AdjustedTickets        int64  `json:"adjustedTickets"`
	AdjustmentTicketRateBp *int64 `json:"adjustmentTicketRateBp"`
}

type AnalyticsQualityData struct {
	Summary            AnalyticsQualitySummary    `json:"summary"`
	VoidAnalysis       AnalyticsQualityVoid       `json:"voidAnalysis"`
	ReopenAnalysis     AnalyticsQualityReopen     `json:"reopenAnalysis"`
	AdjustmentAnalysis AnalyticsQualityAdjustment `json:"adjustmentAnalysis"`
	CorrectionAnalysis AnalyticsQualityCorrection `json:"correctionAnalysis"`
	MissingFields      []AnalyticsMissingField    `json:"missingFields"`
	Anomalies          []AnalyticsAnomaly         `json:"anomalies"`
	IssuerStats        []AnalyticsIssuerStat      `json:"issuerStats"`
	Freshness          AnalyticsFreshness         `json:"freshness"`
}

// 核心原料供应商扣量稳定性
type AnalyticsSupplierQualitySummary struct {
	SupplierCount        int64  `json:"supplierCount"`
	TicketCount          int64  `json:"ticketCount"`
	SampleCount          int64  `json:"sampleCount"`
	AdjustedTickets      int64  `json:"adjustedTickets"`
	WeightedRateBp       *int64 `json:"weightedRateBp"`
	AvgRateBp            *int64 `json:"avgRateBp"`
	MedianRateBp         *int64 `json:"medianRateBp"`
	P90RateBp            *int64 `json:"p90RateBp"`
	AdjustmentCoverageBp *int64 `json:"adjustmentCoverageBp"`
}

type AnalyticsSupplierQualityRow struct {
	PartyCode                       string     `json:"partyCode"`
	PartyName                       string     `json:"partyName"`
	Nature                          string     `json:"nature"`
	TicketCount                     int64      `json:"ticketCount"`
	SampleCount                     int64      `json:"sampleCount"`
	AdjustedTickets                 int64      `json:"adjustedTickets"`
	AdjustmentCoverageBp            *int64     `json:"adjustmentCoverageBp"`
	WeightedRateBp                  *int64     `json:"weightedRateBp"`
	AvgRateBp                       *int64     `json:"avgRateBp"`
	MedianRateBp                    *int64     `json:"medianRateBp"`
	P90RateBp                       *int64     `json:"p90RateBp"`
	StddevRateBp                    *int64     `json:"stddevRateBp"`
	CvBp                            *int64     `json:"cvBp"`
	MinRateBp                       *int64     `json:"minRateBp"`
	MaxRateBp                       *int64     `json:"maxRateBp"`
	TotalAdjustmentMilliTonne       int64      `json:"totalAdjustmentMilliTonne"`
	TotalPreAdjustmentNetMilliTonne int64      `json:"totalPreAdjustmentNetMilliTonne"`
	MaterialCount                   int64      `json:"materialCount"`
	MaterialNames                   string     `json:"materialNames"`
	FirstIssuedAt                   *time.Time `json:"firstIssuedAt"`
	LastIssuedAt                    *time.Time `json:"lastIssuedAt"`
}

type AnalyticsRateTrendPoint struct {
	Period      string `json:"period"`
	PeriodStart string `json:"periodStart"`
	PeriodEnd   string `json:"periodEnd"`
	AvgRateBp   *int64 `json:"avgRateBp"`
	SampleCount int64  `json:"sampleCount"`
}

type AnalyticsSupplierQualityTrend struct {
	PartyCode string                    `json:"partyCode"`
	PartyName string                    `json:"partyName"`
	Points    []AnalyticsRateTrendPoint `json:"points"`
}

type AnalyticsSupplierQualityData struct {
	Summary   AnalyticsSupplierQualitySummary `json:"summary"`
	Records   []AnalyticsSupplierQualityRow   `json:"records"`
	Top       []AnalyticsSupplierQualityRow   `json:"top"`
	Total     int64                           `json:"total"`
	Page      int                             `json:"page"`
	PageSize  int                             `json:"pageSize"`
	Trend     []AnalyticsSupplierQualityTrend `json:"trend"`
	Freshness AnalyticsFreshness              `json:"freshness"`
}

// 副产品出库流向
type AnalyticsByproductSummary struct {
	ActiveCustomers             int64  `json:"activeCustomers"`
	TicketCount                 int64  `json:"ticketCount"`
	TotalNetMilliTonne          int64  `json:"totalNetMilliTonne"`
	AvgNetPerCustomerMilliTonne *int64 `json:"avgNetPerCustomerMilliTonne"`
	MaterialCount               int64  `json:"materialCount"`
	CR3Bp                       *int64 `json:"cr3Bp"`
	CR5Bp                       *int64 `json:"cr5Bp"`
	CR10Bp                      *int64 `json:"cr10Bp"`
	HHI                         *int64 `json:"hhi"`
	TopCustomerShareBp          *int64 `json:"topCustomerShareBp"`
}

type AnalyticsByproductRow struct {
	PartyCode                 string     `json:"partyCode"`
	PartyName                 string     `json:"partyName"`
	Nature                    string     `json:"nature"`
	TicketCount               int64      `json:"ticketCount"`
	NetMilliTonne             int64      `json:"netMilliTonne"`
	AvgNetPerTicketMilliTonne *int64     `json:"avgNetPerTicketMilliTonne"`
	ShareBp                   *int64     `json:"shareBp"`
	FirstIssuedAt             *time.Time `json:"firstIssuedAt"`
	LastIssuedAt              *time.Time `json:"lastIssuedAt"`
	MaterialCount             int64      `json:"materialCount"`
	MaterialNames             string     `json:"materialNames"`
}

type AnalyticsByproductMaterial struct {
	MaterialCode  string `json:"materialCode"`
	MaterialName  string `json:"materialName"`
	TicketCount   int64  `json:"ticketCount"`
	NetMilliTonne int64  `json:"netMilliTonne"`
	ShareBp       *int64 `json:"shareBp"`
}

type AnalyticsByproductTrendPoint struct {
	Period        string `json:"period"`
	PeriodStart   string `json:"periodStart"`
	PeriodEnd     string `json:"periodEnd"`
	TicketCount   int64  `json:"ticketCount"`
	NetMilliTonne int64  `json:"netMilliTonne"`
}

type AnalyticsByproductData struct {
	Summary       AnalyticsByproductSummary      `json:"summary"`
	Records       []AnalyticsByproductRow        `json:"records"`
	Total         int64                          `json:"total"`
	Page          int                            `json:"page"`
	PageSize      int                            `json:"pageSize"`
	Top           []AnalyticsByproductRow        `json:"top"`
	Concentration []AnalyticsPartyConcentration  `json:"concentration"`
	Materials     []AnalyticsByproductMaterial   `json:"materials"`
	Trend         []AnalyticsByproductTrendPoint `json:"trend"`
	Freshness     AnalyticsFreshness             `json:"freshness"`
}
