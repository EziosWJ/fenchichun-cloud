import {
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
      this.setData({
        trips: cards(
          demo.listTrips().filter(trip => matches(trip, this.data.query)),
        ),
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
})
