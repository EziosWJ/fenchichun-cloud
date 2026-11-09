const platePattern = /^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领][A-Z]([A-Z0-9]{5}|[A-Z0-9]{6}|[A-Z0-9]{5}[挂学警港澳])$/;

export function normalizePlate(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

export function isValidPlate(value: string): boolean {
  return platePattern.test(normalizePlate(value));
}
