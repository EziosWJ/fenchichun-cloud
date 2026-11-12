import { routes } from '@/config/routes'
import { grainService } from '@/features/grain/api-service'
import { applyAsync, errorMessage, requireLogin } from '@/features/grain/page'
import { roleLabels } from '@/features/grain/presentation'

Page({
  data: {
    loading: true,
    error: '',
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
  logout() {
    wx.showModal({
      title: '退出登录',
      content: '确定退出当前账号？',
      success: ({ confirm }) => {
        if (!confirm) {
          return
        }
        try {
          applyAsync(
            grainService.logout(),
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
