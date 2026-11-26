import type { HistoryWeighing, OutboundProfile, PendingWeighing, ScaleReading, TicketResult } from '@/features/outbound/api'
import { routes } from '@/config/routes'
import { grainService } from '@/features/grain/api-service'
import { errorMessage, requireLogin } from '@/features/grain/page'
import {
  cancelPending,
  firstWeigh,
  outboundHistory,
  outboundProfile,
  outboundWeight,
  secondWeigh,
} from '@/features/outbound/api'

interface HistoryView {
  ticketNo: string
  firstText: string
  secondText: string
  netText: string
  dateText: string
}

function weightText(milliTonne: number) {
  return (milliTonne / 1000).toFixed(3)
}

let pollTimer: ReturnType<typeof setInterval> | null = null
let pollBusy = false

const pendingTTL = 6 * 60 * 60 * 1000

function dateTimeText(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const two = (number: number) => String(number).padStart(2, '0')
  return `${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`
}

function historyView(item: HistoryWeighing): HistoryView {
  return {
    ticketNo: item.ticketNo,
    firstText: weightText(item.firstWeightMilliTonne),
    secondText: weightText(item.secondWeightMilliTonne),
    netText: weightText(item.netMilliTonne),
    dateText: dateTimeText(item.secondAt),
  }
}

Page({
  data: {
    loading: true,
    error: '',
    busy: false,
    profile: null as OutboundProfile | null,
    plate: '',
    partyName: '',
    reading: null as ScaleReading | null,
    weightText: '0.000',
    statusText: '正在读取地磅',
    available: false,
    mock: false,
    pending: null as PendingWeighing | null,
    firstText: '',
    result: null as TicketResult | null,
    netText: '',
    resultFirstText: '',
    resultSecondText: '',
    tab: 'weigh' as 'weigh' | 'history',
    historyLoading: false,
    historyError: '',
    history: [] as HistoryView[],
  },
  onShow() {
    try {
      wx.hideTabBar({ animation: false })
    }
    catch {
      // 非 tab 环境忽略。
    }
    const current = requireLogin('outbound')
    if (!current) {
      return
    }
    this.load()
    if (this.data.tab === 'history') {
      this.loadHistory()
    }
  },
  onHide() {
    this.stopPolling()
  },
  onUnload() {
    this.stopPolling()
    try {
      wx.showTabBar({ animation: false })
    }
    catch {
      // 忽略。
    }
  },
  load() {
    this.setData({ loading: true, error: '' })
    outboundProfile().then((profile) => {
      this.setData({
        loading: false,
        profile,
        plate: profile.plate,
        partyName: profile.partyName,
        pending: profile.pending ?? null,
        firstText: profile.pending ? weightText(profile.pending.firstWeightMilliTonne) : '',
        result: null,
      })
      if (this.data.tab === 'weigh') {
        this.startPolling()
      }
    }).catch((error) => {
      this.setData({ loading: false, error: errorMessage(error) })
    })
  },
  loadHistory() {
    this.setData({ historyLoading: true, historyError: '' })
    outboundHistory().then((page) => {
      this.setData({
        historyLoading: false,
        history: (page.records ?? []).map(historyView),
      })
    }).catch((error) => {
      this.setData({ historyLoading: false, historyError: errorMessage(error) })
    })
  },
  changeTab(event: WechatMiniprogram.TouchEvent) {
    const tab = event.currentTarget.dataset.tab === 'history' ? 'history' : 'weigh'
    if (tab === this.data.tab) {
      return
    }
    this.setData({ tab })
    try {
      wx.pageScrollTo({ scrollTop: 0, duration: 0 })
    }
    catch {
      // 忽略。
    }
    if (tab === 'history') {
      this.stopPolling()
      this.loadHistory()
      return
    }
    if (this.data.profile) {
      this.startPolling()
    }
  },
  startPolling() {
    this.stopPolling()
    this.refreshWeight()
    pollTimer = setInterval(() => this.refreshWeight(), 1000)
  },
  stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  },
  refreshWeight() {
    this.dropExpiredPending()
    if (pollBusy) {
      return
    }
    pollBusy = true
    outboundWeight().then((reading) => {
      this.setData({
        reading,
        weightText: weightText(reading.weightMilliTonne),
        available: reading.available,
        mock: reading.mock,
        statusText: reading.message,
      })
    }).catch(() => {
      this.setData({ available: false, statusText: '地磅服务连接失败' })
    }).then(() => {
      pollBusy = false
    })
  },
  dropExpiredPending() {
    const pending = this.data.pending
    if (!pending) {
      return
    }
    const firstAt = new Date(pending.firstAt).getTime()
    if (Number.isNaN(firstAt) || Date.now() - firstAt < pendingTTL) {
      return
    }
    this.setData({ pending: null, firstText: '' })
    wx.showToast({ title: '首磅已超过6小时，已自动清除', icon: 'none' })
  },
  doFirst() {
    if (this.data.busy || !this.data.available) {
      return
    }
    this.setData({ busy: true })
    firstWeigh().then((value) => {
      this.setData({
        pending: value.pending,
        firstText: weightText(value.pending.firstWeightMilliTonne),
        busy: false,
      })
      wx.showToast({ title: '首磅已记录，请卸货', icon: 'none' })
      this.refreshWeight()
    }).catch((error) => {
      this.setData({ busy: false })
      wx.showToast({ title: errorMessage(error), icon: 'none' })
    })
  },
  doSecond() {
    if (this.data.busy || !this.data.available || !this.data.pending) {
      return
    }
    this.setData({ busy: true })
    secondWeigh().then((result) => {
      this.stopPolling()
      this.setData({
        busy: false,
        pending: null,
        firstText: '',
        result,
        netText: weightText(result.netMilliTonne),
        resultFirstText: weightText(result.firstWeightMilliTonne),
        resultSecondText: weightText(result.secondWeightMilliTonne),
      })
      wx.showToast({ title: '过磅完成', icon: 'success' })
    }).catch((error) => {
      this.setData({ busy: false })
      wx.showToast({ title: errorMessage(error), icon: 'none' })
    })
  },
  cancelFirst() {
    if (this.data.busy || !this.data.pending) {
      return
    }
    wx.showModal({
      title: '取消首磅',
      content: '确定放弃本次首磅重量，重新开始过磅？',
      success: ({ confirm }) => {
        if (!confirm) {
          return
        }
        this.setData({ busy: true })
        cancelPending().then(() => {
          this.setData({ busy: false, pending: null, firstText: '' })
          wx.showToast({ title: '已取消首磅', icon: 'none' })
          this.refreshWeight()
        }).catch((error) => {
          this.setData({ busy: false })
          wx.showToast({ title: errorMessage(error), icon: 'none' })
        })
      },
    })
  },
  finish() {
    this.setData({ result: null })
    this.load()
  },
  exit() {
    wx.showModal({
      title: '退出登录',
      content: '确定退出当前账号？',
      success: ({ confirm }) => {
        if (!confirm) {
          return
        }
        grainService.logout().catch(() => null).then(() => {
          this.stopPolling()
          try {
            wx.showTabBar({ animation: false })
          }
          catch {
            // 忽略。
          }
          wx.reLaunch({ url: routes.login })
        })
      },
    })
  },
})
