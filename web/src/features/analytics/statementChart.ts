import dayjs from 'dayjs';
import type { StatementDaily } from './api';

export type StatementChartGranularity = 'day' | 'week' | 'month';

export interface StatementChartPoint {
  key: string;
  label: string;
  range: string;
  secondaryLabel?: string;
  netMilliTonne: number;
  ticketCount: number;
}

/**
 * 长周期把每日柱状图收敛为周/月柱，避免一年 365 根柱子挤在一起。
 * 45 天内保留日粒度，180 天内按周，超过 180 天按月。
 */
export function statementChartGranularity(
  from: string,
  to: string,
  fallbackDate?: string,
): StatementChartGranularity {
  const start = dayjs(from || fallbackDate || '');
  const end = dayjs(to || fallbackDate || '');
  if (!start.isValid() || !end.isValid()) return 'day';
  const days = Math.max(1, end.diff(start, 'day') + 1);
  if (days > 180) return 'month';
  if (days > 45) return 'week';
  return 'day';
}

export function aggregateStatementDaily(
  daily: StatementDaily[],
  granularity: StatementChartGranularity,
  from: string,
  to: string,
): StatementChartPoint[] {
  if (!daily.length) return [];

  const anchor = dayjs(from || daily[0].date);
  const periodEnd = dayjs(to || daily[daily.length - 1].date);
  const multiYear = new Set(daily.map((point) => point.date.slice(0, 4))).size > 1;
  const groups = new Map<string, StatementChartPoint>();

  for (const point of daily) {
    const date = dayjs(point.date);
    let key: string;
    let label: string;
    let range: string;
    let secondaryLabel: string | undefined;

    if (granularity === 'week') {
      const index = anchor.isValid() ? Math.max(0, Math.floor(date.diff(anchor, 'day') / 7)) : 0;
      const bucketStart = anchor.add(index * 7, 'day');
      const bucketEnd = bucketStart.add(6, 'day');
      const rangeStart =
        anchor.isValid() && bucketStart.isBefore(anchor, 'day') ? anchor : bucketStart;
      const rangeEnd =
        periodEnd.isValid() && bucketEnd.isAfter(periodEnd, 'day') ? periodEnd : bucketEnd;
      key = bucketStart.format('YYYY-MM-DD');
      label = rangeStart.format('MM-DD');
      const sameMonth =
        rangeStart.year() === rangeEnd.year() && rangeStart.month() === rangeEnd.month();
      secondaryLabel = rangeEnd.isSame(rangeStart, 'day')
        ? undefined
        : `~${rangeEnd.format(sameMonth ? 'DD' : 'MM-DD')}`;
      range =
        rangeEnd.isSame(rangeStart, 'day')
          ? rangeStart.format('YYYY-MM-DD')
          : `${rangeStart.format('YYYY-MM-DD')} ~ ${rangeEnd.format('YYYY-MM-DD')}`;
    } else if (granularity === 'month') {
      key = date.format('YYYY-MM');
      label = multiYear ? date.format('YY-MM') : date.format('M月');
      range = date.format('YYYY-MM');
    } else {
      key = date.format('YYYY-MM-DD');
      label = date.format('MM-DD');
      range = date.format('YYYY-MM-DD');
    }

    const existing = groups.get(key);
    if (existing) {
      existing.netMilliTonne += point.netMilliTonne;
      existing.ticketCount += point.ticketCount;
    } else {
      groups.set(key, {
        key,
        label,
        range,
        secondaryLabel,
        netMilliTonne: point.netMilliTonne,
        ticketCount: point.ticketCount,
      });
    }
  }

  return Array.from(groups.values()).sort((left, right) => left.key.localeCompare(right.key));
}
