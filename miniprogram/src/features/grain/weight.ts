/** 实际净重 = 毛重 - 皮重；扣减后重量使用磅单 finalNet，两者不能混用。 */
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
