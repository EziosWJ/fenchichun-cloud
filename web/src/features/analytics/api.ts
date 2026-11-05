import { get, getBlob } from '../../lib/api/client';

export interface StatementTotals {
  ticketCount: number;
  grossMilliTonne: number;
  tareMilliTonne: number;
  netAdjustmentMilliTonne: number;
  netMilliTonne: number;
}

export interface StatementParty extends StatementTotals {
  siteCode: string;
  siteName: string;
  partyCode: string;
  partyName: string;
  firstIssuedAt: string;
  lastIssuedAt: string;
}

export interface StatementPageSummary extends StatementTotals {
  partyCount: number;
}

export interface StatementPartyPage {
  records: StatementParty[];
  total: number;
  page: number;
  pageSize: number;
  summary: StatementPageSummary;
}

export interface StatementMaterial extends StatementTotals {
  materialCode: string;
  materialName: string;
  materialSpec: string;
}

export interface StatementDaily extends StatementTotals {
  date: string;
}

export interface StatementDetail extends StatementTotals {
  siteCode: string;
  siteName: string;
  partyCode: string;
  partyName: string;
  direction: string;
  from: string;
  to: string;
  materials: StatementMaterial[];
  daily: StatementDaily[];
}

const base = '/weighbridge/statements/parties';

export const statementParties = (params: Record<string, unknown>) =>
  get<StatementPartyPage>(base, params);

export const statementDetail = (params: Record<string, unknown>) =>
  get<StatementDetail>(`${base}/detail`, params);

export const exportStatementParties = (params: Record<string, unknown>) =>
  getBlob(`${base}/export`, params);

export const exportStatementDetail = (params: Record<string, unknown>) =>
  getBlob(`${base}/detail/export`, params);

// 统计与分析
export interface AnalyticsSiteReceipt {
  siteCode: string;
  siteName: string;
  lastReceivedAt: string | null;
  receivedChanges: number;
}

export interface AnalyticsFreshness {
  dataThrough: string | null;
  lastReceivedAt: string | null;
  historyStart: string | null;
  siteReceipts: AnalyticsSiteReceipt[];
}

export interface ComparisonMetric {
  current: number;
  previous: number;
  delta: number;
  deltaBp: number | null;
}

export interface ComparisonSummary {
  validTickets: ComparisonMetric;
  inboundTickets: ComparisonMetric;
  outboundTickets: ComparisonMetric;
  inboundNetMilliTonne: ComparisonMetric;
  outboundNetMilliTonne: ComparisonMetric;
  netFlowMilliTonne: ComparisonMetric;
  adjustmentNetMilliTonne: ComparisonMetric;
  voidTickets: ComparisonMetric;
}

export interface AnalyticsComparison {
  previous: ComparisonSummary;
  year: ComparisonSummary;
}

export interface OverviewSummary {
  validTickets: number;
  inboundTickets: number;
  inboundNetMilliTonne: number;
  outboundTickets: number;
  outboundNetMilliTonne: number;
  netFlowMilliTonne: number;
  activeSites: number;
  activeSuppliers: number;
  activeCustomers: number;
  avgNetPerTicketMilliTonne: number | null;
  adjustedTickets: number;
  adjustmentNetMilliTonne: number;
  adjustmentWeightRateBp: number | null;
  adjustmentCoverageBp: number | null;
  voidTickets: number;
  voidRateBp: number | null;
}

export interface TrendPoint {
  period: string;
  periodStart: string;
  periodEnd: string;
  inboundTickets: number;
  inboundNetMilliTonne: number;
  outboundTickets: number;
  outboundNetMilliTonne: number;
  netFlowMilliTonne: number;
  avgNetPerTicketMilliTonne: number | null;
  voidTickets: number;
  voidRateBp: number | null;
  adjustedTickets?: number;
  adjustmentNetMilliTonne?: number;
  adjustmentWeightRateBp?: number | null;
  reopenedTickets?: number;
}

export interface TrendSeries {
  granularity: string;
  points: TrendPoint[];
}

export interface StructureRow {
  key: string;
  label: string;
  netMilliTonne: number;
  shareBp: number | null;
}

export interface TopRow {
  code: string;
  name: string;
  direction?: string;
  netMilliTonne: number;
  ticketCount: number;
  shareBp: number | null;
}

