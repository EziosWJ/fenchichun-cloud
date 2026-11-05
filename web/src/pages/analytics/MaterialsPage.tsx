import { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Card, Col, Row, Space, Tabs, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { PageHeader } from '../../components/PageHeader';
import { DataTable } from '../../components/DataTable';
import { EChart } from '../../components/charts/EChart';
import { useListUrlState } from '../../hooks/useListUrlState';
import { getApiErrorMessage } from '../../lib/api/errors';
import {
  analyticsByproductFlow,
  analyticsMaterials,
  analyticsSupplierQuality,
  exportAnalyticsMaterials,
  type MaterialRow,
} from '../../features/analytics/api';
import { analyticsFilterConfig, AnalyticsFilterBar, useAnalyticsDefaults } from '../../features/analytics/filters';
import { analyticsFilterParams } from '../../features/analytics/params';
import { formatBp, formatMilliTonne } from '../../features/analytics/format';
import { ChartCard, FreshnessNote, KpiCard } from '../../features/analytics/ui';
import { materialTrendOption, pieChartOption } from '../../features/analytics/charts';
import { useAnalyticsMasterData } from '../../features/analytics/useMasterData';
import { downloadBlob } from '../../features/analytics/download';
import { formatDateTime, formatNumber } from '../../utils/format';
import { SupplierQualityTab } from './SupplierQualityTab';
import { ByproductFlowTab } from './ByproductFlowTab';

type MaterialTab = 'overview' | 'supplier' | 'byproduct';

export default function MaterialsPage() {
  const { message } = App.useApp();
  const { state, actions } = useListUrlState(analyticsFilterConfig);
  useAnalyticsDefaults(state, actions);
  const master = useAnalyticsMasterData();
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState<MaterialTab>('overview');
  const [supplierPage, setSupplierPage] = useState(1);
  const [supplierPageSize, setSupplierPageSize] = useState(10);
  const [supplierSortBy, setSupplierSortBy] = useState<string | undefined>();
  const [supplierSortOrder, setSupplierSortOrder] = useState<'asc' | 'desc' | undefined>();
  const [byproductPage, setByproductPage] = useState(1);
  const [byproductPageSize, setByproductPageSize] = useState(10);
  const [byproductSortBy, setByproductSortBy] = useState<string | undefined>();
  const [byproductSortOrder, setByproductSortOrder] = useState<'asc' | 'desc' | undefined>();

  const defaults = useMemo(
    () => ({
      from: dayjs().startOf('month').format('YYYY-MM-DD'),
      to: dayjs().endOf('month').format('YYYY-MM-DD'),
    }),
    [],
  );
  const baseParams = useMemo(() => analyticsFilterParams(state, defaults), [state, defaults]);
  const supplierParams = useMemo(
    () => ({
      ...baseParams,
      page: supplierPage,
      pageSize: supplierPageSize,
      sortBy: supplierSortBy || 'avg',
      sortOrder: supplierSortOrder || 'desc',
    }),
    [baseParams, supplierPage, supplierPageSize, supplierSortBy, supplierSortOrder],
  );
  const byproductParams = useMemo(
    () => ({
      ...baseParams,
      page: byproductPage,
      pageSize: byproductPageSize,
      sortBy: byproductSortBy || 'net',
      sortOrder: byproductSortOrder || 'desc',
    }),
    [baseParams, byproductPage, byproductPageSize, byproductSortBy, byproductSortOrder],
  );

  const materials = useQuery({
    queryKey: ['analytics', 'materials', baseParams],
    queryFn: () => analyticsMaterials(baseParams),
    staleTime: 60_000,
    refetchInterval: 300_000,
    refetchIntervalInBackground: false,
  });
  const supplierQuality = useQuery({
    queryKey: ['analytics', 'supplier-quality', supplierParams],
    queryFn: () => analyticsSupplierQuality(supplierParams),
    enabled: activeTab === 'supplier',
    staleTime: 60_000,
    refetchInterval: 300_000,
    refetchIntervalInBackground: false,
  });
  const byproductFlow = useQuery({
    queryKey: ['analytics', 'byproduct-flow', byproductParams],
    queryFn: () => analyticsByproductFlow(byproductParams),
    enabled: activeTab === 'byproduct',
    staleTime: 60_000,
    refetchInterval: 300_000,
    refetchIntervalInBackground: false,
  });
  const activeQuery = activeTab === 'supplier' ? supplierQuality : activeTab === 'byproduct' ? byproductFlow : materials;
  const data = materials.data;
  const summary = data?.summary;

  useEffect(() => {
    setSupplierPage(1);
    setByproductPage(1);
  }, [state.filters, state.keyword]);

  const exportMaterials = async () => {
    setExporting(true);
    try {
      const blob = await exportAnalyticsMaterials(baseParams);
      downloadBlob(blob, `物料分析-${baseParams.from}至${baseParams.to}.csv`);
      message.success('物料分析 CSV 已导出');
    } catch (error) {
      message.error(getApiErrorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  const columns: ColumnsType<MaterialRow> = [
    {
      title: '物料 / 规格', key: 'material', width: 220,
      render: (_, row) => (
        <div>
          <div>{row.materialName || row.materialCode}</div>
          <Typography.Text type="secondary">{row.materialSpec || row.materialCode}</Typography.Text>
        </div>
      ),
    },
    { title: '分类', key: 'category', width: 120, render: (_, row) => row.categoryName || '—' },
    { title: '入厂车次', dataIndex: 'inboundTickets', key: 'inboundTickets', align: 'right', width: 100 },
    { title: '入厂净重（吨）', key: 'inboundNet', align: 'right', width: 140, render: (_, row) => formatMilliTonne(row.inboundNetMilliTonne) },
    { title: '出厂车次', dataIndex: 'outboundTickets', key: 'outboundTickets', align: 'right', width: 100 },
    { title: '出厂净重（吨）', key: 'outboundNet', align: 'right', width: 140, render: (_, row) => formatMilliTonne(row.outboundNetMilliTonne) },
    { title: '合计净重（吨）', key: 'net', align: 'right', width: 150, sorter: true, render: (_, row) => <Typography.Text strong>{formatMilliTonne(row.totalNetMilliTonne)}</Typography.Text> },
    { title: '平均单次（吨）', key: 'avg', align: 'right', width: 130, sorter: true, render: (_, row) => row.avgNetPerTicketMilliTonne == null ? '—' : formatMilliTonne(row.avgNetPerTicketMilliTonne) },
    { title: '占比', key: 'share', align: 'right', width: 90, render: (_, row) => formatBp(row.shareBp) },
    { title: '调整车次', dataIndex: 'adjustedTickets', key: 'adjustment', align: 'right', width: 100 },
    { title: '净重调整（吨）', key: 'adjustmentNet', align: 'right', width: 140, render: (_, row) => formatMilliTonne(row.adjustmentNetMilliTonne) },
    { title: '扣量率', key: 'adjustmentRate', align: 'right', width: 100, render: (_, row) => formatBp(row.adjustmentWeightRateBp) },
    { title: '调整覆盖率', key: 'coverage', align: 'right', width: 120, render: (_, row) => formatBp(row.adjustmentCoverageBp) },
    { title: '最后过磅', key: 'lastIssuedAt', width: 150, sorter: true, render: (_, row) => formatDateTime(row.lastIssuedAt) },
  ];

  const overview = (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {materials.isError && (
        <Alert type="error" message={`物料分析加载失败：${getApiErrorMessage(materials.error)}`} action={<Button onClick={() => void materials.refetch()}>重试</Button>} />
      )}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={4}><KpiCard label="物料数" value={summary ? formatNumber(summary.materialCount) : '—'} suffix="种" /></Col>
        <Col xs={24} sm={12} xl={4}><KpiCard label="入厂净重" value={summary ? formatMilliTonne(summary.inboundNetMilliTonne) : '—'} suffix="吨" /></Col>
        <Col xs={24} sm={12} xl={4}><KpiCard label="出厂净重" value={summary ? formatMilliTonne(summary.outboundNetMilliTonne) : '—'} suffix="吨" /></Col>
        <Col xs={24} sm={12} xl={4}><KpiCard label="净重调整" value={summary ? formatMilliTonne(summary.adjustmentNetMilliTonne) : '—'} suffix="吨" /></Col>
        <Col xs={24} sm={12} xl={4}><KpiCard label="扣量率" value={summary ? formatBp(summary.adjustmentWeightRateBp) : '—'} hint={summary ? `调整覆盖率 ${formatBp(summary.adjustmentCoverageBp)}` : undefined} /></Col>
        <Col xs={24} sm={12} xl={4}><KpiCard label="最后过磅" value={summary?.lastIssuedAt ? dayjs(summary.lastIssuedAt).format('MM-DD HH:mm') : '—'} /></Col>
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <ChartCard title="物料净重趋势（全部物料）">
            <EChart option={materialTrendOption(data?.trend)} loading={materials.isLoading} empty={!data?.trend.length} ariaLabel="物料净重趋势图" />
          </ChartCard>
        </Col>
        <Col xs={24} xl={10}>
          <ChartCard title="分类结构">
            <EChart option={pieChartOption(data?.structure)} loading={materials.isLoading} empty={!data?.structure.length} ariaLabel="物料分类结构图" />
          </ChartCard>
        </Col>
      </Row>
      <DataTable
        tableKey="analytics-materials"
        rowKey={(row: MaterialRow) => `${row.materialCode}:${row.materialSpec}`}
        columns={columns}
        dataSource={data?.records ?? []}
        total={data?.total ?? 0}
        page={state.page}
        pageSize={state.pageSize}
        onPageChange={actions.setPage}
        sortBy={state.sortBy}
        sortOrder={state.sortOrder}
        onSortChange={actions.setSort}
        loading={materials.isLoading}
        onRefresh={() => void materials.refetch()}
        refreshing={materials.isFetching}
        title="物料汇总"
        emptyDescription="当前期间没有符合条件的有效过磅单"
      />
      {(data?.topAdjustments.length ?? 0) > 0 && (
        <Card size="small" title="扣量 Top">
          <Row gutter={[16, 16]}>
            {data?.topAdjustments.slice(0, 6).map((row) => (
              <Col xs={24} sm={12} xl={8} key={`${row.materialCode}:${row.materialSpec}`}>
                <Card size="small">
                  <Typography.Text strong>{row.materialName || row.materialCode}</Typography.Text>
                  <Typography.Text type="secondary"> {row.materialSpec}</Typography.Text>
                  <div>扣量 {formatMilliTonne(row.adjustmentNetMilliTonne)} 吨 · 扣量率 {formatBp(row.adjustmentWeightRateBp)}</div>
                </Card>
              </Col>
            ))}
          </Row>
        </Card>
      )}
      <FreshnessNote freshness={data?.freshness} />
    </Space>
  );

  return (
    <>
      <PageHeader
        title="物料分析"
        description="按物料/规格汇总入厂、出厂、净重、扣量和最后一次过磅时间；可切换查看核心原料扣量稳定性和副产品出库流向。"
        extra={
          <Space>
            <Button onClick={() => void activeQuery.refetch()} loading={activeQuery.isFetching}>刷新</Button>
            {activeTab === 'overview' && <Button onClick={() => void exportMaterials()} loading={exporting}>导出当前筛选 CSV</Button>}
          </Space>
        }
      />
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Card size="small">
          <AnalyticsFilterBar
            state={state}
            actions={actions}
            sites={master.sites}
            materials={master.materials}
            categories={master.categories}
            showDirection={activeTab === 'overview'}
            showKeyword
            showCompare={false}
            keywordPlaceholder={
              activeTab === 'supplier' ? '供应商名称 / 编码' : activeTab === 'byproduct' ? '客户名称 / 编码' : '物料名称 / 编码'
            }
          />
        </Card>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as MaterialTab)}
          items={[
            { key: 'overview', label: '物料总览', children: overview },
            {
              key: 'supplier',
              label: '核心原料扣量稳定性',
              children: (
                <SupplierQualityTab
                  data={supplierQuality.data}
                  loading={supplierQuality.isLoading}
                  error={supplierQuality.isError ? getApiErrorMessage(supplierQuality.error) : null}
                  page={supplierPage}
                  pageSize={supplierPageSize}
                  onPageChange={(nextPage, nextPageSize) => {
                    setSupplierPage(nextPage);
                    setSupplierPageSize(nextPageSize);
                  }}
                  sortBy={supplierSortBy}
                  sortOrder={supplierSortOrder}
                  onSortChange={(nextSortBy, nextSortOrder) => {
                    setSupplierSortBy(nextSortBy);
                    setSupplierSortOrder(nextSortOrder);
                    setSupplierPage(1);
                  }}
                />
              ),
            },
            {
              key: 'byproduct',
              label: '副产品出库流向',
              children: (
                <ByproductFlowTab
                  data={byproductFlow.data}
                  loading={byproductFlow.isLoading}
                  error={byproductFlow.isError ? getApiErrorMessage(byproductFlow.error) : null}
                  page={byproductPage}
                  pageSize={byproductPageSize}
                  onPageChange={(nextPage, nextPageSize) => {
                    setByproductPage(nextPage);
                    setByproductPageSize(nextPageSize);
                  }}
                  sortBy={byproductSortBy}
                  sortOrder={byproductSortOrder}
                  onSortChange={(nextSortBy, nextSortOrder) => {
                    setByproductSortBy(nextSortBy);
                    setByproductSortOrder(nextSortOrder);
                    setByproductPage(1);
                  }}
                />
              ),
            },
          ]}
        />
      </Space>
    </>
  );
}
