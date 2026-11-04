import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import OverviewPage from '../../src/pages/analytics/OverviewPage';
import FlowPage from '../../src/pages/analytics/FlowPage';
import MaterialsPage from '../../src/pages/analytics/MaterialsPage';
import PartiesPage from '../../src/pages/analytics/PartiesPage';
import QualityPage from '../../src/pages/analytics/QualityPage';
import { renderWithProviders } from '../utils/renderWithProviders';

const analytics = vi.hoisted(() => ({
  analyticsOverview: vi.fn(),
  analyticsFlow: vi.fn(),
  exportAnalyticsFlow: vi.fn(),
  analyticsMaterials: vi.fn(),
  analyticsParties: vi.fn(),
  analyticsPartyDetail: vi.fn(),
  analyticsQuality: vi.fn(),
  exportAnalyticsMaterials: vi.fn(),
  exportAnalyticsParties: vi.fn(),
  exportAnalyticsQuality: vi.fn(),
}));
const weighing = vi.hoisted(() => ({
  sites: vi.fn(),
  materials: vi.fn(),
  categories: vi.fn(),
  parties: vi.fn(),
}));

vi.mock('../../src/features/analytics/api', () => analytics);
vi.mock('../../src/features/weighbridge/api', () => weighing);
vi.mock('../../src/components/charts/EChart', () => ({
  EChart: () => <div data-testid="chart" />,
}));

const comparisonMetric = { current: 10, previous: 8, delta: 2, deltaBp: 2500 };
const comparison = {
  validTickets: comparisonMetric,
  inboundTickets: comparisonMetric,
  outboundTickets: comparisonMetric,
  inboundNetMilliTonne: comparisonMetric,
  outboundNetMilliTonne: comparisonMetric,
  netFlowMilliTonne: comparisonMetric,
  adjustmentNetMilliTonne: comparisonMetric,
  voidTickets: comparisonMetric,
};
const freshness = {
  dataThrough: '2026-11-03T08:40:00Z',
  lastReceivedAt: '2026-11-03T08:41:00Z',
  historyStart: '2025-12-20T01:00:00Z',
  siteReceipts: [],
};
const summary = {
  validTickets: 10,
  inboundTickets: 6,
  inboundNetMilliTonne: 100000,
  outboundTickets: 4,
  outboundNetMilliTonne: 30000,
  netFlowMilliTonne: 70000,
  activeSites: 2,
  activeSuppliers: 3,
  activeCustomers: 2,
  avgNetPerTicketMilliTonne: 13000,
  adjustedTickets: 5,
  adjustmentNetMilliTonne: 2000,
  adjustmentWeightRateBp: 200,
  adjustmentCoverageBp: 9000,
  voidTickets: 1,
  voidRateBp: 909,
};

describe('统计与分析页面', () => {
  it('经营总览展示核心指标和异常', async () => {
    weighing.sites.mockResolvedValue([]);
    weighing.materials.mockResolvedValue([]);
    weighing.categories.mockResolvedValue([]);
    analytics.analyticsOverview.mockResolvedValue({
      summary,
      comparison: { previous: comparison, year: comparison },
      trend: { granularity: 'month', points: [] },
      materialStructure: [{ key: 'C1', label: '原料', netMilliTonne: 100000, shareBp: 10000 }],
      topMaterials: [{ code: 'M1', name: '高粱', netMilliTonne: 100000, ticketCount: 6, shareBp: 10000 }],
      topParties: [{ code: 'P1', name: '供应商甲', direction: 'inbound', netMilliTonne: 100000, ticketCount: 6, shareBp: 10000 }],
      alerts: [{ type: 'void_rate', level: 'warning', count: 1, message: '作废率偏高' }],
      freshness,
    });
    renderWithProviders(<OverviewPage />, { route: '/analytics/overview' });
    expect(await screen.findByText('经营总览')).toBeInTheDocument();
    expect(await screen.findByText('有效车次')).toBeInTheDocument();
    expect(await screen.findByText('作废率偏高')).toBeInTheDocument();
    expect(analytics.analyticsOverview).toHaveBeenCalled();
  });

  it('进出厂分析展示周期汇总和时长口径', async () => {
    weighing.sites.mockResolvedValue([]);
    weighing.materials.mockResolvedValue([]);
    weighing.categories.mockResolvedValue([]);
    analytics.analyticsFlow.mockResolvedValue({
      summary: { ...summary, inboundAvgNetMilliTonne: 16666, outboundAvgNetMilliTonne: 7500 },
      comparison: { previous: comparison, year: comparison },
      trend: {
        granularity: 'day',
        points: [{
          period: '2026-11-01', periodStart: '2026-11-01', periodEnd: '2026-11-01',
          inboundTickets: 6, inboundNetMilliTonne: 100000, outboundTickets: 4, outboundNetMilliTonne: 30000,
          netFlowMilliTonne: 70000, avgNetPerTicketMilliTonne: 13000, voidTickets: 1, voidRateBp: 909,
        }],
      },
      siteComparison: [],
      duration: {
        sampleTickets: 10, medianSeconds: 1800, p90Seconds: 3600, maxSeconds: 7200,
        crossDayTickets: 1, crossDayRateBp: 1000, reopenedExcludedTickets: 1,
      },
      freshness,
    });
    renderWithProviders(<FlowPage />, { route: '/analytics/flow' });
    expect(await screen.findByText('进出厂分析')).toBeInTheDocument();
    expect(await screen.findByText('周期汇总')).toBeInTheDocument();
    expect(await screen.findByText('两次过磅间隔中位数')).toBeInTheDocument();
    expect(analytics.analyticsFlow).toHaveBeenCalled();
  });
});

