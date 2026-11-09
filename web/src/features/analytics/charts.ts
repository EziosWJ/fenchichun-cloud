import type { EChartsOption } from 'echarts';
import type { ByproductTrendPoint, MaterialTrendSeries, StructureRow, SupplierQualityRow, SupplierQualityTrend, TopRow, TrendSeries } from './api';

const palette = ['#1677ff', '#13c2c2', '#fa8c16', '#722ed1', '#eb2f96'];

// 后端重量字段统一是千分之一吨；图表入口只转换一次，坐标轴和 tooltip 不再各自换算。
function toTonnes(value: number): number {
  return value / 1000;
}

function tonneText(value: number): string {
  return `${Number(value).toLocaleString('zh-CN', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })} 吨`;
}

function axisTonnes(value: number): string {
  return Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

function alphaColor(color: string, opacity: number): string {
  const hex = color.replace('#', '');
  if (hex.length === 6) {
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  return color;
}

export function trendChartOption(trend: TrendSeries | undefined): EChartsOption {
  const points = trend?.points ?? [];
  return {
    color: palette,
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value) => tonneText(Number(value)),
    },
    legend: { data: ['入厂净重', '出厂净重', '过磅净流入'], top: 4, itemGap: 20 },
    grid: { left: 48, right: 24, top: 64, bottom: 32 },
    xAxis: { type: 'category', data: points.map((point) => point.period), boundaryGap: false },
    yAxis: {
      type: 'value',
      name: '吨',
      axisLabel: { formatter: (value: number) => axisTonnes(value) },
    },
    series: [
      { name: '入厂净重', type: 'line', smooth: true, data: points.map((point) => toTonnes(point.inboundNetMilliTonne)) },
      { name: '出厂净重', type: 'line', smooth: true, data: points.map((point) => toTonnes(point.outboundNetMilliTonne)) },
      {
        name: '过磅净流入',
        type: 'line',
        smooth: true,
        lineStyle: { type: 'dashed' },
        data: points.map((point) => toTonnes(point.netFlowMilliTonne)),
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
        return `${item?.name ?? ''}<br/>${value.toFixed(3)} 吨（${item?.percent ?? 0}%）`;
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
        data: (rows ?? []).map((row) => ({ name: row.label, value: toTonnes(row.netMilliTonne) })),
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
      valueFormatter: (value) => tonneText(Number(value)),
    },
    grid: { left: 120, right: 24, top: 16, bottom: 24 },
    xAxis: {
      type: 'value',
      axisLabel: { formatter: (value: number) => axisTonnes(value) },
    },
    yAxis: {
      type: 'category',
      data: sorted.map((row) => row.name || row.code),
    },
    series: [
      {
        type: 'bar',
        data: sorted.map((row) => toTonnes(row.netMilliTonne)),
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
    tooltip: { trigger: 'axis', valueFormatter: (value) => tonneText(Number(value)) },
    legend: { data: rows.map((item) => item.materialName || item.materialCode), top: 4, itemGap: 20 },
    grid: { left: 48, right: 24, top: 64, bottom: 32 },
    xAxis: { type: 'category', data: periods, boundaryGap: false },
    yAxis: {
      type: 'value',
      name: '吨',
      axisLabel: { formatter: (value: number) => axisTonnes(value) },
    },
    series: rows.map((item) => ({
      name: item.materialName || item.materialCode,
      type: 'line',
      smooth: true,
      data: periods.map((period) => toTonnes(item.points.find((point) => point.period === period)?.netMilliTonne ?? 0)),
    })),
  };
}

export function supplierRateBarOption(rows: SupplierQualityRow[] | undefined): EChartsOption {
  const sorted = [...(rows ?? [])]
    .filter((row) => row.sampleCount > 0)
    .sort((a, b) => (a.avgRateBp ?? 0) - (b.avgRateBp ?? 0));
  return {
    color: palette,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const item = (Array.isArray(params) ? params[0] : params) as { name?: string; value?: unknown };
        return `${item?.name ?? ''}<br/>平均扣量率 ${((Number(item?.value ?? 0)) / 100).toFixed(2)}%`;
      },
    },
    grid: { left: 130, right: 32, top: 16, bottom: 32 },
    xAxis: {
      type: 'value',
      axisLabel: { formatter: (value: number) => `${(value / 100).toFixed(1)}%` },
    },
    yAxis: {
      type: 'category',
      data: sorted.map((row) => row.partyName || row.partyCode),
    },
    series: [
      {
        type: 'bar',
        data: sorted.map((row) => row.avgRateBp ?? 0),
        barMaxWidth: 24,
        itemStyle: { borderRadius: [0, 4, 4, 0] },
      },
    ],
  };
}

export function supplierQualityTrendOption(series: SupplierQualityTrend[] | undefined): EChartsOption {
  const rows = series ?? [];
  const periods = Array.from(new Set(rows.flatMap((item) => item.points.map((point) => point.period)))).sort();
  return {
    color: palette,
    tooltip: { trigger: 'axis', valueFormatter: (value) => `${(Number(value) / 100).toFixed(2)}%` },
    legend: { data: rows.map((item) => item.partyName || item.partyCode), top: 4, itemGap: 16, type: 'scroll' },
    grid: { left: 52, right: 24, top: 64, bottom: 32 },
    xAxis: { type: 'category', data: periods, boundaryGap: false },
    yAxis: {
      type: 'value',
      name: '扣量率',
      axisLabel: { formatter: (value: number) => `${(value / 100).toFixed(1)}%` },
    },
    series: rows.map((item) => ({
      name: item.partyName || item.partyCode,
      type: 'line',
      smooth: true,
      data: periods.map((period) => item.points.find((point) => point.period === period)?.avgRateBp ?? null),
    })),
  };
}

export function byproductTrendOption(points: ByproductTrendPoint[] | undefined): EChartsOption {
  const rows = points ?? [];
  return {
    color: palette,
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const items = (Array.isArray(params) ? params : [params]) as Array<{
          name?: string;
          marker?: string;
          seriesName?: string;
          value?: unknown;
        }>;
        const title = items[0]?.name ?? '';
        return [
          title,
          ...items.map((item) => {
            const value = Number(item.value ?? 0);
            return `${item.marker ?? ''}${item.seriesName ?? ''}：${
              item.seriesName === '出库净重' ? tonneText(value) : `${value} 车`
            }`;
          }),
        ].join('<br/>');
      },
    },
    legend: { data: ['出库净重', '出库车次'], top: 4, itemGap: 20 },
    grid: { left: 52, right: 52, top: 64, bottom: 32 },
    xAxis: { type: 'category', data: rows.map((point) => point.period), boundaryGap: true },
    yAxis: [
      { type: 'value', name: '吨', axisLabel: { formatter: (value: number) => axisTonnes(value) } },
      { type: 'value', name: '车', minInterval: 1 },
    ],
    series: [
      { name: '出库净重', type: 'bar', data: rows.map((point) => toTonnes(point.netMilliTonne)), barMaxWidth: 32 },
      { name: '出库车次', type: 'line', yAxisIndex: 1, data: rows.map((point) => point.ticketCount) },
    ],
  };
}

