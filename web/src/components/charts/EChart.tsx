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

interface EChartProps {
  option: EChartsOption;
  height?: number;
  loading?: boolean;
  empty?: boolean;
  emptyDescription?: string;
  ariaLabel?: string;
}

export function EChart({
  option,
  height = 320,
  loading = false,
  empty = false,
  emptyDescription = '暂无数据',
  ariaLabel,
}: EChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (empty || !containerRef.current) return;
    const chart = echarts.init(containerRef.current);
    chartRef.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(containerRef.current);
    return () => {
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
