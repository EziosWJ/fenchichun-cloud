import type { Role, Trip } from '@/features/grain/types'
import { routes } from '@/config/routes'
import { grainService } from '@/features/grain/api-service'
import {
  applyAsync,
  cards,
  errorMessage,
  matches,
  needsAction,
  requireLogin,
  sortTrips,
} from '@/features/grain/page'
import { exitEligible, roleLabels } from '@/features/grain/presentation'

Page({
  data: {
    loading: true,
    error: '',
    role: 'warehouse' as Role,
    roleName: '',
    query: '',
    gateHistory: false,
    trips: cards([]),
  },
  onShow() {
    this.load()
  },
  load() {
    this.setData({ loading: true, error: '' })
    try {
      const current = requireLogin()
      if (!current) {
        return
      }
      if (current.role === 'finance') {
        this.setData({
          role: 'finance',
          roleName: roleLabels.finance,
          trips: [],
          loading: false,
        })
        return
      }
      const apply = (all: Trip[]) => {
        const query = this.data.query
        const trips = all.filter((trip) => {
          if (!matches(trip, query)) {
            return false
          }
          if (current.role === 'warehouse') {
            return !trip.exitedAt && needsAction(trip)
          }
          return this.data.gateHistory ? !!trip.exitedAt : exitEligible(trip)
        })
        this.setData({
          trips: cards(sortTrips(trips, current.role)),
          role: current.role,
          roleName: roleLabels[current.role],
        })
        this.setData({ loading: false })
      }
      applyAsync(grainService.listTrips(), apply, (error) => {
        this.setData({ error: errorMessage(error), loading: false })
      })
    }
    catch (error) {
      this.setData({ error: errorMessage(error), loading: false })
    }
  },
  search(event: WechatMiniprogram.Input) {
    this.setData({ query: event.detail.value })
    this.load()
  },
  clearSearch() {
    if (!this.data.query) {
      return
    }
    this.setData({ query: '' })
    this.load()
  },
  showPending() {
    this.setData({ gateHistory: false })
    this.load()
  },
  showHistory() {
    this.setData({ gateHistory: true })
    this.load()
  },
  register() {
    wx.navigateTo({ url: routes.registration })
  },
  openDistillerGrains() {
    wx.navigateTo({ url: routes.distillerGrains })
  },
})
