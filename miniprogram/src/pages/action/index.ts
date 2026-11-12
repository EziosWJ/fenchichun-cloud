import type { Conclusion, Trip } from '@/features/grain/types'
import { grainService } from '@/features/grain/api-service'
import {
  currentDictionary,
  refreshDictionary,
  sameDictionary,
} from '@/features/grain/dictionary-service'
import { applyAsync, errorMessage, requireLogin } from '@/features/grain/page'
import { tripStatus } from '@/features/grain/presentation'

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
    granaries: [] as string[],
    granaryIndex: 0,
    confirming: false,
  },
  onLoad(query: Record<string, string | undefined>) {
    this.setData({ id: query.id || '', action: query.action || '' })
    wx.setNavigationBarTitle({
      title: query.action === 'visual' ? '确认目测' : '确认卸货',
    })
    this.load()
  },
  load(refresh: unknown = true) {
    this.setData({ loading: true, error: '' })
    try {
      if (!requireLogin('warehouse')) {
        return
      }
      const dictionary = currentDictionary()
      const apply = (trip: Trip) => {
        if (
          tripStatus(trip).action !== this.data.action
          || !['visual', 'unload'].includes(this.data.action)
        ) {
          throw new Error('当前状态已变化，请返回详情重新核对')
        }
        this.setData({
          trip,
          granaries: ['请选择卸货地点', ...dictionary.granaries.map(item => item.name)],
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
    if (refresh !== false) {
      this.refresh()
    }
  },
  refresh() {
    const before = currentDictionary()
    void refreshDictionary().then((after) => {
      if (after && !sameDictionary(before, after)) {
        this.load(false)
      }
    })
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
  chooseGranary(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value)
    this.setData({
      granaryIndex: index,
      location: index ? this.data.granaries[index] : '',
      formError: '',
    })
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
      return this.setData({ formError: '请选择实际卸货地点' })
    }
    const content
      = action === 'visual'
        ? `请核对 ${trip.plate}、${trip.material}和供应商 ${trip.supplier}。目测${conclusion === 'accept' ? '接收' : `拒收，原因：${reason.trim()}`}；确认后不可覆盖。`
        : `请确认 ${trip.plate} 已完成现场首磅和卸货，实际卸货地点为 ${location.trim()}。`
    this.setData({ confirming: true })
    wx.showModal({
      title: action === 'visual' ? '确认目测结果' : '确认现场卸货',
      content,
      confirmText: '确认',
      success: ({ confirm }) => {
        if (!confirm) {
          this.setData({ confirming: false })
          return
        }
        this.submitAction()
      },
    })
  },
  submitAction() {
    const trip = this.data.trip
    const { action, conclusion, reason, location } = this.data
    if (!trip) {
      return
    }
    this.setData({ confirming: true })
    try {
      if (action === 'visual') {
        applyAsync(
          grainService.recordVisual(
            trip.serverId,
            trip.version,
            conclusion as Conclusion,
            reason,
          ),
          () => {
            this.setData({ confirming: false })
            wx.navigateBack()
          },
          (error) => {
            this.setData({ formError: errorMessage(error), confirming: false })
            this.load(false)
          },
        )
        return
      }
      applyAsync(
        grainService.confirmUnload(trip.serverId, trip.version, location),
        () => {
          this.setData({ confirming: false })
          wx.navigateBack()
        },
        (error) => {
          this.setData({ formError: errorMessage(error), confirming: false })
          this.load(false)
        },
      )
    }
    catch (error) {
      this.setData({ formError: errorMessage(error), confirming: false })
    }
  },
})
