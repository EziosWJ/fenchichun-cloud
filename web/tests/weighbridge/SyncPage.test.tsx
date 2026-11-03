import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SyncPage from '../../src/pages/weighbridge/SyncPage';
import { renderWithProviders } from '../utils/renderWithProviders';

const api = vi.hoisted(() => ({ sites: vi.fn(), tickets: vi.fn(), syncTicketReceipt: vi.fn() }));
vi.mock('../../src/features/weighbridge/api', () => api);

const digest = (letter: string) => letter.repeat(64);

function site(code: string, name: string) {
  return { code, name, enabled: true };
}

function ticketRecord(siteCode: string, ticketNo: string, plate: string) {
  return {
    siteCode,
    status: 'valid',
    ticket: {
      ticketNo,
      previousTicketNo: null,
      title: '酒厂过磅单',
      plate,
      direction: 'inbound',
      materialCode: 'C-M-0001',
      materialName: '高粱',
      materialSpec: '散装',
      partyCode: 'C-P-0001',
      partyName: '供货方',
      firstConfirmedAt: '2026-10-31T08:00:00+08:00',
      secondConfirmedAt: '2026-10-31T08:10:00+08:00',
      originalGross: '30',
      originalTare: '9',
      finalGross: '30',
      finalTare: '10',
      finalNet: '20',
      netAdjustment: '0',
      netAdjustmentMode: 'amount',
      netAdjustmentRateBp: null,
      netAdjustmentCategory: '',
      netAdjustmentCategoryName: '',
      previousFinalGross: '30',
      previousFinalTare: '10',
      previousFinalNet: '20',
      previousNetAdjustment: '0',
      grossSource: 'collected',
      tareSource: 'collected',
      adjustmentRemark: '',
      adjustedBy: null,
      adjustedAt: null,
      driver: '',
      driverPhone: '',
      contactName: '',
      contactPhone: '',
      issuedAt: '2026-10-31T08:10:00+08:00',
      issuerName: '操作员',
    },
    voidReason: null,
    voidedAt: null,
  };
}

function ticketReceipt(found: boolean, siteCode = 'F001', ticketNo = 'T1') {
  return {
    found,
    siteCode,
    ticketNo,
    status: found ? 'void' : null,
    ticket: found
      ? ticketRecord(siteCode, ticketNo, '晋A12345').ticket
      : null,
    voidReason: found ? '重量录入错误' : null,
    voidedBy: found ? '操作员' : null,
    voidedAt: found ? '2026-10-31T10:05:00+08:00' : null,
    latestDigest: found ? digest('b') : null,
    latestDigestVersion: found ? 1 : null,
    latestChangeType: found ? 'void' : null,
    latestReceivedAt: found ? '2026-10-31T10:05:00+08:00' : null,
    previousSiteCode: found ? 'F000' : null,
    previousTicketNo: found ? 'T0' : null,
    reopenedBy: null,
    changes: found
      ? [
          { digest: digest('a'), ticketNo, changeType: 'issue', digestVersion: 1, schemaVersion: 4, receivedAt: '2026-10-31T10:00:00+08:00' },
          { digest: digest('b'), ticketNo, changeType: 'void', digestVersion: 1, schemaVersion: 4, receivedAt: '2026-10-31T10:05:00+08:00' },
        ]
      : [],
  };
}

describe('云端厂云同步页面', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.sites.mockResolvedValue([site('F001', '甲厂'), site('SITE01', '乙厂')]);
    api.tickets.mockImplementation((params: { siteCode: string }) => Promise.resolve({
      items: [ticketRecord(params.siteCode, params.siteCode === 'SITE01' ? 'T2' : 'T1', params.siteCode === 'SITE01' ? '晋B22222' : '晋A12345')],
      total: 1,
      page: 1,
      pageSize: 10,
    }));
    api.syncTicketReceipt.mockImplementation((siteCode: string, ticketNo: string) => Promise.resolve(ticketReceipt(true, siteCode, ticketNo)));
  });

  it('按厂区 Tab 展示已同步单据，并从操作列查看同步详情', async () => {
    renderWithProviders(<SyncPage />);

    expect(await screen.findByText('甲厂')).toBeInTheDocument();
    expect(screen.getByText('乙厂')).toBeInTheDocument();
    expect(await screen.findByText('晋A12345')).toBeInTheDocument();
    expect(screen.queryByText('厂区最近接收')).not.toBeInTheDocument();
    expect(screen.queryByText('按单据核对')).not.toBeInTheDocument();

    await userEvent.click(screen.getByText('乙厂'));
    await waitFor(() => expect(api.tickets).toHaveBeenCalledWith(expect.objectContaining({ siteCode: 'SITE01' })));
    expect(await screen.findByText('晋B22222')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '详情' }));
    await waitFor(() => expect(api.syncTicketReceipt).toHaveBeenCalledWith('SITE01', 'T2'));
    expect(await screen.findAllByText(/最新变化摘要/)).not.toHaveLength(0);
    expect(screen.getByRole('button', { name: 'F000 / T0' })).toBeInTheDocument();
    expect(screen.getAllByText('作废')).not.toHaveLength(0);
    expect(screen.getByText('重量录入错误')).toBeInTheDocument();
    expect(screen.getAllByText('v4')).not.toHaveLength(0);
  });

  it('云端缺单时在详情弹窗明确提示', async () => {
    api.syncTicketReceipt.mockImplementation((siteCode: string, ticketNo: string) => Promise.resolve(ticketReceipt(false, siteCode, ticketNo)));
    renderWithProviders(<SyncPage />);
    expect(await screen.findByText('晋A12345')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '详情' }));

    expect(await screen.findByText(/云端未找到 F001 \/ T1/)).toBeInTheDocument();
    expect(screen.queryByText(/最新变化摘要/)).not.toBeInTheDocument();
  });

  it('厂区加载失败时展示错误和重试', async () => {
    api.sites.mockRejectedValue(new Error('network down'));
    renderWithProviders(<SyncPage />);

    expect(await screen.findByText(/厂区加载失败/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  });
});
