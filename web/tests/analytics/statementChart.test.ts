import { describe, expect, it } from 'vitest';
import {
  aggregateStatementDaily,
  statementChartGranularity,
} from '../../src/features/analytics/statementChart';
import type { StatementDaily } from '../../src/features/analytics/api';

function day(date: string, netMilliTonne: number): StatementDaily {
  return {
    date,
    ticketCount: 1,
    grossMilliTonne: 0,
    tareMilliTonne: 0,
    netAdjustmentMilliTonne: 0,
    netMilliTonne,
  };
}

describe('statementChart', () => {
  it('selects day, week and month granularity by period length', () => {
    expect(statementChartGranularity('2026-11-01', '2026-11-30')).toBe('day');
    expect(statementChartGranularity('2026-11-01', '2027-01-31')).toBe('week');
    expect(statementChartGranularity('2026-01-01', '2026-12-31')).toBe('month');
  });

  it('aggregates daily points into 7-day buckets with an explicit range', () => {
    const points = aggregateStatementDaily(
      [day('2026-11-01', 1000), day('2026-11-02', 2000), day('2026-11-08', 3000)],
      'week',
      '2026-11-01',
      '2026-11-30',
    );

    expect(points.map((point) => point.label)).toEqual(['11-01', '11-08']);
    expect(points[0].range).toBe('2026-11-01 ~ 2026-11-07');
    expect(points[0].secondaryLabel).toBe('~07');
    expect(points[0].netMilliTonne).toBe(3000);
    expect(points[1].netMilliTonne).toBe(3000);
    expect(points.reduce((total, point) => total + point.ticketCount, 0)).toBe(3);
  });

  it('keeps the month in a cross-month weekly range', () => {
    const points = aggregateStatementDaily(
      [day('2026-10-29', 1000), day('2026-11-04', 2000)],
      'week',
      '2026-10-01',
      '2026-11-30',
    );

    expect(points[0].range).toBe('2026-10-29 ~ 2026-11-04');
    expect(points[0].secondaryLabel).toBe('~11-04');
  });

  it('clamps the last partial week to the selected period', () => {
    const points = aggregateStatementDaily(
      [day('2026-11-29', 1000), day('2026-11-30', 2000)],
      'week',
      '2026-11-01',
      '2026-11-30',
    );

    expect(points[0].range).toBe('2026-11-29 ~ 2026-11-30');
    expect(points[0].secondaryLabel).toBe('~30');
  });

  it('aggregates a year of data into monthly buckets', () => {
    const points = aggregateStatementDaily(
      [day('2026-01-01', 1000), day('2026-01-15', 2000), day('2026-02-01', 3000)],
      'month',
      '2026-01-01',
      '2026-12-31',
    );

    expect(points.map((point) => point.label)).toEqual(['1月', '2月']);
    expect(points[0].range).toBe('2026-01');
    expect(points[0].netMilliTonne).toBe(3000);
    expect(points[1].netMilliTonne).toBe(3000);
  });

  it('keeps daily labels for a short period', () => {
    const points = aggregateStatementDaily(
      [day('2026-11-01', 1000), day('2026-11-02', 2000)],
      'day',
      '2026-11-01',
      '2026-11-30',
    );

    expect(points.map((point) => point.label)).toEqual(['11-01', '11-02']);
    expect(points[0].range).toBe('2026-11-01');
  });
});
