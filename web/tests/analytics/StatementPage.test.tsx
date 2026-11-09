import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
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

  it('展示单个往来方的物料和日期汇总', async () => {
    analytics.statementDetail.mockResolvedValue({
      siteCode: 'F001', siteName: '一厂', partyCode: 'C-P-0001', partyName: '客户甲',
      direction: 'outbound', from: '2026-11-01', to: '2026-11-30',
      ...totals,
      materials: [{ materialCode: 'M1', materialName: '高粱', materialSpec: '散装', ...totals }],
      daily: [{ date: '2026-11-01', ...totals }],
    });
    weighing.tickets.mockResolvedValue({
      items: [{
        siteCode: 'F001', status: 'valid', voidReason: null, voidedAt: null,
        ticket: {
          ticketNo: 'F001-20261101-0001', previousTicketNo: null, title: '酒厂过磅单', plate: '晋A1',
          direction: 'outbound', materialCode: 'M1', materialName: '高粱', materialSpec: '散装',
          partyCode: 'C-P-0001', partyName: '客户甲',
          firstConfirmedAt: '2026-11-01T02:00:00Z', secondConfirmedAt: '2026-11-01T02:10:00Z',
          originalGross: '30', originalTare: '10', finalGross: '30', finalTare: '10', finalNet: '19.5',
          netAdjustment: '0.5', netAdjustmentMode: 'amount', netAdjustmentRateBp: null,
          netAdjustmentCategory: 'QUALITY', netAdjustmentCategoryName: '质量差',
          previousFinalGross: null, previousFinalTare: null, previousFinalNet: null,
          previousNetAdjustment: null, grossSource: 'collected', tareSource: 'collected',
          adjustmentRemark: '', adjustedBy: null, adjustedAt: null, driver: '', driverPhone: '',
          contactName: '', contactPhone: '', issuedAt: '2026-11-01T02:10:00Z', issuerName: '操作员',
        },
      }],
      total: 1, page: 1, pageSize: 10,
    });
    renderWithProviders(<StatementDetailPage />, {
      route: '/analytics/reconciliation/detail?siteCode=F001&partyCode=C-P-0001&direction=outbound&from=2026-11-01&to=2026-11-30',
      path: '/analytics/reconciliation/detail',
    });
    await screen.findByRole('heading', { level: 2, name: /客户甲.*C-P-0001/ });
    expect(screen.getAllByText('高粱 / 散装').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('净重趋势图')).toBeInTheDocument();
    expect(screen.getByText('F001-20261101-0001')).toBeInTheDocument();
  });
});
