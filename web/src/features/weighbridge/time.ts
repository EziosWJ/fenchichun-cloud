const beijingDateTime = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export function formatBeijingTime(value: string | null | undefined, precision: 'day' | 'minute' | 'second' = 'minute') {
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return '—';
  const formatted = beijingDateTime.format(date);
  return formatted.slice(0, { day: 10, minute: 16, second: 19 }[precision]);
}
