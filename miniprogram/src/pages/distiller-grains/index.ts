import type { DistillerGrainsCustomer, DistillerGrainsDay, DistillerGrainsRecord, DistillerGrainsStats } from '@/features/distiller-grains/api'
import { distillerGrainsStats } from '@/features/distiller-grains/api'
import { applyAsync, errorMessage, requireLogin } from '@/features/grain/page'

type Mode = 'today' | 'week' | 'month' | 'detail'
type Unit = 'day' | 'week' | 'month'

interface Row {
  key: string
  start: string
  end: string
  label: string
  meta: string
  weight: string
}

interface DisplayRecord {
  ticketNo: string
  time: string
  plate: string
  customer: string
  weight: string
}

interface Group {
  date: string
  label: string
  total: string
  records: DisplayRecord[]
}

const modes = [
  { value: 'today', label: '本日' },
  { value: 'week', label: '本周' },
  { value: 'month', label: '本月' },
  { value: 'detail', label: '详细' },
]

const modeUnits: Record<Mode, Unit> = {
  today: 'day',
  week: 'week',
  month: 'month',
  detail: 'day',
}

const summaryLabels: Record<Mode, string> = {
  today: '本日出库合计',
  week: '本周出库合计',
  month: '本月出库合计',
  detail: '所选时段合计',
}

const emptyTexts: Record<Mode, string> = {
  today: '今天还没有酒糟出厂',
  week: '本周还没有酒糟出厂',
  month: '本月还没有酒糟出厂',
  detail: '这段时间没有酒糟出厂',
}

const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function localDate(offsetDays = 0) {
  const value = new Date()
  value.setDate(value.getDate() + offsetDays)
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}

function firstOfMonth() {
  const value = new Date()
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-01`
}

function addDays(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number)
  const value = new Date(Date.UTC(year, month - 1, day + days))
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`
}

