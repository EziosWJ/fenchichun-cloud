import { env } from '@/config/env'
import { routes } from '@/config/routes'
import { errorMessage } from '@/features/grain/page'
import { demo } from '@/features/grain/service'

Page({
  data: {
    mock: env.mock,
    account: '',
    password: '',
    showPassword: false,
    error: '',
    submitting: false,
  },
  onShow() {
    if (!env.mock) {
      return
    }
    try {
      if (demo.current()) {
        wx.reLaunch({ url: routes.workbench })
      }
    }
    catch (error) {
      this.setData({ error: errorMessage(error) })
    }
  },
  accountInput(event: WechatMiniprogram.Input) {
    this.setData({ account: event.detail.value, error: '' })
  },
  passwordInput(event: WechatMiniprogram.Input) {
    this.setData({ password: event.detail.value, error: '' })
  },
  togglePassword() {
    this.setData({ showPassword: !this.data.showPassword })
  },
  login() {
    if (!env.mock || this.data.submitting) {
      return
    }
    this.setData({ submitting: true, error: '' })
    try {
      if (!this.data.account.trim() || !this.data.password) {
        throw new Error('请输入员工账号和密码')
      }
      demo.login(this.data.account, this.data.password)
      this.setData({ password: '' })
      wx.reLaunch({ url: routes.workbench })
    }
    catch (error) {
      this.setData({ error: errorMessage(error) })
    }
    finally {
      this.setData({ submitting: false })
    }
  },
})
