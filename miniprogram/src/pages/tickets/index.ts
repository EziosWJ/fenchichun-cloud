import type { Ticket, Trip } from '@/features/grain/types'
import { applyAsync, errorMessage, requireLogin } from '@/features/grain/page'
import { demo } from '@/features/grain/service'

Page({
  data: {
    id: '',
    trip: null as Trip | null,
    tickets: [] as Ticket[],
    loading: true,
    error: '',
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
      const applyTrip = (trip: Trip) => {
        if (!trip.unload || trip.ticket || trip.exitedAt) {
          throw new Error('本趟状态已变化，请返回详情查看')
        }
        applyAsync(
          demo.candidates(trip.serverId || trip.id),
          (tickets) => {
            this.setData({ trip, tickets })
            this.setData({ loading: false })
          },
          (error) => {
            this.setData({ error: errorMessage(error), loading: false })
          },
        )
      }
      applyAsync(demo.getTrip(this.data.id), applyTrip, (error) => {
        this.setData({ error: errorMessage(error), loading: false })
      })
    }
    catch (error) {
      this.setData({ error: errorMessage(error), loading: false })
    }
  },
  link(event: WechatMiniprogram.BaseEvent) {
    const ticket = this.data.tickets.find(
      item => item.id === event.currentTarget.dataset.id,
    )
    if (!ticket) {
      return
    }
    if (ticket.linkable === false) {
      wx.showModal({
        title: '暂不能关联',
        content: `${ticket.reason || '时间顺序不一致'}。请核对化验、首磅、卸货和回磅时间后再关联。`,
        showCancel: false,
      })
      return
    }
    const trip = this.data.trip
    if (!trip || this.data.confirming) {
      return
    }
    this.setData({ confirming: true })
    wx.showModal({
      title: '关联正式磅单',
      content: `请核对 ${trip.plate}、${ticket.material}、${ticket.supplier}及磅单 ${ticket.id}，确认关联？`,
      success: ({ confirm }) => {
        if (confirm) {
          this.submitLink(ticket.id)
        }
        else {
          this.setData({ confirming: false })
        }
      },
    })
  },
  submitLink(ticketId: string) {
    const trip = this.data.trip
    const ticket = this.data.tickets.find(item => item.id === ticketId)
    if (!trip || !ticket) {
      return
    }
    this.setData({ confirming: true })
    try {
      applyAsync(
        demo.linkTicket(trip.serverId || trip.id, trip.version, ticket.id),
        () => {
          this.setData({ confirming: false })
          wx.navigateBack()
        },
        (error) => {
          wx.showModal({
            title: '关联未完成',
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
        title: '关联未完成',
        content: errorMessage(error),
        showCancel: false,
      })
      this.setData({ confirming: false })
      this.load()
    }
  },
})
