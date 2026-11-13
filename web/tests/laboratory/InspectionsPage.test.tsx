import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InspectionsPage from '../../src/pages/laboratory/InspectionsPage';
import { renderWithProviders } from '../utils/renderWithProviders';
import { useAuthStore } from '../../src/stores/useAuthStore';
import type { Trip } from '../../src/features/grain-intake/api';

const api = vi.hoisted(() => ({ trips: vi.fn(), tripDefaults: vi.fn() }));
const wb = vi.hoisted(() => ({ sites: vi.fn() }));
vi.mock('../../src/features/grain-intake/api', () => api);
vi.mock('../../src/features/weighbridge/api', () => wb);
vi.mock('../../src/pages/laboratory/InspectionFormModal', () => ({ default: ({ trip }: { trip: Trip }) => <div>化验录入 {trip.number}</div> }));

const base: Trip = {
  id: 1, number: 'LZ-000001', version: 2, siteCode: 'F001', plate: '晋A12345', materialCode: 'M1', materialName: '高粱', partyCode: 'P1', partyName: '供货方',
  driver: '', driverPhone: '', contractNo: '', remark: '', effectiveInspectionId: null, effectiveSelectedAt: null, effectiveSelectedBy: null,
  effectiveConclusion: '', unloadingLocation: '', unloadedAt: null, unloadedBy: null, ticketId: null, createdBy: 1,
  createdAt: '2026-11-06T07:00:00Z', updatedAt: '2026-11-06T07:00:00Z', exitedAt: null, exitedBy: null, exitBasis: '', exitInspectionId: null,
  inspectionMethod: 'lab', visualConclusion: '', visualReason: '', visualInspectedAt: null, visualInspectedBy: null,
  stage: 'pending_inspection', inspectionId: null, inspectionConclusion: '',
};

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ permissions: ['laboratory:inspect'] });
  api.trips.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
  wb.sites.mockResolvedValue([{ code: 'F001', name: '测试厂', enabled: true }]);
});

describe('laboratory workbench', () => {
  it('only enables the inspection button for trips without a result', async () => {
    api.trips.mockResolvedValue({
      items: [
        { ...base, id: 1, number: 'LZ-000001' },
        { ...base, id: 2, number: 'LZ-000002', effectiveInspectionId: 11, inspectionId: 11, inspectionConclusion: 'accept', stage: 'accepted' },
      ],
      total: 2, page: 1, pageSize: 10,
    });
    const user = userEvent.setup();
    renderWithProviders(<InspectionsPage />);
    await screen.findByText('LZ-000001');
    const buttons = screen.getAllByRole('button', { name: '化验' });
    expect(buttons[0]).toBeEnabled();
    expect(buttons[1]).toBeDisabled();
    await user.click(buttons[0]);
    expect(screen.getByText('化验录入 LZ-000001')).toBeInTheDocument();
  });

  it('asks the backend to put uninspected trips first', async () => {
    renderWithProviders(<InspectionsPage />);
    await screen.findByText('LZ-000001').catch(() => undefined);
    expect(api.trips).toHaveBeenCalledWith(expect.objectContaining({ order: 'inspection_first' }));
  });

  it('renders site, result and registration date filters', async () => {
    renderWithProviders(<InspectionsPage />);
    expect(await screen.findByText('全部厂区')).toBeInTheDocument();
    expect(screen.getByText('全部化验结果')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('登记开始')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('登记结束')).toBeInTheDocument();
  });
});
