import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DistillerGrainsPage from '../../src/pages/distiller-grains/DistillerGrainsPage';
import { renderWithProviders } from '../utils/renderWithProviders';

const api = vi.hoisted(() => ({ distillerGrainsStats: vi.fn(), exportDistillerGrains: vi.fn() }));
const download = vi.hoisted(() => ({ downloadBlob: vi.fn() }));
vi.mock('../../src/features/distiller-grains/api', () => api);
vi.mock('../../src/features/analytics/download', () => download);

const today = {
  from: '2026-11-24',
  to: '2026-11-24',
  totalNetMilliTonne: 73400,
  ticketCount: 3,
  days: [{ date: '2026-11-24', ticketCount: 3, netMilliTonne: 73400 }],
  records: [
    { ticketNo: 'T1', issuedAt: '2026-11-24T08:10:00+08:00', plate: '晋A8K201', partyCode: 'C-P-0031', partyName: '张帅', netMilliTonne: 24500 },
    { ticketNo: 'T2', issuedAt: '2026-11-24T10:40:00+08:00', plate: '晋A6M738', partyCode: 'C-P-0066', partyName: '郝耀忠', netMilliTonne: 30200 },
    { ticketNo: 'T3', issuedAt: '2026-11-24T14:05:00+08:00', plate: '晋A3T526', partyCode: 'C-P-0031', partyName: '张帅', netMilliTonne: 18700 },
  ],
  customers: [
    { code: 'C-P-0031', name: '张帅' },
    { code: 'C-P-0066', name: '郝耀忠' },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  api.distillerGrainsStats.mockResolvedValue(today);
  api.exportDistillerGrains.mockResolvedValue(new Blob(['a']));
});

describe('酒糟统计', () => {
  it('本日出库展示合计吨数、车次与逐车记录', async () => {
    renderWithProviders(<DistillerGrainsPage />, { route: '/distiller-grains/today' });
    expect(await screen.findByText('73.40')).toBeInTheDocument();
    expect(screen.getByText('共 3 车')).toBeInTheDocument();
    expect(screen.getByText('晋A8K201')).toBeInTheDocument();
    expect(screen.getAllByText('张帅').length).toBeGreaterThan(0);
    expect(api.distillerGrainsStats).toHaveBeenCalledWith(expect.objectContaining({ period: 'today' }));
  });

  it('本周出库点击某一天弹出该日明细', async () => {
    api.distillerGrainsStats.mockResolvedValue({
      ...today,
      from: '2026-11-23',
      to: '2026-11-24',
      totalNetMilliTonne: 132900,
      ticketCount: 5,
      days: [
        { date: '2026-11-23', ticketCount: 2, netMilliTonne: 59500 },
        { date: '2026-11-24', ticketCount: 3, netMilliTonne: 73400 },
      ],
    });
    const user = userEvent.setup();
    renderWithProviders(<DistillerGrainsPage />, { route: '/distiller-grains/week' });
    const row = await screen.findByRole('button', { name: /11月24日/ });
    await user.click(row);
    expect(await screen.findByText('11月24日出库明细')).toBeInTheDocument();
    expect(api.distillerGrainsStats).toHaveBeenCalledWith(expect.objectContaining({ period: 'range', from: '2026-11-24', to: '2026-11-24' }));
  });

  it('导出当前筛选为 Excel 可打开的表格', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DistillerGrainsPage />, { route: '/distiller-grains/today' });
    await screen.findByText('73.40');
    await user.click(screen.getByRole('button', { name: '导出 Excel' }));
    await waitFor(() => expect(download.downloadBlob).toHaveBeenCalledWith(expect.any(Blob), '酒糟统计-2026-11-24至2026-11-24.csv'));
    expect(api.exportDistillerGrains).toHaveBeenCalledWith(expect.objectContaining({ period: 'today' }));
  });

  it('详细查询提供开始和结束日期并按时间段请求', async () => {
    renderWithProviders(<DistillerGrainsPage />, { route: '/distiller-grains/detail' });
    expect(await screen.findByText('开始日期')).toBeInTheDocument();
    expect(screen.getByText('结束日期')).toBeInTheDocument();
    expect(api.distillerGrainsStats).toHaveBeenCalledWith(expect.objectContaining({ period: 'range', from: expect.any(String), to: expect.any(String) }));
  });
});
