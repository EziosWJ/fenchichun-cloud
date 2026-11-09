import type { Trip } from '@/features/grain/types'
import { errorMessage, requireLogin } from '@/features/grain/page'
import {
  exitEligible,
  exitType,
  inspectionText,
} from '@/features/grain/presentation'
import { demo } from '@/features/grain/service'

Page({
  data: {
    id: '',
    trip: null as Trip | null,
    loading: true,
    error: '',
    eligible: false,
    type: '',
    inspection: '',
    evidenceExpanded: false,
    confirming: false,
  },
  onLoad(query: Record<string, string | undefined>) {
    this.setData({ id: query.id || '' })
  },
  onShow() {
    this.load()
  },
  load() {
    this.setData({ loading: true, error: '' })
    try {
      if (!requireLogin('guard')) {
        return
      }
      const trip = demo.getTrip(this.data.id)
      this.setData({
        trip,
        eligible: exitEligible(trip),
        type: exitType(trip),
        inspection: inspectionText(trip),
      })
    }
    catch (error) {
      this.setData({ error: errorMessage(error) })
    }
    finally {
      this.setData({ loading: false })
    }
  },
  toggleEvidence() {
    this.setData({ evidenceExpanded: !this.data.evidenceExpanded })
  },
  confirmExit() {
    const trip = this.data.trip
    if (!trip || !this.data.eligible || this.data.confirming) {
      return
    }
    const basis
      = trip.inspection?.conclusion === 'reject'
        ? `${this.data.inspection}，原因：${trip.inspection.reason}`
        : `出门证 ${trip.permit?.id} 已审批`
    this.setData({ confirming: true })
    wx.showModal({
      title: '确认实际出厂',
      content: `请核对现场车辆 ${trip.plate}、${trip.site}及${basis}。确认车辆正在实际放行？`,
      confirmText: '确认出厂',
      success: ({ confirm }) => {
        if (!confirm) {
          return
        }
        try {
          demo.confirmExit(trip.id, trip.version)
          wx.showToast({ title: '已确认实际出厂', icon: 'success' })
          this.load()
        }
        catch (error) {
          wx.showModal({
            title: '出厂未确认',
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
