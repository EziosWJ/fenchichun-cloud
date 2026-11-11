import { get, getPage, post, put } from '../../lib/api/client';
import type { Inspection } from '../laboratory/api';
import type { TicketRecord } from '../weighbridge/api';
export interface TripInput {
  siteCode: string; plate: string; materialCode: string; partyCode: string;
  driver: string; driverPhone: string; contractNo: string; remark: string;
}
export interface Trip extends TripInput {
  id: number; number: string; version: number; materialName: string; partyName: string;
  inspectionMethod: 'lab' | 'visual'; visualConclusion: '' | 'accept' | 'reject'; visualReason: string; visualInspectedAt: string | null; visualInspectedBy: number | null;
  effectiveInspectionId: number | null; effectiveSelectedAt: string | null; effectiveSelectedBy: number | null;
  unloadingLocation: string; unloadedAt: string | null; unloadedBy: number | null;
  ticketId: number | null; ticketConfirmedAt?: string | null; ticketConfirmedBy?: number | null; createdBy: number; createdAt: string; updatedAt: string;
  exitedAt: string | null; exitedBy: number | null; exitBasis: string; exitInspectionId: number | null;
  stage: string; effectiveConclusion: string;
  inspectionId: number | null; inspectionConclusion: string;
}
export interface Permit {
  id: number; number: string; tripId: number; version: number; status: 'pending' | 'approved';
  inspectionId: number | null; ticketId: number; createdBy: number; createdAt: string;
  approvedBy: number | null; approvedAt: string | null;
  tripNumber: string; plate: string; siteCode: string; exitedAt: string | null; stage: string;
}
export interface TripEvent { id: number; tripId: number; action: string; description: string; actorId: number | null; actorName: string; createdAt: string }
export interface TripDetail { trip: Trip; inspections: Inspection[]; permit: Permit | null; ticket: TicketRecord | null; events: TripEvent[] }
export interface TicketCandidate {
  siteCode: string; ticketNo: string; plate: string; materialCode: string; materialName: string;
  partyCode: string; partyName: string; finalGross: string; finalTare: string; finalNetMilliTonne: number;
  firstConfirmedAt: string; secondConfirmedAt: string; issuedAt: string; linkable: boolean; reason: string;
}
export type TripAction = 'record-visual' | 'link-inspection' | 'select-inspection' | 'confirm-unloading' | 'link-ticket' | 'confirm-ticket' | 'issue-permit' | 'approve-permit' | 'confirm-exit';
export interface TripCommand {
  inspectionId?: number; inspectionVersion?: number; location?: string; conclusion?: 'accept' | 'reject'; reason?: string;
  ticketSiteCode?: string; ticketNo?: string; basis?: 'permit' | 'rejection'; permitId?: number;
}
const base = '/grain-intake';
export const trips = (params: Record<string, unknown>) => getPage<Trip>(`${base}/trips`, params);
export const permits = (params: Record<string, unknown>) => getPage<Permit>(`${base}/permits`, params);
export const rejections = (params: Record<string, unknown>) => getPage<Trip>(`${base}/rejections`, params);
export const tripDetail = (id: number, gate = false) => get<TripDetail>(`${base}/${gate ? 'exit-basis' : 'trips'}/${id}`);
export const saveTrip = (input: TripInput, original?: Trip) => original
  ? put<TripDetail>(`${base}/trips/${original.id}`, { ...input, version: original.version })
  : post<TripDetail>(`${base}/trips`, input);
export const ticketCandidates = (id: number) => get<TicketCandidate[]>(`${base}/trips/${id}/ticket-candidates`);
export const tripAction = (trip: Trip, action: TripAction, input: TripCommand = {}) => post<TripDetail>(`${base}/trips/${trip.id}/${action}`, { ...input, version: trip.version });
export const tripStages = [
  { value: 'pending_inspection', label: '待检验' }, { value: 'pending_unload', label: '待卸粮' }, { value: 'pending_ticket', label: '待磅单' },
  { value: 'accepted', label: '接收待完成' },
  { value: 'rejected', label: '拒收待出厂' }, { value: 'ready', label: '待开证' },
  { value: 'permit_pending', label: '待审批' }, { value: 'permit_approved', label: '待放行' },
  { value: 'exited', label: '已出厂' }, { value: 'blocked', label: '需核查' },
];
export const stageLabel = (stage: string, inspectionMethod?: string) => {
  if (stage === 'pending_inspection' && inspectionMethod) return inspectionMethod === 'visual' ? '待目测' : '待化验';
  return tripStages.find((v) => v.value === stage)?.label ?? stage;
};
