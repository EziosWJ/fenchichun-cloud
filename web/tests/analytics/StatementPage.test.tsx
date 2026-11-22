import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import StatementPage from '../../src/pages/analytics/StatementPage';
import StatementDetailPage from '../../src/pages/analytics/StatementDetailPage';
import { renderWithProviders } from '../utils/renderWithProviders';

const analytics = vi.hoisted(() => ({
  statementParties: vi.fn(),
  statementDetail: vi.fn(),
  exportStatementParties: vi.fn(),
  exportStatementDetail: vi.fn(),
}));
const weighing = vi.hoisted(() => ({
  sites: vi.fn(),
  materials: vi.fn(),
  tickets: vi.fn(),
}));

vi.mock('../../src/features/analytics/api', () => analytics);
vi.mock('../../src/features/weighbridge/api', () => weighing);
vi.mock('../../src/components/charts/EChart', () => ({
  EChart: ({ ariaLabel }: { ariaLabel?: string }) => <div role="img" aria-label={ariaLabel} />,
}));

const totals = {
  ticketCount: 2,
  grossMilliTonne: 50000,
  tareMilliTonne: 15000,
  netAdjustmentMilliTonne: 500,
  netMilliTonne: 34500,
};

describe('客户对账页面', () => {
  it('默认展示采购供应商汇总并保留两个方向切换', async () => {
    weighing.sites.mockResolvedValue([]);
    weighing.materials.mockResolvedValue([]);
    analytics.statementParties.mockResolvedValue({
      records: [{
        siteCode: 'F001', siteName: '一厂', partyCode: 'C-P-0001', partyName: '客户甲',
        ...totals, firstIssuedAt: '2026-11-01T02:00:00Z', lastIssuedAt: '2026-11-02T02:00:00Z',
      }],
      total: 1, page: 1, pageSize: 10,
      summary: { ...totals, partyCount: 1 },
    });
    renderWithProviders(<StatementPage />, { route: '/analytics/reconciliation' });
    await screen.findByText('客户甲');
    expect(screen.getByText('销售客户')).toBeInTheDocument();
    expect(screen.getByText('采购供应商')).toBeInTheDocument();
    expect(screen.getAllByText('34.5').length).toBeGreaterThan(0);
    await waitFor(() => expect(analytics.statementParties).toHaveBeenCalled());
  });

  it('展示跨日补单归属日、实际回磅和出单，并保留原主体', async () => {
    analytics.statementDetail.mockResolvedValue({
      siteCode: 'F001', siteName: '一厂', partyCode: 'C-P-0001', partyName: '客户甲',
      direction: 'outbound', from: '2026-11-01', to: '2026-11-30',
      ...totals,
      materials: [{ materialCode: 'M1', materialName: '高粱', materialSpec: '散装', ...totals }],
      daily: [{ date: '2026-11-20', ...totals }],
    });
    weighing.tickets.mockResolvedValue({
      items: [{
        siteCode: 'F001', status: 'valid', voidReason: null, voidedAt: null,
        ticket: {
          ticketNo: 'F001-20261120-0001', previousTicketNo: null, title: '酒厂过磅单', plate: '晋A1',
          direction: 'outbound', materialCode: 'M1', materialName: '高粱', materialSpec: '散装',
          partyCode: 'T-P-1120', partyName: '客户甲临时登记',
          entryType: 'manual_supplement', firstWeighedAt: '2026-11-20T08:20:00Z', secondWeighedAt: '2026-11-20T08:45:00Z',
          firstConfirmedAt: '2026-11-01T02:00:00Z', secondConfirmedAt: '2026-11-01T02:10:00Z',
          originalGross: '30', originalTare: '10', finalGross: '30', finalTare: '10', finalNet: '19.5',
          netAdjustment: '0.5', netAdjustmentMode: 'amount', netAdjustmentRateBp: null,
          netAdjustmentCategory: 'QUALITY', netAdjustmentCategoryName: '质量差',
          previousFinalGross: null, previousFinalTare: null, previousFinalNet: null,
          previousNetAdjustment: null, grossSource: 'collected', tareSource: 'collected',
          adjustmentRemark: '', adjustedBy: null, adjustedAt: null, driver: '', driverPhone: '',
          contactName: '', contactPhone: '', issuedAt: '2026-11-21T00:15:00Z', issuerName: '操作员',
        },
      }],
      total: 1, page: 1, pageSize: 10,
    });
    renderWithProviders(<StatementDetailPage />, {
      route: '/analytics/reconciliation/detail?siteCode=F001&partyCode=C-P-0001&direction=outbound&from=2026-11-01&to=2026-11-30',
      path: '/analytics/reconciliation/detail',
    });
    await screen.findByRole('heading', { level: 2, name: /客户甲.*C-P-0001/ }, { timeout: 5_000 });
    expect(screen.getAllByText('高粱 / 散装').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('净重趋势图')).toBeInTheDocument();
    expect(screen.getByText('人工补单')).toBeInTheDocument();
    expect(screen.getByText('2026-11-20')).toBeInTheDocument();
    expect(screen.getByText('回磅 2026-11-20 16:45')).toBeInTheDocument();
    expect(screen.getByText('2026-11-21 08:15')).toBeInTheDocument();
    fireEvent.click(screen.getByText('F001-20261120-0001'));
    expect(await screen.findByText('实际回磅时间')).toBeInTheDocument();
    expect(screen.getByText('客户甲 / C-P-0001')).toBeInTheDocument();
    expect(screen.getAllByText('客户甲临时登记 / T-P-1120')).toHaveLength(2);
  });

  it('展开对账单后按 ESC 收起', async () => {
    weighing.sites.mockResolvedValue([]);
    weighing.materials.mockResolvedValue([]);
    analytics.statementParties.mockResolvedValue({
      records: [{
        siteCode: 'F001', siteName: '一厂', partyCode: 'C-P-0001', partyName: '客户甲',
        ...totals, firstIssuedAt: '2026-11-01T02:00:00Z', lastIssuedAt: '2026-11-02T02:00:00Z',
      }],
      total: 1, page: 1, pageSize: 10,
      summary: { ...totals, partyCount: 1 },
    });
    analytics.statementDetail.mockResolvedValue({
      siteCode: 'F001', siteName: '一厂', partyCode: 'C-P-0001', partyName: '客户甲',
      direction: 'inbound', from: '2026-11-01', to: '2026-11-30',
      ...totals, materials: [], daily: [],
    });
    weighing.tickets.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });

    renderWithProviders(<StatementPage />, { route: '/analytics/reconciliation' });
    fireEvent.click(await screen.findByText('客户甲'));
    await screen.findByLabelText('关闭对账单');

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByLabelText('关闭对账单')).not.toBeInTheDocument());
  });
});