export interface AlertRow {
  type: string;
  level: 'info' | 'warning' | 'error';
  count: number;
  message: string;
}

export interface OverviewData {
  summary: OverviewSummary;
  comparison: AnalyticsComparison;
  trend: TrendSeries;
  materialStructure: StructureRow[];
  topMaterials: TopRow[];
  topParties: TopRow[];
  alerts: AlertRow[];
  freshness: AnalyticsFreshness;
}

export interface FlowSummary extends OverviewSummary {
  inboundAvgNetMilliTonne: number | null;
  outboundAvgNetMilliTonne: number | null;
}

export interface FlowSiteRow {
  siteCode: string;
  siteName: string;
  inboundTickets: number;
  inboundNetMilliTonne: number;
  outboundTickets: number;
  outboundNetMilliTonne: number;
  netFlowMilliTonne: number;
  avgNetPerTicketMilliTonne: number | null;
  voidTickets: number;
  voidRateBp: number | null;
  adjustedTickets: number;
  adjustmentWeightRateBp: number | null;
  adjustmentCoverageBp: number | null;
}

export interface AnalyticsDuration {
  sampleTickets: number;
  medianSeconds: number | null;
  p90Seconds: number | null;
  maxSeconds: number | null;
  crossDayTickets: number;
  crossDayRateBp: number | null;
  reopenedExcludedTickets: number;
}

export interface FlowData {
  summary: FlowSummary;
  comparison: AnalyticsComparison;
  trend: TrendSeries;
  siteComparison: FlowSiteRow[];
  duration: AnalyticsDuration;
  freshness: AnalyticsFreshness;
}

export interface MaterialSummary {
  materialCount: number;
  inboundNetMilliTonne: number;
  outboundNetMilliTonne: number;
  adjustmentNetMilliTonne: number;
  adjustmentWeightRateBp: number | null;
  adjustmentCoverageBp: number | null;
  lastIssuedAt: string | null;
}

export interface MaterialRow {
  materialCode: string;
  materialName: string;
  materialSpec: string;
  categoryCode: string;
  categoryName: string;
  inboundTickets: number;
  inboundNetMilliTonne: number;
  outboundTickets: number;
  outboundNetMilliTonne: number;
  totalTickets: number;
  totalNetMilliTonne: number;
  avgNetPerTicketMilliTonne: number | null;
  shareBp: number | null;
  adjustedTickets: number;
  adjustmentNetMilliTonne: number;
  adjustmentWeightRateBp: number | null;
  adjustmentCoverageBp: number | null;
  lastIssuedAt: string | null;
}

export interface MaterialTrendSeries {
  materialCode: string;
  materialName: string;
  points: Array<{ period: string; netMilliTonne: number }>;
}

export interface MaterialsData {
  summary: MaterialSummary;
  records: MaterialRow[];
  total: number;
  page: number;
  pageSize: number;
  trend: MaterialTrendSeries[];
  structure: StructureRow[];
  topAdjustments: MaterialRow[];
  freshness: AnalyticsFreshness;
}

export interface PartySummary {
  activeParties: number;
  totalNetMilliTonne: number;
  avgNetPerPartyMilliTonne: number | null;
  cr3Bp: number | null;
  cr5Bp: number | null;
  cr10Bp: number | null;
  hhi: number | null;
  newParties: number;
  returningParties: number;
  dormantParties: number;
  coverageComplete: boolean;
  historyStart: string | null;
}

export interface PartyRow {
  partyCode: string;
  partyName: string;
  direction: string;
  ticketCount: number;
  netMilliTonne: number;
  avgNetPerTicketMilliTonne: number | null;
  shareBp: number | null;
  firstIssuedAt: string | null;
  lastIssuedAt: string | null;
  adjustedTickets: number;
  adjustmentNetMilliTonne: number;
  adjustmentWeightRateBp: number | null;
  adjustmentCoverageBp: number | null;
  voidTickets: number;
  voidRateBp: number | null;
}

export interface PartyConcentration {
  label: string;
  netMilliTonne: number;
  shareBp: number | null;
}

export interface PartiesData {
  summary: PartySummary;
  records: PartyRow[];
  total: number;
  page: number;
  pageSize: number;
  top: PartyRow[];
  concentration: PartyConcentration[];
  freshness: AnalyticsFreshness;
}

