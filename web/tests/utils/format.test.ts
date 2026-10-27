import { describe, expect, it } from 'vitest';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatFileSize,
  formatNumber,
  formatPercent,
  isDateString,
} from '../../src/utils/format';

describe('format utilities', () => {
  it('formats dates and date-times without timezone conversion surprises', () => {
    expect(formatDate('2026-10-18')).toBe('2026-10-18');
    expect(formatDate('')).toBe('—');
    expect(formatDate(null, '暂无')).toBe('暂无');
    expect(formatDate('not-a-date')).toBe('—');
    expect(formatDateTime('2026-10-18T10:30:00')).toBe('2026-10-18 10:30');
  });

  it('formats currency with grouping and two decimals', () => {
    expect(formatCurrency(1234567.5)).toBe('¥1,234,567.50');
    expect(formatCurrency(0)).toBe('¥0.00');
    expect(formatCurrency(-1234.5)).toBe('-¥1,234.50');
    expect(formatCurrency(Number.NaN)).toBe('—');
  });

  it('formats numbers, percentages and file sizes', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatPercent(42.6, 1)).toBe('42.6%');
    expect(formatFileSize(900)).toBe('900 B');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(3 * 1024 * 1024)).toBe('3.0 MB');
  });

  it('validates strict YYYY-MM-DD values', () => {
    expect(isDateString('2026-10-18')).toBe(true);
    expect(isDateString('2026-02-30')).toBe(false);
    expect(isDateString('2026-13-01')).toBe(false);
    expect(isDateString('2026/10/18')).toBe(false);
    expect(isDateString('')).toBe(false);
  });
});
