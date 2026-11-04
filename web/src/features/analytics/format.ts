export const statementDirectionLabels = {
  outbound: '销售客户（出厂装货）',
  inbound: '采购供应商（入厂卸货）',
} as const;

export function statementDirectionLabel(direction: string): string {
  return direction === 'inbound'
    ? statementDirectionLabels.inbound
    : statementDirectionLabels.outbound;
}

export function formatMilliTonne(milliTonne: number): string {
  if (!Number.isFinite(milliTonne)) return '—';
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(milliTonne / 1000);
}
