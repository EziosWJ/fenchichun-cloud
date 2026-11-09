import type { Ticket, Trip } from '@/features/grain/types'
import { errorMessage, requireLogin } from '@/features/grain/page'
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
      const trip = demo.getTrip(this.data.id)
      if (!trip.unload || trip.ticket || trip.exitedAt) {
        throw new Error('本趟状态已变化，请返回详情查看')
      }
      this.setData({ trip, tickets: demo.candidates(trip.id) })
    }
    catch (error) {
      this.setData({ error: errorMessage(error) })
    }
    finally {
      this.setData({ loading: false })
    }
  },
  link(event: WechatMiniprogram.BaseEvent) {
    const trip = this.data.trip
    const ticket = this.data.tickets.find(
      item => item.id === event.currentTarget.dataset.id,
    )
    if (!trip || !ticket || this.data.confirming) {
      return
    }
    this.setData({ confirming: true })
    wx.showModal({
      title: '关联正式磅单',
      content: `请核对 ${trip.plate}、${ticket.material}、${ticket.supplier}及磅单 ${ticket.id}，确认关联？`,
      success: ({ confirm }) => {
        if (!confirm) {
          return
        }
        try {
          demo.linkTicket(trip.id, trip.version, ticket.id)
          wx.navigateBack()
        }
        catch (error) {
          wx.showModal({
            title: '关联未完成',
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
