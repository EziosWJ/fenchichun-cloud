import { useMemo, useState } from 'react';
import { Alert, App, Button, Card, Col, Divider, Drawer, Empty, Row, Space, Table, Tabs, Typography } from 'antd';
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
import { analyticsDirectionLabel, formatBp, formatMilliTonne, formatSeconds } from '../../features/analytics/format';
import { ChartCard, FreshnessNote, KpiCard } from '../../features/analytics/ui';
import { partyRankingOption, trendChartOption } from '../../features/analytics/charts';
import { useAnalyticsMasterData } from '../../features/analytics/useMasterData';
import { downloadBlob } from '../../features/analytics/download';
import { formatDateTime, formatNumber } from '../../utils/format';

function natureLabel(nature: string) {
  if (nature === 'individual') return '个人';
  if (nature === 'enterprise') return '企业';
  return nature || '—';
}

export default function PartiesPage() {
  const { message } = App.useApp();
  const { state, actions } = useListUrlState(analyticsFilterConfig);
  useAnalyticsDefaults(state, actions, 'inbound');
  const master = useAnalyticsMasterData(true);
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<PartyRow | null>(null);
  const direction = state.filters.direction === 'outbound' ? 'outbound' : 'inbound';
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
  const ranking = useMemo(() => data?.ranking ?? [], [data?.ranking]);
  const enterpriseCount = ranking.filter((row) => row.nature === 'enterprise').length;
  const individualCount = ranking.filter((row) => row.nature === 'individual').length;
  const rankMap = useMemo(() => new Map(ranking.map((row, index) => [row.partyCode, index + 1])), [ranking]);

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

  const frequencyLabel = direction === 'inbound' ? '供货频次' : '提货频次';
  const volumeLabel = direction === 'inbound' ? '累计供货量' : '累计提货量';
  const intervalLabel = direction === 'inbound' ? '供货间隔' : '提货周期';

  const columns: ColumnsType<PartyRow> = [
    {
      title: direction === 'inbound' ? '供货量排名' : '提货量排名', key: 'rank', width: 100, align: 'center',
      render: (_, row) => rankMap.get(row.partyCode) ?? '—',
    },
    {
      title: direction === 'inbound' ? '供货方' : '客户', key: 'party', width: 250,
      render: (_, row) => (
        <div>
          <div>{row.partyName || row.partyCode}</div>
          <Typography.Text type="secondary">{row.partyCode}</Typography.Text>
        </div>
      ),
    },
    { title: '企业/个人', key: 'nature', width: 100, render: (_, row) => natureLabel(row.nature) },
    { title: frequencyLabel, dataIndex: 'ticketCount', key: 'tickets', align: 'right', width: 100, sorter: true },
    {
      title: `${volumeLabel}（吨）`, key: 'net', align: 'right', width: 150, sorter: true,
      render: (_, row) => <Typography.Text strong>{formatMilliTonne(row.netMilliTonne)}</Typography.Text>,
    },
    {
      title: '平均单次（吨）', key: 'avg', align: 'right', width: 130, sorter: true,
      render: (_, row) => row.avgNetPerTicketMilliTonne == null ? '—' : formatMilliTonne(row.avgNetPerTicketMilliTonne),
    },
    { title: '占比', key: 'share', align: 'right', width: 90, render: (_, row) => formatBp(row.shareBp) },
    {
      title: intervalLabel, key: 'interval', align: 'right', width: 150, sorter: true,
      render: (_, row) => (
        <div>
          <div>{formatSeconds(row.avgIntervalSeconds)}</div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            中位 {formatSeconds(row.medianIntervalSeconds)}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: '活跃月数', dataIndex: 'activeMonths', key: 'activeMonths', align: 'right', width: 100,
      render: (value: number) => (value ? `${value} 月` : '—'),
    },
    {
      title: '月度波动(CV)', key: 'volatility', align: 'right', width: 120, sorter: true,
      render: (_, row) => formatBp(row.monthlyNetCvBp),
    },
    { title: '平均扣重率', key: 'adjustmentRate', align: 'right', width: 120, render: (_, row) => formatBp(row.adjustmentWeightRateBp) },
    { title: '调整车次', dataIndex: 'adjustedTickets', key: 'adjustment', align: 'right', width: 100 },
    { title: '调整覆盖率', key: 'adjustmentCoverage', align: 'right', width: 120, render: (_, row) => formatBp(row.adjustmentCoverageBp) },
    { title: '作废车次', dataIndex: 'voidTickets', key: 'void', align: 'right', width: 100, sorter: true },
    { title: '作废率', key: 'voidRate', align: 'right', width: 100, render: (_, row) => formatBp(row.voidRateBp) },
    { title: '最后过磅', key: 'lastIssuedAt', width: 150, sorter: true, render: (_, row) => formatDateTime(row.lastIssuedAt) },
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
        extra={<Space><Button onClick={() => void parties.refetch()} loading={parties.isFetching}>刷新</Button><Button onClick={() => void exportParties()} loading={exporting}>导出当前筛选 CSV</Button></Space>}
      />
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Card size="small">
          <Tabs
            activeKey={direction}
            onChange={(key) => actions.setFilter('direction', key)}
            tabBarStyle={{ marginBottom: 0 }}
            items={[
              { key: 'inbound', label: '入厂供货方' },
              { key: 'outbound', label: '出厂客户' },
            ]}
          />
          <Divider style={{ margin: '10px 0 12px' }} />
          <AnalyticsFilterBar
            state={state}
            actions={actions}
            sites={master.sites}
            materials={master.materials}
            categories={master.categories}
            parties={master.parties}
            showDirection={false}
            directionRequired
            showKeyword
            showCompare={false}
            keywordPlaceholder="供收方名称 / 编码"
          />
        </Card>
        {parties.isError && (
          <Alert type="error" message={`供收方分析加载失败：${getApiErrorMessage(parties.error)}`} action={<Button onClick={() => void parties.refetch()}>重试</Button>} />
        )}
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} xl={4}><KpiCard label={direction === 'inbound' ? '活跃供货方' : '活跃客户'} value={summary ? formatNumber(summary.activeParties) : '—'} suffix="家" /></Col>
          <Col xs={24} sm={12} xl={4}><KpiCard label={volumeLabel} value={summary ? formatMilliTonne(summary.totalNetMilliTonne) : '—'} suffix="吨" /></Col>
          <Col xs={24} sm={12} xl={4}><KpiCard label="户均量" value={summary?.avgNetPerPartyMilliTonne != null ? formatMilliTonne(summary.avgNetPerPartyMilliTonne) : '—'} suffix="吨" /></Col>
          <Col xs={24} sm={12} xl={4}><KpiCard label="企业" value={formatNumber(enterpriseCount)} suffix="家" hint={`个人 ${formatNumber(individualCount)} 家`} /></Col>
          <Col xs={24} sm={12} xl={4}><KpiCard label="新增 / 回归" value={summary ? `${summary.newParties} / ${summary.returningParties}` : '—'} hint={summary && !summary.coverageComplete ? '历史不足，新增按“系统内首次”' : undefined} /></Col>
          <Col xs={24} sm={12} xl={4}><KpiCard label="数据覆盖" value={summary?.coverageComplete ? '完整' : '积累中'} hint={summary?.historyStart ? `历史起点 ${dayjs(summary.historyStart).format('YYYY-MM-DD')}` : undefined} /></Col>
        </Row>
        <ChartCard title={`全量${direction === 'inbound' ? '供货方' : '客户'}排名`}>
          <EChart
            option={partyRankingOption(ranking)}
            loading={parties.isLoading}
            empty={!ranking.length}
            height={420}
            ariaLabel="全量供收方排名图"
          />
        </ChartCard>
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
          refreshing={parties.isFetching}
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
              <Col span={8}><KpiCard label={volumeLabel} value={formatMilliTonne(detailData.party.netMilliTonne)} suffix="吨" /></Col>
              <Col span={8}><KpiCard label="平均扣重率" value={formatBp(detailData.party.adjustmentWeightRateBp)} /></Col>
              <Col span={8}><KpiCard label={intervalLabel} value={formatSeconds(detailData.party.avgIntervalSeconds)} hint={`中位 ${formatSeconds(detailData.party.medianIntervalSeconds)}`} /></Col>
              <Col span={8}><KpiCard label="活跃月数" value={detailData.party.activeMonths ? `${detailData.party.activeMonths} 月` : '—'} /></Col>
              <Col span={8}><KpiCard label="月度波动(CV)" value={formatBp(detailData.party.monthlyNetCvBp)} /></Col>
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
          </Space>
        )}
      </Drawer>
    </>
  );
}
