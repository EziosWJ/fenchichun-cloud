import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { ApiError } from '../../src/lib/api/errors';
import TemporaryPartiesPage from '../../src/pages/weighbridge/TemporaryPartiesPage';
import { renderWithProviders } from '../utils/renderWithProviders';

const api = vi.hoisted(() => ({ temporaryParties: vi.fn(), parties: vi.fn(), decideTemporaryParty: vi.fn() }));
vi.mock('../../src/features/weighbridge/api', () => api);

it('在旧版确认被拒绝时展示新版登记，重新核对后才允许归并', async () => {
  const pending = {
    id: 4, siteCode: 'F001', siteName: '甲厂', temporaryCode: 'T-P-0001',
    name: '甲供应商', nature: 'individual', isSupplier: true, isCustomer: false, isCarrier: false,
    version: 1, status: 'pending', formalPartyCode: null, reason: '', receivedAt: '2026-11-18T03:10:00Z',
    processedBy: null, processedAt: null,
  };
  api.temporaryParties
    .mockResolvedValueOnce([pending])
    .mockResolvedValueOnce([{ ...pending, version: 2, name: '更正后的甲供应商' }])
    .mockResolvedValue([]);
  api.parties.mockResolvedValue([
    { ...pending, code: 'C-P-0001', nature: 'enterprise', enabled: true },
    { ...pending, name: '乙公司', code: 'C-P-0002', isSupplier: false, isCustomer: true, enabled: true },
  ]);
  api.decideTemporaryParty
    .mockRejectedValueOnce(new ApiError('client', '登记资料已更新，请重新核对后提交', { status: 409 }))
    .mockResolvedValueOnce(undefined);
  const user = userEvent.setup();
  const waitOptions = { timeout: 10_000 };
  renderWithProviders(<TemporaryPartiesPage />);

  await user.click(await screen.findByRole('button', { name: '核对 甲供应商' }, waitOptions));
  const dialog = within(await screen.findByRole('dialog', {}, waitOptions));
  expect(dialog.getByText('甲厂（F001）')).toBeInTheDocument();
  expect(await dialog.findByText('总部资料中有同名主体，请核实实际业务归属。', {}, waitOptions)).toBeInTheDocument();
  expect(dialog.getByRole('button', { name: '确认归并' })).toBeDisabled();

  await user.click(dialog.getByRole('radio', { name: '待补资料' }));
  expect(dialog.getByRole('textbox', { name: '处理原因' })).toBeVisible();
  await user.click(dialog.getByRole('radio', { name: '归并到正式主体' }));
  const search = dialog.getByRole('combobox', { name: '拟归并的正式主体' });
  await user.type(search, 'c-p-0002');
  expect(await screen.findByText('没有匹配的正式主体', {}, waitOptions)).toBeVisible();
  expect(screen.queryByText(/乙公司（C-P-0002）/)).not.toBeInTheDocument();

  const selectFormalParty = async () => {
    const input = dialog.getByRole('combobox', { name: '拟归并的正式主体' });
    await user.clear(input);
    await user.type(input, 'C-P-0001');
    await user.click(await screen.findByText('甲供应商（C-P-0001）', {
      selector: '.ant-select-item-option-content',
    }, waitOptions));
  };
  await selectFormalParty();
  expect(dialog.getByText('正式主体业务身份：供货商。确认后关联固定。')).toBeInTheDocument();
  await user.click(dialog.getByRole('button', { name: '确认归并' }));
  expect(api.decideTemporaryParty).toHaveBeenNthCalledWith(1, 4, expect.objectContaining({
    version: 1, status: 'merged', formalPartyCode: 'C-P-0001',
  }));
  expect(await dialog.findByText('登记资料已更新，请重新核对后提交', {}, waitOptions)).toBeInTheDocument();
  expect(dialog.getByRole('button', { name: '确认归并' })).toBeDisabled();

  await user.click(await dialog.findByRole('button', { name: '核对最新版' }, waitOptions));
  expect(dialog.getByText('更正后的甲供应商')).toBeInTheDocument();
  expect(dialog.getByRole('button', { name: '确认归并' })).toBeDisabled();
  await selectFormalParty();
  await user.click(dialog.getByRole('button', { name: '确认归并' }));
  expect(api.decideTemporaryParty).toHaveBeenNthCalledWith(2, 4, expect.objectContaining({
    version: 2, status: 'merged', formalPartyCode: 'C-P-0001',
  }));
});

it('按下拉框选中的状态筛选登记列表', async () => {
  const registrations = [
    ['pending', '待核对的供应商'],
    ['needs_info', '待补资料的供应商'],
    ['merged', '已归并的供应商'],
    ['disabled', '已停用的供应商'],
  ] as const;
  api.temporaryParties.mockReset().mockResolvedValue(registrations.map(([status, name], index) => ({
    id: index + 1, status, name, siteCode: 'F001', siteName: '甲厂', temporaryCode: `T-P-${index + 1}`,
    nature: 'individual', isSupplier: true, version: 1, receivedAt: '2026-11-18T03:10:00Z',
  })));
  const user = userEvent.setup();
  const waitOptions = { timeout: 10_000 };
  renderWithProviders(<TemporaryPartiesPage />);

  expect(await screen.findByText('待核对的供应商', {}, waitOptions)).toBeVisible();
  expect(screen.getByText('待补资料的供应商')).toBeVisible();
  expect(screen.queryByText('已归并的供应商')).not.toBeInTheDocument();

  const status = screen.getByRole('combobox', { name: '状态' });
  const selectStatus = async (label: string) => {
    await user.click(status.closest('.ant-select')!);
    await user.click(await screen.findByText(label, { selector: '.ant-select-item-option-content' }, waitOptions));
  };
  for (const [label, row] of [
    ['待确认', '待核对的供应商'],
    ['待补资料', '待补资料的供应商'],
    ['已归并', '已归并的供应商'],
    ['已停用', '已停用的供应商'],
  ]) {
    await selectStatus(label);
    expect(screen.getByText(row)).toBeVisible();
    for (const [, name] of registrations) {
      if (name !== row) expect(screen.queryByText(name)).not.toBeInTheDocument();
    }
  }

  await selectStatus('全部');
  for (const [, name] of registrations) expect(screen.getByText(name)).toBeVisible();
  await selectStatus('待处理');
  expect(screen.getByText('待补资料的供应商')).toBeVisible();
  expect(screen.queryByText('已停用的供应商')).not.toBeInTheDocument();
});
