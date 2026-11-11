import { get, getPage, post, put } from '../../lib/api/client';

export interface InspectionInput {
  tripId?: number | null;
  siteCode: string;
  plate: string;
  materialCode: string;
  partyCode: string;
  driver: string;
  driverPhone: string;
  contractNo: string;
  moisture: string;
  impurity: string;
  conclusion: '' | 'accept' | 'reject';
  reason: string;
  remark: string;
}
export interface Inspection extends InspectionInput {
  id: number;
  number: string;
  status: 'draft' | 'confirmed' | 'void';
  version: number;
  originalId: number | null;
  materialName: string;
  partyName: string;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  confirmedBy: number | null;
  confirmedAt: string | null;
  voidedBy: number | null;
  voidedAt: string | null;
  voidReason: string;
}
const base = '/laboratory/inspections';
export const inspections = (params: Record<string, unknown>) => getPage<Inspection>(base, params);
export type CreateInspectionInput = Pick<InspectionInput, 'tripId' | 'moisture' | 'impurity' | 'conclusion' | 'reason' | 'remark'>;
export const createInspection = (input: CreateInspectionInput) => post<Inspection>(base, input);
export const inspection = (id: number) => get<Inspection>(`${base}/${id}`);
export const saveInspection = (input: InspectionInput, original?: Inspection) => original
  ? put<Inspection>(`${base}/${original.id}`, { ...input, version: original.version })
  : post<Inspection>(base, input);
export const inspectionAction = (original: Inspection, action: 'confirm' | 'void' | 'delete' | 'retest', reason = '') =>
  post<Inspection>(`${base}/${original.id}/${action}`, { version: original.version, reason });
export const voidInspection = (original: Inspection, reason: string) =>
  post<Inspection>(`${base}/${original.id}/void`, { version: original.version, reason });
