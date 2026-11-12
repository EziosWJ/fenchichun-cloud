import type { TimeRange } from '@/features/grain/page'
import { grainService } from '@/features/grain/api-service'
import {
  applyAsync,
  cards,
  errorMessage,
  matches,
  requireLogin,
  withinTimeRange,
} from '@/features/grain/page'

Page({
  data: {
    loading: true,
    error: '',
    query: '',
    range: 'all' as TimeRange,
    trips: cards([]),
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
      applyAsync(
        grainService.listTrips(),
        (all) => {
          this.setData({
            trips: cards(all.filter(trip =>
              withinTimeRange(trip, this.data.range) && matches(trip, this.data.query),
            )),
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
  setRange(event: WechatMiniprogram.BaseEvent) {
    this.setData({ range: event.currentTarget.dataset.range as TimeRange })
    this.load()
  },
})
