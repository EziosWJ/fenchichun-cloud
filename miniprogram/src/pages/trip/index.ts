import type { Conclusion, EventRecord, Trip } from '@/features/grain/types'
import { routes } from '@/config/routes'
import { grainService } from '@/features/grain/api-service'
import { currentDictionary, refreshDictionary } from '@/features/grain/dictionary-service'
import { applyAsync, errorMessage, requireLogin } from '@/features/grain/page'
import { canEdit, inspectionText, tripStatus } from '@/features/grain/presentation'

const actionLabels: Record<string, string> = {
  'visual': '确认目测',
  'unload': '确认卸货',
  'ticket': '查看磅单候选',
  'confirm-ticket': '确认过磅单关联',
  'issue': '开具出门证',
  'approve': '审批出门证',
}

const stepTitles: Record<string, string> = {
  'visual': '确认目测',
  'unload': '确认卸货',
  'ticket': '关联磅单',
  'confirm-ticket': '确认磅单关联',
  'issue': '开具出门证',
  'approve': '审批出门证',
}

interface TimelineStep {
  key: string
  detail: string
  title: string
  time: string
  current: boolean
}

function inspectionTitle(trip: Trip) {
  if (!trip.inspection) {
    return '检验结果'
  }
  const method = trip.inspection.method === 'lab' ? '化验' : '目测'
  return `${method}${trip.inspection.conclusion === 'accept' ? '接收' : '拒收'}`
}

function buildTimeline(trip: Trip, currentTitle: string): TimelineStep[] {
  const steps: TimelineStep[] = [
    { key: 'current', detail: 'current', title: currentTitle, time: '当前', current: true },
  ]
  if (trip.permit?.approvedAt) {
    steps.push({ key: 'permit-approved', detail: 'permit', title: '出门证已审批', time: trip.permit.approvedAt, current: false })
  }
  if (trip.permit?.issuedAt) {
    steps.push({ key: 'permit-issued', detail: 'permit', title: '出门证已开具', time: trip.permit.issuedAt, current: false })
  }
  if (trip.ticket) {
    steps.push({
      key: 'ticket',
      detail: 'ticket',
      title: trip.ticketConfirmedAt ? '磅单已关联' : '磅单已同步',
      time: trip.ticketConfirmedAt || trip.ticket.secondAt || trip.ticket.firstAt || trip.updatedAt || '',
      current: false,
    })
  }
  if (trip.unload) {
    steps.push({ key: 'unload', detail: 'unload', title: '卸货已确认', time: trip.unload.at, current: false })
  }
  if (trip.inspection) {
    steps.push({ key: 'inspection', detail: 'inspection', title: inspectionTitle(trip), time: trip.inspection.at, current: false })
  }
  steps.push({ key: 'registration', detail: 'registration', title: '登记流转单', time: trip.createdAt, current: false })
  return steps
}

