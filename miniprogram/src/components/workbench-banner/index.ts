Component({
  properties: {
    role: {
      type: String,
      value: 'warehouse',
    },
    title: {
      type: String,
      value: '',
    },
    subtitle: {
      type: String,
      value: '',
    },
    canSwitch: {
      type: Boolean,
      value: false,
    },
  },
  methods: {
    switchRole() {
      this.triggerEvent('switchrole')
    },
  },
})
