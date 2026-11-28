import type { HistoryQuery, HistoryWeighing, OutboundPrintAttempt, OutboundPrintStatus, OutboundProfile, OutboundQr, OutboundWeighing, ScaleReading } from '@/features/outbound/api'
import { routes } from '@/config/routes'
import { grainService } from '@/features/grain/api-service'
import { errorMessage, requireLogin } from '@/features/grain/page'
import { createOutboundPrintScan, firstWeighQR, handoffQrImage, outboundCurrent, outboundHistory, outboundPrintStatus, outboundProfile, outboundWeight, printQrImage, secondWeighQR, startOutboundPrint, verifyOutboundPrint } from '@/features/outbound/api'

type HistoryType = 'all' | 'first' | 'second'
type HistoryStatus = 'all' | 'pending' | 'completed'
type HistoryRange = 'today' | '7d' | '30d' | '3m' | 'custom'

interface QrView extends OutboundQr {
  action: 'first' | 'second'
  weighingId: number
}

interface HistoryView {
  id: number
  type: 'first' | 'second'
  statusLabel: string
  statusKind: 'pending' | 'completed' | 'muted'
  infoText: string
  firstText: string
  secondText: string
  mainText: string
  showNetLabel: boolean
  printable: boolean
  dateText: string
}

interface PrintAttemptView {
  id: number
  sourceLabel: string
  intentLabel: string
  statusLabel: string
  statusKind: 'ok' | 'warn' | 'error'
  timeText: string
  reason: string
  actorText: string
  scanLabel: string
}

const printStatusLabels: Record<string, string> = {
  unprinted: '未打印',
  printing: '打印中',
  printed: '已打印',
  failed: '打印失败',
  unknown: '结果未知',
}

const printSourceLabels: Record<string, string> = {
  factory: '厂端',
  mobile: '手机端',
  driver: '司机核实',
}

const printAttemptStatusLabels: Record<string, string> = {
  initiated: '打印中',
  unknown: '结果未知',
  printed: '已打印',
  failed: '打印失败',
}

function printAttemptView(attempt: OutboundPrintAttempt): PrintAttemptView {
  return {
    id: attempt.id,
    sourceLabel: printSourceLabels[attempt.source] ?? attempt.source,
    intentLabel: attempt.intent === 'reprint' ? '补打' : '正常打印',
    statusLabel: printAttemptStatusLabels[attempt.status] ?? attempt.status,
    statusKind: attempt.status === 'printed' ? 'ok' : (attempt.status === 'failed' ? 'error' : 'warn'),
    timeText: fullTimeText(attempt.initiatedAt),
    reason: attempt.reason,
    actorText: attempt.actorName ? `${attempt.source === 'mobile' ? '司机' : '操作员'} ${attempt.actorName}` : '',
    scanLabel: attempt.scanVerified ? '已扫码' : '',
  }
}

function weightText(milliTonne: number) {
  return (milliTonne / 1000).toFixed(3)
}

