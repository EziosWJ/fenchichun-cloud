import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TripWorkspace from '../../src/pages/grain-intake/TripWorkspace';
import { renderWithProviders } from '../utils/renderWithProviders';
import { useAuthStore } from '../../src/stores/useAuthStore';
import type { Trip, TripDetail } from '../../src/features/grain-intake/api';
import type { CurrentUserMenu } from '../../src/types/auth';

const api = vi.hoisted(() => ({ tripDetail: vi.fn(), tripAction: vi.fn(), ticketCandidates: vi.fn() }));
vi.mock('../../src/features/grain-intake/api', () => ({ ...api, stageLabel: (v: string) => v }));
vi.mock('../../src/pages/laboratory/InspectionFormModal', () => ({ default: () => <div>化验录入</div> }));
vi.mock('../../src/features/laboratory/api', () => ({ inspections: vi.fn(), createInspection: vi.fn() }));
const trip: Trip = {
  id: 1, number: 'LZ-000001', version: 9, siteCode: 'F001', plate: '晋A12345', materialCode: 'M1', materialName: '高粱', partyCode: 'P1', partyName: '供货方', driver: '', driverPhone: '', contractNo: '', remark: '',
  inspectionMethod: 'lab', visualConclusion: '', visualReason: '', visualInspectedAt: null, visualInspectedBy: null,
  inspectionId: 11, inspectionConclusion: 'accept',
  effectiveInspectionId: 11, effectiveSelectedAt: '2026-11-06T08:00:00Z', effectiveSelectedBy: 1, effectiveConclusion: 'accept', unloadingLocation: '东仓', unloadedAt: '2026-11-06T09:00:00Z', unloadedBy: 1,
  ticketId: 21, createdBy: 1, createdAt: '2026-11-06T07:00:00Z', updatedAt: '2026-11-06T09:00:00Z', exitedAt: null, exitedBy: null, exitBasis: '', exitInspectionId: null, stage: 'permit_approved',
};
function evidence(): TripDetail {
  return {
    trip: { ...trip },
    inspections: [{ id: 11, number: 'HY-000001', tripId: 1, siteCode: trip.siteCode, status: 'confirmed', version: 2, originalId: null, plate: trip.plate, materialCode: 'M1', materialName: '高粱', partyCode: 'P1', partyName: '供货方', moisture: '14.1', impurity: '', bulkDensity: '750', conclusion: 'accept', reason: '', remark: '', driver: '', driverPhone: '', contractNo: '', createdBy: 1, createdAt: trip.createdAt, updatedAt: trip.updatedAt, confirmedBy: 1, confirmedAt: trip.createdAt, voidedBy: null, voidedAt: null, voidReason: '' }],
    permit: { id: 31, number: 'CM-000001', tripId: 1, version: 2, status: 'approved', inspectionId: 11, ticketId: 21, createdBy: 1, createdAt: trip.createdAt, approvedBy: 1, approvedAt: trip.updatedAt, tripNumber: trip.number, plate: trip.plate, siteCode: trip.siteCode, exitedAt: null, stage: 'permit_approved' },
    ticket: null, events: [], deductions: [],
  };
}
function menu(path: string): CurrentUserMenu {
  return { id: 1, parentId: 0, menuName: '核验', menuType: 'MENU', path, component: null, icon: null, permissionCode: null, sortOrder: 1, visible: 1, children: [] };
}
beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ menus: [menu('/grain-intake/permits')], permissions: ['grain-intake:release','grain-intake:approve-permit','grain-intake:issue-permit','grain-intake:trip-edit','grain-intake:unload','grain-intake:ticket','grain-intake:visual','laboratory:inspect'] });
  api.tripDetail.mockResolvedValue(evidence());
  api.tripAction.mockResolvedValue(evidence());
});
describe('exit evidence', () => {
  it('requires explicit confirmation of actual exit, using the viewed basis and version', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TripWorkspace gate />, { route: '/grain-intake/permits/1', path: '/grain-intake/permits/:id' });
    await screen.findByText('出厂核验 · LZ-000001');
    await user.click(screen.getByRole('tab', { name: '出门证与出厂' }));
    expect(api.tripAction).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '确认出厂' }));
    expect(api.tripAction).not.toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: /^确\s*认$/ }));
    await waitFor(() => expect(api.tripAction).toHaveBeenCalledWith(expect.objectContaining({ id: 1, version: 9 }), 'confirm-exit', { basis: 'permit', permitId: 31 }));
  });
  it('shows visual rejection evidence and lets gate confirm exit without a lab report', async () => {
    const value = evidence();
    value.trip = { ...value.trip, inspectionMethod: 'visual', visualConclusion: 'reject', visualReason: '夹杂异物', visualInspectedAt: trip.createdAt, visualInspectedBy: 1, effectiveInspectionId: null, effectiveConclusion: 'reject', stage: 'rejected', ticketId: null, unloadedAt: null };
    value.inspections = []; value.permit = null;
    api.tripDetail.mockResolvedValue(value);
    const user = userEvent.setup();
    renderWithProviders(<TripWorkspace gate />, { route: '/grain-intake/permits/1', path: '/grain-intake/permits/:id' });
    await screen.findByText('夹杂异物');
    await user.click(screen.getByRole('tab', { name: '出门证与出厂' }));
    await user.click(screen.getByRole('button', { name: '确认拒收出厂' }));
    await user.click(await screen.findByRole('button', { name: /^确\s*认$/ }));
    await waitFor(() => expect(api.tripAction).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 'confirm-exit', expect.objectContaining({ basis: 'rejection' })));
  });
  it('guides the next step and jumps to the matching tab', async () => {
    const value = evidence();
    value.trip.stage = 'pending_unload';
    value.trip.unloadedAt = null;
    value.trip.ticketId = null;
    api.tripDetail.mockResolvedValue(value);
    renderWithProviders(<TripWorkspace />, { route: '/grain-intake/trips/1', path: '/grain-intake/trips/:id' });
    await screen.findByText('下一步：确认现场卸货');
    const weighingTab = screen.getByRole('tab', { name: '卸货与磅单' });
    expect(screen.getByRole('tab', { name: '化验结果' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('button', { name: '去办理' }));
    await waitFor(() => expect(weighingTab).toHaveAttribute('aria-selected', 'true'));
  });
  it('hides release actions when the ticket evidence is blocked', async () => {
    const value = evidence(); value.trip.stage = 'blocked';
    api.tripDetail.mockResolvedValue(value);
    renderWithProviders(<TripWorkspace gate />, { route: '/grain-intake/permits/1', path: '/grain-intake/permits/:id' });
    await screen.findByText('当前依据已失效或存在冲突，暂停开证和放行，请核查磅单与化验记录。');
    await userEvent.click(screen.getByRole('tab', { name: '出门证与出厂' }));
    expect(screen.queryByRole('button', { name: '确认出厂' })).not.toBeInTheDocument();
  });
});
