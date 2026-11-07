Component({
  options: {
    multipleSlots: true,
  },
  properties: {
    text: {
      type: String,
      value: '加载中',
    },
  },
  methods: {
    retry() {
      this.triggerEvent('retry')
    },
  },
})
