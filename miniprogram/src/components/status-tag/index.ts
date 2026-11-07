Component({
  options: {
    multipleSlots: true,
  },
  properties: {
    text: String,
    theme: {
      type: String,
      value: 'default',
    },
  },
  methods: {
    retry() {
      this.triggerEvent('retry')
    },
  },
})
