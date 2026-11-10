import type { Role, Trip } from './types'
import { routes } from '@/config/routes'
import { demo } from '@/features/grain/service'
import { exitType, inspectionText, tripStatus } from './presentation'

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
