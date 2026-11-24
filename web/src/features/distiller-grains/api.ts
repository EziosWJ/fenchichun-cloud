import { get, getBlob } from '../../lib/api/client';

export interface DistillerGrainsDay {
  date: string;
  ticketCount: number;
  netMilliTonne: number;
}

export interface DistillerGrainsRecord {
  ticketNo: string;
  issuedAt: string;
  plate: string;
  partyCode: string;
  partyName: string;
  netMilliTonne: number;
}

export interface DistillerGrainsCustomer {
  code: string;
  name: string;
}

export interface DistillerGrainsStats {
  from: string;
  to: string;
  totalNetMilliTonne: number;
  ticketCount: number;
  days: DistillerGrainsDay[];
  records: DistillerGrainsRecord[];
  customers: DistillerGrainsCustomer[];
}

/** 酒糟出库统计；period=range 时必须同时提供 from/to。 */
export const distillerGrainsStats = (params: Record<string, unknown>) =>
  get<DistillerGrainsStats>('/distiller-grains/stats', params);

/** 导出当前筛选的酒糟出库明细（UTF-8 CSV，Excel 可直接打开）。 */
export const exportDistillerGrains = (params: Record<string, unknown>) =>
  getBlob('/distiller-grains/export', params);
