const TONNES = /^-?\d+(\.\d{1,3})?$/;

function milli(value: string): bigint | null {
  if (!TONNES.test(value)) return null;
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  const result = BigInt(whole) * 1000n + BigInt((fraction + '000').slice(0, 3));
  return negative ? -result : result;
}

export function formatTonnes(value: string | null | undefined): string {
  return value && TONNES.test(value) ? value : '—';
}

export function subtractTonnes(minuend: string | null | undefined, subtrahend: string | null | undefined): string {
  const a = minuend ? milli(minuend) : null;
  const b = subtrahend ? milli(subtrahend) : null;
  if (a === null || b === null) return '—';
  const value = a - b;
  const absolute = value < 0n ? -value : value;
  const fraction = (absolute % 1000n).toString().padStart(3, '0');
  return `${value < 0n ? '-' : ''}${absolute / 1000n}.${fraction}`;
}