export interface PartySiteRow {
  siteCode: string;
  siteName: string;
  tickets: number;
  netMilliTonne: number;
  shareBp: number | null;
}

export interface RecentTicket {
  siteCode: string;
  ticketNo: string;
  issuedAt: string;
  plate: string;
  materialName: string;
  netMilliTonne: number;
  adjustmentMilliTonne: number;
}

export interface PartyDetail {
  party: PartyRow;
  trend: TrendSeries;
  materials: MaterialRow[];
  sites: PartySiteRow[];
  recentTickets: RecentTicket[];
}

export interface QualitySummary {
  totalTickets: number;
  validTickets: number;
  voidTickets: number;
  voidRateBp: number | null;
  reopenedTickets: number;
  reopenRateBp: number | null;
  adjustedTickets: number;
  adjustmentTicketRateBp: number | null;
  adjustmentNetMilliTonne: number;
  adjustmentWeightRateBp: number | null;
  adjustmentCoverageBp: number | null;
  manualWeightTickets: number;
  manualWeightRateBp: number | null;
  correctionTickets: number;
  anomalyTickets: number;
}

export interface ReasonRow {
  reason: string;
  tickets: number;
  shareBp: number | null;
}

export interface QualityGroupRow {
  code: string;
  name: string;
  tickets: number;
  voidTickets: number;
  voidRateBp: number | null;
}

export interface QualityVoid {
  trend: TrendSeries;
  reasons: ReasonRow[];
  bySite: QualityGroupRow[];
  byParty: QualityGroupRow[];
  byMaterial: QualityGroupRow[];
}

export interface ReopenChain {
  originalTicketNo: string;
  newTicketNo: string;
  siteCode: string;
  originalIssuedAt: string | null;
  originalVoidedAt: string | null;
  newIssuedAt: string | null;
  reopenLagSeconds: number | null;
  crossDay: boolean;
}

export interface QualityReopen {
  trend: TrendSeries;
  chains: ReopenChain[];
  medianReopenLagSeconds: number | null;
}

export interface AdjustmentCategoryRow {
  category: string;
  categoryName: string;
  tickets: number;
  adjustmentNetMilliTonne: number;
  rateBp: number | null;
}

export interface AdjustmentModeRow {
  mode: string;
  tickets: number;
  shareBp: number | null;
}

export interface QualityAdjustment {
  byCategory: AdjustmentCategoryRow[];
  byMaterial: MaterialRow[];
  byParty: PartyRow[];
  modes: AdjustmentModeRow[];
  trend: TrendSeries;
}

export interface CorrectionSiteRow {
  siteCode: string;
  siteName: string;
  tickets: number;
  grossCorrectionMilliTonne: number;
  tareCorrectionMilliTonne: number;
}

export interface QualityCorrection {
  tickets: number;
  grossCorrectionMilliTonne: number;
  tareCorrectionMilliTonne: number;
  bySite: CorrectionSiteRow[];
}

export interface MissingField {
  field: string;
  label: string;
  missingCount: number;
  missingRateBp: number | null;
}

export interface QualityAnomaly {
  ticketNo: string;
  siteCode: string;
  issuedAt: string;
  type: string;
  detail: string;
}

export interface IssuerStat {
  issuerName: string;
  tickets: number;
  voidTickets: number;
  voidRateBp: number | null;
  reopenedTickets: number;
  adjustedTickets: number;
  adjustmentTicketRateBp: number | null;
}

export interface QualityData {
  summary: QualitySummary;
  voidAnalysis: QualityVoid;
  reopenAnalysis: QualityReopen;
  adjustmentAnalysis: QualityAdjustment;
  correctionAnalysis: QualityCorrection;
  missingFields: MissingField[];
  anomalies: QualityAnomaly[];
  issuerStats: IssuerStat[];
  freshness: AnalyticsFreshness;
}

const analyticsBase = '/weighbridge/analytics';

export const analyticsOverview = (params: Record<string, unknown>) =>
  get<OverviewData>(`${analyticsBase}/overview`, params);

export const analyticsFlow = (params: Record<string, unknown>) =>
  get<FlowData>(`${analyticsBase}/flow`, params);

export const analyticsMaterials = (params: Record<string, unknown>) =>
  get<MaterialsData>(`${analyticsBase}/materials`, params);

