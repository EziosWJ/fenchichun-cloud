import { useMemo, useState } from 'react';
import { Alert, App, Button, Card, Col, Drawer, Empty, Row, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { PageHeader } from '../../components/PageHeader';
import { DataTable } from '../../components/DataTable';
import { EChart } from '../../components/charts/EChart';
import { useListUrlState } from '../../hooks/useListUrlState';
import { getApiErrorMessage } from '../../lib/api/errors';
import {
  analyticsParties,
  analyticsPartyDetail,
  exportAnalyticsParties,
  type MaterialRow,
  type PartyRow,
  type PartySiteRow,
  type RecentTicket,
} from '../../features/analytics/api';
import { analyticsFilterConfig, AnalyticsFilterBar, useAnalyticsDefaults } from '../../features/analytics/filters';
import { analyticsFilterParams } from '../../features/analytics/params';
import { analyticsDirectionLabel, formatBp, formatMilliTonne } from '../../features/analytics/format';
import { ChartCard, FreshnessNote, KpiCard } from '../../features/analytics/ui';
import { topBarChartOption, trendChartOption } from '../../features/analytics/charts';
import { useAnalyticsMasterData } from '../../features/analytics/useMasterData';
import { downloadBlob } from '../../features/analytics/download';
import { formatDateTime, formatNumber } from '../../utils/format';

export default function PartiesPage() {
  const { message } = App.useApp();
  const { state, actions } = useListUrlState(analyticsFilterConfig);
  useAnalyticsDefaults(state, actions, 'inbound');
  const master = useAnalyticsMasterData(true);
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<PartyRow | null>(null);
  const direction = state.filters.direction || 'inbound';
  const defaults = useMemo(
    () => ({
      from: dayjs().startOf('month').format('YYYY-MM-DD'),
      to: dayjs().endOf('month').format('YYYY-MM-DD'),
    }),
    [],
  );
  const from = state.filters.from || defaults.from;
  const to = state.filters.to || defaults.to;
  const params = useMemo(
    () => ({ ...analyticsFilterParams(state, defaults), direction }),
    [state, defaults, direction],
  );
  const parties = useQuery({
    queryKey: ['analytics', 'parties', params],
    queryFn: () => analyticsParties(params),
    staleTime: 60_000,
    refetchInterval: 300_000,
    refetchIntervalInBackground: false,
  });
  const detail = useQuery({
    queryKey: ['analytics', 'party-detail', selected?.partyCode, direction, from, to],
    queryFn: () => analyticsPartyDetail({ ...params, partyCode: selected?.partyCode, page: undefined, pageSize: undefined, from, to }),
    enabled: Boolean(selected?.partyCode),
  });
  const data = parties.data;
  const summary = data?.summary;
  const detailData = detail.data;

  const exportParties = async () => {
    setExporting(true);
    try {
      const blob = await exportAnalyticsParties(params);
      downloadBlob(blob, `供收方分析-${analyticsDirectionLabel(direction)}-${from}至${to}.csv`);
      message.success('供收方分析 CSV 已导出');
    } catch (error) {
      message.error(getApiErrorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  const columns: ColumnsType<PartyRow> = [
    {
      title: '供收方', key: 'party', width: 260,
      render: (_, row) => (
        <div>
          <div>{row.partyName || row.partyCode}</div>
          <Typography.Text type="secondary">{row.partyCode}</Typography.Text>
        </div>
      ),
    },
    { title: '车次', dataIndex: 'ticketCount', key: 'tickets', align: 'right', width: 90, sorter: true },
    { title: '净重（吨）', key: 'net', align: 'right', width: 140, sorter: true, render: (_, row) => <Typography.Text strong>{formatMilliTonne(row.netMilliTonne)}</Typography.Text> },
    { title: '平均单次（吨）', key: 'avg', align: 'right', width: 130, sorter: true, render: (_, row) => row.avgNetPerTicketMilliTonne == null ? '—' : formatMilliTonne(row.avgNetPerTicketMilliTonne) },
    { title: '占比', key: 'share', align: 'right', width: 90, render: (_, row) => formatBp(row.shareBp) },
    { title: '首次过磅', key: 'first', width: 150, render: (_, row) => formatDateTime(row.firstIssuedAt) },
    { title: '最后过磅', key: 'last', width: 150, render: (_, row) => formatDateTime(row.lastIssuedAt) },
    { title: '调整车次', dataIndex: 'adjustedTickets', key: 'adjustment', align: 'right', width: 100 },
    { title: '扣量率', key: 'adjustmentRate', align: 'right', width: 100, render: (_, row) => formatBp(row.adjustmentWeightRateBp) },
    { title: '作废车次', dataIndex: 'voidTickets', key: 'void', align: 'right', width: 100, sorter: true },
    { title: '作废率', key: 'voidRate', align: 'right', width: 100, render: (_, row) => formatBp(row.voidRateBp) },
    { title: '操作', key: 'actions', width: 90, fixed: 'right', render: (_, row) => <Button type="link" onClick={() => setSelected(row)}>详情</Button> },
  ];

  const detailMaterialColumns: ColumnsType<MaterialRow> = [
    { title: '物料', key: 'material', render: (_, row) => [row.materialName, row.materialSpec].filter(Boolean).join(' / ') },
    { title: '车次', dataIndex: 'totalTickets', key: 'tickets', align: 'right' },
    { title: '净重（吨）', key: 'net', align: 'right', render: (_, row) => formatMilliTonne(row.totalNetMilliTonne) },
    { title: '占比', key: 'share', align: 'right', render: (_, row) => formatBp(row.shareBp) },
  ];
  const siteColumns: ColumnsType<PartySiteRow> = [
    { title: '厂区', key: 'site', render: (_, row) => `${row.siteName || row.siteCode}（${row.siteCode}）` },
    { title: '车次', dataIndex: 'tickets', key: 'tickets', align: 'right' },
    { title: '净重（吨）', key: 'net', align: 'right', render: (_, row) => formatMilliTonne(row.netMilliTonne) },
    { title: '占比', key: 'share', align: 'right', render: (_, row) => formatBp(row.shareBp) },
  ];
  const recentColumns: ColumnsType<RecentTicket> = [
    { title: '出单时间', key: 'issuedAt', width: 150, render: (_, row) => formatDateTime(row.issuedAt) },
    { title: '单号', dataIndex: 'ticketNo', key: 'ticketNo', width: 190 },
    { title: '车牌', dataIndex: 'plate', key: 'plate', width: 110 },
    { title: '物料', dataIndex: 'materialName', key: 'materialName' },
    { title: '净重（吨）', key: 'net', align: 'right', render: (_, row) => formatMilliTonne(row.netMilliTonne) },
  ];

  return (
    <>
      <PageHeader
        title="供收方分析"
        description="入厂按供货方、出厂按收货方汇总车次、净重、扣量和集中度；方向由过磅单 inbound/outbound 决定。"
        extra={<Space><Button onClick={() => void parties.refetch()}>刷新</Button><Button onClick={() => void exportParties()} loading={exporting}>导出当前筛选 CSV</Button></Space>}
      />
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Card size="small">
          <AnalyticsFilterBar state={state} actions={actions} sites={master.sites} materials={master.materials} categories={master.categories} parties={master.parties} directionRequired showKeyword showCompare={false} keywordPlaceholder="供收方名称 / 编码" />
        </Card>
        {parties.isError && (
          <Alert type="error" message={`供收方分析加载失败：${getApiErrorMessage(parties.error)}`} action={<Button onClick={() => void parties.refetch()}>重试</Button>} />
        )}
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} xl={4}><KpiCard label={direction === 'inbound' ? '活跃供货方' : '活跃收货方'} value={summary ? formatNumber(summary.activeParties) : '—'} suffix="家" /></Col>
          <Col xs={24} sm={12} xl={4}><KpiCard label="净重合计" value={summary ? formatMilliTonne(summary.totalNetMilliTonne) : '—'} suffix="吨" /></Col>
          <Col xs={24} sm={12} xl={4}><KpiCard label="户均净重" value={summary?.avgNetPerPartyMilliTonne != null ? formatMilliTonne(summary.avgNetPerPartyMilliTonne) : '—'} suffix="吨" /></Col>
          <Col xs={24} sm={12} xl={4}><KpiCard label="CR3" value={formatBp(summary?.cr3Bp)} hint={`CR5 ${formatBp(summary?.cr5Bp)} · CR10 ${formatBp(summary?.cr10Bp)}`} /></Col>
          <Col xs={24} sm={12} xl={4}><KpiCard label="HHI" value={summary?.hhi != null ? formatNumber(summary.hhi) : '—'} /></Col>
          <Col xs={24} sm={12} xl={4}><KpiCard label="新增 / 回归" value={summary ? `${summary.newParties} / ${summary.returningParties}` : '—'} hint={summary && !summary.coverageComplete ? '历史不足，新增按“系统内首次”' : undefined} /></Col>
        </Row>
        <Row gutter={[16, 16]}>
          <Col xs={24} xl={14}>
            <ChartCard title={`${analyticsDirectionLabel(direction)} Top 10`}>
              <EChart option={topBarChartOption(data?.top.map((row) => ({ code: row.partyCode, name: row.partyName, netMilliTonne: row.netMilliTonne, ticketCount: row.ticketCount, shareBp: row.shareBp })))} loading={parties.isLoading} empty={!data?.top.length} ariaLabel="供收方 Top 10 图" />
            </ChartCard>
          </Col>
          <Col xs={24} xl={10}>
            <ChartCard title="集中度 / Pareto">
              <EChart option={topBarChartOption(data?.concentration.map((row, index) => ({ code: String(index), name: row.label, netMilliTonne: row.netMilliTonne, ticketCount: 0, shareBp: row.shareBp })))} loading={parties.isLoading} empty={!data?.concentration.length} ariaLabel="供收方集中度图" />
            </ChartCard>
          </Col>
        </Row>
        <DataTable
          tableKey="analytics-parties"
          rowKey="partyCode"
          columns={columns}
          dataSource={data?.records ?? []}
          total={data?.total ?? 0}
          page={state.page}
          pageSize={state.pageSize}
          onPageChange={actions.setPage}
          sortBy={state.sortBy}
          sortOrder={state.sortOrder}
          onSortChange={actions.setSort}
          loading={parties.isLoading}
          onRefresh={() => void parties.refetch()}
          title={`${analyticsDirectionLabel(direction)}汇总`}
          emptyDescription="当前期间没有符合条件的有效过磅单"
        />
        <FreshnessNote freshness={data?.freshness} />
      </Space>
      <Drawer
        title={selected ? `${selected.partyName}（${selected.partyCode}）` : '供收方详情'}
        width={860}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        destroyOnHidden
      >
        {detail.isError && <Alert type="error" message={`详情加载失败：${getApiErrorMessage(detail.error)}`} />}
        {!detailData ? <Empty description="暂无详情" /> : (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Row gutter={[16, 16]}>
              <Col span={8}><KpiCard label="车次" value={formatNumber(detailData.party.ticketCount)} suffix="车" /></Col>
              <Col span={8}><KpiCard label="净重" value={formatMilliTonne(detailData.party.netMilliTonne)} suffix="吨" /></Col>
              <Col span={8}><KpiCard label="扣量率" value={formatBp(detailData.party.adjustmentWeightRateBp)} /></Col>
            </Row>
            <ChartCard title="净重趋势">
              <EChart option={trendChartOption(detailData.trend)} loading={detail.isLoading} empty={!detailData.trend.points.length} height={260} ariaLabel="供收方净重趋势图" />
            </ChartCard>
            <Card size="small" title="主要物料">
              <Table<MaterialRow> rowKey={(row) => `${row.materialCode}:${row.materialSpec}`} columns={detailMaterialColumns} dataSource={detailData.materials} pagination={false} size="small" />
            </Card>
            <Card size="small" title="厂区分布">
              <Table<PartySiteRow> rowKey="siteCode" columns={siteColumns} dataSource={detailData.sites} pagination={false} size="small" />
            </Card>
            <Card size="small" title="最近单据">
              <Table<RecentTicket> rowKey="ticketNo" columns={recentColumns} dataSource={detailData.recentTickets} pagination={false} size="small" scroll={{ x: 'max-content' }} />
            </Card>
            {!detailData.party.direction ? null : <Tag>{analyticsDirectionLabel(detailData.party.direction)}</Tag>}
          </Space>
        )}
      </Drawer>
    </>
  );
}
