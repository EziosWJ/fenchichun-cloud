import { createDemoService } from './mock-core'

export const demo = createDemoService({
  get: () => wx.getStorageSync('grain.demo.v1'),
  set: state => wx.setStorageSync('grain.demo.v1', state),
})
