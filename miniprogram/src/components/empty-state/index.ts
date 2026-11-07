Component({
  options: {
    multipleSlots: true,
  },
  properties: {
    text: {
      type: String,
      value: '暂无数据',
    },
  },
  methods: {
    retry() {
      this.triggerEvent('retry')
    },
  },
})
