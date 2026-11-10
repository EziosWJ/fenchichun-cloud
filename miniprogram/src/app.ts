import {
  refreshDictionary,
} from '@/features/grain/dictionary-service'
import {
  session,
} from '@/utils/api'

App({
  onLaunch() {
    session.restore()
    void refreshDictionary()
  },
  onError() {
    wx.showToast({
      title: '页面发生异常，请重新进入',
      icon: 'none',
    })
  },
  onUnhandledRejection() {
    wx.showToast({
      title: '操作未完成，请重试',
      icon: 'none',
    })
  },
})