function weekdayOf(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

function shortDate(date: string) {
  const parts = date.split('-')
  return `${Number(parts[1])}月${Number(parts[2])}日`
}

function dayLabel(date: string) {
  return `${shortDate(date)} ${weekdayNames[weekdayOf(date)] ?? ''}`
}

function rangeText(from: string, to: string) {
  return from === to ? shortDate(from) : `${shortDate(from)}—${shortDate(to)}`
}

function tonnesText(milliTonne: number) {
  const text = (Math.round(milliTonne / 10) / 100).toFixed(2)
  const [integer, decimal] = text.split('.')
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${decimal}`
}

function timeOf(issuedAt: string) {
  return issuedAt.slice(11, 16)
}

function dateOf(issuedAt: string) {
  return issuedAt.slice(0, 10)
}

function groupRecords(records: DistillerGrainsRecord[]): Group[] {
  const map = new Map<string, DistillerGrainsRecord[]>()
  records.forEach((record) => {
    const key = dateOf(record.issuedAt)
    const list = map.get(key) ?? []
    list.push(record)
    map.set(key, list)
  })
  return [...map.entries()]
    .sort(([left], [right]) => (left < right ? 1 : -1))
    .map(([date, list]) => ({
      date,
      label: dayLabel(date),
      total: tonnesText(list.reduce((sum, record) => sum + record.netMilliTonne, 0)),
      records: list.map(record => ({
        ticketNo: record.ticketNo,
        time: timeOf(record.issuedAt),
        plate: record.plate,
        customer: record.partyName || '—',
        weight: tonnesText(record.netMilliTonne),
      })),
    }))
}

function dayRows(days: DistillerGrainsDay[]): Row[] {
  return days.map(day => ({
    key: day.date,
    start: day.date,
    end: day.date,
    label: dayLabel(day.date),
    meta: `${day.ticketCount} 车`,
    weight: tonnesText(day.netMilliTonne),
  }))
}

function weekRows(days: DistillerGrainsDay[], from: string, to: string): Row[] {
  const rows = new Map<string, Row & { ticketCount: number, netMilliTonne: number }>()
  days.forEach((day) => {
    const weekday = weekdayOf(day.date)
    const mondayIndex = weekday === 0 ? 7 : weekday
    let start = addDays(day.date, 1 - mondayIndex)
    let end = addDays(start, 6)
    if (start < from) {
      start = from
    }
    if (end > to) {
      end = to
    }
    const key = start
    const row = rows.get(key) ?? {
      key,
      start,
      end,
      label: rangeText(start, end),
      meta: '',
      weight: '0.00',
      ticketCount: 0,
      netMilliTonne: 0,
    }
    row.ticketCount += day.ticketCount
    row.netMilliTonne += day.netMilliTonne
    row.meta = `${row.ticketCount} 车`
    row.weight = tonnesText(row.netMilliTonne)
    rows.set(key, row)
  })
  return [...rows.values()]
    .sort((left, right) => left.start.localeCompare(right.start))
    .map(({ key, start, end, label, meta, weight }) => ({ key, start, end, label, meta, weight }))
}

Page({
  data: {
    loading: true,
    error: '',
    roleName: '财务',
    modes,
    mode: 'today' as Mode,
    title: '本日',
    unit: 'day' as Unit,
    isDetail: false,
    customers: [] as DistillerGrainsCustomer[],
    customerNames: ['全部客户'] as string[],
    customerIndex: 0,
    customerCode: '',
    customerName: '',
    showCustomer: true,
    from: firstOfMonth(),
    to: localDate(),
    fromText: shortDate(firstOfMonth()),
    toText: shortDate(localDate()),
    summaryLabel: summaryLabels.today,
    dateText: shortDate(localDate()),
    totalText: '0.00',
    ticketCount: 0,
    hasData: false,
    emptyText: emptyTexts.today,
    rows: [] as Row[],
    groups: [] as Group[],
    modalOpen: false,
    modalLoading: false,
    modalError: '',
    modalTitle: '',
    modalTotal: '0.00',
    modalCount: 0,
    modalGroups: [] as Group[],
  },
  onShow() {
    this.load()
  },
  load() {
    const current = requireLogin('finance')
    if (!current) {
      return
    }
    this.setData({ loading: true, error: '', roleName: '财务' })
    const params: Record<string, unknown> = {
      period: this.data.mode === 'detail' ? 'range' : this.data.mode,
    }
    if (this.data.customerCode) {
      params.customerCode = this.data.customerCode
    }
    if (this.data.mode === 'detail') {
      params.from = this.data.from
      params.to = this.data.to
    }
    applyAsync(
      distillerGrainsStats(params),
      data => this.apply(data),
      error => this.setData({ error: errorMessage(error), loading: false }),
    )
  },
  apply(data: DistillerGrainsStats) {
    const customers = data.customers
    const selected = customers.findIndex(item => item.code === this.data.customerCode)
    const customerIndex = selected >= 0 ? selected + 1 : 0
    const selectedCustomer = customerIndex > 0 ? customers[customerIndex - 1] : undefined
    const mode = this.data.mode
    const unit = modeUnits[mode]
    const groups = groupRecords(data.records)
    this.setData({
      loading: false,
      error: '',
      customers,
      customerNames: ['全部客户', ...customers.map(item => item.name)],
      customerIndex,
      customerCode: selectedCustomer ? selectedCustomer.code : '',
      customerName: selectedCustomer ? selectedCustomer.name : '',
      showCustomer: !selectedCustomer,
      title: modes.find(item => item.value === mode)?.label ?? '本日',
      unit,
      isDetail: mode === 'detail',
      summaryLabel: summaryLabels[mode],
      dateText: mode === 'today' ? shortDate(data.from) : rangeText(data.from, data.to),
      totalText: tonnesText(data.totalNetMilliTonne),
      ticketCount: data.ticketCount,
      hasData: data.ticketCount > 0,
      emptyText: emptyTexts[mode],
      rows: unit === 'week' ? dayRows(data.days) : unit === 'month' ? weekRows(data.days, data.from, data.to) : [],
      groups: unit === 'day' ? groups : [],
    })
  },
  changeMode(event: WechatMiniprogram.BaseEvent) {
    const mode = event.currentTarget.dataset.mode as Mode
    this.setData({
      mode,
      unit: modeUnits[mode],
      isDetail: mode === 'detail',
      summaryLabel: summaryLabels[mode],
      emptyText: emptyTexts[mode],
    })
    this.load()
  },
  changeCustomer(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value)
    const customer = index > 0 ? this.data.customers[index - 1] : undefined
    this.setData({
      customerIndex: index,
      customerCode: customer ? customer.code : '',
      customerName: customer ? customer.name : '',
      showCustomer: !customer,
    })
    this.load()
  },
  changeFrom(event: WechatMiniprogram.PickerChange) {
    const from = String(event.detail.value)
    const to = from > this.data.to ? from : this.data.to
    this.setData({ from, to, fromText: shortDate(from), toText: shortDate(to) })
    this.load()
  },
  changeTo(event: WechatMiniprogram.PickerChange) {
    const to = String(event.detail.value)
    const from = to < this.data.from ? to : this.data.from
    this.setData({ from, to, fromText: shortDate(from), toText: shortDate(to) })
    this.load()
  },
  openDetail(event: WechatMiniprogram.BaseEvent) {
    const start = String(event.currentTarget.dataset.start || '')
    const end = String(event.currentTarget.dataset.end || start)
    const label = String(event.currentTarget.dataset.label || rangeText(start, end))
    if (!start) {
      return
    }
    this.setData({
      modalOpen: true,
      modalLoading: true,
      modalError: '',
      modalTitle: `${label}出库明细`,
      modalTotal: '0.00',
      modalCount: 0,
      modalGroups: [],
    })
    const params: Record<string, unknown> = { period: 'range', from: start, to: end }
    if (this.data.customerCode) {
      params.customerCode = this.data.customerCode
    }
    applyAsync(
      distillerGrainsStats(params),
      data => this.setData({
        modalLoading: false,
        modalGroups: groupRecords(data.records),
        modalTotal: tonnesText(data.totalNetMilliTonne),
        modalCount: data.ticketCount,
      }),
      error => this.setData({ modalLoading: false, modalError: errorMessage(error) }),
    )
  },
  closeModal() {
    this.setData({ modalOpen: false })
  },
  stopTap() {},
})
