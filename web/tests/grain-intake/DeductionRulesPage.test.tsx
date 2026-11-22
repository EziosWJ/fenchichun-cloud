import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DeductionRulesPage from '../../src/pages/grain-intake/DeductionRulesPage';
import { checkRanges, deductionMilliTonnes, matchRange } from '../../src/pages/grain-intake/deductionRuleDraft';
import { renderWithProviders } from '../utils/renderWithProviders';
import { useAuthStore } from '../../src/stores/useAuthStore';

const api = vi.hoisted(() => ({
  deductionCategories: vi.fn(),
  deductionRules: vi.fn(),
  saveDeductionRule: vi.fn(),
  deleteDeductionRule: vi.fn(),
}));
const wb = vi.hoisted(() => ({ materials: vi.fn() }));
vi.mock('../../src/features/deduction/api', () => api);
vi.mock('../../src/features/weighbridge/api', () => wb);

const rule = {
  id: 7, code: 'DR-LOCAL-GL-WATER', materialCode: 'C-M-0010', materialName: '高粱',
  categoryCode: 'WATER', categoryName: '水分', mode: 'percent' as const, basisField: 'moisture' as const,
  amountMilliTonne: 0, version: 1, effectiveFrom: '2026-01-01T00:00:00Z', enabled: true, remark: '',
  ranges: [{ minValue: '13', maxValue: '14', rateBp: 100, sortOrder: 1 }],
};
const visualRule = {
  ...rule, id: 8, code: 'DR-LOCAL-WOOD-WATER', materialCode: 'C-M-0020', materialName: '木板',
};

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ permissions: ['grain-intake:deduction-rules'] });
  api.deductionCategories.mockResolvedValue([
    { code: 'WATER', name: '水分', enabled: true, sortOrder: 1 },
    { code: 'OTHER', name: '其他', enabled: true, sortOrder: 3 },
  ]);
  api.deductionRules.mockResolvedValue([rule]);
  api.deleteDeductionRule.mockResolvedValue(undefined);
  wb.materials.mockResolvedValue([
    { code: 'C-M-0010', name: '高粱', spec: '', categoryCode: null, inspectionMethod: 'lab', remark: '', enabled: true },
    { code: 'C-M-0020', name: '木板', spec: '', categoryCode: null, inspectionMethod: 'visual', remark: '', enabled: true },
  ]);
});

describe('deduction rules page', () => {
  it('shows delete action and removes a rule version after confirmation', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DeductionRulesPage />);
    await screen.findByText('[13%, 14%) 扣 1.00%');
    expect(screen.queryByText(/按物料配置水分、杂质等扣减类别/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '删除' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: '删除' }));
    await waitFor(() => expect(api.deleteDeductionRule).toHaveBeenCalledWith(7));
  });

  it('keeps the rule form focused on category, percentage and enabled state', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DeductionRulesPage />);
    await screen.findByText('[13%, 14%) 扣 1.00%');
    await user.click(screen.getByRole('button', { name: '新增规则' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText('检测值依据')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('生效日期')).not.toBeInTheDocument();
    expect(within(dialog).getByText('按百分比扣减')).toBeInTheDocument();
    expect(within(dialog).getByText('启用')).toBeInTheDocument();
  });

  it('marks rules for visual-inspection materials as inactive', async () => {
    api.deductionRules.mockResolvedValue([rule, visualRule]);
    const user = userEvent.setup();
    renderWithProviders(<DeductionRulesPage />);
    await screen.findByText('木板');
    expect(screen.getByText('启用 · 不生效')).toBeInTheDocument();
    const visualRow = screen.getByText('木板').closest('tr');
    expect(visualRow).not.toBeNull();
    await user.click(within(visualRow!).getByRole('button', { name: '编辑' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('该物料的扣减规则不会生效')).toBeInTheDocument();
  });
});

it('试算采用左闭右开区间，断档不匹配，扣减在半千克处向上舍入', () => {
  const first = { minValue: '14', maxValue: '16', ratePercent: 2 };
  const second = { minValue: '17', maxValue: '', ratePercent: 3 };
  expect(checkRanges([first, second])).toEqual({ complete: true, gaps: ['[16%, 17%)'], error: undefined });
  expect(matchRange([first, second], 14)).toBe(0);
  expect(matchRange([first, second], 16)).toBe(-1);
  expect(matchRange([first, second], 17)).toBe(1);
  expect(checkRanges([first, { ...second, minValue: '16' }]).gaps).toEqual([]);
  expect(checkRanges([first, { ...second, minValue: '15.999999' }]).error).toContain('重叠');
  expect(checkRanges([{ ...first, maxValue: '' }, second]).error).toContain('只有最后一个区间');
  expect(deductionMilliTonnes(20.025, 2)).toBe(401);
});
