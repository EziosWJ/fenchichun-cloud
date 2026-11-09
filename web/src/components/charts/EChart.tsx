import { useEffect, useRef } from 'react';
import { Empty, Spin } from 'antd';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
  DatasetComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  TitleComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  DatasetComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  TitleComponent,
  CanvasRenderer,
]);

export interface EChartClickParams {
  dataIndex?: number;
  name?: string;
  value?: unknown;
  seriesIndex?: number;
}

interface EChartProps {
  option: EChartsOption;
  height?: number;
  loading?: boolean;
  empty?: boolean;
  emptyDescription?: string;
  ariaLabel?: string;
  onClick?: (params: EChartClickParams) => void;
}

export function EChart({
  option,
  height = 320,
  loading = false,
  empty = false,
  emptyDescription = '暂无数据',
  ariaLabel,
  onClick,
}: EChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const clickRef = useRef(onClick);

  useEffect(() => {
    clickRef.current = onClick;
  }, [onClick]);

  useEffect(() => {
    if (empty || !containerRef.current) return;
    const container = containerRef.current;
    const chart = echarts.init(container);
    chartRef.current = chart;
    const handleClick = (params: unknown) => clickRef.current?.(params as EChartClickParams);
    chart.on('click', handleClick);
    // 初始化后观察器会立即回调一次；尺寸没变时不要 resize，避免打断首次进入动画。
    let lastWidth = container.clientWidth;
    let lastHeight = container.clientHeight;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      const width = rect?.width ?? container.clientWidth;
      const height = rect?.height ?? container.clientHeight;
      if (Math.abs(width - lastWidth) < 1 && Math.abs(height - lastHeight) < 1) return;
      lastWidth = width;
      lastHeight = height;
      chart.resize();
    });
    observer.observe(container);
    return () => {
      chart.off('click', handleClick);
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [empty]);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option]);

  if (empty) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyDescription} />
      </div>
    );
  }

  return (
    <Spin spinning={loading}>
      <div
        ref={containerRef}
        role="img"
        aria-label={ariaLabel ?? '统计图表'}
        style={{ width: '100%', height }}
      />
    </Spin>
  );
}
