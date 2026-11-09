import { get, getPage, post } from '../../lib/api/client';

export interface InspectionInput {
  tripId: number;
  moisture: string;
  impurity: string;
  bulkDensity: string;
  conclusion: 'accept' | 'reject';
  reason: string;
  remark: string;
}

export interface Inspection extends Omit<InspectionInput, 'conclusion'> {
  id: number;
  number: string;
  status: string;
  version: number;
  plate: string;
  materialCode: string;
  materialName: string;
  partyCode: string;
  partyName: string;
  driver: string;
  driverPhone: string;
  contractNo: string;
  conclusion: '' | 'accept' | 'reject';
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  confirmedBy: number | null;
  confirmedAt: string | null;
}

const base = '/laboratory/inspections';

export const inspections = (params: Record<string, unknown>) => getPage<Inspection>(base, params);

export const inspection = (id: number) => get<Inspection>(`${base}/${id}`);

/** 为流转单录入化验结果；一张流转单只能录入一次，提交即生效。 */
export const createInspection = (input: InspectionInput) => post<Inspection>(base, input);
