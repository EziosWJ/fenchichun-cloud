/** 中国大陆民用/新能源车牌校验（含挂、学、警、港、澳、领后缀）。 */
export const platePattern = /^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领][A-HJ-NP-Z]([A-HJ-NP-Z0-9]{4}[A-HJ-NP-Z0-9挂学警港澳领]|\d{5}[DF]|[DF][A-HJ-NP-Z0-9]\d{4})$/

export function normalizePlate(value: string) {
  return value.trim().toUpperCase()
}

export function isValidPlate(value: string) {
  return platePattern.test(normalizePlate(value))
}
