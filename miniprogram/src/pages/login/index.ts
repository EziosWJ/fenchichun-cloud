import {
  env,
} from '@/config/env'
import {
  routes,
} from '@/config/routes'
import {
  session,
} from '@/utils/api'

Page({
  data: {
    mock: env.mock,
  },
  login() {
    if (!env.mock) {
      return
    }
    session.save('mock-session')
    wx.reLaunch({
      url: routes.workbench,
    })
  },
})
