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

export function formatBp(value: number | null | undefined, fractionDigits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${(value / 100).toFixed(fractionDigits)}%`;
}

export function formatSeconds(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value < 60) return `${Math.round(value)} 秒`;
  if (value < 3600) return `${Math.round(value / 60)} 分钟`;
  if (value < 86400) return `${(value / 3600).toFixed(1)} 小时`;
  return `${(value / 86400).toFixed(1)} 天`;
}

export function formatMilliTonneOrDash(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return formatMilliTonne(value);
}

export function analyticsDirectionLabel(direction: string | undefined): string {
  if (direction === 'inbound') return '入厂';
  if (direction === 'outbound') return '出厂';
  return '全部';
}
