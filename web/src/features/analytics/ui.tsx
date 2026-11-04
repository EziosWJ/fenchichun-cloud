import type { ReactNode } from 'react';
import { Alert, Card, Space, Statistic, Typography } from 'antd';
import { formatDateTime } from '../../utils/format';
import type { AnalyticsFreshness, ComparisonMetric } from './api';
import { formatBp } from './format';

export function KpiCard({
  label,
  value,
  suffix,
  hint,
}: {
  label: string;
  value: ReactNode;
  suffix?: string;
  hint?: ReactNode;
}) {
  return (
    <Card size="small">
      <Statistic title={label} value={value as string | number} suffix={suffix} />
      {hint && (
        <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
          {hint}
        </Typography.Text>
      )}
    </Card>
  );
}

export function ChartCard({
  title,
  extra,
  children,
}: {
  title: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card size="small" title={title} extra={extra}>
      {children}
    </Card>
  );
}

export function FreshnessNote({ freshness }: { freshness: AnalyticsFreshness | undefined }) {
  if (!freshness) return null;
  const lastReceived = freshness.lastReceivedAt ? formatDateTime(freshness.lastReceivedAt) : '暂无';
  const dataThrough = freshness.dataThrough ? formatDateTime(freshness.dataThrough) : '暂无';
  const historyStart = freshness.historyStart ? formatDateTime(freshness.historyStart) : '暂无';
  return (
    <Alert
      type="info"
      showIcon
      message={`数据截止：${dataThrough} · 最近接收：${lastReceived}`}
      description={`历史起点：${historyStart}。统计仅基于云端已接收单据，结果会随厂端补传变化，不代表各厂实时完整上报。`}
    />
  );
}

export function ComparisonText({ metric, unit = '吨' }: { metric: ComparisonMetric | undefined; unit?: string }) {
  if (!metric) return <Typography.Text type="secondary">—</Typography.Text>;
  const sign = metric.delta > 0 ? '+' : '';
  return (
    <Space size={4} wrap>
      <Typography.Text type={metric.delta > 0 ? 'success' : metric.delta < 0 ? 'danger' : 'secondary'}>
        {sign}
        {unit === '吨' ? (metric.delta / 1000).toFixed(3) : metric.delta}
        {unit}
      </Typography.Text>
      <Typography.Text type="secondary">({formatBp(metric.deltaBp)})</Typography.Text>
    </Space>
  );
}
