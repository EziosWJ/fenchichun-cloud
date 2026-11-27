import { useMemo, useState } from 'react';
import { Alert, App, Button, Card, Col, Row, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { paths } from '../../config/paths';
import { PageHeader } from '../../components/PageHeader';
import { EChart } from '../../components/charts/EChart';
import { useListUrlState } from '../../hooks/useListUrlState';
import { getApiErrorMessage } from '../../lib/api/errors';
import {
  analyticsFlow,
  exportAnalyticsFlow,
  type FlowSiteRow,
  type TrendPoint,
} from '../../features/analytics/api';
import { analyticsFilterConfig, AnalyticsFilterBar, useAnalyticsDefaults } from '../../features/analytics/filters';
import { analyticsFilterParams, analyticsHref, analyticsPeriodFilters, analyticsTicketsHref } from '../../features/analytics/params';
import { formatBp, formatMilliTonne, formatSeconds } from '../../features/analytics/format';
import { ChartCard, ComparisonText, FreshnessNote, KpiCard } from '../../features/analytics/ui';
import { trendChartOption } from '../../features/analytics/charts';
import { useAnalyticsMasterData } from '../../features/analytics/useMasterData';
import { downloadBlob } from '../../features/analytics/download';
import { formatNumber } from '../../utils/format';

export default function FlowPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { state, actions } = useListUrlState(analyticsFilterConfig);
  useAnalyticsDefaults(state, actions);
  const master = useAnalyticsMasterData();
  const [exporting, setExporting] = useState(false);
  const defaults = useMemo(
    () => ({
      from: dayjs().startOf('month').format('YYYY-MM-DD'),
      to: dayjs().endOf('month').format('YYYY-MM-DD'),
    }),
    [],
  );
  const params = useMemo(() => analyticsFilterParams(state, defaults), [state, defaults]);
  const flow = useQuery({
    queryKey: ['analytics', 'flow', params],
    queryFn: () => analyticsFlow(params),
    staleTime: 60_000,
    refetchInterval: 300_000,
    refetchIntervalInBackground: false,
  });
  const data = flow.data;
  const summary = data?.summary;
  const compareMode = state.filters.compare || 'previous';
  const comparison = compareMode === 'year' ? data?.comparison.year : compareMode === 'previous' ? data?.comparison.previous : undefined;

  const drillHref = (filters: Record<string, unknown>) => {
    if (params.keyword) return analyticsHref(paths.analyticsFlow, filters);
    if (params.categoryCode) return analyticsHref(paths.analyticsMaterials, filters);
    return analyticsTicketsHref(filters);
  };

  const exportFlow = async () => {
    setExporting(true);
    try {
      const blob = await exportAnalyticsFlow(params);
      downloadBlob(blob, `进出厂分析-${params.from}至${params.to}.csv`);
      message.success('进出厂分析 CSV 已导出');
    } catch (error) {
      message.error(getApiErrorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  const trendColumns: ColumnsType<TrendPoint> = [
    { title: '周期', key: 'period', width: 120,
      render: (_, row) => <Link to={drillHref(analyticsPeriodFilters(params, row))}>{row.period}</Link>,
    },
    { title: '入厂车次', dataIndex: 'inboundTickets', key: 'inboundTickets', align: 'right', width: 100 },
    { title: '入厂净重（吨）', key: 'inboundNet', align: 'right', width: 140, render: (_, row) => formatMilliTonne(row.inboundNetMilliTonne) },
    { title: '出厂车次', dataIndex: 'outboundTickets', key: 'outboundTickets', align: 'right', width: 100 },
    { title: '出厂净重（吨）', key: 'outboundNet', align: 'right', width: 140, render: (_, row) => formatMilliTonne(row.outboundNetMilliTonne) },
    { title: '过磅净流入（吨）', key: 'netFlow', align: 'right', width: 150, render: (_, row) => <Typography.Text strong>{formatMilliTonne(row.netFlowMilliTonne)}</Typography.Text> },
    { title: '平均单次（吨）', key: 'avg', align: 'right', width: 130, render: (_, row) => row.avgNetPerTicketMilliTonne == null ? '—' : formatMilliTonne(row.avgNetPerTicketMilliTonne) },
    { title: '作废车次', dataIndex: 'voidTickets', key: 'voidTickets', align: 'right', width: 100 },
    { title: '作废率', key: 'voidRate', align: 'right', width: 100, render: (_, row) => formatBp(row.voidRateBp) },
  ];

  const siteColumns: ColumnsType<FlowSiteRow> = [
    { title: '厂区', key: 'site', render: (_, row) => <Link to={drillHref({ ...params, siteCode: row.siteCode })}>{row.siteName || row.siteCode}（{row.siteCode}）</Link> },
    { title: '入厂车次', dataIndex: 'inboundTickets', key: 'inboundTickets', align: 'right' },
    { title: '入厂净重（吨）', key: 'inboundNet', align: 'right', render: (_, row) => formatMilliTonne(row.inboundNetMilliTonne) },
    { title: '出厂车次', dataIndex: 'outboundTickets', key: 'outboundTickets', align: 'right' },
    { title: '出厂净重（吨）', key: 'outboundNet', align: 'right', render: (_, row) => formatMilliTonne(row.outboundNetMilliTonne) },
    { title: '净流入（吨）', key: 'netFlow', align: 'right', render: (_, row) => formatMilliTonne(row.netFlowMilliTonne) },
    { title: '作废率', key: 'voidRate', align: 'right', render: (_, row) => formatBp(row.voidRateBp) },
    { title: '扣量率', key: 'adjustmentRate', align: 'right', render: (_, row) => formatBp(row.adjustmentWeightRateBp) },
  ];

  return (
    <div className="pageStack">
      <PageHeader
        title="进出厂分析"
        description="按入厂与出厂方向分析车次、净重趋势、厂区对比与称重间隔。"
        extra={<Space><Button onClick={() => void flow.refetch()} loading={flow.isFetching}>刷新</Button><Button onClick={() => void exportFlow()} loading={exporting}>导出当前筛选 CSV</Button></Space>}
      />
      <div className="filterCard">
        <AnalyticsFilterBar state={state} actions={actions} sites={master.sites} materials={master.materials} categories={master.categories} />
      </div>
      {flow.isError && (
        <Alert type="error" title={`进出厂分析加载失败：${getApiErrorMessage(flow.error)}`} action={<Button onClick={() => void flow.refetch()}>重试</Button>} />
      )}
      <FreshnessNote freshness={data?.freshness} siteCode={state.filters.siteCode} />
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={4}><KpiCard label="入厂车次" value={summary ? formatNumber(summary.inboundTickets) : '—'} suffix="车" hint={<ComparisonText metric={comparison?.inboundTickets} unit="车" />} /></Col>
        <Col xs={24} sm={12} xl={4}><KpiCard label="入厂净重" value={summary ? formatMilliTonne(summary.inboundNetMilliTonne) : '—'} suffix="吨" hint={<ComparisonText metric={comparison?.inboundNetMilliTonne} />} /></Col>
        <Col xs={24} sm={12} xl={4}><KpiCard label="出厂车次" value={summary ? formatNumber(summary.outboundTickets) : '—'} suffix="车" hint={<ComparisonText metric={comparison?.outboundTickets} unit="车" />} /></Col>
        <Col xs={24} sm={12} xl={4}><KpiCard label="出厂净重" value={summary ? formatMilliTonne(summary.outboundNetMilliTonne) : '—'} suffix="吨" hint={<ComparisonText metric={comparison?.outboundNetMilliTonne} />} /></Col>
        <Col xs={24} sm={12} xl={4}><KpiCard label="过磅净流入" value={summary ? formatMilliTonne(summary.netFlowMilliTonne) : '—'} suffix="吨" hint={<ComparisonText metric={comparison?.netFlowMilliTonne} />} /></Col>
        <Col xs={24} sm={12} xl={4}><KpiCard label="作废率" value={summary ? formatBp(summary.voidRateBp) : '—'} hint={summary ? `${summary.voidTickets} / ${summary.validTickets + summary.voidTickets} 张单据` : undefined} /></Col>
      </Row>
      <ChartCard title="进出厂净重趋势">
        <EChart option={trendChartOption(data?.trend)} loading={flow.isLoading} empty={!data?.trend.points.length} ariaLabel="进出厂净重趋势图"
          onClick={({ dataIndex, seriesIndex }) => {
            const point = dataIndex === undefined ? undefined : data?.trend.points[dataIndex];
            if (!point) return;
            const direction = seriesIndex === 1 ? 'outbound' : 'inbound';
            if (params.direction && params.direction !== direction) return;
            navigate(drillHref({ ...analyticsPeriodFilters(params, point), direction }));
          }} />
      </ChartCard>
      <Card size="small" title="周期汇总">
        <Table<TrendPoint> rowKey="period" columns={trendColumns} dataSource={data?.trend.points ?? []} pagination={false} size="small" scroll={{ x: 'max-content' }} />
      </Card>
      <Card size="small" title="厂区对比">
        <Table<FlowSiteRow> rowKey="siteCode" columns={siteColumns} dataSource={data?.siteComparison ?? []} pagination={false} size="small" scroll={{ x: 'max-content' }} />
      </Card>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}><KpiCard label="时长样本" value={data ? formatNumber(data.duration.sampleTickets) : '—'} suffix="车" hint={summary ? `共 ${formatNumber(summary.validTickets)} 张有效单` : undefined} /></Col>
        <Col xs={24} sm={12} xl={6}><KpiCard label="两次过磅间隔中位数" value={formatSeconds(data?.duration.medianSeconds)} /></Col>
        <Col xs={24} sm={12} xl={6}><KpiCard label="P90 间隔" value={formatSeconds(data?.duration.p90Seconds)} hint={`最大 ${formatSeconds(data?.duration.maxSeconds)}`} /></Col>
        <Col xs={24} sm={12} xl={6}><KpiCard label="隔日完成单" value={data ? `${data.duration.crossDayTickets}（${formatBp(data.duration.crossDayRateBp)}）` : '—'} hint={data ? `已剔除重开单 ${data.duration.reopenedExcludedTickets} 张` : undefined} /></Col>
      </Row>
      <Alert
        type="info"
        showIcon
        title="时长口径"
        description="两次过磅间隔是首次确认到二次确认的时间，包含等待、装卸等环节。样本为间隔已知且非负的有效单，剔除重开单。隔日按北京时间判断。"
      />
    </div>
  );
}
