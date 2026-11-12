import type { Role, Trip } from './types'

export const roleLabels: Record<Role, string> = {
  warehouse: '库管',
  guard: '门卫',
}

const stageStatuses: Record<string, {
  label: string
  next: string
  action: string
  waiting: boolean
}> = {
  pending_unload: { label: '待卸货', next: '现场首磅和卸货完成后确认', action: 'unload', waiting: false },
  pending_ticket: { label: '待磅单', next: '磅单同步后选择并关联', action: 'ticket', waiting: false },
  ready: { label: '待开证', next: '核对磅单并开具出门证', action: 'issue', waiting: false },
  permit_pending: { label: '待审批', next: '核对出门证并审批', action: 'approve', waiting: false },
  permit_approved: { label: '等待出厂', next: '出门证已审批，等待门卫放行', action: '', waiting: true },
  rejected: { label: '等待退厂', next: '拒收退厂，等待门卫核验', action: '', waiting: true },
  exited: { label: '已出厂', next: '本趟已完成', action: '', waiting: true },
  blocked: { label: '需核查', next: '依据失效或冲突，请在网页版核查', action: '', waiting: true },
}

export function tripStatus(trip: Trip) {
  if (trip.stage === 'ready' && !trip.ticketConfirmedAt) {
    return { label: '待确认磅单', next: '核对过磅端关联的磅单', action: 'confirm-ticket', waiting: false }
  }
  if (trip.stage === 'pending_inspection') {
    return trip.method === 'visual'
      ? { label: '待目测', next: '核对货品并确认目测结果', action: 'visual', waiting: false }
      : { label: '待化验', next: '等待网页版完成化验', action: '', waiting: true }
  }
  return stageStatuses[trip.stage] ?? stageStatuses.blocked
}

export function exitType(trip: Trip) {
  if (trip.stage === 'rejected') {
    return '拒收退厂'
  }
  return trip.inspection?.conclusion === 'reject' ? '拒收退厂' : '正常出厂'
}

export function exitEligible(trip: Trip) {
  return !trip.exitedAt
    && (trip.stage === 'permit_approved' || trip.stage === 'rejected')
}

export function inspectionText(trip: Trip) {
  if (trip.stage === 'pending_inspection') {
    return trip.method === 'lab' ? '等待化验' : '等待目测'
  }
  if (!trip.inspection) {
    return trip.method === 'lab' ? '等待化验' : '待目测'
  }
  return `${trip.inspection.method === 'lab' ? '化验' : '目测'}${trip.inspection.conclusion === 'accept' ? '接收' : '拒收'}`
}

export function canEdit(trip: Trip) {
  return trip.stage === 'pending_inspection'
    && !trip.inspection
    && !trip.unload
    && !trip.ticket
    && !trip.permit
}
