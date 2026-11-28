import { env } from '@/config/env'
import { request } from '@/utils/api'

export interface OutboundAccount {
  partyCode: string
  partyName: string
  plate: string
  siteCode: string
  siteName: string
  scaleCode: string
}

export interface OutboundQr {
  value: string
  expiresAt: string
  image: string
}

export interface OutboundWeighing {
  id: number
  status: string
  source: string
  plate: string
  partyCode: string
  partyName: string
  siteCode: string
  siteName: string
  scaleCode: string
  firstWeightMilliTonne: number
  firstAt: string
  secondWeightMilliTonne: number
  secondAt?: string
  netMilliTonne: number
  ticketNo: string
  factoryTaskNo: string
  captureStatus: string
  message: string
  expiresAt?: string
  qr?: OutboundQr
}

export interface OutboundProfile extends OutboundAccount {
  current?: OutboundWeighing
}

export interface CurrentResponse {
  current?: OutboundWeighing
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

export interface HistoryWeighing {
  id: number
  type: 'first' | 'second'
  ticketNo: string
  status: string
  source: string
  plate: string
  firstWeightMilliTonne: number
  secondWeightMilliTonne: number
  netMilliTonne: number
  firstAt: string
  secondAt?: string
  factoryTaskNo: string
}

export interface HistoryPage {
  records: HistoryWeighing[]
  total: number
  totalNetMilliTonne: number
  page: number
  pageSize: number
  hasMore: boolean
}

export interface HistoryQuery {
  page?: number
  pageSize?: number
  type?: 'first' | 'second'
  status?: 'pending' | 'completed'
  from?: string
  to?: string
}

export function handoffQrImage(value: string) {
  return `${env.baseURL.replace(/\/$/, '')}/grain-outbound/handoffs/qr?value=${encodeURIComponent(value)}`
}

export function outboundProfile() {
  return request<OutboundProfile>({ path: '/grain-outbound/me' })
}

export function outboundCurrent() {
  return request<CurrentResponse>({ path: '/grain-outbound/current' })
}

export function outboundWeight() {
  return request<ScaleReading>({ path: '/grain-outbound/weight' })
}

export function firstWeighQR() {
  return request<OutboundWeighing>({ path: '/grain-outbound/weighings/first-qr', method: 'POST', data: {} })
}

export function secondWeighQR() {
  return request<OutboundWeighing>({ path: '/grain-outbound/weighings/second-qr', method: 'POST', data: {} })
}

export function cancelPending() {
  return request<null>({ path: '/grain-outbound/weighings/pending', method: 'DELETE' })
}

export function outboundHistory(query: HistoryQuery = {}) {
  const params = Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')
  return request<HistoryPage>({ path: `/grain-outbound/weighings${params ? `?${params}` : ''}` })
}

export interface OutboundPrintAttempt {
  id: number
  attemptNo: number
  intent: 'initial' | 'reprint' | string
  status: 'initiated' | 'printed' | 'failed' | 'unknown' | string
  source: 'factory' | 'mobile' | string
  actorName: string
  reason: string
  scanVerified: boolean
  initiatedAt: string
  resolvedAt?: string
  resolutionSource: string
  closeReason: string
}

export interface OutboundPrintCommand {
  id: number
  status: string
  origin: string
  action: string
  reason: string
  scanVerified: boolean
  factoryAttemptId?: number
  factoryIntent?: string
  message: string
  createdAt: string
  updatedAt: string
}

export interface OutboundPrintScan {
  id: number
  expiresAt: string
}

export interface OutboundPrintStatus {
  ticketNo: string
  siteCode: string
  plate: string
  netMilliTonne: number
  printStatus: 'unprinted' | 'printing' | 'printed' | 'failed' | 'unknown' | string
  reprintCount: number
  maxReprints: number
  canPrint: boolean
  scanRequired: boolean
  retryAsReprint: boolean
  needsVerify: boolean
  lastAttempt?: OutboundPrintAttempt
  attempts: OutboundPrintAttempt[]
  activeCommand?: OutboundPrintCommand
  pendingScan?: OutboundPrintScan
}

export interface OutboundPrintScanResult {
  value: string
  expiresAt: string
}

export function outboundPrintStatus(weighingID: number, context: 'completion' | 'history') {
  return request<OutboundPrintStatus>({
    path: `/grain-outbound/weighings/${weighingID}/print-status?context=${context}`,
  })
}

export function startOutboundPrint(weighingID: number) {
  return request<OutboundPrintCommand>({
    path: `/grain-outbound/weighings/${weighingID}/print`,
    method: 'POST',
    data: {},
  })
}

export function createOutboundPrintScan(weighingID: number, reason: string) {
  return request<OutboundPrintScanResult>({
    path: `/grain-outbound/weighings/${weighingID}/print-scan`,
    method: 'POST',
    data: { reason },
  })
}

export function verifyOutboundPrint(weighingID: number, result: 'printed' | 'not_printed') {
  return request<OutboundPrintCommand>({
    path: `/grain-outbound/weighings/${weighingID}/print-verify`,
    method: 'POST',
    data: { result },
  })
}

export function printQrImage(value: string) {
  return handoffQrImage(value)
}
