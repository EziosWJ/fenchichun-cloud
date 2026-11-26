import type { HistoryWeighing, OutboundProfile, OutboundQr, OutboundWeighing, ScaleReading } from '@/features/outbound/api'
import { routes } from '@/config/routes'
import { grainService } from '@/features/grain/api-service'
import { errorMessage, requireLogin } from '@/features/grain/page'
import { cancelPending, firstWeighQR, handoffQrImage, outboundCurrent, outboundHistory, outboundProfile, outboundWeight, secondWeighQR } from '@/features/outbound/api'

interface QrView extends OutboundQr {
  action: 'first' | 'second'
  weighingId: number
}

interface HistoryView {
  id: number
  ticketNo: string
  statusLabel: string
  sourceLabel: string
  firstText: string
  secondText: string
  firstLabel: string
  secondLabel: string
  netText: string
  dateText: string
  factoryTaskNo: string
}

function weightText(milliTonne: number) {
  return (milliTonne / 1000).toFixed(3)
}

function timeText(value?: string) {
  if (!value) {
    return ''
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const two = (number: number) => String(number).padStart(2, '0')
  return `${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`
}

function statusText(status: string) {
  const labels: Record<string, string> = {
    first_qr_ready: '待厂端扫描首磅码',
    first_scanning: '厂端首磅采集处理中',
    first_recorded: '首磅已确认，待回磅',
    second_qr_ready: '待厂端扫描回磅码',
    second_scanning: '厂端回磅采集处理中',
    completed: '厂端已出单',
    terminated: '厂端已终止首磅任务',
    expired: '首磅二维码已过期',
    cancelled: '已取消',
  }
  return labels[status] || status
}

function sourceText(source: string) {
  return source === 'mobile_direct' ? '手机直出' : '手机扫码'
}

function historyView(item: HistoryWeighing): HistoryView {
  return {
    id: item.id,
    ticketNo: item.ticketNo || '待厂端出单',
    statusLabel: statusText(item.status),
    sourceLabel: sourceText(item.source),
    firstText: weightText(item.firstWeightMilliTonne),
    secondText: weightText(item.secondWeightMilliTonne),
    firstLabel: item.source === 'mobile_direct' ? '首磅毛重' : '首磅皮重',
    secondLabel: item.source === 'mobile_direct' ? '回磅皮重' : '回磅毛重',
    netText: weightText(item.netMilliTonne),
    dateText: timeText(item.secondAt || item.firstAt),
    factoryTaskNo: item.factoryTaskNo || '',
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
    current: null as OutboundWeighing | null,
    qr: null as QrView | null,
    qrTitle: '',
    qrExpireText: '',
    statusLabel: '',
    firstText: '',
    secondText: '',
    netText: '',
    taskText: '',
    ticketText: '',
    message: '',
    tab: 'weigh' as 'weigh' | 'history',
    historyLoading: false,
    historyError: '',
    history: [] as HistoryView[],
  },
  lastStatus: '',
  ignoredCurrentID: 0,
  weightTimer: null as ReturnType<typeof setInterval> | null,
  currentTimer: null as ReturnType<typeof setInterval> | null,
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
    this.setData({ loading: true, error: '', busy: false })
    outboundProfile().then((profile) => {
      this.setData({
        loading: false,
        profile,
        plate: profile.plate,
        partyName: profile.partyName,
      })
      this.applyCurrent(profile.current)
      if (this.data.tab === 'weigh') {
        this.startPolling()
      }
    }).catch((error) => {
      this.setData({ loading: false, error: errorMessage(error) })
    })
  },
  applyCurrent(current?: OutboundWeighing) {
    if (current && current.id === this.ignoredCurrentID) {
      this.setData({ current: null, qr: null, statusLabel: '', message: '' })
      return
    }
    const previous = this.lastStatus
    this.lastStatus = current ? current.status : ''
    const keepQR = this.data.qr && current && this.data.qr.weighingId === current.id && (
      (current.status === 'first_qr_ready' && this.data.qr.action === 'first')
      || (current.status === 'second_qr_ready' && this.data.qr.action === 'second')
    )
    const terminal = !!current && ['completed', 'terminated', 'expired', 'cancelled'].includes(current.status)
    this.setData({
      current: current || null,
      firstText: current ? weightText(current.firstWeightMilliTonne) : '',
      secondText: current ? weightText(current.secondWeightMilliTonne) : '',
      netText: current ? weightText(current.netMilliTonne) : '',
      taskText: current ? current.factoryTaskNo : '',
      ticketText: current ? current.ticketNo : '',
      statusLabel: current ? statusText(current.status) : '',
      message: current ? current.message : '',
      qr: keepQR ? this.data.qr : null,
      busy: terminal ? false : this.data.busy,
    })
    if (current && previous !== current.status) {
      if (current.status === 'first_recorded') {
        wx.showToast({ title: '厂端首磅已确认，请装货后回磅', icon: 'none' })
      }
      else if (current.status === 'first_scanning') {
        wx.showToast({ title: '厂端正在采集首磅', icon: 'none' })
      }
      else if (current.status === 'second_scanning') {
        wx.showToast({ title: '厂端正在采集回磅', icon: 'none' })
      }
      else if (current.status === 'completed') {
        wx.showToast({ title: '厂端已出单', icon: 'success' })
      }
      else if (current.status === 'terminated') {
        wx.showToast({ title: '首磅任务已被厂端终止', icon: 'none' })
      }
    }
  },
  startPolling() {
    this.stopPolling()
    this.refreshWeight()
    this.weightTimer = setInterval(() => this.refreshWeight(), 1000)
    this.currentTimer = setInterval(() => this.refreshCurrent(), 2000)
  },
  stopPolling() {
    if (this.weightTimer) {
      clearInterval(this.weightTimer)
      this.weightTimer = null
    }
    if (this.currentTimer) {
      clearInterval(this.currentTimer)
      this.currentTimer = null
    }
  },
  refreshWeight() {
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
    })
  },
  refreshCurrent() {
    outboundCurrent().then((value) => {
      this.applyCurrent(value.current)
    }).catch(() => {
      // 当前状态读取失败不打断称重读数，下一次轮询继续。
    })
  },
  doFirst() {
    if (this.data.busy) {
      wx.showToast({ title: '正在处理，请稍候', icon: 'none' })
      return
    }
    if (!this.data.available || !this.data.reading) {
      wx.showToast({ title: '地磅读数不可用', icon: 'none' })
      this.refreshWeight()
      return
    }
    wx.showModal({
      title: '确认首磅（皮重）',
      content: `当前重量 ${this.data.weightText} 吨，确认后生成首磅二维码，由厂端扫码采集并生成待回磅任务。`,
      confirmText: '确认',
      success: ({ confirm }) => {
        if (!confirm) {
          return
        }
        this.setData({ busy: true })
        firstWeighQR().then((current) => {
          this.setData({ busy: false })
          this.applyCurrent(current)
          if (current.qr) {
            this.setQr(current.qr, 'first', current.id)
            wx.showToast({ title: '首磅二维码已生成，请让厂端扫码', icon: 'none' })
          }
          this.refreshWeight()
        }).catch((error) => {
          this.setData({ busy: false })
          wx.showToast({ title: errorMessage(error), icon: 'none' })
          this.refreshCurrent()
        })
      },
    })
  },
  doSecond() {
    const current = this.data.current
    if (this.data.busy || !current || current.status !== 'first_recorded') {
      return
    }
    if (!this.data.available || !this.data.reading) {
      wx.showToast({ title: '地磅读数不可用', icon: 'none' })
      this.refreshWeight()
      return
    }
    const tare = current.firstWeightMilliTonne
    const gross = this.data.reading ? this.data.reading.weightMilliTonne : 0
    const net = gross > tare ? weightText(gross - tare) : '0.000'
    wx.showModal({
      title: '确认回磅（毛重）',
      content: `首磅皮重 ${weightText(tare)} 吨，当前毛重 ${this.data.weightText} 吨，预计净重 ${net} 吨。确认后生成回磅二维码，由厂端扫码采集并出单。`,
      confirmText: '确认',
      success: ({ confirm }) => {
        if (!confirm) {
          return
        }
        this.setData({ busy: true })
        secondWeighQR().then((value) => {
          this.setData({ busy: false })
          this.applyCurrent(value)
          if (value.qr) {
            this.setQr(value.qr, 'second', value.id)
            wx.showToast({ title: '回磅二维码已生成，请让厂端扫码', icon: 'none' })
          }
          this.refreshWeight()
        }).catch((error) => {
          this.setData({ busy: false })
          wx.showToast({ title: errorMessage(error), icon: 'none' })
          this.refreshCurrent()
        })
      },
    })
  },
  setQr(qr: OutboundQr, action: 'first' | 'second', weighingId: number) {
    this.setData({
      qr: { ...qr, action, weighingId, image: handoffQrImage(qr.value) },
      qrTitle: action === 'first' ? '首磅二维码' : '回磅二维码',
      qrExpireText: timeText(qr.expiresAt),
    })
  },
  regenerateQR() {
    const current = this.data.current
    if (this.data.busy) {
      return
    }
    if (!current || (current.status !== 'first_qr_ready' && current.status !== 'second_qr_ready')) {
      return
    }
    this.setData({ busy: true })
    const action = current.status === 'first_qr_ready' ? 'first' : 'second'
    const request = action === 'first' ? firstWeighQR : secondWeighQR
    request().then((value) => {
      this.setData({ busy: false })
      this.applyCurrent(value)
      if (value.qr) {
        this.setQr(value.qr, action, value.id)
        wx.showToast({ title: '二维码已重新生成', icon: 'none' })
      }
    }).catch((error) => {
      this.setData({ busy: false })
      wx.showToast({ title: errorMessage(error), icon: 'none' })
    })
  },
  cancelCurrent() {
    const current = this.data.current
    if (this.data.busy || !current) {
      return
    }
    const isSecond = current.status === 'second_qr_ready'
    wx.showModal({
      title: isSecond ? '取消回磅二维码' : '取消首磅',
      content: isSecond ? '确定撤销当前回磅二维码，重新回磅？' : '确定取消本次首磅？厂端尚未扫码时可以直接取消。',
      success: ({ confirm }) => {
        if (!confirm) {
          return
        }
        this.setData({ busy: true })
        cancelPending().then(() => {
          this.setData({ busy: false, qr: null })
          wx.showToast({ title: isSecond ? '已取消回磅二维码' : '已取消首磅', icon: 'none' })
          this.refreshCurrent()
          this.refreshWeight()
        }).catch((error) => {
          this.setData({ busy: false })
          wx.showToast({ title: errorMessage(error), icon: 'none' })
        })
      },
    })
  },
  finish() {
    const current = this.data.current
    this.ignoredCurrentID = current ? current.id : 0
    this.lastStatus = ''
    this.setData({ current: null, qr: null, statusLabel: '', message: '', firstText: '', secondText: '', netText: '', taskText: '', ticketText: '' })
    this.refreshWeight()
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
    this.startPolling()
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
