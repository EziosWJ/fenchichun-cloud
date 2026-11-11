/** 中国大陆民用/新能源车牌校验（含挂、学、警、港、澳、领后缀）。 */
export const plateProvinces = [
  '京', '沪', '津', '渝', '冀', '豫', '云', '辽', '黑', '湘', '皖', '鲁', '新',
  '苏', '浙', '赣', '鄂', '桂', '甘', '晋', '蒙', '陕', '吉', '闽', '贵', '粤',
  '青', '藏', '川', '宁', '琼',
]

export const platePattern = /^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领][A-HJ-NP-Z]([A-HJ-NP-Z0-9]{4}[A-HJ-NP-Z0-9挂学警港澳领]|\d{5}[DF]|[DF][A-HJ-NP-Z0-9]\d{4})$/

export function normalizePlate(value: string) {
  return value.trim().toUpperCase()
}

export function isValidPlate(value: string) {
  return platePattern.test(normalizePlate(value))
}
