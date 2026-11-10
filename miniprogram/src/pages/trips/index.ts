import {
  applyAsync,
  cards,
  errorMessage,
  matches,
  requireLogin,
} from '@/features/grain/page'
import { demo } from '@/features/grain/service'

Page({
  data: { loading: true, error: '', query: '', trips: cards([]) },
  onShow() {
    this.load()
  },
  load() {
    this.setData({ loading: true, error: '' })
    try {
      if (!requireLogin('warehouse')) {
        return
      }
      applyAsync(
        demo.listTrips(),
        (all) => {
          this.setData({
            trips: cards(all.filter(trip => matches(trip, this.data.query))),
          })
          this.setData({ loading: false })
        },
        (error) => {
          this.setData({ error: errorMessage(error), loading: false })
        },
      )
    }
    catch (error) {
      this.setData({ error: errorMessage(error), loading: false })
    }
  },
  search(event: WechatMiniprogram.Input) {
    this.setData({ query: event.detail.value })
    this.load()
  },
})
