import type {
  Transport,
} from './request'
import {
  env,
} from '@/config/env'
import {
  routes,
} from '@/config/routes'
import {
  createClient,
} from './request'
import {
  createSession,
} from './session'

export const session = createSession({
  get: () => wx.getStorageSync('app.session'),
  set: token => wx.setStorageSync('app.session', token),
  remove: () => wx.removeStorageSync('app.session'),
})
export const wxTransport: Transport = options => new Promise((resolve, reject) => {
  wx.request({
    ...options,
    success: response => resolve(response),
    fail: error => reject(new Error(error.errMsg)),
  })
})
export const request = createClient(env.baseURL, session, wxTransport, () => {
  const pages = getCurrentPages()
  if (`/${pages[pages.length - 1]?.route}` !== routes.login) {
    wx.showToast({
      title: '登录已过期，请重新登录',
      icon: 'none',
    })
    wx.reLaunch({
      url: routes.login,
    })
  }
})
