import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InspectionsPage from '../../src/pages/laboratory/InspectionsPage';
import { renderWithProviders } from '../utils/renderWithProviders';
import type { Inspection } from '../../src/features/laboratory/api';

const api = vi.hoisted(() => ({ inspections: vi.fn(), inspection: vi.fn(), saveInspection: vi.fn(), inspectionAction: vi.fn() }));
vi.mock('../../src/features/laboratory/api', () => api);
vi.mock('../../src/features/weighbridge/api', () => ({ materials: async () => [], parties: async () => [], sites: async () => [] }));
const confirmed: Inspection = {
  id: 1, number: 'HY-000001', status: 'confirmed', version: 3, originalId: null,
  plate: '晋A12345', materialCode: 'M1', materialName: '高粱', partyCode: 'P1', partyName: '供货方',
  siteCode: 'F001', driver: '', driverPhone: '', contractNo: '', moisture: '14.1', impurity: '0', bulkDensity: '750', conclusion: 'accept', reason: '', remark: '',
  createdBy: 1, createdAt: '2026-11-06T08:00:00Z', updatedAt: '2026-11-06T08:00:00Z', confirmedBy: 1, confirmedAt: '2026-11-06T08:00:00Z', voidedBy: null, voidedAt: null, voidReason: '',
};
beforeEach(() => {
  vi.clearAllMocks();
  api.inspections.mockResolvedValue({ items: [confirmed], total: 1, page: 1, pageSize: 10 });
  api.inspection.mockResolvedValue(confirmed);
  api.inspectionAction.mockResolvedValue({ ...confirmed, status: 'void' });
  api.saveInspection.mockResolvedValue({ ...confirmed, status: 'draft' });
});
describe('independent laboratory inspections', () => {
  it('preserves confirmed results and requires a reason before voiding', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InspectionsPage />);
    await screen.findByText('HY-000001');
    expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '作废' }));
    expect(screen.getByRole('button', { name: '确认作废' })).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: '作废原因' }), '检测值录错');
    await user.click(screen.getByRole('button', { name: '确认作废' }));
    await waitFor(() => expect(api.inspectionAction).toHaveBeenCalledWith(confirmed, 'void', '检测值录错'));
  });
  it('allows an incomplete draft without starting a flow', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InspectionsPage />);
    await user.click(screen.getByRole('button', { name: '新建化验单' }));
    await user.click(screen.getByRole('button', { name: '保存草稿' }));
    await waitFor(() => expect(api.saveInspection).toHaveBeenCalledWith(expect.objectContaining({ plate: '', moisture: '', partyCode: '', conclusion: '' }), undefined));
  });
});
