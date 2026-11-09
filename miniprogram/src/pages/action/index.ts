import type { Conclusion, Trip } from '@/features/grain/types'
import { errorMessage, requireLogin } from '@/features/grain/page'
import { tripStatus } from '@/features/grain/presentation'
import { demo } from '@/features/grain/service'

Page({
  data: {
    id: '',
    action: '',
    trip: null as Trip | null,
    loading: true,
    error: '',
    formError: '',
    conclusion: '' as Conclusion | '',
    reason: '',
    location: '',
    confirming: false,
  },
  onLoad(query: Record<string, string | undefined>) {
    this.setData({ id: query.id || '', action: query.action || '' })
    wx.setNavigationBarTitle({
      title: query.action === 'visual' ? '确认目测' : '确认卸粮',
    })
    this.load()
  },
  load() {
    this.setData({ loading: true, error: '' })
    try {
      if (!requireLogin('warehouse')) {
        return
      }
      const trip = demo.getTrip(this.data.id)
      if (
        tripStatus(trip).action !== this.data.action
        || !['visual', 'unload'].includes(this.data.action)
      ) {
        throw new Error('当前状态已变化，请返回详情重新核对')
      }
      this.setData({ trip })
    }
    catch (error) {
      this.setData({ error: errorMessage(error) })
    }
    finally {
      this.setData({ loading: false })
    }
  },
  selectConclusion(event: WechatMiniprogram.BaseEvent) {
    this.setData({
      conclusion: event.currentTarget.dataset.value as Conclusion,
      formError: '',
    })
  },
  inputReason(event: WechatMiniprogram.Input) {
    this.setData({ reason: event.detail.value, formError: '' })
  },
  inputLocation(event: WechatMiniprogram.Input) {
    this.setData({ location: event.detail.value, formError: '' })
  },
  submit() {
    const trip = this.data.trip
    if (!trip || this.data.confirming) {
      return
    }
    const { action, conclusion, reason, location } = this.data
    if (action === 'visual' && !conclusion) {
      return this.setData({ formError: '请选择目测结论' })
    }
    if (action === 'visual' && conclusion === 'reject' && !reason.trim()) {
      return this.setData({ formError: '请填写拒收原因' })
    }
    if (action === 'unload' && !location.trim()) {
      return this.setData({ formError: '请填写实际卸粮地点' })
    }
    const content
      = action === 'visual'
        ? `请核对 ${trip.plate}、${trip.material}和供应商 ${trip.supplier}。目测${conclusion === 'accept' ? '接收' : `拒收，原因：${reason.trim()}`}；确认后不可覆盖。`
        : `请确认 ${trip.plate} 已完成现场首磅和卸粮，实际卸粮地点为 ${location.trim()}。`
    this.setData({ confirming: true })
    wx.showModal({
      title: action === 'visual' ? '确认目测结果' : '确认现场卸粮',
      content,
      confirmText: '确认',
      success: ({ confirm }) => {
        if (!confirm) {
          return
        }
        try {
          if (action === 'visual') {
            demo.recordVisual(
              trip.id,
              trip.version,
              conclusion as Conclusion,
              reason,
            )
          }
          else {
            demo.confirmUnload(trip.id, trip.version, location)
          }
          wx.navigateBack()
        }
        catch (error) {
          this.setData({ formError: errorMessage(error) })
        }
      },
      complete: () => this.setData({ confirming: false }),
    })
  },
})
