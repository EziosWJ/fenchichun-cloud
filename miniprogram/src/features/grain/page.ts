import type { Role, Trip } from './types'
import { routes } from '@/config/routes'
import { grainService } from './api-service'
import { exitEligible, exitType, inspectionText, tripStatus } from './presentation'

export function requireLogin(role?: Role) {
  const current = grainService.current()
  if (!current) {
    wx.reLaunch({ url: routes.login })
    return null
  }
  if (role && current.role !== role) {
    wx.showToast({ title: '请切换到对应岗位', icon: 'none' })
    wx.switchTab({ url: routes.workbench })
    return null
  }
  return current
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作未完成，请重试'
}

export function applyAsync<T>(
  value: Promise<T>,
  onValue: (value: T) => void,
  onError: (error: unknown) => void,
) {
  void value.then(onValue).catch(onError)
}

const listActionLabels: Record<string, string> = {
  'visual': '去目测',
  'unload': '确认卸货',
  'ticket': '关联磅单',
  'confirm-ticket': '确认磅单',
  'issue': '开出门证',
  'approve': '审批出门证',
}

const accentActions = new Set(['issue', 'visual'])

export function cards(trips: Trip[]) {
  return trips.map((trip) => {
    const status = tripStatus(trip)
    return {
      ...trip,
      statusLabel: status.label,
      next: status.next,
      waiting: status.waiting,
      action: status.action,
      actionLabel: listActionLabels[status.action] || '',
      actionTone: accentActions.has(status.action) ? 'accent' : 'brand',
      exitType: exitType(trip),
      inspectionText: inspectionText(trip),
    }
  })
}

export function matches(trip: Trip, query: string) {
  const value = query.trim().toUpperCase()
  return (
    !value
    || trip.plate.toUpperCase().includes(value)
    || trip.id.toUpperCase().includes(value)
    || (trip.supplier || '').toUpperCase().includes(value)
    || (trip.permit?.id || '').toUpperCase().includes(value)
  )
}

const actionableActions = new Set(['visual', 'unload', 'ticket', 'confirm-ticket', 'issue', 'approve'])

export function needsAction(trip: Trip) {
  return actionableActions.has(tripStatus(trip).action)
}

/** 当前角色真正需要操作的流转单排在前面，其余（等待他人或已办）按更新时间倒序。 */
export function sortTrips(trips: Trip[], role: Role) {
  const pending = (trip: Trip) => role === 'guard'
    ? exitEligible(trip)
    : needsAction(trip)
  return [...trips].sort((left, right) => {
    const leftPending = pending(left) ? 0 : 1
    const rightPending = pending(right) ? 0 : 1
    if (leftPending !== rightPending) {
      return leftPending - rightPending
    }
    return (right.updatedAt || right.createdAt).localeCompare(left.updatedAt || left.createdAt)
  })
}

export type TimeRange = 'all' | 'today' | '3d' | '7d' | '30d'

function tripTime(trip: Trip) {
  const value = new Date(trip.createdAt.replace(' ', 'T'))
  return Number.isNaN(value.getTime()) ? null : value
}

/** 按登记时间过滤；无法解析时间时保留记录，避免误隐藏。 */
export function withinTimeRange(trip: Trip, range: TimeRange, now = new Date()) {
  if (range === 'all') {
    return true
  }
  const value = tripTime(trip)
  if (!value) {
    return true
  }
  if (range === 'today') {
    return value.getFullYear() === now.getFullYear()
      && value.getMonth() === now.getMonth()
      && value.getDate() === now.getDate()
  }
  const days = range === '3d' ? 3 : range === '7d' ? 7 : 30
  return now.getTime() - value.getTime() <= days * 24 * 60 * 60 * 1000
}
