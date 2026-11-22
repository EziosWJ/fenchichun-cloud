import { routes } from '@/config/routes'
import { grainService } from '@/features/grain/api-service'
import { applyAsync, errorMessage } from '@/features/grain/page'

let collapseTimer: ReturnType<typeof setTimeout> | null = null

Page({
  data: {
    statusBarHeight: 20,
    typing: false,
    focused: false,
    account: '',
    password: '',
    showPassword: false,
    passwordFocus: false,
    error: '',
    submitting: false,
  },
  onLoad() {
    try {
      const statusBarHeight = wx.getWindowInfo().statusBarHeight
      if (statusBarHeight) {
        this.setData({ statusBarHeight })
      }
    }
    catch {
      // 旧基础库取不到窗口信息时沿用默认值，不影响登录
    }
  },
  handleInputFocus() {
    this.setData({ focused: true, typing: true })
  },
  handleInputBlur() {
    this.setData({ focused: false })
    this.collapseWhenKeyboardClosed()
  },
  collapseWhenKeyboardClosed() {
    if (collapseTimer) {
      clearTimeout(collapseTimer)
    }
    collapseTimer = setTimeout(() => {
      collapseTimer = null
      if (!this.data.focused) {
        this.setData({ typing: false })
      }
    }, 200)
  },
  onUnload() {
    if (collapseTimer) {
      clearTimeout(collapseTimer)
      collapseTimer = null
    }
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
  focusPassword() {
    this.setData({ passwordFocus: true })
  },
  blurPassword() {
    this.setData({ passwordFocus: false, focused: false })
    this.collapseWhenKeyboardClosed()
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
