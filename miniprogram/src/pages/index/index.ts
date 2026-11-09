import type { Role } from '@/features/grain/types'
import { routes } from '@/config/routes'
import {
  cards,
  errorMessage,
  matches,
  requireLogin,
} from '@/features/grain/page'
import { exitEligible, roleLabels } from '@/features/grain/presentation'
import { demo } from '@/features/grain/service'

Page({
  data: {
    loading: true,
    error: '',
    role: 'warehouse' as Role,
    roleName: '',
    canSwitch: false,
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
      const query = this.data.query
      const trips = demo.listTrips().filter((trip) => {
        if (!matches(trip, query)) {
          return false
        }
        if (current.role === 'warehouse') {
          return !trip.exitedAt
        }
        return this.data.gateHistory ? !!trip.exitedAt : exitEligible(trip)
      })
      this.setData({
        trips: cards(trips),
        role: current.role,
        roleName: roleLabels[current.role],
        canSwitch: current.user.roles.length > 1,
      })
    }
    catch (error) {
      this.setData({ error: errorMessage(error) })
    }
    finally {
      this.setData({ loading: false })
    }
  },
  search(event: WechatMiniprogram.Input) {
    this.setData({ query: event.detail.value })
    this.load()
  },
  switchRole() {
    try {
      const current = requireLogin()
      if (!current || current.user.roles.length < 2) {
        return
      }
      const roles = current.user.roles
      wx.showActionSheet({
        itemList: roles.map(role => roleLabels[role]),
        success: ({ tapIndex }) => {
          try {
            demo.switchRole(roles[tapIndex])
            this.setData({ query: '', gateHistory: false })
            this.load()
          }
          catch (error) {
            wx.showToast({ title: errorMessage(error), icon: 'none' })
          }
        },
      })
    }
    catch (error) {
      wx.showToast({ title: errorMessage(error), icon: 'none' })
    }
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
  allTrips() {
    wx.navigateTo({ url: routes.trips })
  },
})
