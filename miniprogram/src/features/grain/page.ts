import type { Role, Trip } from './types'
import { routes } from '@/config/routes'
import { demo } from '@/features/grain/service'
import { exitEligible, exitType, inspectionText, tripStatus } from './presentation'

export function requireLogin(role?: Role) {
  const current = demo.current()
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

/** 同时兼容本地 Mock 的同步返回和真实接口的 Promise 返回。 */
export function applyAsync<T>(
  value: T | Promise<T>,
  onValue: (value: T) => void,
  onError: (error: unknown) => void,
) {
  if (value && typeof (value as Promise<T>).then === 'function') {
    (value as Promise<T>).then(onValue).catch(onError)
    return
  }
  try {
    onValue(value as T)
  }
  catch (error) {
    onError(error)
  }
}

export function cards(trips: Trip[]) {
  return trips.map((trip) => {
    const status = tripStatus(trip)
    return {
      ...trip,
      statusLabel: status.label,
      next: status.next,
      waiting: status.waiting,
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
  )
}

const actionableActions = new Set(['edit', 'visual', 'unload', 'ticket', 'issue', 'approve'])

/** 当前角色真正需要操作的流转单排在前面，其余（等待他人或已办）按更新时间倒序。 */
export function sortTrips(trips: Trip[], role: Role) {
  const pending = (trip: Trip) => role === 'guard'
    ? exitEligible(trip)
    : actionableActions.has(tripStatus(trip).action)
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
