import { routes } from '@/config/routes'
import { grainService } from '@/features/grain/api-service'
import { applyAsync, errorMessage } from '@/features/grain/page'

Page({
  data: {
    account: '',
    password: '',
    showPassword: false,
    error: '',
    submitting: false,
  },
  onShow() {
    try {
      if (grainService.current()) {
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
    if (this.data.submitting) {
      return
    }
    this.setData({ submitting: true, error: '' })
    try {
      if (!this.data.account.trim() || !this.data.password) {
        throw new Error('请输入员工账号和密码')
      }
      applyAsync(
        grainService.login(this.data.account, this.data.password),
        () => {
          this.setData({ password: '', submitting: false })
          wx.reLaunch({ url: routes.workbench })
        },
        (error) => {
          this.setData({ error: errorMessage(error), submitting: false })
        },
      )
    }
    catch (error) {
      this.setData({ error: errorMessage(error), submitting: false })
    }
  },
})
