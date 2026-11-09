import type { EventRecord, Trip } from '@/features/grain/types'
import { routes } from '@/config/routes'
import { errorMessage, requireLogin } from '@/features/grain/page'
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
      const trip = demo.getTrip(this.data.id)
      const status = tripStatus(trip)
      this.setData({
        trip,
        events: trip.events.map((event, key) => ({ ...event, key })),
        status: status.label,
        next: status.next,
        waiting: status.waiting,
        action: status.action,
        actionLabel: actionLabels[status.action] || '',
        editable: canEdit(trip),
        inspection: inspectionText(trip),
      })
    }
    catch (error) {
      this.setData({ error: errorMessage(error) })
    }
    finally {
      this.setData({ loading: false })
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
        url: `${routes.action}?id=${encodeURIComponent(trip.id)}&action=${action}`,
      })
    }
    if (action === 'ticket') {
      return wx.navigateTo({
        url: `${routes.tickets}?id=${encodeURIComponent(trip.id)}`,
      })
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
        if (!confirm) {
          return
        }
        try {
          if (action === 'issue') {
            demo.issuePermit(trip.id, trip.version)
          }
          else {
            demo.approvePermit(trip.id, trip.version)
          }
          wx.showToast({
            title: action === 'issue' ? '出门证已开具' : '出门证已审批',
            icon: 'success',
          })
          this.load()
        }
        catch (error) {
          wx.showModal({
            title: '操作未完成',
            content: errorMessage(error),
            showCancel: false,
          })
          this.load()
        }
      },
      complete: () => this.setData({ confirming: false }),
    })
  },
})
