import { routes } from '@/config/routes'

Component({
  properties: {
    trips: { type: Array, value: [] },
    kind: { type: String, value: 'warehouse' },
  },
  methods: {
    open(event: WechatMiniprogram.BaseEvent) {
      const id = String(event.currentTarget.dataset.id)
      wx.navigateTo({
        url: `${this.data.kind === 'guard' ? routes.exit : routes.trip}?id=${encodeURIComponent(id)}`,
      })
    },
  },
})
