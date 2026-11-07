Component({
  options: {
    multipleSlots: true,
  },
  properties: {
    text: {
      type: String,
      value: '加载失败',
    },
    retryable: {
      type: Boolean,
      value: true,
    },
  },
  methods: {
    retry() {
      this.triggerEvent('retry')
    },
  },
})
