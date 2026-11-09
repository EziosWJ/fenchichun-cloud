import { useMemo, useState } from 'react';
import { Alert, App, Button, Card, Col, Row, Space, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { PageHeader } from '../../components/PageHeader';
import { EChart } from '../../components/charts/EChart';
import { useListUrlState } from '../../hooks/useListUrlState';
import { getApiErrorMessage } from '../../lib/api/errors';
import {
  analyticsQuality,
  exportAnalyticsQuality,
  type AdjustmentCategoryRow,
  type AdjustmentModeRow,
  type IssuerStat,
  type MaterialRow,
  type MissingField,
  type PartyRow,
  type QualityAnomaly,
  type QualityGroupRow,
  type CorrectionSiteRow,
  type ReasonRow,
  type ReopenChain,
} from '../../features/analytics/api';
import { analyticsFilterConfig, AnalyticsFilterBar, useAnalyticsDefaults } from '../../features/analytics/filters';
import { analyticsFilterParams } from '../../features/analytics/params';
import { formatBp, formatMilliTonne, formatSeconds } from '../../features/analytics/format';
import { ChartCard, FreshnessNote, KpiCard } from '../../features/analytics/ui';
import { countPieChartOption } from '../../features/analytics/charts';
import { useAnalyticsMasterData } from '../../features/analytics/useMasterData';
import { downloadBlob } from '../../features/analytics/download';
import { formatDateTime, formatNumber } from '../../utils/format';

export default function QualityPage() {
  const { message } = App.useApp();
  const { state, actions } = useListUrlState(analyticsFilterConfig);
  useAnalyticsDefaults(state, actions);
  const master = useAnalyticsMasterData(true);
  const [exporting, setExporting] = useState(false);
  const defaults = useMemo(
    () => ({
      from: dayjs().startOf('month').format('YYYY-MM-DD'),
      to: dayjs().endOf('month').format('YYYY-MM-DD'),
    }),
    [],
  );
  const params = useMemo(() => analyticsFilterParams(state, defaults), [state, defaults]);
  const quality = useQuery({
    queryKey: ['analytics', 'quality', params],
    queryFn: () => analyticsQuality(params),
    staleTime: 60_000,
    refetchInterval: 300_000,
    refetchIntervalInBackground: false,
  });
  const data = quality.data;
  const summary = data?.summary;

  const exportQuality = async () => {
    setExporting(true);
    try {
      const blob = await exportAnalyticsQuality(params);
      downloadBlob(blob, `数据质量-${params.from}至${params.to}.csv`);
      message.success('数据质量明细 CSV 已导出');
    } catch (error) {
      message.error(getApiErrorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  const reasonColumns: ColumnsType<ReasonRow> = [
    { title: '作废原因', dataIndex: 'reason', key: 'reason' },
    { title: '单数', dataIndex: 'tickets', key: 'tickets', align: 'right' },
    { title: '占比', key: 'share', align: 'right', render: (_, row) => formatBp(row.shareBp) },
  ];
  const groupColumns: ColumnsType<QualityGroupRow> = [
    { title: '对象', key: 'name', render: (_, row) => row.name || row.code },
    { title: '总单数', dataIndex: 'tickets', key: 'tickets', align: 'right' },
    { title: '作废单数', dataIndex: 'voidTickets', key: 'voidTickets', align: 'right' },
    { title: '作废率', key: 'voidRate', align: 'right', render: (_, row) => formatBp(row.voidRateBp) },
  ];
  const reopenColumns: ColumnsType<ReopenChain> = [
    { title: '原单号', dataIndex: 'originalTicketNo', key: 'originalTicketNo', width: 180 },
    { title: '新单号', dataIndex: 'newTicketNo', key: 'newTicketNo', width: 180 },
    { title: '厂区', dataIndex: 'siteCode', key: 'siteCode', width: 100 },
    { title: '原单作废', key: 'originalVoidedAt', width: 150, render: (_, row) => formatDateTime(row.originalVoidedAt) },
    { title: '新单出单', key: 'newIssuedAt', width: 150, render: (_, row) => formatDateTime(row.newIssuedAt) },
    { title: '重开间隔', key: 'reopenLag', align: 'right', width: 120, render: (_, row) => formatSeconds(row.reopenLagSeconds) },
    { title: '跨日', key: 'crossDay', width: 80, render: (_, row) => row.crossDay ? <Tag color="orange">是</Tag> : '否' },
  ];
  const categoryColumns: ColumnsType<AdjustmentCategoryRow> = [
    { title: '调整类别', key: 'category', render: (_, row) => row.categoryName || row.category || '未填写' },
    { title: '调整车次', dataIndex: 'tickets', key: 'tickets', align: 'right' },
    { title: '净重调整（吨）', key: 'adjustment', align: 'right', render: (_, row) => formatMilliTonne(row.adjustmentNetMilliTonne) },
    { title: '扣量率', key: 'rate', align: 'right', render: (_, row) => formatBp(row.rateBp) },
  ];
  const modeColumns: ColumnsType<AdjustmentModeRow> = [
    { title: '调整方式', dataIndex: 'mode', key: 'mode', render: (value: string) => value === 'percent' ? '按比例' : value === 'amount' ? '按吨' : value === 'multi' ? '多项调整' : value },
    { title: '车次', dataIndex: 'tickets', key: 'tickets', align: 'right' },
    { title: '占比', key: 'share', align: 'right', render: (_, row) => formatBp(row.shareBp) },
  ];
  const missingColumns: ColumnsType<MissingField> = [
    { title: '字段', dataIndex: 'label', key: 'label' },
    { title: '缺失单数', dataIndex: 'missingCount', key: 'missingCount', align: 'right' },
    { title: '缺失率', key: 'missingRate', align: 'right', render: (_, row) => formatBp(row.missingRateBp) },
  ];
  const anomalyColumns: ColumnsType<QualityAnomaly> = [
    { title: '单号', dataIndex: 'ticketNo', key: 'ticketNo', width: 190 },
    { title: '厂区', dataIndex: 'siteCode', key: 'siteCode', width: 100 },
    { title: '出单时间', key: 'issuedAt', width: 150, render: (_, row) => formatDateTime(row.issuedAt) },
    { title: '类型', dataIndex: 'type', key: 'type', width: 180 },
    { title: '详情', dataIndex: 'detail', key: 'detail' },
  ];
  const issuerColumns: ColumnsType<IssuerStat> = [
    { title: '出单人', dataIndex: 'issuerName', key: 'issuerName' },
    { title: '有效车次', dataIndex: 'tickets', key: 'tickets', align: 'right' },
    { title: '作废车次', dataIndex: 'voidTickets', key: 'voidTickets', align: 'right' },
    { title: '作废率', key: 'voidRate', align: 'right', render: (_, row) => formatBp(row.voidRateBp) },
    { title: '重开单', dataIndex: 'reopenedTickets', key: 'reopenedTickets', align: 'right' },
    { title: '调整单', dataIndex: 'adjustedTickets', key: 'adjustedTickets', align: 'right' },
    { title: '调整单占比', key: 'adjustmentRate', align: 'right', render: (_, row) => formatBp(row.adjustmentTicketRateBp) },
  ];
  const partyColumns: ColumnsType<PartyRow> = [
    { title: '供收方', key: 'party', render: (_, row) => row.partyName || row.partyCode },
    { title: '方向', dataIndex: 'direction', key: 'direction', render: (value: string) => value === 'inbound' ? '入厂' : '出厂' },
    { title: '调整车次', dataIndex: 'adjustedTickets', key: 'adjustedTickets', align: 'right' },
    { title: '净重调整（吨）', key: 'adjustment', align: 'right', render: (_, row) => formatMilliTonne(row.adjustmentNetMilliTonne) },
    { title: '扣量率', key: 'rate', align: 'right', render: (_, row) => formatBp(row.adjustmentWeightRateBp) },
  ];
  const materialColumns: ColumnsType<MaterialRow> = [
    { title: '物料', key: 'material', render: (_, row) => [row.materialName, row.materialSpec].filter(Boolean).join(' / ') },
    { title: '调整车次', dataIndex: 'adjustedTickets', key: 'adjustedTickets', align: 'right' },
    { title: '净重调整（吨）', key: 'adjustment', align: 'right', render: (_, row) => formatMilliTonne(row.adjustmentNetMilliTonne) },
    { title: '扣量率', key: 'rate', align: 'right', render: (_, row) => formatBp(row.adjustmentWeightRateBp) },
  ];
  const correctionSiteColumns: ColumnsType<CorrectionSiteRow> = [
    { title: '厂区', key: 'site', render: (_, row) => `${row.siteName || row.siteCode}（${row.siteCode}）` },
    { title: '修正单', dataIndex: 'tickets', key: 'tickets', align: 'right' },
    { title: '毛重修正（吨）', key: 'gross', align: 'right', render: (_, row) => formatMilliTonne(row.grossCorrectionMilliTonne) },
    { title: '皮重修正（吨）', key: 'tare', align: 'right', render: (_, row) => formatMilliTonne(row.tareCorrectionMilliTonne) },
  ];

  const tabs = [
    {
      key: 'void',
      label: '作废分析',
      children: (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Row gutter={[16, 16]}>
            <Col xs={24} xl={8}>
              <ChartCard title="作废原因">
                <EChart option={countPieChartOption(data?.voidAnalysis.reasons.map((row) => ({ name: row.reason, value: row.tickets })))} loading={quality.isLoading} empty={!data?.voidAnalysis.reasons.length} height={280} ariaLabel="作废原因图" />
              </ChartCard>
            </Col>
            <Col xs={24} xl={16}>
              <Card size="small" title="作废原因明细">
                <Table<ReasonRow> rowKey="reason" columns={reasonColumns} dataSource={data?.voidAnalysis.reasons ?? []} pagination={false} size="small" />
              </Card>
            </Col>
          </Row>
          <Row gutter={[16, 16]}>
            <Col xs={24} xl={8}><Card size="small" title="按厂区"><Table<QualityGroupRow> rowKey="code" columns={groupColumns} dataSource={data?.voidAnalysis.bySite ?? []} pagination={false} size="small" /></Card></Col>
            <Col xs={24} xl={8}><Card size="small" title="按供收方"><Table<QualityGroupRow> rowKey="code" columns={groupColumns} dataSource={data?.voidAnalysis.byParty ?? []} pagination={false} size="small" /></Card></Col>
            <Col xs={24} xl={8}><Card size="small" title="按物料"><Table<QualityGroupRow> rowKey="code" columns={groupColumns} dataSource={data?.voidAnalysis.byMaterial ?? []} pagination={false} size="small" /></Card></Col>
          </Row>
        </Space>
      ),
    },
    {
      key: 'reopen',
      label: '重开分析',
      children: (
        <Card size="small" title={`重开链（中位间隔 ${formatSeconds(data?.reopenAnalysis.medianReopenLagSeconds)}）`}>
          <Table<ReopenChain> rowKey="newTicketNo" columns={reopenColumns} dataSource={data?.reopenAnalysis.chains ?? []} pagination={false} size="small" scroll={{ x: 'max-content' }} />
        </Card>
      ),
    },
    {
      key: 'adjustment',
      label: '扣量分析',
      children: (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Row gutter={[16, 16]}>
            <Col xs={24} xl={12}><Card size="small" title="按调整类别"><Table<AdjustmentCategoryRow> rowKey="category" columns={categoryColumns} dataSource={data?.adjustmentAnalysis.byCategory ?? []} pagination={false} size="small" /></Card></Col>
            <Col xs={24} xl={12}><Card size="small" title="按调整方式"><Table<AdjustmentModeRow> rowKey="mode" columns={modeColumns} dataSource={data?.adjustmentAnalysis.modes ?? []} pagination={false} size="small" /></Card></Col>
          </Row>
          <Card size="small" title="按供收方">
            <Table<PartyRow> rowKey={(row) => `${row.direction}:${row.partyCode}`} columns={partyColumns} dataSource={data?.adjustmentAnalysis.byParty ?? []} pagination={false} size="small" scroll={{ x: 'max-content' }} />
          </Card>
          <Card size="small" title="按物料">
            <Table<MaterialRow> rowKey={(row) => `${row.materialCode}:${row.materialSpec}`} columns={materialColumns} dataSource={data?.adjustmentAnalysis.byMaterial ?? []} pagination={false} size="small" scroll={{ x: 'max-content' }} />
          </Card>
        </Space>
      ),
    },
    {
      key: 'correction',
      label: '修正与缺失',
      children: (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={8}><KpiCard label="毛皮重修正单" value={data ? formatNumber(data.correctionAnalysis.tickets) : '—'} suffix="张" /></Col>
            <Col xs={24} sm={8}><KpiCard label="毛重修正合计" value={data ? formatMilliTonne(data.correctionAnalysis.grossCorrectionMilliTonne) : '—'} suffix="吨" /></Col>
            <Col xs={24} sm={8}><KpiCard label="皮重修正合计" value={data ? formatMilliTonne(data.correctionAnalysis.tareCorrectionMilliTonne) : '—'} suffix="吨" /></Col>
          </Row>
          <Card size="small" title="缺失字段">
            <Table<MissingField> rowKey="field" columns={missingColumns} dataSource={data?.missingFields ?? []} pagination={false} size="small" />
          </Card>
          <Card size="small" title="按厂区修正">
            <Table<CorrectionSiteRow> rowKey="siteCode" columns={correctionSiteColumns} dataSource={data?.correctionAnalysis.bySite ?? []} pagination={false} size="small" />
          </Card>
        </Space>
      ),
    },
    {
      key: 'anomaly',
      label: `异常清单${summary?.anomalyTickets ? `（${summary.anomalyTickets}）` : ''}`,
      children: (
        <Card size="small" title="异常清单">
          <Table<QualityAnomaly> rowKey={(row) => `${row.ticketNo}:${row.type}`} columns={anomalyColumns} dataSource={data?.anomalies ?? []} pagination={{ pageSize: 10, showSizeChanger: true }} size="small" scroll={{ x: 'max-content' }} />
        </Card>
      ),
    },
    {
      key: 'issuer',
      label: '出单人',
      children: (
        <Card size="small" title="出单人工作量与质量">
          <Table<IssuerStat> rowKey="issuerName" columns={issuerColumns} dataSource={data?.issuerStats ?? []} pagination={false} size="small" scroll={{ x: 'max-content' }} />
        </Card>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="数据质量"
        description=""
        extra={<Space><Button onClick={() => void quality.refetch()} loading={quality.isFetching}>刷新</Button><Button onClick={() => void exportQuality()} loading={exporting}>导出质量明细 CSV</Button></Space>}
      />
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Card size="small">
          <AnalyticsFilterBar state={state} actions={actions} sites={master.sites} materials={master.materials} categories={master.categories} parties={master.parties} showKeyword showCompare={false} keywordPlaceholder="单号 / 物料 / 供收方" />
        </Card>
        {quality.isError && (
          <Alert type="error" message={`数据质量加载失败：${getApiErrorMessage(quality.error)}`} action={<Button onClick={() => void quality.refetch()}>重试</Button>} />
        )}
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} xl={4}><KpiCard label="总单数" value={summary ? formatNumber(summary.totalTickets) : '—'} suffix="张" hint={summary ? `有效 ${summary.validTickets} · 作废 ${summary.voidTickets}` : undefined} /></Col>
          <Col xs={24} sm={12} xl={4}><KpiCard label="作废率" value={formatBp(summary?.voidRateBp)} /></Col>
          <Col xs={24} sm={12} xl={4}><KpiCard label="重开率" value={formatBp(summary?.reopenRateBp)} hint={summary ? `${summary.reopenedTickets} 张重开单` : undefined} /></Col>
          <Col xs={24} sm={12} xl={4}><KpiCard label="调整单占比" value={formatBp(summary?.adjustmentTicketRateBp)} hint={summary ? `调整 ${summary.adjustedTickets} 张` : undefined} /></Col>
          <Col xs={24} sm={12} xl={4}><KpiCard label="调整覆盖率" value={formatBp(summary?.adjustmentCoverageBp)} hint={summary ? `扣量率 ${formatBp(summary.adjustmentWeightRateBp)}` : undefined} /></Col>
          <Col xs={24} sm={12} xl={4}><KpiCard label="异常涉及单" value={summary ? formatNumber(summary.anomalyTickets) : '—'} suffix="张" hint={summary ? `手工来源 ${formatBp(summary.manualWeightRateBp)}` : undefined} /></Col>
        </Row>
        <Tabs items={tabs} />
        <FreshnessNote freshness={data?.freshness} />
        <Typography.Text type="secondary">
          口径：作废率=作废单/(有效+作废)；重开率=新单 previousTicketNo 非空/有效单；调整单占比只统计调整字段已知的有效单；异常清单最多展示 1000 条。
        </Typography.Text>
      </Space>
    </>
  );
}