describe('统计与分析页面（扩展）', () => {
  it('物料分析展示汇总和扣量', async () => {
    weighing.sites.mockResolvedValue([]);
    weighing.materials.mockResolvedValue([]);
    weighing.categories.mockResolvedValue([]);
    weighing.parties.mockResolvedValue([]);
    analytics.analyticsMaterials.mockResolvedValue({
      summary: {
        materialCount: 1, inboundNetMilliTonne: 100000, outboundNetMilliTonne: 0,
        adjustmentNetMilliTonne: 2000, adjustmentWeightRateBp: 200, adjustmentCoverageBp: 10000,
        lastIssuedAt: '2026-11-03T08:40:00Z',
      },
      records: [{
        materialCode: 'M1', materialName: '高粱', materialSpec: '散装', categoryCode: 'C1', categoryName: '原料',
        inboundTickets: 6, inboundNetMilliTonne: 100000, outboundTickets: 0, outboundNetMilliTonne: 0,
        totalTickets: 6, totalNetMilliTonne: 100000, avgNetPerTicketMilliTonne: 16666, shareBp: 10000,
        adjustedTickets: 4, adjustmentNetMilliTonne: 2000, adjustmentWeightRateBp: 200, adjustmentCoverageBp: 10000,
        lastIssuedAt: '2026-11-03T08:40:00Z',
      }],
      total: 1, page: 1, pageSize: 20, trend: [], structure: [], topAdjustments: [], freshness,
    });
    renderWithProviders(<MaterialsPage />, { route: '/analytics/materials' });
    expect(await screen.findByText('物料分析')).toBeInTheDocument();
    expect(await screen.findByText('高粱')).toBeInTheDocument();
    expect(await screen.findByText('物料汇总')).toBeInTheDocument();
  });

  it('供收方分析展示活跃供货方和集中度', async () => {
    weighing.sites.mockResolvedValue([]);
    weighing.materials.mockResolvedValue([]);
    weighing.categories.mockResolvedValue([]);
    weighing.parties.mockResolvedValue([]);
    const partyRow = {
      partyCode: 'P1', partyName: '供应商甲', direction: 'inbound', ticketCount: 6,
      netMilliTonne: 100000, avgNetPerTicketMilliTonne: 16666, shareBp: 10000,
      firstIssuedAt: '2026-11-01T02:00:00Z', lastIssuedAt: '2026-11-03T02:00:00Z',
      adjustedTickets: 4, adjustmentNetMilliTonne: 2000, adjustmentWeightRateBp: 200,
      adjustmentCoverageBp: 10000, voidTickets: 0, voidRateBp: 0,
    };
    analytics.analyticsParties.mockResolvedValue({
      summary: {
        activeParties: 1, totalNetMilliTonne: 100000, avgNetPerPartyMilliTonne: 100000,
        cr3Bp: 10000, cr5Bp: 10000, cr10Bp: 10000, hhi: 10000,
        newParties: 1, returningParties: 0, dormantParties: 0, coverageComplete: true, historyStart: '2025-12-20T01:00:00Z',
      },
      records: [partyRow], total: 1, page: 1, pageSize: 20, top: [partyRow],
      concentration: [{ label: '供应商甲', netMilliTonne: 100000, shareBp: 10000 }],
      freshness,
    });
    renderWithProviders(<PartiesPage />, { route: '/analytics/parties' });
    expect(await screen.findByText('供收方分析')).toBeInTheDocument();
    expect(await screen.findByText('活跃供货方')).toBeInTheDocument();
    expect(await screen.findByText('供应商甲')).toBeInTheDocument();
  });

  it('数据质量展示作废和扣量口径', async () => {
    weighing.sites.mockResolvedValue([]);
    weighing.materials.mockResolvedValue([]);
    weighing.categories.mockResolvedValue([]);
    weighing.parties.mockResolvedValue([]);
    analytics.analyticsQuality.mockResolvedValue({
      summary: {
        totalTickets: 10, validTickets: 9, voidTickets: 1, voidRateBp: 1000,
        reopenedTickets: 1, reopenRateBp: 1111, adjustedTickets: 4, adjustmentTicketRateBp: 4444,
        adjustmentNetMilliTonne: 2000, adjustmentWeightRateBp: 200, adjustmentCoverageBp: 10000,
        manualWeightTickets: 1, manualWeightRateBp: 1111, correctionTickets: 1, anomalyTickets: 2,
      },
      voidAnalysis: {
        trend: { granularity: 'day', points: [] },
        reasons: [{ reason: '更正', tickets: 1, shareBp: 10000 }],
        bySite: [], byParty: [], byMaterial: [],
      },
      reopenAnalysis: { trend: { granularity: 'day', points: [] }, chains: [], medianReopenLagSeconds: 60 },
      adjustmentAnalysis: { byCategory: [], byMaterial: [], byParty: [], modes: [], trend: { granularity: 'day', points: [] } },
      correctionAnalysis: { tickets: 1, grossCorrectionMilliTonne: 1000, tareCorrectionMilliTonne: 0, bySite: [] },
      missingFields: [],
      anomalies: [{ ticketNo: 'T1', siteCode: 'A', issuedAt: '2026-11-01T02:00:00Z', type: 'missing_driver', detail: '司机为空' }],
      issuerStats: [],
      freshness,
    });
    renderWithProviders(<QualityPage />, { route: '/analytics/quality' });
    expect(await screen.findByText('数据质量')).toBeInTheDocument();
    expect(await screen.findByText('作废分析')).toBeInTheDocument();
    expect(await screen.findByText('作废原因明细')).toBeInTheDocument();
  });
});
