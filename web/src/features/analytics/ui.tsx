import type { ReactNode } from 'react';
import { Alert, Card, Space, Statistic, Typography } from 'antd';
import type { AnalyticsFreshness, ComparisonMetric } from './api';
import { formatBeijingTime, formatBp } from './format';

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
    <Card
      size="small"
      style={{ height: '100%' }}
      styles={{ body: { display: 'flex', flexDirection: 'column', height: '100%' } }}
    >
      <Statistic title={label} value={value as string | number} suffix={suffix} />
      <div style={{ minHeight: 20, marginTop: 4 }}>
        {hint && (
          <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
            {hint}
          </Typography.Text>
        )}
      </div>
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

export function FreshnessNote({
  freshness,
  siteCode,
}: {
  freshness: AnalyticsFreshness | undefined;
  siteCode?: string;
}) {
  if (!freshness) return null;
  const receipts = (freshness.siteReceipts ?? []).filter((site) => !siteCode || site.siteCode === siteCode);
  const staleBefore = Date.now() - 2 * 60 * 60 * 1000;
  const staleSites = receipts.filter((site) =>
    (site.enabled !== false || siteCode === site.siteCode)
      && (!site.lastReceivedAt || Date.parse(site.lastReceivedAt) < staleBefore));
  const latestReceipt = siteCode ? receipts[0]?.lastReceivedAt : freshness.lastReceivedAt;
  return (
    <Alert
      type={staleSites.length ? 'warning' : 'info'}
      showIcon
      title={
        <Space size={[20, 4]} wrap>
          <span>数据截止（筛选内最后出单） {formatBeijingTime(freshness.filteredDataThrough)}</span>
          <span>最近接收（{siteCode ? '所选厂区' : '全平台'}） {formatBeijingTime(latestReceipt)}</span>
        </Space>
      }
      description={
        <>
          {staleSites.length > 0 && (
            <details open={staleSites.length === 1 || undefined}>
              <summary>{staleSites.length} 个厂区超 2 小时未收到单据变化或暂无接收记录</summary>
              <ul style={{ marginBlock: 4, paddingInlineStart: 22 }}>
                {staleSites.map((site) => (
                  <li key={site.siteCode}>
                    {site.siteName || site.siteCode}（{site.siteCode}） {site.lastReceivedAt
                      ? formatBeijingTime(site.lastReceivedAt)
                      : '暂无接收记录'}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <span>北京时间。全平台历史起点 {formatBeijingTime(freshness.historyStart)}。补传会更新统计，接收间隔也可能受厂区业务量影响。</span>
        </>
      }
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
