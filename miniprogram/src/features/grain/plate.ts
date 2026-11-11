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

/**
 * 车牌不使用 I/O。OCR 结果回填时，将发牌机关字母之后的 O/I 纠正为 0/1；
 * 第二位发牌机关字母必须保持字母，不能替换成数字，交给人工核对。
 */
export function correctPlateOcrConfusions(value: string) {
  const normalized = normalizePlate(value)
  if (!normalized) {
    return normalized
  }
  const hasProvince = plateProvinces.includes(normalized[0]) || normalized[0] === '使' || normalized[0] === '领'
  const head = normalized.slice(0, hasProvince ? 2 : 1)
  const body = normalized.slice(head.length).replace(/O/g, '0').replace(/I/g, '1')
  return head + body
}
