import {
  session,
} from '@/utils/api'

Page({
  data: {
    loggedIn: false,
  },
  onShow() {
    this.setData({
      loggedIn: !!session.snapshot().token,
    })
  },
  logout() {
    wx.showModal({
      title: '退出会话',
      content: '确认清除本地会话？',
      success: (result) => {
        if (result.confirm) {
          session.clear()
          this.setData({
            loggedIn: false,
          })
        }
      },
    })
  },
})
