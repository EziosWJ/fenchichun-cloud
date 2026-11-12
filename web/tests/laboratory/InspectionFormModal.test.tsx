import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InspectionFormModal from '../../src/pages/laboratory/InspectionFormModal';
import { renderWithProviders } from '../utils/renderWithProviders';
import type { Trip } from '../../src/features/grain-intake/api';

const api = vi.hoisted(() => ({ createInspection: vi.fn(), deductionPreview: vi.fn() }));
vi.mock('../../src/features/laboratory/api', () => ({ createInspection: api.createInspection }));
vi.mock('../../src/features/deduction/api', () => ({ deductionPreview: api.deductionPreview }));

const trip: Trip = {
  id: 1, number: 'LZ-000001', version: 2, siteCode: 'SITE01', plate: '鲁A11111', materialCode: 'C-M-0010', materialName: '高粱',
  partyCode: 'C-P-0001', partyName: '供货方', driver: '司机', driverPhone: '13800000000', contractNo: '', remark: '',
  effectiveInspectionId: null, effectiveSelectedAt: null, effectiveSelectedBy: null, effectiveConclusion: '',
  unloadingLocation: '', unloadedAt: null, unloadedBy: null, ticketId: null, createdBy: 1,
  createdAt: '2026-11-12T02:00:00Z', updatedAt: '2026-11-12T02:00:00Z', exitedAt: null, exitedBy: null,
  exitBasis: '', exitInspectionId: null, inspectionMethod: 'lab', visualConclusion: '', visualReason: '',
  visualInspectedAt: null, visualInspectedBy: null, stage: 'pending_inspection', inspectionId: null, inspectionConclusion: '',
};

beforeEach(() => {
  vi.clearAllMocks();
  api.createInspection.mockResolvedValue({});
  api.deductionPreview.mockResolvedValue([{
    ruleId: 7, ruleCode: 'DR-LOCAL-GL-WATER', ruleVersion: 1, categoryCode: 'WATER', categoryName: '水分',
    mode: 'percent', basisField: 'moisture', basisValue: '13.8', amountMilliTonne: 0, rateBp: 100,
    explanation: '水分 13.8 落入 13.000000 至 14.000000 区间',
  }]);
});

describe('inspection result entry', () => {
  it('records capacity, omits impurity and previews moisture deduction rules', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InspectionFormModal trip={trip} open onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByText('容量（g/L）')).toBeInTheDocument();
    expect(screen.queryByText('杂质（%）')).not.toBeInTheDocument();
    expect(screen.getByText('鲁A11111')).toBeInTheDocument();
    expect(screen.getByText('高粱')).toBeInTheDocument();
    expect(screen.getByText('SITE01')).toBeInTheDocument();
    expect(screen.getByText('供货方')).toBeInTheDocument();
    expect(screen.getByTitle('流转单号 / 车次')).toBeInTheDocument();
    expect(screen.getByTitle('车牌')).toBeInTheDocument();
    expect(screen.getByTitle('粮种')).toBeInTheDocument();
    expect(screen.getByTitle('供应商')).toBeInTheDocument();
    expect(screen.queryByText('单据信息')).not.toBeInTheDocument();
    expect(screen.getByText('其他信息')).toBeInTheDocument();
    await user.type(screen.getByRole('spinbutton', { name: '水分（%）' }), '13.8');
    await waitFor(() => expect(api.deductionPreview).toHaveBeenCalledWith('C-M-0010', '13.8'));
    expect(await screen.findByText('净重扣减比例')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '净重扣减比例说明' })).toBeInTheDocument();
    await screen.findByText('1.00%');
    expect(screen.queryByText(/落入/)).not.toBeInTheDocument();
    await user.type(screen.getByRole('spinbutton', { name: '容量（g/L）' }), '750');
    await user.click(screen.getByRole('button', { name: '接收' }));
    await waitFor(() => expect(api.createInspection).toHaveBeenCalled());
    expect(api.createInspection.mock.calls[0][0]).toMatchObject({
      tripId: 1, moisture: expect.stringMatching(/^13\.8/), bulkDensity: '750', conclusion: 'accept',
    });
    expect(api.createInspection.mock.calls[0][0]).not.toHaveProperty('impurity');
  });

  it('marks the reject reason field as required', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InspectionFormModal trip={trip} open onClose={() => {}} onSaved={() => {}} />);
    await user.type(screen.getByRole('spinbutton', { name: '水分（%）' }), '13.8');
    await user.type(screen.getByRole('spinbutton', { name: '容量（g/L）' }), '750');
    await user.click(screen.getByRole('button', { name: '拒收' }));
    await user.click(screen.getByRole('button', { name: '确认拒收' }));
    const error = await screen.findByText('请填写拒收原因');
    expect(error.closest('.ant-form-item')).toHaveClass('ant-form-item-has-error');
    expect(api.createInspection).not.toHaveBeenCalled();
  });
});
