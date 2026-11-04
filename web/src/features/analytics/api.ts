import { get, getBlob } from '../../lib/api/client';

export interface StatementTotals {
  ticketCount: number;
  grossMilliTonne: number;
  tareMilliTonne: number;
  netAdjustmentMilliTonne: number;
  netMilliTonne: number;
}

export interface StatementParty extends StatementTotals {
  siteCode: string;
  siteName: string;
  partyCode: string;
  partyName: string;
  firstIssuedAt: string;
  lastIssuedAt: string;
}

export interface StatementPageSummary extends StatementTotals {
  partyCount: number;
}

export interface StatementPartyPage {
  records: StatementParty[];
  total: number;
  page: number;
  pageSize: number;
  summary: StatementPageSummary;
}

export interface StatementMaterial extends StatementTotals {
  materialCode: string;
  materialName: string;
  materialSpec: string;
}

export interface StatementDaily extends StatementTotals {
  date: string;
}

export interface StatementDetail extends StatementTotals {
  siteCode: string;
  siteName: string;
  partyCode: string;
  partyName: string;
  direction: string;
  from: string;
  to: string;
  materials: StatementMaterial[];
  daily: StatementDaily[];
}

const base = '/weighbridge/statements/parties';

export const statementParties = (params: Record<string, unknown>) =>
  get<StatementPartyPage>(base, params);

export const statementDetail = (params: Record<string, unknown>) =>
  get<StatementDetail>(`${base}/detail`, params);

export const exportStatementParties = (params: Record<string, unknown>) =>
  getBlob(`${base}/export`, params);

export const exportStatementDetail = (params: Record<string, unknown>) =>
  getBlob(`${base}/detail/export`, params);
