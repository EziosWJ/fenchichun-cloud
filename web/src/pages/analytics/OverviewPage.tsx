import { useMemo } from 'react';
import { Alert, Button, Card, Col, Row, Space, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { PageHeader } from '../../components/PageHeader';
import { EChart } from '../../components/charts/EChart';
import { useListUrlState } from '../../hooks/useListUrlState';
import { getApiErrorMessage } from '../../lib/api/errors';
import { analyticsOverview } from '../../features/analytics/api';
import { analyticsFilterConfig, AnalyticsFilterBar, useAnalyticsDefaults } from '../../features/analytics/filters';
import { analyticsFilterParams } from '../../features/analytics/params';
import { formatBp, formatMilliTonne } from '../../features/analytics/format';
import { ChartCard, ComparisonText, FreshnessNote, KpiCard } from '../../features/analytics/ui';
import { pieChartOption, topBarChartOption, trendChartOption } from '../../features/analytics/charts';
import { useAnalyticsMasterData } from '../../features/analytics/useMasterData';
import { formatNumber } from '../../utils/format';

export default function OverviewPage() {
  const { state, actions } = useListUrlState(analyticsFilterConfig);
  useAnalyticsDefaults(state, actions);
  const master = useAnalyticsMasterData();
  const defaults = useMemo(
    () => ({
      from: dayjs().startOf('month').format('YYYY-MM-DD'),
      to: dayjs().endOf('month').format('YYYY-MM-DD'),
    }),
    [],
  );
  const params = useMemo(() => analyticsFilterParams(state, defaults), [state, defaults]);
  const overview = useQuery({
    queryKey: ['analytics', 'overview', params],
    queryFn: () => analyticsOverview(params),
    staleTime: 60_000,
    refetchInterval: 300_000,
    refetchIntervalInBackground: false,
  });
  const data = overview.data;
  const summary = data?.summary;
  const compareMode = state.filters.compare || 'previous';
  const comparison = compareMode === 'year' ? data?.comparison.year : compareMode === 'previous' ? data?.comparison.previous : undefined;
  const inboundTop = data?.topParties.filter((row) => row.direction === 'inbound') ?? [];
  const outboundTop = data?.topParties.filter((row) => row.direction === 'outbound') ?? [];

  const kpis = [
    {
      label: '有效车次',
      value: summary ? formatNumber(summary.validTickets) : '—',
      suffix: '车',
      hint: <ComparisonText metric={comparison?.validTickets} unit="车" />,
    },
    {
      label: '入厂净重',
      value: summary ? formatMilliTonne(summary.inboundNetMilliTonne) : '—',
      suffix: '吨',
      hint: <ComparisonText metric={comparison?.inboundNetMilliTonne} />,
    },
    {
      label: '出厂净重',
      value: summary ? formatMilliTonne(summary.outboundNetMilliTonne) : '—',
      suffix: '吨',
      hint: <ComparisonText metric={comparison?.outboundNetMilliTonne} />,
    },
    {
      label: '过磅净流入',
      value: summary ? formatMilliTonne(summary.netFlowMilliTonne) : '—',
      suffix: '吨',
      hint: <ComparisonText metric={comparison?.netFlowMilliTonne} />,
    },
    {
      label: '活跃供收方',
      value: summary ? formatNumber(summary.activeSuppliers + summary.activeCustomers) : '—',
      suffix: '家',
      hint: summary ? `供货方 ${summary.activeSuppliers} · 收货方 ${summary.activeCustomers}` : undefined,
    },
    {
      label: '扣量率',
      value: summary ? formatBp(summary.adjustmentWeightRateBp) : '—',
      hint: summary ? `调整覆盖率 ${formatBp(summary.adjustmentCoverageBp)}` : undefined,
    },
  ];

  return (
    <>
      <PageHeader
        title="经营总览"
        description="按出单时间汇总云端有效过磅单，展示入厂、出厂、净流入、结构与异常。过磅净流入不是库存。"
        extra={<Button onClick={() => void overview.refetch()}>刷新</Button>}
      />
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Card size="small">
          <AnalyticsFilterBar
            state={state}
            actions={actions}
            sites={master.sites}
            materials={master.materials}
            categories={master.categories}
            showDirection={false}
            showKeyword={false}
          />
        </Card>
        {overview.isError && (
          <Alert
            type="error"
            message={`经营总览加载失败：${getApiErrorMessage(overview.error)}`}
            action={<Button onClick={() => void overview.refetch()}>重试</Button>}
          />
        )}
        <Row gutter={[16, 16]}>
          {kpis.map((item) => (
            <Col xs={24} sm={12} xl={4} key={item.label}>
              <KpiCard label={item.label} value={item.value} suffix={item.suffix} hint={item.hint} />
            </Col>
          ))}
        </Row>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} xl={6}>
            <KpiCard label="作废率" value={summary ? formatBp(summary.voidRateBp) : '—'} hint={summary ? `${summary.voidTickets} 张作废单` : undefined} />
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <KpiCard label="平均单次净重" value={summary?.avgNetPerTicketMilliTonne != null ? formatMilliTonne(summary.avgNetPerTicketMilliTonne) : '—'} suffix="吨" />
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <KpiCard label="净重调整" value={summary ? formatMilliTonne(summary.adjustmentNetMilliTonne) : '—'} suffix="吨" hint={summary ? `${summary.adjustedTickets} 张调整单` : undefined} />
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <KpiCard label="数据截止" value={data?.freshness.dataThrough ? dayjs(data.freshness.dataThrough).format('MM-DD HH:mm') : '—'} hint={data?.freshness.historyStart ? `历史起点 ${dayjs(data.freshness.historyStart).format('YYYY-MM-DD')}` : undefined} />
          </Col>
        </Row>
        <ChartCard title="进出厂趋势">
          <EChart
            option={trendChartOption(data?.trend)}
            loading={overview.isLoading}
            empty={!data?.trend.points.length}
            ariaLabel="进出厂净重趋势图"
          />
        </ChartCard>
        <Row gutter={[16, 16]}>
          <Col xs={24} xl={8}>
            <ChartCard title="物料分类结构">
              <EChart option={pieChartOption(data?.materialStructure)} loading={overview.isLoading} empty={!data?.materialStructure.length} height={300} ariaLabel="物料分类结构图" />
            </ChartCard>
          </Col>
          <Col xs={24} xl={8}>
            <ChartCard title="Top 物料">
              <EChart option={topBarChartOption(data?.topMaterials)} loading={overview.isLoading} empty={!data?.topMaterials.length} height={300} ariaLabel="Top 物料图" />
            </ChartCard>
          </Col>
          <Col xs={24} xl={8}>
            <ChartCard title="Top 供收方">
              <EChart option={topBarChartOption([...inboundTop, ...outboundTop])} loading={overview.isLoading} empty={!inboundTop.length && !outboundTop.length} height={300} ariaLabel="Top 供收方图" />
            </ChartCard>
          </Col>
        </Row>
        {(data?.alerts.length ?? 0) > 0 && (
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            {data?.alerts.map((alert) => (
              <Alert key={`${alert.type}-${alert.message}`} type={alert.level === 'error' ? 'error' : alert.level === 'warning' ? 'warning' : 'info'} showIcon message={alert.message} description={alert.count ? `涉及 ${alert.count} 条` : undefined} />
            ))}
          </Space>
        )}
        <FreshnessNote freshness={data?.freshness} />
        <Typography.Text type="secondary">
          口径：有效单按出单时间归期；作废单不计入流量；重开只计新的有效单；扣量率仅统计调整字段已知的单据。
        </Typography.Text>
      </Space>
    </>
  );
}
