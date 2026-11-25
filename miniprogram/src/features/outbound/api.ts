import { request } from '@/utils/api'

export interface OutboundAccount {
  partyCode: string
  partyName: string
  plate: string
  siteCode: string
  siteName: string
  scaleCode: string
}

export interface PendingWeighing {
  id: number
  firstWeightMilliTonne: number
  firstAt: string
}

export interface OutboundProfile extends OutboundAccount {
  pending?: PendingWeighing
}

export interface ScaleReading {
  available: boolean
  online: boolean
  stable: boolean
  deviceOk: boolean
  weightMilliTonne: number
  receivedAt?: string
  mock: boolean
  message: string
}

export interface FirstWeighResult {
  weight: ScaleReading
  pending: PendingWeighing
}

export interface TicketResult {
  ticketNo: string
  firstWeightMilliTonne: number
  secondWeightMilliTonne: number
  netMilliTonne: number
  issuedAt: string
  mock: boolean
}

export function outboundProfile() {
  return request<OutboundProfile>({ path: '/grain-outbound/me' })
}

export function outboundWeight() {
  return request<ScaleReading>({ path: '/grain-outbound/weight' })
}

export function firstWeigh() {
  return request<FirstWeighResult>({ path: '/grain-outbound/weighings/first', method: 'POST', data: {} })
}

export function secondWeigh() {
  return request<TicketResult>({ path: '/grain-outbound/weighings/second', method: 'POST', data: {} })
}

export function cancelPending() {
  return request<null>({ path: '/grain-outbound/weighings/pending', method: 'DELETE' })
}
