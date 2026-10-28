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
});
