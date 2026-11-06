import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SyncPage from '../../src/pages/weighbridge/SyncPage';
import { renderWithProviders } from '../utils/renderWithProviders';

const api = vi.hoisted(() => ({ syncSiteReceipts: vi.fn(), syncTicketReceipt: vi.fn() }));
vi.mock('../../src/features/weighbridge/api', () => api);

const digest = (letter: string) => letter.repeat(64);

function siteReceipt() {
  return {
    siteCode: 'F001',
    siteName: '甲厂',
    enabled: true,
    receivedChanges: 2,
    lastReceivedAt: '2026-10-31T10:05:00+08:00',
    lastTicketNo: 'T1',
    lastChangeType: 'void',
    lastIssuedSiteCode: 'F000',
  };
}

function ticketReceipt(found: boolean, siteCode = 'F001', ticketNo = 'T1') {
  return {
    found,
    siteCode,
    ticketNo,
    status: found ? 'void' : null,
    ticket: found
      ? {
          ticketNo: 'T1', previousTicketNo: 'T0', title: '酒厂过磅单', plate: '晋A12345', direction: 'inbound',
          materialCode: 'C-M-0001', materialName: '高粱', materialSpec: '散装', partyCode: 'C-P-0001', partyName: '供货方',
          firstConfirmedAt: '2026-10-31T08:00:00+08:00', secondConfirmedAt: '2026-10-31T08:10:00+08:00',
          originalGross: '30', originalTare: '9', finalGross: '30', finalTare: '10', finalNet: '20',
          netAdjustment: '0', netAdjustmentMode: 'amount', netAdjustmentRateBp: null,
          netAdjustmentCategory: '', netAdjustmentCategoryName: '',
          previousFinalGross: '30', previousFinalTare: '10', previousFinalNet: '20', previousNetAdjustment: '0',
          grossSource: 'collected', tareSource: 'collected', adjustmentRemark: '', adjustedBy: null, adjustedAt: null,
          driver: '', driverPhone: '', contactName: '', contactPhone: '',
          issuedAt: '2026-10-31T08:10:00+08:00', issuerName: '操作员',
        }
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
          { digest: digest('a'), ticketNo: 'T1', changeType: 'issue', digestVersion: 1, schemaVersion: 4, receivedAt: '2026-10-31T10:00:00+08:00' },
          { digest: digest('b'), ticketNo: 'T1', changeType: 'void', digestVersion: 1, schemaVersion: 4, receivedAt: '2026-10-31T10:05:00+08:00' },
        ]
      : [],
  };
}

describe('云端厂云同步页面', () => {
  it('再次查询同一单据时刷新云端状态', async () => {
    api.syncTicketReceipt.mockReset();
    api.syncSiteReceipts.mockResolvedValue([]);
    api.syncTicketReceipt.mockResolvedValueOnce(ticketReceipt(true)).mockResolvedValueOnce(ticketReceipt(false));
    renderWithProviders(<SyncPage />);
    await userEvent.type(screen.getByLabelText('出单厂区编码'), 'F001');
    await userEvent.type(screen.getByLabelText('单号'), 'T1');
    await userEvent.click(screen.getByRole('button', { name: '查询' }));
    await screen.findByText('重量录入错误');
    await userEvent.click(screen.getByRole('button', { name: '查询' }));
    expect(await screen.findByText(/云端未找到 F001 \/ T1/)).toBeInTheDocument();
    expect(api.syncTicketReceipt).toHaveBeenCalledTimes(2);
  });

  it('只展示云端接收结果，并按单据核对变化与原单关联', async () => {
    api.syncSiteReceipts.mockResolvedValue([siteReceipt()]);
    api.syncTicketReceipt.mockResolvedValue(ticketReceipt(true));
    renderWithProviders(<SyncPage />);

    expect(screen.getByText(/不代表厂端在线/)).toBeInTheDocument();
    expect(screen.getByText(/不展示厂端待上传数量和在线状态/)).toBeInTheDocument();
    await screen.findByText('甲厂');
    expect(screen.getByText('F000')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('出单厂区编码'), 'F001');
    await userEvent.type(screen.getByLabelText('单号'), 'T1');
    await userEvent.click(screen.getByRole('button', { name: '查询' }));

    await waitFor(() => expect(api.syncTicketReceipt).toHaveBeenCalledWith('F001', 'T1'));
    expect((await screen.findAllByText(/最新变化摘要/)).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'F000 / T0' })).toBeInTheDocument();
    expect(screen.getAllByText('作废').length).toBeGreaterThan(0);
    expect(screen.getByText('重量录入错误')).toBeInTheDocument();
    expect(screen.getAllByText('v4').length).toBeGreaterThan(0);
  });

  it('云端缺单时明确提示，而不是冒充一致', async () => {
    api.syncSiteReceipts.mockResolvedValue([]);
    api.syncTicketReceipt.mockImplementation((siteCode: string, ticketNo: string) => Promise.resolve(ticketReceipt(false, siteCode, ticketNo)));
    renderWithProviders(<SyncPage />);
    await screen.findByText('尚未登记厂区，或云端还没有可展示的接收记录');

    await userEvent.type(screen.getByLabelText('出单厂区编码'), 'F001');
    await userEvent.type(screen.getByLabelText('单号'), 'T9');
    await userEvent.click(screen.getByRole('button', { name: '查询' }));

    expect(await screen.findByText(/云端未找到 F001 \/ T9/)).toBeInTheDocument();
    expect(screen.queryByText(/最新变化摘要/)).not.toBeInTheDocument();
  });

  it('厂区接收情况加载失败时展示错误和重试', async () => {
    api.syncSiteReceipts.mockRejectedValue(new Error('network down'));
    renderWithProviders(<SyncPage />);
    expect(await screen.findByText(/厂区接收情况加载失败/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  });
});
