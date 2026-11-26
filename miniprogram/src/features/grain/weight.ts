import type { Ticket } from './types'

export interface TicketWeightItem {
  title: string
  amount: string
}

export interface TicketWeightView {
  grossText: string
  tareText: string
  netText: string
  adjustmentText: string
  hasAdjustment: boolean
  settledText: string
  items: TicketWeightItem[]
}

/** 过磅净重 = 毛重 - 皮重；结算净重使用磅单 finalNet，两者不能混用。 */
export function actualNet(gross: string, tare: string) {
  if (!gross.trim() || !tare.trim()) {
    return ''
  }
  const grossValue = Number(gross)
  const tareValue = Number(tare)
  return Number.isFinite(grossValue) && Number.isFinite(tareValue)
    ? (grossValue - tareValue).toFixed(3)
    : ''
}

function formatWeight(value: string) {
  if (!value || !value.trim()) {
    return '未提供'
  }
  const number = Number(value)
  if (!Number.isFinite(number)) {
    return `${value} 吨`
  }
  return `${Number(number.toFixed(3))} 吨`
}

/** 正值显示为扣减，负值显示为补量，零值不显示。 */
function formatAdjustment(value: string) {
  if (!value || !value.trim()) {
    return ''
  }
  const number = Number(value)
  if (!Number.isFinite(number) || number === 0) {
    return ''
  }
  const signed = number > 0 ? -Math.abs(number) : Math.abs(number)
  return `${signed > 0 ? '+' : ''}${Number(signed.toFixed(3))} 吨`
}

export function ticketWeightOf(ticket: Ticket | null): TicketWeightView | null {
  if (!ticket) {
    return null
  }
  const net = ticket.net
  const settled = ticket.deducted
  const rawAdjustment = ticket.adjustmentTotal
    || (net && settled ? (Number(net) - Number(settled)).toFixed(3) : '')
  const adjustmentText = formatAdjustment(rawAdjustment)
  const items = (ticket.adjustments ?? []).map(item => ({
    title: item.categoryName || item.category || '净重调整',
    amount: formatAdjustment(item.amount) || '—',
  }))
  return {
    grossText: formatWeight(ticket.gross),
    tareText: formatWeight(ticket.tare),
    netText: formatWeight(net),
    adjustmentText,
    hasAdjustment: Boolean(adjustmentText),
    settledText: formatWeight(settled),
    items,
  }
}
