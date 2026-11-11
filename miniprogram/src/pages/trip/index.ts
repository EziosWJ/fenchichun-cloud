import type { EventRecord, Trip } from '@/features/grain/types'
import { env } from '@/config/env'
import { routes } from '@/config/routes'
import { applyAsync, errorMessage, requireLogin } from '@/features/grain/page'
import {
  canEdit,
  inspectionText,
  tripStatus,
} from '@/features/grain/presentation'
import { demo } from '@/features/grain/service'

const actionLabels: Record<string, string> = {
  edit: '补充供应商',
  visual: '确认目测',
  unload: '确认卸粮',
  ticket: '查看磅单候选',
  'confirm-ticket': '确认过磅单关联',
  issue: '开具出门证',
  approve: '审批出门证',
}

Page({
  data: {
    id: '',
    loading: true,
    error: '',
    trip: null as Trip | null,
    events: [] as Array<EventRecord & { key: number }>,
    status: '',
    next: '',
    waiting: false,
    action: '',
    actionLabel: '',
    editable: false,
    inspection: '',
    expanded: {
      registration: false,
      inspection: false,
      unload: false,
      ticket: false,
      permit: false,
      events: false,
    },
    confirming: false,
  },
  onLoad(query: Record<string, string | undefined>) {
    this.setData({ id: query.id || '' })
  },
  onShow() {
    this.load()
  },
  load() {
    this.setData({ loading: true, error: '' })
    try {
      if (!requireLogin('warehouse')) {
        return
      }
      const apply = (trip: Trip) => {
        const status = tripStatus(trip)
        const expanded = {
          registration: false,
          inspection: false,
          unload: false,
          ticket: false,
          permit: false,
          events: false,
        }
        if (status.action === 'visual' || trip.stage === 'pending_inspection' || trip.stage === 'rejected') {
          expanded.inspection = true
        }
        else if (status.action === 'unload') {
          expanded.unload = true
        }
        else if (status.action === 'ticket' || status.action === 'confirm-ticket') {
          expanded.ticket = true
        }
        else if (status.action === 'issue' || status.action === 'approve' || trip.stage === 'permit_approved') {
          expanded.permit = true
        }
        this.setData({
          trip,
          events: trip.events.map((event, key) => ({ ...event, key })),
          status: status.label,
          next: status.next,
          waiting: status.waiting,
          action: status.action,
          actionLabel: actionLabels[status.action] || '',
          editable: env.mock && canEdit(trip),
          inspection: inspectionText(trip),
          expanded,
        })
        this.setData({ loading: false })
      }
      applyAsync(demo.getTrip(this.data.id), apply, (error) => {
        this.setData({ error: errorMessage(error), loading: false })
      })
    }
    catch (error) {
      this.setData({ error: errorMessage(error), loading: false })
    }
  },
  edit() {
    wx.navigateTo({
      url: `${routes.registration}?id=${encodeURIComponent(this.data.id)}`,
    })
  },
  toggleSection(event: WechatMiniprogram.BaseEvent) {
    const section = event.currentTarget.dataset.section as keyof typeof this.data.expanded
    if (!(section in this.data.expanded)) {
      return
    }
    this.setData({ [`expanded.${section}`]: !this.data.expanded[section] })
  },
  act() {
    const trip = this.data.trip
    if (!trip || this.data.confirming) {
      return
    }
    const action = this.data.action
    if (action === 'edit') {
      return this.edit()
    }
    if (action === 'visual' || action === 'unload') {
      return wx.navigateTo({
        url: `${routes.action}?id=${encodeURIComponent(trip.serverId || trip.id)}&action=${action}`,
      })
    }
    if (action === 'ticket') {
      return wx.navigateTo({
        url: `${routes.tickets}?id=${encodeURIComponent(trip.serverId || trip.id)}`,
      })
    }
    if (action === 'confirm-ticket') {
      wx.showModal({
        title: '确认过磅单关联？',
        content: `请核对过磅端关联的磅单 ${trip.ticket?.id} 与车辆 ${trip.plate}、${trip.material}是否一致。`,
        confirmText: '确认关联',
        success: ({ confirm }) => {
          if (confirm) {
            this.submitTicketConfirmation()
          }
        },
      })
      return
    }
    if (action !== 'issue' && action !== 'approve') {
      return
    }
    const title = action === 'issue' ? '开具出门证' : '审批出门证'
    const content
      = action === 'issue'
        ? `请核对 ${trip.plate}、${trip.site}及磅单 ${trip.ticket?.id}，确认开具出门证？`
        : `请核对 ${trip.plate} 的出门证 ${trip.permit?.id} 和磅单 ${trip.ticket?.id}。审批后仍需门卫确认实际出厂。`
    this.setData({ confirming: true })
    wx.showModal({
      title,
      content,
      confirmText: '确认',
      success: ({ confirm }) => {
        if (confirm) {
          this.submitPermit()
        }
        else {
          this.setData({ confirming: false })
        }
      },
    })
  },
  submitTicketConfirmation() {
    const trip = this.data.trip
    if (!trip) {
      return
    }
    this.setData({ confirming: true })
    try {
      applyAsync(
        demo.confirmTicket(trip.serverId || trip.id, trip.version),
        () => {
          wx.showToast({ title: '已确认过磅单关联', icon: 'success' })
          this.setData({ confirming: false })
          this.load()
        },
        (error) => {
          wx.showModal({
            title: '确认未完成',
            content: errorMessage(error),
            showCancel: false,
          })
          this.setData({ confirming: false })
          this.load()
        },
      )
    }
    catch (error) {
      wx.showModal({
        title: '确认未完成',
        content: errorMessage(error),
        showCancel: false,
      })
      this.setData({ confirming: false })
      this.load()
    }
  },
  submitPermit() {
    const trip = this.data.trip
    const action = this.data.action
    if (!trip || (action !== 'issue' && action !== 'approve')) {
      return
    }
    this.setData({ confirming: true })
    try {
      const result = action === 'issue'
        ? demo.issuePermit(trip.serverId || trip.id, trip.version)
        : demo.approvePermit(trip.serverId || trip.id, trip.version)
      applyAsync(
        result,
        () => {
          wx.showToast({
            title: action === 'issue' ? '出门证已开具' : '出门证已审批',
            icon: 'success',
          })
          this.setData({ confirming: false })
          this.load()
        },
        (error) => {
          wx.showModal({
            title: '操作未完成',
            content: errorMessage(error),
            showCancel: false,
          })
          this.setData({ confirming: false })
          this.load()
        },
      )
    }
    catch (error) {
      wx.showModal({
        title: '操作未完成',
        content: errorMessage(error),
        showCancel: false,
      })
      this.setData({ confirming: false })
      this.load()
    }
  },
})
