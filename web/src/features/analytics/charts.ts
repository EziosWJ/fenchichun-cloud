import type { EChartsOption } from 'echarts';
import type { MaterialTrendSeries, StructureRow, TopRow, TrendSeries } from './api';

const palette = ['#1677ff', '#13c2c2', '#fa8c16', '#722ed1', '#eb2f96'];

function tonnes(value: number): string {
  return (value / 1000).toFixed(3);
}

export function trendChartOption(trend: TrendSeries | undefined): EChartsOption {
  const points = trend?.points ?? [];
  return {
    color: palette,
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value) => `${Number(value).toFixed(3)} 吨`,
    },
    legend: { data: ['入厂净重', '出厂净重', '过磅净流入'] },
    grid: { left: 48, right: 24, top: 40, bottom: 32 },
    xAxis: { type: 'category', data: points.map((point) => point.period), boundaryGap: false },
    yAxis: {
      type: 'value',
      name: '吨',
      axisLabel: { formatter: (value: number) => (value / 1000).toFixed(0) },
    },
    series: [
      { name: '入厂净重', type: 'line', smooth: true, data: points.map((point) => point.inboundNetMilliTonne) },
      { name: '出厂净重', type: 'line', smooth: true, data: points.map((point) => point.outboundNetMilliTonne) },
      {
        name: '过磅净流入',
        type: 'line',
        smooth: true,
        lineStyle: { type: 'dashed' },
        data: points.map((point) => point.netFlowMilliTonne),
      },
    ],
  };
}

export function pieChartOption(rows: StructureRow[] | undefined): EChartsOption {
  return {
    color: palette,
    tooltip: {
      trigger: 'item',
      formatter: (params) => {
        const item = (Array.isArray(params) ? params[0] : params) as {
          name?: string;
          value?: unknown;
          percent?: number;
        };
        const value = typeof item?.value === 'number' ? item.value : Number(item?.value ?? 0);
        return `${item?.name ?? ''}<br/>${tonnes(value)} 吨（${item?.percent ?? 0}%）`;
      },
    },
    legend: { bottom: 0 },
    series: [
      {
        type: 'pie',
        radius: ['42%', '68%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
        label: { formatter: '{b}' },
        data: (rows ?? []).map((row) => ({ name: row.label, value: row.netMilliTonne })),
      },
    ],
  };
}

export function countPieChartOption(rows: Array<{ name: string; value: number }> | undefined): EChartsOption {
  return {
    color: palette,
    tooltip: {
      trigger: 'item',
      formatter: (params) => {
        const item = (Array.isArray(params) ? params[0] : params) as {
          name?: string;
          value?: unknown;
          percent?: number;
        };
        const value = typeof item?.value === 'number' ? item.value : Number(item?.value ?? 0);
        return `${item?.name ?? ''}<br/>${value} 单（${item?.percent ?? 0}%）`;
      },
    },
    legend: { bottom: 0 },
    series: [
      {
        type: 'pie',
        radius: ['42%', '68%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
        label: { formatter: '{b}' },
        data: (rows ?? []).map((row) => ({ name: row.name, value: row.value })),
      },
    ],
  };
}

export function topBarChartOption(rows: TopRow[] | undefined): EChartsOption {
  const sorted = [...(rows ?? [])].reverse();
  return {
    color: palette,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (value) => `${Number(value).toFixed(3)} 吨`,
    },
    grid: { left: 120, right: 24, top: 16, bottom: 24 },
    xAxis: {
      type: 'value',
      axisLabel: { formatter: (value: number) => (value / 1000).toFixed(0) },
    },
    yAxis: {
      type: 'category',
      data: sorted.map((row) => row.name || row.code),
    },
    series: [
      {
        type: 'bar',
        data: sorted.map((row) => row.netMilliTonne),
        barMaxWidth: 24,
        itemStyle: { borderRadius: [0, 4, 4, 0] },
      },
    ],
  };
}

export function materialTrendOption(series: MaterialTrendSeries[] | undefined): EChartsOption {
  const rows = series ?? [];
  const periods = Array.from(new Set(rows.flatMap((item) => item.points.map((point) => point.period)))).sort();
  return {
    color: palette,
    tooltip: { trigger: 'axis', valueFormatter: (value) => `${Number(value).toFixed(3)} 吨` },
    legend: { data: rows.map((item) => item.materialName || item.materialCode) },
    grid: { left: 48, right: 24, top: 40, bottom: 32 },
    xAxis: { type: 'category', data: periods, boundaryGap: false },
    yAxis: {
      type: 'value',
      name: '吨',
      axisLabel: { formatter: (value: number) => (value / 1000).toFixed(0) },
    },
    series: rows.map((item) => ({
      name: item.materialName || item.materialCode,
      type: 'line',
      smooth: true,
      data: periods.map((period) => item.points.find((point) => point.period === period)?.netMilliTonne ?? 0),
    })),
  };
}