export function partyRankingOption(rows: Array<{ partyName: string; partyCode: string; netMilliTonne: number }> | undefined): EChartsOption {
  const sorted = [...(rows ?? [])]
    .filter((row) => row.netMilliTonne > 0)
    .sort((a, b) => a.netMilliTonne - b.netMilliTonne);
  return {
    color: palette,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (value) => tonneText(Number(value)),
    },
    grid: { left: 150, right: 32, top: 16, bottom: 44 },
    dataZoom: [
      { type: 'inside', yAxisIndex: 0 },
      { type: 'slider', yAxisIndex: 0, width: 10, right: 4, showDetail: false },
    ],
    xAxis: {
      type: 'value',
      axisLabel: { formatter: (value: number) => axisTonnes(value) },
    },
    yAxis: {
      type: 'category',
      data: sorted.map((row) => row.partyName || row.partyCode),
      axisLabel: { width: 130, overflow: 'truncate' },
    },
    series: [
      {
        type: 'bar',
        data: sorted.map((row) => toTonnes(row.netMilliTonne)),
        barMaxWidth: 18,
        itemStyle: { borderRadius: [0, 4, 4, 0] },
      },
    ],
  };
}

export interface OverviewStructureChrome {
  background: string;
  border: string;
  text: string;
}

/**
 * 经营总览物料结构环形图：保留自定义图例和中心文案，悬浮由 ECharts 提供明细。
 */