Page({
  data: {
    id: '',
    loading: true,
    error: '',
    trip: null as Trip | null,
    events: [] as Array<EventRecord & { key: number }>,
    status: '',
    next: '',
    stepTitle: '',
    timeline: [] as TimelineStep[],
    waiting: false,
    action: '',
    actionLabel: '',
    editable: false,
    inspection: '',
    tab: 'current' as 'current' | 'timeline',
    expanded: {
      registration: false,
      inspection: false,
      unload: false,
      ticket: false,
      permit: false,
    },
    confirming: false,
    formError: '',
    conclusion: '' as Conclusion | '',
    reason: '',
    granaries: [] as string[],
    location: '',
    granaryIndex: 0,
    plateProvince: '',
    plateNumber: '',
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
      if (!requireLogin('warehouse')) {
        return
      }
      const apply = (trip: Trip) => {
        wx.setNavigationBarTitle({
          title: trip.exitedAt ? '出厂记录' : '库管作业详情',
        })
        const status = tripStatus(trip)
        const stepTitle = stepTitles[status.action] || status.label
        const expanded = {
          registration: false,
          inspection: false,
          unload: false,
          ticket: false,
          permit: false,
        }
        if (status.action === 'visual' || trip.stage === 'pending_inspection' || trip.stage === 'rejected') {
          expanded.inspection = true
        }
        else if (status.action === 'unload') {
          expanded.unload = true
        }
        else if (status.action === 'ticket' || status.action === 'confirm-ticket') {
          expanded.ticket = true
        }
        else if (status.action === 'issue' || status.action === 'approve' || trip.stage === 'permit_approved') {
          expanded.permit = true
        }
        const granaries = currentDictionary().granaries.map(item => item.name)
        const location = this.data.location && granaries.includes(this.data.location)
          ? this.data.location
          : (granaries[0] || '')
        this.setData({
          trip,
          events: trip.events.map((event, key) => ({ ...event, key })),
          status: status.label,
          next: status.next,
          stepTitle,
          timeline: buildTimeline(trip, stepTitle),
          waiting: status.waiting,
          action: status.action,
          actionLabel: actionLabels[status.action] || '',
          editable: canEdit(trip),
          inspection: inspectionText(trip),
          plateProvince: trip.plate.slice(0, 1),
          plateNumber: trip.plate.slice(1),
          granaries,
          location,
          granaryIndex: Math.max(0, granaries.indexOf(location)),
          expanded,
        })
        if (status.action === 'unload' && !granaries.length) {
          void refreshDictionary().then((value) => {
            if (!value) {
              return
            }
            const names = value.granaries.map(item => item.name)
            const nextLocation = names.includes(this.data.location)
              ? this.data.location
              : (names[0] || '')
            this.setData({
              granaries: names,
              location: nextLocation,
              granaryIndex: Math.max(0, names.indexOf(nextLocation)),
            })
          })
        }
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
  switchTab(event: WechatMiniprogram.BaseEvent) {
    const tab = event.currentTarget.dataset.tab
    if (tab === 'current' || tab === 'timeline') {
      this.setData({ tab })
    }
  },
  toggleSection(event: WechatMiniprogram.BaseEvent) {
    const section = event.currentTarget.dataset.section as keyof typeof this.data.expanded
    if (!(section in this.data.expanded)) {
      return
    }
    this.setData({ [`expanded.${section}`]: !this.data.expanded[section] })
  },
  openStepDetail(event: WechatMiniprogram.BaseEvent) {
    const step = event.currentTarget.dataset.step
    if (!step) {
      return
    }
    wx.navigateTo({
      url: `${routes.tripRecord}?id=${encodeURIComponent(this.data.id)}&step=${step}`,
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
      location: this.data.granaries[index] || '',
      formError: '',
    })
  },
  act() {
    const trip = this.data.trip
    if (!trip || this.data.confirming) {
      return
    }
    const action = this.data.action
    if (action === 'visual' || action === 'unload') {
      return this.submitStep()
    }
    if (action === 'ticket') {
      return wx.navigateTo({
        url: `${routes.tickets}?id=${encodeURIComponent(trip.serverId)}`,
      })
    }
    if (action === 'confirm-ticket') {
      wx.showModal({
        title: '确认过磅单关联？',
        content: `请核对过磅端关联的磅单 ${trip.ticket?.id} 与车辆 ${trip.plate}、${trip.material}是否一致。`,
        confirmText: '确认关联',
        success: ({ confirm }) => {
          if (confirm) {
            this.submitTicketConfirmation()
          }
        },
      })
      return
    }
    if (action !== 'issue' && action !== 'approve') {
      return
    }
    const title = action === 'issue' ? '开具出门证' : '审批出门证'
    const content
      = action === 'issue'
        ? `请核对 ${trip.plate}、${trip.site}及磅单 ${trip.ticket?.id}，确认开具出门证？`
        : `请核对 ${trip.plate} 的出门证 ${trip.permit?.id} 和磅单 ${trip.ticket?.id}。审批后仍需门卫确认实际出厂。`
    this.setData({ confirming: true })
    wx.showModal({
      title,
      content,
      confirmText: '确认',
      success: ({ confirm }) => {
        if (confirm) {
          this.submitPermit()
        }
        else {
          this.setData({ confirming: false })
        }
      },
    })
  },
  submitStep() {
    const trip = this.data.trip
    if (!trip) {
      return
    }
    const { action, conclusion, reason, location } = this.data
    if (action === 'visual') {
      if (!conclusion) {
        return this.setData({ formError: '请选择目测结论' })
      }
      if (conclusion === 'reject' && !reason.trim()) {
        return this.setData({ formError: '请填写拒收原因' })
      }
      this.setData({ confirming: true, formError: '' })
      wx.showModal({
        title: '确认目测结果',
        content: `请核对 ${trip.plate}、${trip.material}和供应商 ${trip.supplier}。目测${conclusion === 'accept' ? '接收' : `拒收，原因：${reason.trim()}`}；确认后不可覆盖。`,
        confirmText: '确认',
        success: ({ confirm }) => {
          if (!confirm) {
            this.setData({ confirming: false })
            return
          }
          this.submitVisual()
        },
      })
      return
    }
    if (!location.trim()) {
      return this.setData({ formError: '请选择实际卸货地点' })
    }
    this.setData({ confirming: true, formError: '' })
    wx.showModal({
      title: '确认现场卸货',
      content: `请确认 ${trip.plate} 已完成现场首磅和卸货，实际卸货地点为 ${location.trim()}。`,
      confirmText: '确认',
      success: ({ confirm }) => {
        if (!confirm) {
          this.setData({ confirming: false })
          return
        }
        this.submitUnload()
      },
    })
  },
  submitVisual() {
    const trip = this.data.trip
    const { conclusion, reason } = this.data
    if (!trip || !conclusion) {
      return
    }
    this.setData({ confirming: true, formError: '' })
    try {
      applyAsync(
        grainService.recordVisual(trip.serverId, trip.version, conclusion, reason),
        () => {
          this.setData({ confirming: false })
          wx.showToast({ title: '目测结果已记录', icon: 'success' })
          this.load()
        },
        (error) => {
          this.setData({ formError: errorMessage(error), confirming: false })
          this.load()
        },
      )
    }
    catch (error) {
      this.setData({ formError: errorMessage(error), confirming: false })
    }
  },
  submitUnload() {
    const trip = this.data.trip
    const { location } = this.data
    if (!trip) {
      return
    }
    this.setData({ confirming: true, formError: '' })
    try {
      applyAsync(
        grainService.confirmUnload(trip.serverId, trip.version, location.trim()),
        () => {
          this.setData({ confirming: false })
          wx.showToast({ title: '卸货已确认', icon: 'success' })
          this.load()
        },
        (error) => {
          this.setData({ formError: errorMessage(error), confirming: false })
          this.load()
        },
      )
    }
    catch (error) {
      this.setData({ formError: errorMessage(error), confirming: false })
    }
  },
  submitTicketConfirmation() {
    const trip = this.data.trip
    if (!trip) {
      return
    }
    this.setData({ confirming: true })
    try {
      applyAsync(
        grainService.confirmTicket(trip.serverId, trip.version),
        () => {
          wx.showToast({ title: '已确认过磅单关联', icon: 'success' })
          this.setData({ confirming: false })
          this.load()
        },
        (error) => {
          wx.showModal({
            title: '确认未完成',
            content: errorMessage(error),
            showCancel: false,
          })
          this.setData({ confirming: false })
          this.load()
        },
      )
    }
    catch (error) {
      wx.showModal({
        title: '确认未完成',
        content: errorMessage(error),
        showCancel: false,
      })
      this.setData({ confirming: false })
      this.load()
    }
  },
  submitPermit() {
    const trip = this.data.trip
    const action = this.data.action
    if (!trip || (action !== 'issue' && action !== 'approve')) {
      return
    }
    this.setData({ confirming: true })
    try {
      const result = action === 'issue'
        ? grainService.issuePermit(trip.serverId, trip.version)
        : grainService.approvePermit(trip.serverId, trip.version)
      applyAsync(
        result,
        () => {
          wx.showToast({
            title: action === 'issue' ? '出门证已开具' : '出门证已审批',
            icon: 'success',
          })
          this.setData({ confirming: false })
          this.load()
        },
        (error) => {
          wx.showModal({
            title: '操作未完成',
            content: errorMessage(error),
            showCancel: false,
          })
          this.setData({ confirming: false })
          this.load()
        },
      )
    }
    catch (error) {
      wx.showModal({
        title: '操作未完成',
        content: errorMessage(error),
        showCancel: false,
      })
      this.setData({ confirming: false })
      this.load()
    }
  },
})
