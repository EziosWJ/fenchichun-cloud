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
  ticket: '磅单数据',
  permit: '出门证',
}

interface RecordField {
  label: string
  value: string
  tone?: 'brand' | 'success' | 'warning' | 'error'
  full?: boolean
  size?: 'lg' | 'md' | 'sm' | 'xs'
}

interface RecordSection {
  title?: string
  rows: RecordField[][]
}

interface RecordHero {
  label: string
  value: string
  unit?: string
  tone?: 'default' | 'brand' | 'success' | 'error'
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

interface TicketRule {
  title: string
  meta: string
  amount: string
}

interface TicketView {
  no: string
  before: string
  deduction: string
  deductionSigned: string
  final: string
  rules: TicketRule[]
  ruleEmpty: string
  fields: RecordField[]
  rows: RecordField[][]
}

interface PermitView {
  no: string
  date: string
  driver: string
  material: string
  supplier: string
  spec: string
  quantity: string
  plate: string
  site: string
  issuer: string
}

interface RecordView {
  hero: RecordHero
  sections: RecordSection[]
  ticketView: TicketView | null
  permitView: PermitView | null
}

function rateText(rateBp?: number | null) {
  if (rateBp === null || rateBp === undefined) {
    return ''
  }
  return (rateBp / 100).toFixed(2).replace(/\.?0+$/, '')
}

function modeText(mode?: string, rateBp?: number | null) {
  if (mode === 'percent') {
    const rate = rateText(rateBp)
    return rate ? `按比例 ${rate}%` : '按比例'
  }
  if (mode === 'amount') {
    return '按吨'
  }
  return ''
}

function adjustmentTotalOf(ticket: Trip['ticket']) {
  if (!ticket) {
    return ''
  }
  if (ticket.adjustmentTotal) {
    return ticket.adjustmentTotal
  }
  if (ticket.net && ticket.deducted) {
    return (Number(ticket.net) - Number(ticket.deducted)).toFixed(3)
  }
  return ''
}

function trimWeight(value: string) {
  const text = value.trim()
  const [whole, fraction] = text.split('.')
  if (fraction === undefined || !whole) {
    return text
  }
  const trimmed = fraction.replace(/0+$/, '')
  return trimmed ? `${whole}.${trimmed}` : whole
}

function signedDeduction(value: string) {
  const number = Number(value)
  if (!Number.isFinite(number) || number === 0) {
    return ''
  }
  const signed = number > 0 ? -Math.abs(number) : Math.abs(number)
  return `${trimWeight(signed.toFixed(3))} 吨`
}

function tonnes(value: string) {
  const number = Number(value)
  return Number.isFinite(number) ? `${trimWeight(value)} 吨` : `${value} 吨`
}

function chineseDate(value?: string) {
  if (!value) {
    return '—'
  }
  const [year, month, day] = value.slice(0, 10).split('-')
  if (!year || !month || !day) {
    return value
  }
  return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`
}

function permitIssuer(trip: Trip) {
  const events = trip.events.filter(event => event.text.includes('审批') || event.text.includes('开具'))
  const event = events.find(item => item.text.includes('审批')) ?? events[0]
  const operator = event?.operator
  return operator && operator !== '系统' ? operator : '—'
}

function toRows(fields: RecordField[]): RecordField[][] {
  const rows: RecordField[][] = []
  let half: RecordField[] = []
  for (const field of fields) {
    if (field.full) {
      if (half.length) {
        rows.push(half)
        half = []
      }
      rows.push([field])
      continue
    }
    half.push(field)
    if (half.length === 2) {
      rows.push(half)
      half = []
    }
  }
  if (half.length) {
    rows.push(half)
  }
  return rows
}

function currentView(trip: Trip, status: ReturnType<typeof tripStatus>): RecordView {
  const plate = trip.plate
  const inspection = inspectionText(trip)
  const ticket = trip.ticket
  const permit = trip.permit
  const finalNet = ticket?.deducted || '—'
  const empty = '—'

  if (status.action === 'unload') {
    return {
      hero: { label: '检验结果', value: inspection, tone: 'success', size: 'md' },
      sections: [{
        rows: toRows([
          { label: '车牌号码', value: plate, full: true, size: 'lg' },
          { label: '货品', value: trip.material, size: 'md' },
          { label: '供应商', value: trip.supplier || '未提供', size: 'sm' },
        ]),
      }],
      ticketView: null,
      permitView: null,
    }
  }

  if (status.action === 'ticket') {
    return {
      hero: { label: '卸货地点', value: trip.unload?.location || '未确认', size: 'lg' },
      sections: [{
        rows: toRows([
          { label: '车牌号码', value: plate, full: true, size: 'lg' },
          { label: '货品', value: trip.material, size: 'md' },
          { label: '供应商', value: trip.supplier || '未提供', size: 'sm' },
          { label: '检验结果', value: inspection, tone: 'success', full: true, size: 'md' },
        ]),
      }],
      ticketView: null,
      permitView: null,
    }
  }

  if (status.action === 'confirm-ticket') {
    return {
      hero: { label: '磅单号', value: ticket?.id || empty, size: 'sm' },
      sections: [{
        rows: toRows([
          { label: '车牌号码', value: plate, full: true, size: 'lg' },
          { label: '出单净重', value: finalNet === empty ? empty : tonnes(finalNet), tone: 'brand', size: 'md' },
          { label: '供应商', value: trip.supplier || '未提供', size: 'sm' },
          { label: '卸货地点', value: trip.unload?.location || '未确认', size: 'md' },
          { label: '货品', value: trip.material, size: 'md' },
        ]),
      }],
      ticketView: null,
      permitView: null,
    }
  }

  if (status.action === 'issue') {
    return {
      hero: {
        label: '出单净重',
        value: finalNet === empty ? empty : trimWeight(finalNet),
        unit: finalNet === empty ? '' : '吨',
        tone: 'brand',
        size: 'xl',
      },
      sections: [{
        rows: toRows([
          { label: '车牌号码', value: plate, full: true, size: 'lg' },
          { label: '卸货地点', value: trip.unload?.location || '未确认', size: 'md' },
          { label: '检验结果', value: inspection, tone: 'success', size: 'md' },
          { label: '磅单号', value: ticket?.id || empty, size: 'sm' },
          { label: '货品', value: trip.material, size: 'md' },
          { label: '供应商', value: trip.supplier || '未提供', full: true, size: 'sm' },
        ]),
      }],
      ticketView: null,
      permitView: null,
    }
  }

  if (status.action === 'approve') {
    return {
      hero: { label: '出门证号', value: permit?.id || empty, size: 'sm' },
      sections: [{
        rows: toRows([
          { label: '车牌号码', value: plate, full: true, size: 'lg' },
          { label: '出单净重', value: finalNet === empty ? empty : tonnes(finalNet), tone: 'brand', size: 'md' },
          { label: '磅单号', value: ticket?.id || empty, size: 'sm' },
          { label: '开具时间', value: permit?.issuedAt || empty, size: 'xs' },
          { label: '供应商', value: trip.supplier || '未提供', size: 'sm' },
        ]),
      }],
      ticketView: null,
      permitView: null,
    }
  }

  if (trip.stage === 'permit_approved') {
    return {
      hero: { label: '出门证号', value: permit?.id || empty, size: 'sm' },
      sections: [{
        rows: toRows([
          { label: '车牌号码', value: plate, full: true, size: 'lg' },
          { label: '审批状态', value: '已审批', tone: 'success', size: 'md' },
          { label: '出单净重', value: finalNet === empty ? empty : tonnes(finalNet), tone: 'brand', size: 'md' },
          { label: '审批时间', value: permit?.approvedAt || empty, size: 'xs' },
          { label: '供应商', value: trip.supplier || '未提供', size: 'sm' },
        ]),
      }],
      ticketView: null,
      permitView: null,
    }
  }

  if (trip.stage === 'rejected') {
    return {
      hero: { label: '检验结论', value: inspection, tone: 'error', size: 'lg' },
      sections: [{
        rows: toRows([
          { label: '车牌号码', value: plate, full: true, size: 'lg' },
          { label: '货品', value: trip.material, size: 'md' },
          { label: '供应商', value: trip.supplier || '未提供', size: 'sm' },
          { label: '拒收原因', value: trip.inspection?.reason || '未填写', full: true, tone: 'error', size: 'sm' },
        ]),
      }],
      ticketView: null,
      permitView: null,
    }
  }

  if (trip.stage === 'blocked') {
    return {
      hero: { label: '车牌号码', value: plate, size: 'lg' },
      sections: [{
        rows: toRows([
          { label: '货品', value: trip.material, full: true, size: 'md' },
          { label: '供应商', value: trip.supplier || '未提供', size: 'sm' },
          { label: '检验结果', value: inspection, size: 'md' },
        ]),
      }],
      ticketView: null,
      permitView: null,
    }
  }

  if (status.action === 'visual') {
    return {
      hero: { label: '检验方式', value: '目测', size: 'md' },
      sections: [{
        rows: toRows([
          { label: '车牌号码', value: plate, full: true, size: 'lg' },
          { label: '货品', value: trip.material, size: 'md' },
          { label: '供应商', value: trip.supplier || '未提供', size: 'sm' },
        ]),
      }],
      ticketView: null,
      permitView: null,
    }
  }

  return {
    hero: { label: '检验方式', value: '化验', size: 'md' },
    sections: [{
      rows: toRows([
        { label: '车牌号码', value: plate, full: true, size: 'lg' },
        { label: '货品', value: trip.material, size: 'md' },
        { label: '供应商', value: trip.supplier || '未提供', size: 'sm' },
      ]),
    }],
    ticketView: null,
    permitView: null,
  }
}

function registrationView(trip: Trip): RecordView {
  return {
    hero: { label: '车牌号码', value: trip.plate, size: 'lg' },
    sections: [{
      rows: toRows([
        { label: '登记时间', value: trip.createdAt || '—', full: true, size: 'sm' },
        { label: '厂区', value: trip.site || '—', size: 'md' },
        { label: '货品', value: trip.material || '—', size: 'md' },
        { label: '供应商', value: trip.supplier || '未提供', size: 'md' },
        { label: '司机', value: trip.driver || '未填写', size: 'md' },
        { label: '联系电话', value: trip.phone || '未填写', size: 'sm' },
        { label: '合同编号', value: trip.contract || '未填写', size: 'xs' },
        { label: '备注', value: trip.note || '未填写', full: true, size: 'sm' },
      ]),
    }],
    ticketView: null,
    permitView: null,
  }
}

function inspectionView(trip: Trip): RecordView {
  const inspection = trip.inspection
  const conclusion = inspectionText(trip)
  const rejected = inspection?.conclusion === 'reject'
  const fields: RecordField[] = [
    { label: '车牌号码', value: trip.plate, full: true, size: 'lg' },
    { label: '货品', value: trip.material || '—', size: 'md' },
    { label: '供应商', value: trip.supplier || '未提供', size: 'md' },
    { label: '检验方式', value: trip.method === 'lab' ? '化验' : '目测', size: 'md' },
    { label: '检验时间', value: inspection?.at || '—', size: 'xs' },
  ]
  if (trip.method === 'lab') {
    fields.push(
      { label: '水分', value: inspection?.moisture ? `${inspection.moisture}%` : '—', size: 'md' },
      { label: '容量', value: inspection?.capacity ? `${inspection.capacity} g/L` : '—', size: 'md' },
    )
  }
  fields.push(
    { label: '确认人', value: inspection?.operator || '—', size: 'sm' },
    { label: '确认时间', value: inspection?.at || '—', size: 'xs' },
  )
  if (rejected && inspection?.reason) {
    fields.push({ label: '拒收原因', value: inspection.reason, full: true, tone: 'error', size: 'sm' })
  }
  return {
    hero: {
      label: '检验结论',
      value: conclusion,
      tone: rejected ? 'error' : 'success',
      size: 'lg',
    },
    sections: [{ rows: toRows(fields) }],
    ticketView: null,
    permitView: null,
  }
}

function unloadView(trip: Trip): RecordView {
  return {
    hero: {
      label: '实际卸货地点',
      value: trip.unload?.location || '未确认',
      size: 'lg',
    },
    sections: [{
      rows: toRows([
        { label: '车牌号码', value: trip.plate, full: true, size: 'lg' },
        { label: '货品', value: trip.material || '—', size: 'md' },
        { label: '供应商', value: trip.supplier || '未提供', size: 'md' },
        { label: '确认时间', value: trip.unload?.at || '—', full: true, size: 'sm' },
      ]),
    }],
    ticketView: null,
    permitView: null,
  }
}

function ticketView(trip: Trip): RecordView {
  const ticket = trip.ticket
  const before = ticket?.net || ''
  const deduction = adjustmentTotalOf(ticket)
  const final = ticket?.deducted || ''
  const rules: TicketRule[] = []
  if (ticket?.adjustments?.length) {
    for (const item of ticket.adjustments) {
      rules.push({
        title: item.categoryName || item.category || '净重调整',
        meta: [modeText(item.mode, item.rateBp), item.remark].filter(Boolean).join(' · ') || '按规则扣减',
        amount: signedDeduction(item.amount) || '—',
      })
    }
  }
  else if (deduction && Number(deduction) !== 0) {
    rules.push({
      title: ticket?.adjustmentCategoryName || ticket?.adjustmentCategory || '净重调整',
      meta: [modeText(ticket?.adjustmentMode, ticket?.adjustmentRateBp), ticket?.adjustmentRemark]
        .filter(Boolean)
        .join(' · ') || '扣减明细未同步',
      amount: signedDeduction(deduction) || '—',
    })
  }
  const ticketFields: RecordField[] = [
    { label: '调整前净重', value: before ? tonnes(before) : '—', size: 'md' },
    { label: '扣减合计', value: deduction ? tonnes(deduction) : '—', tone: 'warning', size: 'md' },
    { label: '毛重', value: ticket?.gross ? tonnes(ticket.gross) : '—', size: 'md' },
    { label: '皮重', value: ticket?.tare ? tonnes(ticket.tare) : '—', size: 'md' },
    { label: '车牌号码', value: trip.plate, size: 'md' },
    { label: '供应商', value: ticket?.supplier || trip.supplier || '未提供', size: 'sm' },
    { label: '首磅时间', value: ticket?.firstAt || '—', size: 'xs' },
    { label: '回磅时间', value: ticket?.secondAt || '—', size: 'xs' },
  ]
  return {
    hero: {
      label: '出单净重',
      value: final ? trimWeight(final) : '—',
      unit: final ? '吨' : '',
      tone: 'brand',
      size: 'xl',
    },
    sections: [],
    ticketView: {
      no: ticket?.id || '—',
      before: before ? tonnes(before) : '—',
      deduction: deduction ? tonnes(deduction) : '—',
      deductionSigned: signedDeduction(deduction),
      final,
      rules,
      ruleEmpty: rules.length ? '' : '本单无扣减',
      fields: ticketFields,
      rows: toRows(ticketFields),
    },
    permitView: null,
  }
}

function permitView(trip: Trip): RecordView {
  const permit = trip.permit
  const date = permit?.approvedAt || permit?.issuedAt || ''
  return {
    hero: { label: '出门证号', value: permit?.id || '—', size: 'sm' },
    sections: [],
    ticketView: null,
    permitView: {
      no: permit?.id || '—',
      date: chineseDate(date),
      driver: trip.driver || '—',
      material: trip.material || '—',
      supplier: trip.supplier || '—',
      spec: '—',
      quantity: '1 车',
      plate: trip.plate,
      site: trip.site || '—',
      issuer: permitIssuer(trip),
    },
  }
}

function buildView(step: string, trip: Trip) {
  const status = tripStatus(trip)
  if (step === 'current') {
    return currentView(trip, status)
  }
  if (step === 'registration') {
    return registrationView(trip)
  }
  if (step === 'inspection') {
    return inspectionView(trip)
  }
  if (step === 'unload') {
    return unloadView(trip)
  }
  if (step === 'ticket') {
    return ticketView(trip)
  }
  return permitView(trip)
}

Page({
  data: {
    id: '',
    step: 'current',
    loading: true,
    error: '',
    trip: null as Trip | null,
    title: '当前步骤',
    hero: { label: '', value: '' } as RecordHero,
    sections: [] as RecordSection[],
    ticketView: null as TicketView | null,
    permitView: null as PermitView | null,
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
        const title = this.data.step === 'current' ? status.label : stepTitles[this.data.step]
        const view = buildView(this.data.step, trip)
        wx.setNavigationBarTitle({ title })
        this.setData({
          trip,
          title,
          editable: canEdit(trip),
          ...view,
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
