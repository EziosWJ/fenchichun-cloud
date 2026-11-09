import type { Role, Trip } from './types'

export const roleLabels: Record<Role, string> = {
  warehouse: '库管',
  guard: '门卫',
}

export function tripStatus(trip: Trip) {
  if (trip.exitedAt) {
    return {
      label: '已出厂',
      next: `实际出厂：${trip.exitedAt}`,
      action: '',
      waiting: true,
    }
  }
  if (trip.inspection?.conclusion === 'reject') {
    return {
      label: '等待退厂',
      next: '拒收退厂，等待门卫核验',
      action: '',
      waiting: true,
    }
  }
  if (!trip.inspection) {
    if (!trip.supplier) {
      return {
        label: trip.method === 'lab' ? '等待化验' : '待目测',
        next: '请先补充供应商',
        action: 'edit',
        waiting: false,
      }
    }
    if (trip.method === 'lab') {
      return {
        label: '等待化验',
        next: '等待化验员确认生效结果',
        action: '',
        waiting: true,
      }
    }
    return {
      label: '待目测',
      next: '核对货品并确认目测结果',
      action: 'visual',
      waiting: false,
    }
  }
  if (!trip.unload) {
    return {
      label: '待卸粮',
      next: '现场首磅和卸粮完成后确认',
      action: 'unload',
      waiting: false,
    }
  }
  if (!trip.ticket) {
    if (trip.ticketAvailable) {
      return {
        label: '待关联磅单',
        next: '磅单已同步，请核对并关联',
        action: 'ticket',
        waiting: false,
      }
    }
    return {
      label: '等待磅单同步',
      next: '同步后选择并关联正式磅单',
      action: 'ticket',
      waiting: true,
    }
  }
  if (!trip.permit) {
    return {
      label: '待开证',
      next: '核对依据并开具出门证',
      action: 'issue',
      waiting: false,
    }
  }
  if (!trip.permit.approvedAt) {
    return {
      label: '待审批',
      next: '核对出门证并审批',
      action: 'approve',
      waiting: false,
    }
  }
  return {
    label: '等待出厂',
    next: '出门证已审批，等待门卫放行',
    action: '',
    waiting: true,
  }
}

export function exitType(trip: Trip) {
  return trip.inspection?.conclusion === 'reject' ? '拒收退厂' : '正常出厂'
}

export function exitEligible(trip: Trip) {
  return (
    !trip.exitedAt
    && (trip.inspection?.conclusion === 'reject' || !!trip.permit?.approvedAt)
  )
}

export function inspectionText(trip: Trip) {
  if (!trip.inspection) {
    return trip.method === 'lab' ? '等待化验' : '待目测'
  }
  return `${trip.inspection.method === 'lab' ? '化验' : '目测'}${trip.inspection.conclusion === 'accept' ? '接收' : '拒收'}`
}

export function canEdit(trip: Trip) {
  return (
    !trip.inspection
    && !trip.unload
    && !trip.ticket
    && !trip.permit
    && !trip.exitedAt
  )
}