function fullTimeText(value?: string) {
  if (!value) {
    return ''
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const two = (number: number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`
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

function historyStatus(status: string): Pick<HistoryView, 'statusLabel' | 'statusKind'> {
  switch (status) {
    case 'completed':
      return { statusLabel: '已完成', statusKind: 'completed' }
    case 'first_recorded':
      return { statusLabel: '待回磅', statusKind: 'pending' }
    case 'first_qr_ready':
      return { statusLabel: '待首磅', statusKind: 'pending' }
    case 'first_scanning':
      return { statusLabel: '首磅处理中', statusKind: 'pending' }
    case 'second_qr_ready':
      return { statusLabel: '回磅待扫码', statusKind: 'pending' }
    case 'second_scanning':
      return { statusLabel: '回磅处理中', statusKind: 'pending' }
    case 'expired':
      return { statusLabel: '已过期', statusKind: 'muted' }
    case 'cancelled':
      return { statusLabel: '已取消', statusKind: 'muted' }
    case 'terminated':
      return { statusLabel: '已终止', statusKind: 'muted' }
    default:
      return { statusLabel: status, statusKind: 'muted' }
  }
}

function historyView(item: HistoryWeighing): HistoryView {
  const type = item.type === 'second' ? 'second' : 'first'
  const completed = item.status === 'completed'
  const base = {
    id: item.id,
    type,
    infoText: type === 'first' && item.status === 'first_recorded' ? '首磅完成，等待回磅' : '',
    firstText: weightText(item.firstWeightMilliTonne),
    secondText: weightText(item.secondWeightMilliTonne),
    printable: type === 'second' && completed,
    dateText: fullTimeText(item.secondAt || item.firstAt),
    ...historyStatus(item.status),
  } as const
  if (type === 'second') {
    return {
      ...base,
      mainText: completed ? weightText(item.netMilliTonne) : weightText(item.secondWeightMilliTonne),
      showNetLabel: completed,
    }
  }
  return {
    ...base,
    mainText: weightText(item.firstWeightMilliTonne),
    showNetLabel: false,
  }
}

interface LockedReading {
  text: string
  hint: string
}

function lockedReadingFor(current?: OutboundWeighing | null): LockedReading | null {
  if (!current) {
    return null
  }
  switch (current.status) {
    case 'first_qr_ready':
      return { text: weightText(current.firstWeightMilliTonne), hint: '首磅已锁定 · 刷新二维码重称' }
    case 'first_scanning':
      return { text: weightText(current.firstWeightMilliTonne), hint: '首磅已锁定 · 厂端正在采集' }
    case 'second_qr_ready':
      return { text: weightText(current.secondWeightMilliTonne), hint: '回磅已锁定 · 刷新二维码重称' }
    case 'second_scanning':
      return { text: weightText(current.secondWeightMilliTonne), hint: '回磅已锁定 · 厂端正在采集' }
    default:
      return null
  }
}

function dateOnly(date: Date) {
  const two = (number: number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`
}

function daysAgo(days: number) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return dateOnly(date)
}

function monthsAgo(months: number) {
  const date = new Date()
  date.setMonth(date.getMonth() - months)
  return dateOnly(date)
}

const historyRangeLabels: Record<HistoryRange, string> = {
  'today': '今天',
  '7d': '近7天',
  '30d': '近30天',
  '3m': '近三个月',
  'custom': '自定义',
}

const hiddenHistoryStatuses = new Set(['cancelled', 'terminated', 'expired'])

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    loading: true,
    error: '',
    busy: false,
    profile: null as OutboundProfile | null,
    plate: '',
    partyName: '',
    reading: null as ScaleReading | null,
    weightText: '0.000',
    liveWeightText: '0.000',
    weightLocked: false,
    statusText: '正在读取地磅',
    readingState: 'warn' as 'ok' | 'warn' | 'bad' | 'locked',
    readingHint: '正在读取地磅',
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
    historyLoadingMore: false,
    historyError: '',
    history: [] as HistoryView[],
    historyType: 'all' as HistoryType,
    historyStatus: 'all' as HistoryStatus,
    historyRange: '3m' as HistoryRange,
    historyRangeLabel: historyRangeLabels['3m'],
    historyFrom: monthsAgo(3),
    historyTo: dateOnly(new Date()),
    historyPage: 1,
    historyPageSize: 10,
    historyHasMore: false,
    historyTotal: 0,
    historyTotalNetText: '0.000',
    printStatus: null as OutboundPrintStatus | null,
    printStatusLoading: false,
    printStatusError: '',
    printStatusLabel: '未查询',
    printActionLabel: '打印详情',
    printNetText: '',
    printAttemptsView: [] as PrintAttemptView[],
    printDialogOpen: false,
    printDialogContext: 'completion' as 'completion' | 'history',
    printDialogWeighingId: 0,
    printReason: '',
    printQrValue: '',
    printQrImage: '',
    printQrExpireText: '',
    printQrHint: '',
    printNotice: '',
    printSubmitting: false,
    printScanTitle: '打印原因',
    printScanPlaceholder: '请填写打印原因',
    printScanButton: '生成打印二维码',
  },
  lastStatus: '',
  historyRequestID: 0,
  ignoredCurrentID: 0,
  weightTimer: null as ReturnType<typeof setInterval> | null,
  currentTimer: null as ReturnType<typeof setInterval> | null,
  qrRefreshPending: false,
  qrRefreshCommitting: false,
  qrRefreshTimeout: null as ReturnType<typeof setTimeout> | null,
  printPollTimer: null as ReturnType<typeof setInterval> | null,
  printPollWeighingID: 0,
  printPollContext: 'completion' as 'completion' | 'history',
  printStatusRequestID: 0,
  onLoad() {
    this.historyRequestID = 0
    this.qrRefreshPending = false
    this.qrRefreshCommitting = false
    this.qrRefreshTimeout = null
    this.printPollTimer = null
    this.printPollWeighingID = 0
    this.printPollContext = 'completion'
    this.printStatusRequestID = 0
    this.measureNavigation()
  },
  onResize() {
    this.measureNavigation()
  },
  measureNavigation() {
    let statusBarHeight = 20
    let navBarHeight = 44
    try {
      const windowInfo = wx.getWindowInfo()
      statusBarHeight = windowInfo.statusBarHeight || statusBarHeight
      const menu = wx.getMenuButtonBoundingClientRect()
      if (menu && menu.top && menu.height) {
        const gap = Math.max(menu.top - statusBarHeight, 4)
        navBarHeight = menu.height + gap * 2
      }
    }
    catch {
      // 旧基础库取不到胶囊信息时沿用兜底值，不影响业务。
    }
    this.setData({ statusBarHeight, navBarHeight })
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
      this.loadHistory(true)
    }
    if (this.data.printDialogOpen && this.data.printDialogWeighingId) {
      this.startPrintPolling(this.data.printDialogWeighingId, this.data.printDialogContext)
    }
  },
  onHide() {
    this.stopPolling()
    this.stopPrintPolling()
  },
  onUnload() {
    this.stopPolling()
    this.stopPrintPolling()
    try {
      wx.showTabBar({ animation: false })
    }
    catch {
      // 忽略。
    }
  },
  onReachBottom() {
    if (this.data.tab !== 'history' || !this.data.historyHasMore || this.data.historyLoading || this.data.historyLoadingMore) {
      return
    }
    this.loadHistory(false)
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
  applyCurrent(current?: OutboundWeighing | null) {
    if (current && current.id === this.ignoredCurrentID) {
      this.clearQRRefreshWait()
      this.setData({
        current: null,
        qr: null,
        statusLabel: '',
        message: '',
        weightLocked: false,
        readingState: 'warn',
        readingHint: '正在读取地磅',
        busy: false,
      })
      return
    }
    const previousStatus = this.lastStatus
    this.lastStatus = current ? current.status : ''
    const qrActive = !!current && (current.status === 'first_qr_ready' || current.status === 'second_qr_ready')
    const refreshInvalidated = this.qrRefreshPending && !qrActive
    if (refreshInvalidated) {
      this.clearQRRefreshWait()
    }
    const pendingRefresh = this.qrRefreshPending === true
    const lock = pendingRefresh ? null : lockedReadingFor(current)
    const wasLocked = this.data.weightLocked
    const keepQR = this.data.qr && current && this.data.qr.weighingId === current.id && (
      (current.status === 'first_qr_ready' && this.data.qr.action === 'first')
      || (current.status === 'second_qr_ready' && this.data.qr.action === 'second')
    )
    const terminal = !!current && ['completed', 'terminated', 'expired', 'cancelled'].includes(current.status)
    const next: Record<string, unknown> = {
      current: current || null,
      firstText: current ? weightText(current.firstWeightMilliTonne) : '',
      secondText: current ? weightText(current.secondWeightMilliTonne) : '',
      netText: current ? weightText(current.netMilliTonne) : '',
      taskText: current ? current.factoryTaskNo : '',
      ticketText: current ? current.ticketNo : '',
      statusLabel: current ? statusText(current.status) : '',
      message: current ? current.message : '',
      qr: keepQR ? this.data.qr : null,
      busy: terminal || refreshInvalidated ? false : (pendingRefresh ? true : this.data.busy),
    }
    if (!pendingRefresh) {
      next.weightLocked = !!lock
      next.weightText = lock ? lock.text : (this.data.liveWeightText || this.data.weightText)
      if (lock) {
        next.readingState = 'locked'
        next.readingHint = lock.hint
      }
      else if (wasLocked) {
        next.readingState = 'warn'
        next.readingHint = '正在读取地磅'
      }
    }
    this.setData(next)
    if (!pendingRefresh && wasLocked && !lock) {
      this.refreshWeight()
    }
    if (current && current.status === 'completed') {
      if (!this.data.printDialogOpen || this.data.printDialogContext !== 'history') {
        if (this.printPollWeighingID !== current.id || this.printPollContext !== 'completion') {
          this.startPrintPolling(current.id, 'completion')
        }
      }
    }
    else if (this.printPollContext === 'completion' && (this.printPollWeighingID !== 0 || this.data.printStatusLoading || this.data.printStatus)) {
      this.stopPrintPolling()
      this.setData({
        printStatus: null,
        printStatusLoading: false,
        printStatusError: '',
        printStatusLabel: '未查询',
        printActionLabel: '打印详情',
        printNetText: '',
        printAttemptsView: [],
      })
    }
    if (current && previousStatus !== current.status) {
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
    this.clearQRRefreshWait()
    if (this.weightTimer) {
      clearInterval(this.weightTimer)
      this.weightTimer = null
    }
    if (this.currentTimer) {
      clearInterval(this.currentTimer)
      this.currentTimer = null
    }
  },
  clearQRRefreshWait() {
    if (this.qrRefreshTimeout) {
      clearTimeout(this.qrRefreshTimeout)
      this.qrRefreshTimeout = null
    }
    this.qrRefreshPending = false
    this.qrRefreshCommitting = false
  },
  refreshWeight() {
    outboundWeight().then((reading) => {
      const stable = reading.available && reading.stable
      const waiting = reading.available && !reading.stable
      const nextText = weightText(reading.weightMilliTonne)
      const pending = this.qrRefreshPending === true
      const next: Record<string, unknown> = {
        reading,
        liveWeightText: nextText,
        available: reading.available,
        mock: reading.mock,
        statusText: reading.message,
      }
      if (!this.data.weightLocked) {
        next.weightText = nextText
        next.readingState = stable ? 'ok' : waiting ? 'warn' : 'bad'
        next.readingHint = pending
          ? (stable ? '读数已稳定，正在刷新二维码' : '正在重新读取地磅，请保持停稳')
          : (stable ? '读数稳定 · 可用' : waiting ? '读数可用 · 等待稳定' : (reading.message || '读数不可用'))
      }
      this.setData(next)
      if (pending && !this.qrRefreshCommitting && reading.available && reading.stable) {
        this.commitQRRefresh()
      }
    }).catch(() => {
      const next: Record<string, unknown> = {
        available: false,
        statusText: '地磅服务连接失败',
      }
      if (!this.data.weightLocked) {
        next.readingState = 'bad'
        next.readingHint = '地磅服务连接失败'
      }
      this.setData(next)
    })
  },
  refreshCurrent() {
    outboundCurrent().then((value) => {
      this.applyCurrent(value.current)
    }).catch(() => {
      // 当前状态读取失败不打断称重读数，下一次轮询继续。
    })
  },
  startPrintPolling(weighingID: number, context: 'completion' | 'history') {
    if (!weighingID) {
      return
    }
    if (this.printPollTimer && this.printPollWeighingID === weighingID && this.printPollContext === context) {
      this.refreshPrintStatus()
      return
    }
    this.stopPrintPolling()
    this.printPollWeighingID = weighingID
    this.printPollContext = context
    this.setData({ printStatusLoading: true, printStatusError: '' })
    this.refreshPrintStatus()
    this.printPollTimer = setInterval(() => this.refreshPrintStatus(), 2000)
  },
  stopPrintPolling() {
    if (this.printPollTimer) {
      clearInterval(this.printPollTimer)
      this.printPollTimer = null
    }
    this.printPollWeighingID = 0
    this.printStatusRequestID++
  },
  refreshPrintStatus() {
    const weighingID = this.printPollWeighingID
    if (!weighingID) {
      return
    }
    const context = this.printPollContext
    const requestID = ++this.printStatusRequestID
    outboundPrintStatus(weighingID, context).then((status) => {
      if (requestID !== this.printStatusRequestID || this.printPollWeighingID !== weighingID || this.printPollContext !== context) {
        return
      }
      const isReprint = status.scanRequired && (!!status.lastAttempt || status.retryAsReprint)
      let actionLabel = '打印详情'
      if (status.activeCommand) {
        actionLabel = '查看打印进度'
      }
      else if (status.needsVerify) {
        actionLabel = '核实打印结果'
      }
      else if (status.canPrint) {
        actionLabel = isReprint ? '补打单据' : '打印单据'
      }
      else if (status.printStatus === 'printed') {
        actionLabel = '查看打印记录'
      }
      const label = status.activeCommand ? '打印中' : (this.data.printQrValue && status.pendingScan ? '待扫码补打' : (printStatusLabels[status.printStatus] ?? status.printStatus))
      const next: Record<string, unknown> = {
        printStatus: status,
        printStatusLoading: false,
        printStatusError: '',
        printStatusLabel: label,
        printActionLabel: actionLabel,
        printNetText: weightText(status.netMilliTonne),
        printAttemptsView: status.attempts.map(printAttemptView),
        printScanTitle: isReprint ? '补打原因' : '打印原因',
        printScanPlaceholder: isReprint ? '请填写补打原因' : '请填写打印原因',
        printScanButton: isReprint ? '生成补打二维码' : '生成打印二维码',
      }
      const scanAwaiting = !!status.pendingScan
      if (!scanAwaiting && this.data.printQrValue && (status.activeCommand || status.printStatus === 'printing' || status.printStatus === 'printed' || status.printStatus === 'failed')) {
        next.printQrValue = ''
        next.printQrImage = ''
        next.printQrExpireText = ''
        next.printQrHint = ''
        next.printNotice = status.activeCommand ? '已扫码，正在等待厂端打印机…' : (status.printStatus === 'printed' ? '打印已完成' : '打印失败，请重新生成补打二维码')
      }
      this.setData(next)
    }).catch((error) => {
      if (requestID !== this.printStatusRequestID) {
        return
      }
      this.setData({ printStatusLoading: false, printStatusError: errorMessage(error) })
    })
  },
  openPrintDialog(weighingID: number, context: 'completion' | 'history') {
    if (!weighingID) {
      return
    }
    this.setData({
      printDialogOpen: true,
      printDialogContext: context,
      printDialogWeighingId: weighingID,
      printReason: '',
      printQrValue: '',
      printQrImage: '',
      printQrExpireText: '',
      printQrHint: '',
      printNotice: '',
      printStatusError: '',
    })
    this.startPrintPolling(weighingID, context)
  },
  openCompletionPrintDialog() {
    const current = this.data.current
    if (!current || current.status !== 'completed') {
      return
    }
    this.openPrintDialog(current.id, 'completion')
  },
  openHistoryPrintDialog(event: WechatMiniprogram.BaseEvent) {
    const id = Number(event.currentTarget.dataset.id)
    if (!id) {
      return
    }
    this.openPrintDialog(id, 'history')
  },
  closePrintDialog() {
    const context = this.data.printDialogContext
    this.setData({
      printDialogOpen: false,
      printReason: '',
      printQrValue: '',
      printQrImage: '',
      printQrExpireText: '',
      printQrHint: '',
      printNotice: '',
    })
    if (context === 'history') {
      this.stopPrintPolling()
      this.setData({
        printStatus: null,
        printStatusLoading: false,
        printStatusError: '',
        printStatusLabel: '未查询',
        printActionLabel: '打印详情',
        printNetText: '',
        printAttemptsView: [],
      })
      return
    }
    const current = this.data.current
    if (current && current.status === 'completed') {
      this.startPrintPolling(current.id, 'completion')
    }
    else {
      this.stopPrintPolling()
    }
  },
  stopTap() {},
  printReasonInput(event: WechatMiniprogram.Input) {
    this.setData({ printReason: event.detail.value })
  },
  startInitialPrint() {
    const status = this.data.printStatus
    if (!status || this.data.printSubmitting || !status.canPrint || status.scanRequired) {
      return
    }
    this.setData({ printSubmitting: true, printStatusError: '', printNotice: '正在提交打印任务…' })
    startOutboundPrint(this.data.printDialogWeighingId).then(() => {
      this.setData({ printSubmitting: false, printNotice: '打印任务已提交，等待厂端打印机…' })
      this.refreshPrintStatus()
    }).catch((error) => {
      this.setData({ printSubmitting: false, printStatusError: errorMessage(error), printNotice: '' })
    })
  },
  generatePrintScan() {
    const status = this.data.printStatus
    const reason = this.data.printReason.trim()
    if (!status || this.data.printSubmitting || !status.canPrint) {
      return
    }
    if (!reason) {
      wx.showToast({ title: (status.lastAttempt || status.retryAsReprint) ? '请填写补打原因' : '请填写打印原因', icon: 'none' })
      return
    }
    this.setData({ printSubmitting: true, printStatusError: '', printNotice: '正在生成二维码…' })
    createOutboundPrintScan(this.data.printDialogWeighingId, reason).then((result) => {
      const isReprint = !!status.lastAttempt || status.retryAsReprint
      this.setData({
        printSubmitting: false,
        printQrValue: result.value,
        printQrExpireText: fullTimeText(result.expiresAt),
        printQrHint: `${isReprint ? '扫码成功后自动补打' : '扫码成功后自动打印'}，有效期至 ${fullTimeText(result.expiresAt)}`,
        printNotice: '二维码已生成',
      })
      this.loadPrintQr(result.value)
      this.refreshPrintStatus()
    }).catch((error) => {
      this.setData({ printSubmitting: false, printStatusError: errorMessage(error), printNotice: '' })
    })
  },
  loadPrintQr(value: string) {
    const imageURL = printQrImage(value)
    wx.request({
      url: imageURL,
      method: 'GET',
      responseType: 'arraybuffer',
      success: (response) => {
        if (response.statusCode !== 200 || !response.data) {
          return
        }
        try {
          const base64 = wx.arrayBufferToBase64(response.data as ArrayBuffer)
          if (this.data.printQrValue === value) {
            this.setData({ printQrImage: `data:image/png;base64,${base64}` })
          }
        }
        catch {
          // 保留空图，用户可以重新生成。
        }
      },
    })
  },
  verifyPrintResult(event: WechatMiniprogram.BaseEvent) {
    const result = event.currentTarget.dataset.result === 'printed' ? 'printed' : 'not_printed'
    if (this.data.printSubmitting) {
      return
    }
    this.setData({ printSubmitting: true, printStatusError: '', printNotice: result === 'printed' ? '正在核实为已出纸…' : '正在核实为未出纸…' })
    verifyOutboundPrint(this.data.printDialogWeighingId, result).then(() => {
      this.setData({ printSubmitting: false, printNotice: '核实已提交，正在更新打印状态…' })
      this.refreshPrintStatus()
    }).catch((error) => {
      this.setData({ printSubmitting: false, printStatusError: errorMessage(error), printNotice: '' })
    })
  },
  retryPrintStatus() {
    this.refreshPrintStatus()
  },
  doFirst() {
    if (this.data.busy) {
      wx.showToast({ title: '正在处理，请稍候', icon: 'none' })
      return
    }
    const reading = this.data.reading
    if (!this.data.available || !reading || !reading.stable) {
      const hint = !reading ? '地磅读数不可用' : (!reading.available ? (reading.message || '地磅读数不可用') : '读数尚未稳定，请稍候')
      wx.showToast({ title: hint, icon: 'none' })
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
    const reading = this.data.reading
    if (!this.data.available || !reading || !reading.stable) {
      const hint = !reading ? '地磅读数不可用' : (!reading.available ? (reading.message || '地磅读数不可用') : '读数尚未稳定，请稍候')
      wx.showToast({ title: hint, icon: 'none' })
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
    const imageURL = handoffQrImage(qr.value)
    this.setData({
      qr: { ...qr, action, weighingId, image: '' },
      qrTitle: action === 'first' ? '首磅二维码' : '回磅二维码',
      qrExpireText: fullTimeText(qr.expiresAt),
    })
    // 真机对 <image> 的 HTTP 网络图限制较多；用 wx.request 取 PNG 后转成 data URL。
    wx.request({
      url: imageURL,
      method: 'GET',
      responseType: 'arraybuffer',
      success: (response) => {
        if (response.statusCode !== 200 || !response.data) {
          return
        }
        try {
          const base64 = wx.arrayBufferToBase64(response.data as ArrayBuffer)
          if (this.data.qr?.value === qr.value) {
            this.setData({ 'qr.image': `data:image/png;base64,${base64}` })
          }
        }
        catch {
          // 保留空图，用户可以重新生成。
        }
      },
    })
  },
  regenerateQR() {
    this.startQRRefresh()
  },
  startQRRefresh() {
    const current = this.data.current
    if (this.data.busy) {
      return
    }
    if (!current || (current.status !== 'first_qr_ready' && current.status !== 'second_qr_ready')) {
      return
    }
    this.clearQRRefreshWait()
    this.qrRefreshPending = true
    this.qrRefreshTimeout = setTimeout(() => {
      this.qrRefreshTimeout = null
      if (this.qrRefreshCommitting) {
        return
      }
      this.cancelQRRefresh('地磅读数未稳定，请重试')
    }, 15000)
    this.setData({
      busy: true,
      weightLocked: false,
      weightText: this.data.liveWeightText || this.data.weightText,
      readingState: 'warn',
      readingHint: '正在重新读取地磅，请保持停稳',
    })
    this.refreshWeight()
  },
  commitQRRefresh() {
    if (!this.qrRefreshPending || this.qrRefreshCommitting) {
      return
    }
    const current = this.data.current
    if (!current || (current.status !== 'first_qr_ready' && current.status !== 'second_qr_ready')) {
      this.cancelQRRefresh('二维码状态已变化，请重新操作')
      return
    }
    this.qrRefreshCommitting = true
    if (this.qrRefreshTimeout) {
      clearTimeout(this.qrRefreshTimeout)
      this.qrRefreshTimeout = null
    }
    const action = current.status === 'first_qr_ready' ? 'first' : 'second'
    const request = action === 'first' ? firstWeighQR : secondWeighQR
    request().then((value) => {
      this.clearQRRefreshWait()
      this.setData({ busy: false })
      this.applyCurrent(value)
      if (value.qr) {
        this.setQr(value.qr, action, value.id)
        wx.showToast({ title: '二维码已刷新', icon: 'none' })
      }
    }).catch((error) => {
      this.clearQRRefreshWait()
      this.setData({ busy: false })
      this.applyCurrent(this.data.current)
      wx.showToast({ title: errorMessage(error), icon: 'none' })
    })
  },
  cancelQRRefresh(message: string) {
    this.clearQRRefreshWait()
    this.setData({ busy: false })
    this.applyCurrent(this.data.current)
    wx.showToast({ title: message, icon: 'none' })
  },
  finish() {
    const current = this.data.current
    this.ignoredCurrentID = current ? current.id : 0
    this.lastStatus = ''
    this.stopPrintPolling()
    this.setData({
      current: null,
      qr: null,
      statusLabel: '',
      message: '',
      firstText: '',
      secondText: '',
      netText: '',
      taskText: '',
      ticketText: '',
      printDialogOpen: false,
      printStatus: null,
      printStatusLoading: false,
      printStatusError: '',
      printStatusLabel: '未查询',
      printActionLabel: '打印详情',
      printNetText: '',
      printAttemptsView: [],
      printReason: '',
      printQrValue: '',
      printQrImage: '',
      printQrExpireText: '',
      printQrHint: '',
      printNotice: '',
    })
    this.refreshWeight()
  },
  backToWeigh() {
    if (this.data.tab !== 'history') {
      return
    }
    this.setData({ tab: 'weigh', busy: false, printDialogOpen: false })
    this.stopPrintPolling()
    try {
      wx.pageScrollTo({ scrollTop: 0, duration: 0 })
    }
    catch {
      // 忽略。
    }
    this.applyCurrent(this.data.current)
    this.startPolling()
  },
  changeTab(event: WechatMiniprogram.TouchEvent) {
    const tab = event.currentTarget.dataset.tab === 'history' ? 'history' : 'weigh'
    if (tab === this.data.tab) {
      return
    }
    this.setData({ tab, busy: false, printDialogOpen: false })
    try {
      wx.pageScrollTo({ scrollTop: 0, duration: 0 })
    }
    catch {
      // 忽略。
    }
    if (tab === 'history') {
      this.stopPolling()
      this.stopPrintPolling()
      this.loadHistory(true)
      return
    }
    this.stopPrintPolling()
    this.applyCurrent(this.data.current)
    this.startPolling()
  },
  historyRangeBounds(range?: HistoryRange) {
    const current = range ?? this.data.historyRange
    if (current === 'custom') {
      return {
        from: this.data.historyFrom || monthsAgo(3),
        to: this.data.historyTo || dateOnly(new Date()),
      }
    }
    switch (current) {
      case 'today':
        return { from: dateOnly(new Date()), to: dateOnly(new Date()) }
      case '7d':
        return { from: daysAgo(6), to: dateOnly(new Date()) }
      case '30d':
        return { from: daysAgo(29), to: dateOnly(new Date()) }
      default:
        return { from: monthsAgo(3), to: dateOnly(new Date()) }
    }
  },
  changeHistoryRange() {
    const ranges: HistoryRange[] = ['today', '7d', '30d', '3m', 'custom']
    wx.showActionSheet({
      itemList: ranges.map(range => historyRangeLabels[range]),
      success: ({ tapIndex }) => {
        const range = ranges[tapIndex]
        if (!range) {
          return
        }
        if (range === 'custom') {
          const bounds = this.historyRangeBounds()
          this.setData({
            historyRange: range,
            historyRangeLabel: historyRangeLabels[range],
            historyFrom: bounds.from,
            historyTo: bounds.to,
          })
          return
        }
        this.setData({ historyRange: range, historyRangeLabel: historyRangeLabels[range] })
        this.loadHistory(true)
      },
    })
  },
  changeHistoryType(event: WechatMiniprogram.TouchEvent) {
    const type = event.currentTarget.dataset.type as HistoryType
    if (type === this.data.historyType) {
      return
    }
    this.setData({ historyType: type }, () => this.loadHistory(true))
  },
  changeHistoryStatus(event: WechatMiniprogram.TouchEvent) {
    const status = event.currentTarget.dataset.status as HistoryStatus
    if (status === this.data.historyStatus) {
      return
    }
    this.setData({ historyStatus: status }, () => this.loadHistory(true))
  },
  changeHistoryFrom(event: WechatMiniprogram.PickerChange) {
    const from = String(event.detail.value)
    if (this.data.historyTo && from > this.data.historyTo) {
      wx.showToast({ title: '开始日期不能晚于结束日期', icon: 'none' })
      return
    }
    this.setData({ historyFrom: from }, () => this.loadHistory(true))
  },
  changeHistoryTo(event: WechatMiniprogram.PickerChange) {
    const to = String(event.detail.value)
    if (this.data.historyFrom && to < this.data.historyFrom) {
      wx.showToast({ title: '结束日期不能早于开始日期', icon: 'none' })
      return
    }
    this.setData({ historyTo: to }, () => this.loadHistory(true))
  },
  retryHistory() {
    this.loadHistory(true)
  },
  loadHistory(reset = true) {
    if (!reset && (this.data.historyLoading || this.data.historyLoadingMore)) {
      return
    }
    const bounds = this.historyRangeBounds()
    const page = reset ? 1 : this.data.historyPage + 1
    const query: HistoryQuery = {
      page,
      pageSize: this.data.historyPageSize,
      from: bounds.from,
      to: bounds.to,
    }
    if (this.data.historyType !== 'all') {
      query.type = this.data.historyType
    }
    if (this.data.historyStatus !== 'all') {
      query.status = this.data.historyStatus
    }
    const currentRequestID = Number.isFinite(this.historyRequestID) ? this.historyRequestID : 0
    const requestID = reset ? currentRequestID + 1 : currentRequestID
    if (reset) {
      this.historyRequestID = requestID
    }
    if (reset) {
      this.setData({ historyLoading: true, historyLoadingMore: false, historyError: '' })
    }
    else {
      this.setData({ historyLoadingMore: true })
    }
    const listRequest = outboundHistory(query)
    if (!reset) {
      listRequest.then((result) => {
        if (requestID !== this.historyRequestID) {
          return
        }
        const records = (result.records ?? [])
          .filter(item => !hiddenHistoryStatuses.has(item.status))
          .map(historyView)
        const history = [...this.data.history, ...records]
        this.setData({
          historyLoading: false,
          historyLoadingMore: false,
          history,
          historyPage: page,
          historyHasMore: result.hasMore && history.length < this.data.historyTotal,
          historyTotal: this.data.historyTotal,
          historyTotalNetText: this.data.historyTotalNetText,
        })
      }).catch((error) => {
        if (requestID !== this.historyRequestID) {
          return
        }
        this.setData({ historyLoading: false, historyLoadingMore: false })
        wx.showToast({ title: errorMessage(error), icon: 'none' })
      })
      return
    }
    const summaryQuery: HistoryQuery = {
      page: 1,
      pageSize: 1,
      from: bounds.from,
      to: bounds.to,
      type: query.type,
    }
    const pendingRequest = outboundHistory({ ...summaryQuery, status: 'pending' }).catch(() => null)
    const completedRequest = outboundHistory({ ...summaryQuery, status: 'completed' }).catch(() => null)
    Promise.all([listRequest, pendingRequest, completedRequest]).then(([result, pending, completed]) => {
      if (requestID !== this.historyRequestID) {
        return
      }
      const records = (result.records ?? [])
        .filter(item => !hiddenHistoryStatuses.has(item.status))
        .map(historyView)
      const summaryAvailable = !!pending && !!completed
      const total = summaryAvailable ? pending.total + completed.total : result.total
      const totalNet = summaryAvailable ? completed.totalNetMilliTonne : result.totalNetMilliTonne
      this.setData({
        historyLoading: false,
        historyLoadingMore: false,
        history: records,
        historyPage: page,
        historyHasMore: result.hasMore && records.length < total,
        historyTotal: total,
        historyTotalNetText: weightText(totalNet),
      })
    }).catch((error) => {
      if (requestID !== this.historyRequestID) {
        return
      }
      this.setData({ historyLoading: false, historyLoadingMore: false, historyError: errorMessage(error) })
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
