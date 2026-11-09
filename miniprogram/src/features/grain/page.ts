import type { Role, Trip } from './types'
import { env } from '@/config/env'
import { routes } from '@/config/routes'
import { demo } from '@/features/grain/service'
import { exitType, inspectionText, tripStatus } from './presentation'

export function requireLogin(role?: Role) {
  const current = env.mock ? demo.current() : null
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
