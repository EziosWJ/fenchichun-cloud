import { env } from '@/config/env'
import { routes } from '@/config/routes'
import { applyAsync, errorMessage, requireLogin } from '@/features/grain/page'
import { roleLabels } from '@/features/grain/presentation'
import { demo } from '@/features/grain/service'

Page({
  data: {
    loading: true,
    error: '',
    mock: env.mock,
    name: '',
    account: '',
    roles: '',
    role: '',
  },
  onShow() {
    this.load()
  },
  load() {
    this.setData({ loading: true, error: '' })
    try {
      const current = requireLogin()
      if (!current) {
        return
      }
      this.setData({
        name: current.user.name,
        account: current.user.account,
        roles: current.user.roles.map(role => roleLabels[role]).join('、'),
        role: roleLabels[current.role],
      })
    }
    catch (error) {
      this.setData({ error: errorMessage(error) })
    }
    finally {
      this.setData({ loading: false })
    }
  },
  simulation() {
    wx.navigateTo({ url: routes.simulation })
  },
  reset() {
    wx.showModal({
      title: '恢复初始演示数据',
      content: '将清除本机新增和修改的演示记录，恢复预置场景。确定继续？',
      confirmText: '恢复',
      success: ({ confirm }) => {
        if (!confirm) {
          return
        }
        try {
          demo.reset()
          wx.showToast({ title: '已恢复初始数据', icon: 'success' })
          this.load()
        }
        catch (error) {
          wx.showToast({ title: errorMessage(error), icon: 'none' })
        }
      },
    })
  },
  logout() {
    wx.showModal({
      title: '退出登录',
      content: '退出当前演示账号？本机演示数据会保留。',
      success: ({ confirm }) => {
        if (!confirm) {
          return
        }
        try {
          applyAsync(
            demo.logout(),
            () => wx.reLaunch({ url: routes.login }),
            error => wx.showToast({ title: errorMessage(error), icon: 'none' }),
          )
        }
        catch (error) {
          wx.showToast({ title: errorMessage(error), icon: 'none' })
        }
      },
    })
  },
})