export const analyticsParties = (params: Record<string, unknown>) =>
  get<PartiesData>(`${analyticsBase}/parties`, params);

export const analyticsPartyDetail = (params: Record<string, unknown>) =>
  get<PartyDetail>(`${analyticsBase}/parties/detail`, params);

export const analyticsQuality = (params: Record<string, unknown>) =>
  get<QualityData>(`${analyticsBase}/quality`, params);

export const exportAnalyticsFlow = (params: Record<string, unknown>) =>
  getBlob(`${analyticsBase}/flow/export`, params);

export const exportAnalyticsMaterials = (params: Record<string, unknown>) =>
  getBlob(`${analyticsBase}/materials/export`, params);

export const exportAnalyticsParties = (params: Record<string, unknown>) =>
  getBlob(`${analyticsBase}/parties/export`, params);

export const exportAnalyticsQuality = (params: Record<string, unknown>) =>
  getBlob(`${analyticsBase}/quality/export`, params);

export interface SupplierQualitySummary {
  supplierCount: number;
  ticketCount: number;
  sampleCount: number;
  adjustedTickets: number;
  weightedRateBp: number | null;
  avgRateBp: number | null;
  medianRateBp: number | null;
  p90RateBp: number | null;
  adjustmentCoverageBp: number | null;
}

export interface SupplierQualityRow {
  partyCode: string;
  partyName: string;
  nature: string;
  ticketCount: number;
  sampleCount: number;
  adjustedTickets: number;
  adjustmentCoverageBp: number | null;
  weightedRateBp: number | null;
  avgRateBp: number | null;
  medianRateBp: number | null;
  p90RateBp: number | null;
  stddevRateBp: number | null;
  cvBp: number | null;
  minRateBp: number | null;
  maxRateBp: number | null;
  totalAdjustmentMilliTonne: number;
  totalPreAdjustmentNetMilliTonne: number;
  materialCount: number;
  materialNames: string;
  firstIssuedAt: string | null;
  lastIssuedAt: string | null;
}

export interface SupplierRateTrendPoint {
  period: string;
  periodStart: string;
  periodEnd: string;
  avgRateBp: number | null;
  sampleCount: number;
}

export interface SupplierQualityTrend {
  partyCode: string;
  partyName: string;
  points: SupplierRateTrendPoint[];
}

export interface SupplierQualityData {
  summary: SupplierQualitySummary;
  records: SupplierQualityRow[];
  top: SupplierQualityRow[];
  total: number;
  page: number;
  pageSize: number;
  trend: SupplierQualityTrend[];
  freshness: AnalyticsFreshness;
}

export interface ByproductSummary {
  activeCustomers: number;
  ticketCount: number;
  totalNetMilliTonne: number;
  avgNetPerCustomerMilliTonne: number | null;
  materialCount: number;
  cr3Bp: number | null;
  cr5Bp: number | null;
  cr10Bp: number | null;
  hhi: number | null;
  topCustomerShareBp: number | null;
}

export interface ByproductRow {
  partyCode: string;
  partyName: string;
  nature: string;
  ticketCount: number;
  netMilliTonne: number;
  avgNetPerTicketMilliTonne: number | null;
  shareBp: number | null;
  firstIssuedAt: string | null;
  lastIssuedAt: string | null;
  materialCount: number;
  materialNames: string;
}

export interface ByproductMaterial {
  materialCode: string;
  materialName: string;
  ticketCount: number;
  netMilliTonne: number;
  shareBp: number | null;
}

export interface ByproductTrendPoint {
  period: string;
  periodStart: string;
  periodEnd: string;
  ticketCount: number;
  netMilliTonne: number;
}

export interface ByproductData {
  summary: ByproductSummary;
  records: ByproductRow[];
  total: number;
  page: number;
  pageSize: number;
  top: ByproductRow[];
  concentration: PartyConcentration[];
  materials: ByproductMaterial[];
  trend: ByproductTrendPoint[];
  freshness: AnalyticsFreshness;
}

export const analyticsSupplierQuality = (params: Record<string, unknown>) =>
  get<SupplierQualityData>(`${analyticsBase}/materials/supplier-quality`, params);

export const analyticsByproductFlow = (params: Record<string, unknown>) =>
  get<ByproductData>(`${analyticsBase}/materials/byproduct-flow`, params);
