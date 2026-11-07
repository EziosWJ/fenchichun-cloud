Component({
  options: {
    multipleSlots: true,
  },
  properties: {
    title: String,
  },
  methods: {
    retry() {
      this.triggerEvent('retry')
    },
  },
})
