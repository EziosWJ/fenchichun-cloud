import type { Conclusion, Trip } from '@/features/grain/types'
import { errorMessage, requireLogin } from '@/features/grain/page'
import { demo } from '@/features/grain/service'

Page({
  data: {
    loading: true,
    error: '',
    labs: [] as Trip[],
    weights: [] as Trip[],
    confirming: false,
  },
  onShow() {
    this.load()
  },
  load() {
    this.setData({ loading: true, error: '' })
    try {
      if (!requireLogin()) {
        return
      }
      const tasks = demo.simulationTasks()
      this.setData({ labs: tasks.lab, weights: tasks.weigh })
    }
    catch (error) {
      this.setData({ error: errorMessage(error) })
    }
    finally {
      this.setData({ loading: false })
    }
  },
  lab(event: WechatMiniprogram.BaseEvent) {
    const trip = this.data.labs.find(
      item => item.id === event.currentTarget.dataset.id,
    )
    if (!trip || this.data.confirming) {
      return
    }
    if (!trip.supplier) {
      return wx.showModal({
        title: '请先补充供应商',
        content: '回到库管流转单详情，更正登记并选择供应商后再模拟化验。',
        showCancel: false,
      })
    }
    this.setData({ confirming: true })
    wx.showActionSheet({
      itemList: ['模拟化验接收', '模拟化验拒收'],
      success: ({ tapIndex }) => {
        const conclusion: Conclusion = tapIndex === 0 ? 'accept' : 'reject'
        const reason
          = conclusion === 'reject' ? '模拟结果：水分不符合接收要求' : ''
        wx.showModal({
          title: '生成模拟化验结果',
          content: `为 ${trip.plate}（${trip.id}）生成模拟${conclusion === 'accept' ? '接收' : `拒收，${reason}`}结果？`,
          success: ({ confirm }) => {
            if (!confirm) {
              return
            }
            try {
              demo.simulateLab(trip.id, trip.version, conclusion, reason)
              wx.showToast({ title: '模拟结果已生成', icon: 'success' })
              this.load()
            }
            catch (error) {
              wx.showModal({
                title: '模拟未完成',
                content: errorMessage(error),
                showCancel: false,
              })
              this.load()
            }
          },
          complete: () => this.setData({ confirming: false }),
        })
      },
      fail: () => this.setData({ confirming: false }),
    })
  },
  ticket(event: WechatMiniprogram.BaseEvent) {
    const trip = this.data.weights.find(
      item => item.id === event.currentTarget.dataset.id,
    )
    if (!trip || this.data.confirming) {
      return
    }
    this.setData({ confirming: true })
    wx.showModal({
      title: '模拟磅单同步',
      content: `为 ${trip.plate}（${trip.id}）生成一张本地模拟正式磅单？`,
      success: ({ confirm }) => {
        if (!confirm) {
          return
        }
        try {
          demo.simulateTicket(trip.id, trip.version)
          wx.showToast({ title: '模拟磅单已生成', icon: 'success' })
          this.load()
        }
        catch (error) {
          wx.showModal({
            title: '模拟未完成',
            content: errorMessage(error),
            showCancel: false,
          })
          this.load()
        }
      },
      complete: () => this.setData({ confirming: false }),
    })
  },
})