export function overviewStructureChartOption(
  rows: StructureRow[],
  colors: string[],
  chrome: OverviewStructureChrome,
): EChartsOption {
  return {
    animationDuration: 900,
    animationDurationUpdate: 500,
    animationEasing: 'cubicOut',
    color: colors,
    tooltip: {
      trigger: 'item',
      backgroundColor: chrome.background,
      borderColor: chrome.border,
      borderWidth: 1,
      padding: [10, 12],
      textStyle: { color: chrome.text, fontSize: 12 },
      formatter: (params) => {
        const item = (Array.isArray(params) ? params[0] : params) as {
          name?: string;
          value?: unknown;
          percent?: number;
          marker?: string;
        };
        return `${item.marker ?? ''}${item.name ?? ''}<br/>${tonneText(Number(item.value ?? 0))}（${item.percent ?? 0}%）`;
      },
    },
    series: [
      {
        type: 'pie',
        radius: ['62%', '84%'],
        center: ['50%', '50%'],
        animationType: 'expansion',
        animationDelay: (index: number) => index * 70,
        avoidLabelOverlap: true,
        itemStyle: {
          borderColor: chrome.background,
          borderWidth: 3,
          borderRadius: 4,
        },
        label: { show: false },
        labelLine: { show: false },
        emphasis: {
          scale: true,
          scaleSize: 4,
          itemStyle: {
            shadowBlur: 12,
            shadowColor: alphaColor(colors[0] ?? chrome.text, 0.16),
          },
        },
        data: rows.map((row, index) => ({
          name: row.label,
          value: toTonnes(row.netMilliTonne),
          itemStyle: { color: colors[index % colors.length] },
        })),
      },
    ],
  };
}

export interface OverviewChartPalette {
  primary: string;
  outbound: string;
  text: string;
  tertiary: string;
  border: string;
  background: string;
}

/**
 * 经营总览专用趋势图：只保留入厂/出厂两条净重曲线，数据先统一换算成吨。
 */
export function overviewTrendChartOption(trend: TrendSeries | undefined, colors: OverviewChartPalette): EChartsOption {
  const points = trend?.points ?? [];
  const showSymbol = points.length <= 2;
  return {
    animationDuration: 1200,
    animationDurationUpdate: 500,
    animationEasing: 'cubicOut',
    color: [colors.primary, colors.outbound],
    tooltip: {
      trigger: 'axis',
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderWidth: 1,
      padding: [10, 12],
      textStyle: { color: colors.text, fontSize: 12 },
      valueFormatter: (value) => tonneText(Number(value)),
      axisPointer: { type: 'line', lineStyle: { color: colors.border, type: 'dashed' } },
    },
    grid: { left: 4, right: 10, top: 12, bottom: 4, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: points.map((point) => point.period),
      axisLine: { lineStyle: { color: colors.border } },
      axisTick: { show: false },
      axisLabel: { color: colors.tertiary, fontSize: 11, hideOverlap: true, margin: 12 },
    },
    yAxis: {
      type: 'value',
      splitNumber: 4,
      axisLabel: { color: colors.tertiary, fontSize: 11, formatter: (value: number) => axisTonnes(value) },
      splitLine: { lineStyle: { color: colors.border, type: 'dashed' } },
    },
    series: [
      {
        name: '入厂净重',
        type: 'line',
        smooth: 0.3,
        showSymbol,
        symbol: 'circle',
        symbolSize: 6,
        connectNulls: true,
        data: points.map((point) => toTonnes(point.inboundNetMilliTonne)),
        lineStyle: { width: 2.2, color: colors.primary },
        itemStyle: { color: colors.primary },
        areaStyle: {
          color: {
            type: 'linear' as const,
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: alphaColor(colors.primary, 0.16) },
              { offset: 1, color: alphaColor(colors.primary, 0) },
            ],
          },
        },
        emphasis: { focus: 'series' },
      },
      {
        name: '出厂净重',
        type: 'line',
        smooth: 0.3,
        animationDelay: 120,
        showSymbol,
        symbol: 'circle',
        symbolSize: 6,
        connectNulls: true,
        data: points.map((point) => toTonnes(point.outboundNetMilliTonne)),
        lineStyle: { width: 2, color: colors.outbound },
        itemStyle: { color: colors.outbound },
        areaStyle: {
          color: {
            type: 'linear' as const,
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: alphaColor(colors.outbound, 0.12) },
              { offset: 1, color: alphaColor(colors.outbound, 0) },
            ],
          },
        },
        emphasis: { focus: 'series' },
      },
    ],
  };
}
