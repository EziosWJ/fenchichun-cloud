import {
  env,
} from '@/config/env'
import {
  routes,
} from '@/config/routes'
import {
  loadDemo,
} from '@/features/demo'

Page({
  data: {
    loading: true,
    error: '',
    items: [] as string[],
    label: '',
    mock: env.mock,
  },
  onLoad() {
    void this.load()
  },
  async load(state = 'success') {
    this.setData({
      loading: true,
      error: '',
    })
    try {
      this.setData(await loadDemo(state))
    }
    catch (error) {
      this.setData({
        error: error instanceof Error ? error.message : '加载失败',
      })
    }
    finally {
      this.setData({
        loading: false,
      })
    }
  },
  retry() {
    void this.load()
  },
  empty() {
    void this.load('empty')
  },
  fail() {
    void this.load('error')
  },
  login() {
    wx.navigateTo({
      url: routes.login,
    })
  },
  profile() {
    wx.navigateTo({
      url: routes.profile,
    })
  },
  ui() {
    wx.navigateTo({
      url: routes.components,
    })
  },
})
