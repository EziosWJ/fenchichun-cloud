import type { Trip } from '@/features/grain/types'
import { routes } from '@/config/routes'
import { grainService } from '@/features/grain/api-service'
import { applyAsync, errorMessage, requireLogin } from '@/features/grain/page'
import { canEdit, inspectionText, tripStatus } from '@/features/grain/presentation'

const stepTitles: Record<string, string> = {
  current: '当前步骤',
  registration: '登记信息',
  inspection: '检验结果',
  unload: '卸货信息',
  ticket: '正式磅单',
  permit: '出门证',
}

Page({
  data: {
    id: '',
    step: 'current',
    loading: true,
    error: '',
    trip: null as Trip | null,
    title: '当前步骤',
    status: '',
    next: '',
    action: '',
    inspection: '',
    editable: false,
  },
  onLoad(query: Record<string, string | undefined>) {
    const step = query.step && stepTitles[query.step] ? query.step : 'current'
    this.setData({ id: query.id || '', step, title: stepTitles[step] })
    wx.setNavigationBarTitle({ title: stepTitles[step] })
  },
  onShow() {
    this.load()
  },
  load() {
    this.setData({ loading: true, error: '' })
    try {
      if (!requireLogin('warehouse')) {
        return
      }
      const apply = (trip: Trip) => {
        const status = tripStatus(trip)
        this.setData({
          trip,
          status: status.label,
          next: status.next,
          action: status.action,
          inspection: inspectionText(trip),
          editable: canEdit(trip),
        })
        this.setData({ loading: false })
      }
      applyAsync(grainService.getTrip(this.data.id), apply, (error) => {
        this.setData({ error: errorMessage(error), loading: false })
      })
    }
    catch (error) {
      this.setData({ error: errorMessage(error), loading: false })
    }
  },
  edit() {
    wx.navigateTo({
      url: `${routes.registration}?id=${encodeURIComponent(this.data.id)}`,
    })
  },
})
