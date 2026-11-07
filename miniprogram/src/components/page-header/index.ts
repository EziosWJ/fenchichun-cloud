Component({
  options: {
    multipleSlots: true,
  },
  properties: {
    title: String,
    description: String,
  },
  methods: {
    retry() {
      this.triggerEvent('retry')
    },
  },
})
