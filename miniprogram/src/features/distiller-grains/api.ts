import { request } from '@/utils/api'

export interface DistillerGrainsDay {
  date: string
  ticketCount: number
  netMilliTonne: number
}

export interface DistillerGrainsRecord {
  ticketNo: string
  issuedAt: string
  plate: string
  partyCode: string
  partyName: string
  netMilliTonne: number
}

export interface DistillerGrainsCustomer {
  code: string
  name: string
}

export interface DistillerGrainsStats {
  from: string
  to: string
  totalNetMilliTonne: number
  ticketCount: number
  days: DistillerGrainsDay[]
  records: DistillerGrainsRecord[]
  customers: DistillerGrainsCustomer[]
}

/** 酒糟出库统计；period=range 时必须同时提供 from/to。 */
export function distillerGrainsStats(params: Record<string, unknown>) {
  return request<DistillerGrainsStats>({
    path: '/distiller-grains/stats',
    data: params,
  })
}
