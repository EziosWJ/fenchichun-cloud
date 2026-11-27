import type { ReactNode } from 'react';
import { Card, Space, Typography } from 'antd';
import type { AnalyticsFreshness, ComparisonMetric } from './api';
import { formatBeijingTime, formatBp } from './format';
import styles from './ui.module.css';

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
    <Card size="small" className={styles.kpiCard}>
      <div>
        <div className={styles.kpiLabel}>{label}</div>
        <div className={styles.kpiValueRow}>
          <span className={styles.kpiValue}>{value}</span>
          {suffix && <span className={styles.kpiSuffix}>{suffix}</span>}
        </div>
      </div>
      <div className={styles.kpiHint}>{hint}</div>
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
    <Card size="small" className={styles.chartCard} title={title} extra={extra}>
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
  const stale = staleSites.length > 0;

  return (
    <div
      className={`${styles.freshnessBar} ${stale ? styles.freshnessStale : ''}`.trim()}
      role="status"
      aria-label="数据同步状态"
    >
      <div className={styles.freshnessRow}>
        <span>
          <i className={styles.freshnessDot} aria-hidden="true" />
          数据截止（筛选内最后出单） <strong>{formatBeijingTime(freshness.filteredDataThrough)}</strong>
        </span>
        <span>
          最近接收（{siteCode ? '所选厂区' : '全平台'}） <strong>{formatBeijingTime(latestReceipt)}</strong>
        </span>
        <span className={styles.freshnessMeta}>
          北京时间 · 历史起点 {formatBeijingTime(freshness.historyStart)}（补传会更新统计）
        </span>
      </div>
      {stale && (
        <details className={styles.freshnessDetails} open={staleSites.length === 1 || undefined}>
          <summary>{staleSites.length} 个厂区超 2 小时未收到单据变化或暂无接收记录</summary>
          <ul>
            {staleSites.map((site) => (
              <li key={site.siteCode}>
                {site.siteName || site.siteCode}（{site.siteCode}）{' '}
                {site.lastReceivedAt ? formatBeijingTime(site.lastReceivedAt) : '暂无接收记录'}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
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
