import dayjs from 'dayjs';

export const DATE_FORMAT = 'YYYY-MM-DD';
export const DATE_TIME_FORMAT = 'YYYY-MM-DD HH:mm';

export function formatDate(value: string | null | undefined, fallback = '—'): string {
  if (!value) return fallback;
  const date = dayjs(value);
  return date.isValid() ? date.format(DATE_FORMAT) : fallback;
}

export function formatDateTime(value: string | null | undefined, fallback = '—'): string {
  if (!value) return fallback;
  const date = dayjs(value);
  return date.isValid() ? date.format(DATE_TIME_FORMAT) : fallback;
}

export function formatCurrency(value: number, fractionDigits = 2): string {
  if (!Number.isFinite(value)) return '—';
  const fixed = value.toFixed(fractionDigits);
  const negative = fixed.startsWith('-');
  const [integer, decimal] = (negative ? fixed.slice(1) : fixed).split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const amount = decimal ? `${grouped}.${decimal}` : grouped;
  return `${negative ? '-' : ''}¥${amount}`;
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('zh-CN').format(value);
}

export function formatPercent(value: number, fractionDigits = 0): string {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(fractionDigits)}%`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = dayjs(value);
  return parsed.isValid() && parsed.format(DATE_FORMAT) === value;
}

export function todayString(): string {
  return dayjs().format(DATE_FORMAT);
}

export function nowIso(): string {
  return dayjs().toISOString();
}

export function formatBytes(bytes: number | null | undefined, fractionDigits = 1): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(fractionDigits)} ${units[unit]}`;
}
