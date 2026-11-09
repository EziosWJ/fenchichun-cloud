import { describe, expect, it } from 'vitest';
import {
  overviewStructureChartOption,
  overviewTrendChartOption,
  topBarChartOption,
  trendChartOption,
} from '../../src/features/analytics/charts';
import type { TrendSeries } from '../../src/features/analytics/api';

const trend: TrendSeries = {
  granularity: 'day',
  points: [
    {
      period: '2026-11-01',
      periodStart: '2026-11-01',
      periodEnd: '2026-11-01',
      inboundTickets: 1,
      inboundNetMilliTonne: 1000,
      outboundTickets: 1,
      outboundNetMilliTonne: 500,
      netFlowMilliTonne: 500,
      avgNetPerTicketMilliTonne: 750,
      voidTickets: 0,
      voidRateBp: 0,
    },
  ],
};

describe('统计图表单位换算', () => {
  it('趋势图把千分之一吨换算成吨', () => {
    const option = trendChartOption(trend);
    const series = option.series as Array<{ data: number[] }>;
    expect(series[0].data).toEqual([1]);
    expect(series[1].data).toEqual([0.5]);
    const tooltip = option.tooltip as { valueFormatter?: (value: number) => string };
    expect(tooltip.valueFormatter?.(1)).toBe('1.000 吨');
  });

  it('经营总览趋势图使用独立出厂色并保持吨数换算', () => {
    const option = overviewTrendChartOption(trend, {
      primary: '#1677ff',
      outbound: '#13c2c2',
      text: '#1e293b',
      tertiary: '#5f6e82',
      border: '#e9eef6',
      background: '#ffffff',
    });
    const series = option.series as Array<{ data: number[]; lineStyle?: { color?: string } }>;
    expect(series[0].data).toEqual([1]);
    expect(series[1].data).toEqual([0.5]);
    expect(series[1].lineStyle?.color).toBe('#13c2c2');
  });

  it('物料结构图悬浮提示展示吨数和百分比', () => {
    const option = overviewStructureChartOption(
      [{ key: 'C1', label: '原料', netMilliTonne: 1000, shareBp: 10000 }],
      ['#1677ff'],
      { background: '#ffffff', border: '#e9eef6', text: '#1e293b' },
    );
    const series = option.series as Array<{ data: Array<{ name: string; value: number }> }>;
    expect(series[0].data[0]).toMatchObject({ name: '原料', value: 1 });
    const tooltip = option.tooltip as { formatter?: (params: unknown) => string };
    expect(tooltip.formatter?.({ name: '原料', value: 1, percent: 100, marker: '●' })).toContain('1.000 吨');
  });

  it('Top 排名图把千分之一吨换算成吨', () => {
    const option = topBarChartOption([
      { code: 'M1', name: '高粱', netMilliTonne: 1000, ticketCount: 1, shareBp: 10000 },
    ]);
    const series = option.series as Array<{ data: number[] }>;
    expect(series[0].data).toEqual([1]);
    const tooltip = option.tooltip as { valueFormatter?: (value: number) => string };
    expect(tooltip.valueFormatter?.(1)).toBe('1.000 吨');
  });
});
