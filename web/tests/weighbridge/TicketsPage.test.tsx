import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TicketsPage from '../../src/pages/weighbridge/TicketsPage';
import { renderWithProviders } from '../utils/renderWithProviders';

const api = vi.hoisted(() => ({ tickets: vi.fn(), totals: vi.fn() }));
vi.mock('../../src/features/weighbridge/api', () => api);

describe('总部过磅单查询', () => {
  it('提示同步滞后并按厂区筛选已上传单据', async () => {
    api.tickets.mockResolvedValue({items:[],total:0,page:1,pageSize:10});
    api.totals.mockResolvedValue([]);
    renderWithProviders(<TicketsPage />);
    expect(screen.getByText(/数据可能尚未上传/)).toBeInTheDocument();
    await screen.findByText('当前筛选条件下暂无有效单');
    await userEvent.type(screen.getByLabelText('厂区编码'), 'F001');
    await waitFor(() => expect(api.tickets).toHaveBeenCalledWith(expect.objectContaining({siteCode:'F001'})));
  });

  it('版本 3 按 finalNet 展示最终净重和净重调整', async () => {
    api.tickets.mockResolvedValue({items:[{siteCode:'F001',status:'valid',voidReason:null,voidedAt:null,ticket:{
      ticketNo:'F001-20261029-0004',previousTicketNo:null,title:'酒厂过磅单',plate:'晋A78945',direction:'inbound',materialCode:'C-M-0010',materialName:'高粱',materialSpec:'散装',partyCode:'C-P-0081',partyName:'青岛青胜禾农产品有限公司',firstConfirmedAt:'2026-10-29T20:27:57+08:00',secondConfirmedAt:'2026-10-29T20:29:23+08:00',originalGross:'1.49',originalTare:'0.89',finalGross:'1.49',finalTare:'0.89',finalNet:'0.5',netAdjustment:'0.1',netAdjustmentMode:'amount',netAdjustmentRateBp:null,netAdjustmentCategory:'QUALITY',netAdjustmentCategoryName:'质量差',previousFinalGross:null,previousFinalTare:null,previousFinalNet:null,previousNetAdjustment:null,grossSource:'collected',tareSource:'collected',adjustmentRemark:'',adjustedBy:null,adjustedAt:null,driver:'',driverPhone:'',contactName:'',contactPhone:'',issuedAt:'2026-10-29T20:29:23+08:00',issuerName:'司磅员',
    }}],total:1,page:1,pageSize:10});
    api.totals.mockResolvedValue([{direction:'inbound',materialCode:'C-M-0010',partyCode:'C-P-0081',count:1,netMilliTonne:500}]);
    renderWithProviders(<TicketsPage />);
    await screen.findByText('晋A78945');
    await userEvent.click(screen.getByRole('button', { name: '详情' }));
    const netRow = screen.getByRole('rowheader', { name: '净重' }).closest('tr');
    expect(netRow).toHaveTextContent('0.600');
    expect(netRow).toHaveTextContent('0.500');
    expect(screen.getByText(/净重调整／方式/)).toHaveTextContent('0.1 吨（质量差） / 按吨');
  });
});
