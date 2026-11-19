import { routes } from '@/config/routes'

Component({
  properties: {
    trips: { type: Array, value: [] },
    kind: { type: String, value: 'warehouse' },
    mode: { type: String, value: 'workbench' },
    showAction: { type: Boolean, value: true },
  },
  methods: {
    open(event: WechatMiniprogram.BaseEvent) {
      const id = String(event.currentTarget.dataset.id)
      wx.navigateTo({
        url: `${this.data.kind === 'guard' ? routes.exit : routes.trip}?id=${encodeURIComponent(id)}`,
      })
    },
    act(event: WechatMiniprogram.BaseEvent) {
      this.open(event)
    },
  },
})
