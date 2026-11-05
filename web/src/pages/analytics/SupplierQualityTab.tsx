import { Alert, Col, Row, Space, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DataTable } from '../../components/DataTable';
import { EChart } from '../../components/charts/EChart';
import { ChartCard, FreshnessNote, KpiCard } from '../../features/analytics/ui';
import { formatBp, formatMilliTonne } from '../../features/analytics/format';
import { supplierQualityTrendOption, supplierRateBarOption } from '../../features/analytics/charts';
import type { SupplierQualityData, SupplierQualityRow } from '../../features/analytics/api';
import { formatDateTime, formatNumber } from '../../utils/format';

interface SupplierQualityTabProps {
  data: SupplierQualityData | undefined;
  loading: boolean;
  error?: string | null;
  page: number;
  pageSize: number;
  onPageChange: (page: number, pageSize: number) => void;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSortChange: (sortBy: string | undefined, sortOrder: 'asc' | 'desc' | undefined) => void;
}

function natureLabel(nature: string) {
  if (nature === 'individual') return '个人';
  if (nature === 'enterprise') return '企业';
  return nature || '—';
}

export function SupplierQualityTab({
  data,
  loading,
  error,
  page,
  pageSize,
  onPageChange,
  sortBy,
  sortOrder,
  onSortChange,
}: SupplierQualityTabProps) {
  const summary = data?.summary;
  const columns: ColumnsType<SupplierQualityRow> = [
    {
      title: '供应商 / 个人', key: 'party', width: 240,
      render: (_, row) => (
        <div>
          <div>{row.partyName || row.partyCode}</div>
          <Typography.Text type="secondary">
            {row.partyCode} · {natureLabel(row.nature)}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: '样本 / 车次', key: 'sample', align: 'right', width: 120, sorter: true,
      render: (_, row) => `${formatNumber(row.sampleCount)} / ${formatNumber(row.ticketCount)}`,
    },
    { title: '调整覆盖率', key: 'coverage', align: 'right', width: 120, render: (_, row) => formatBp(row.adjustmentCoverageBp) },
    { title: '加权扣量率', key: 'weighted', align: 'right', width: 120, sorter: true, render: (_, row) => formatBp(row.weightedRateBp) },
    { title: '平均扣量率', key: 'avg', align: 'right', width: 120, sorter: true, render: (_, row) => <Typography.Text strong>{formatBp(row.avgRateBp)}</Typography.Text> },
    { title: '中位数', key: 'median', align: 'right', width: 100, render: (_, row) => formatBp(row.medianRateBp) },
    { title: 'P90', key: 'p90', align: 'right', width: 100, render: (_, row) => formatBp(row.p90RateBp) },
    { title: '标准差', key: 'stddev', align: 'right', width: 100, sorter: true, render: (_, row) => formatBp(row.stddevRateBp) },
    { title: 'CV', key: 'cv', align: 'right', width: 90, sorter: true, render: (_, row) => formatBp(row.cvBp) },
    {
      title: '区间', key: 'range', align: 'right', width: 150,
      render: (_, row) => `${formatBp(row.minRateBp)} ~ ${formatBp(row.maxRateBp)}`,
    },
    { title: '调整量（吨）', key: 'adjustment', align: 'right', width: 130, render: (_, row) => formatMilliTonne(row.totalAdjustmentMilliTonne) },
    { title: '物料', key: 'materials', width: 180, render: (_, row) => row.materialNames || '—' },
    { title: '最后过磅', key: 'lastIssuedAt', width: 150, sorter: true, render: (_, row) => formatDateTime(row.lastIssuedAt) },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        message="核心原料扣量稳定性"
        description="统计酿酒原料和酿酒辅料的入厂单据，以每车扣量率为样本聚合供应商稳定性；扣量率 = 净重调整 /（最终毛重 - 最终皮重）。仅统计调整字段已知的有效单，旧协议未知单不进入样本，页面显示覆盖率。"
      />
      {error && <Alert type="error" showIcon message={`核心原料扣量稳定性加载失败：${error}`} />}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={4}><KpiCard label="供应商" value={summary ? formatNumber(summary.supplierCount) : '—'} suffix="家" /></Col>
        <Col xs={24} sm={12} xl={4}><KpiCard label="样本车次" value={summary ? formatNumber(summary.sampleCount) : '—'} suffix="车" hint={summary ? `总车次 ${formatNumber(summary.ticketCount)}` : undefined} /></Col>
        <Col xs={24} sm={12} xl={4}><KpiCard label="调整车次" value={summary ? formatNumber(summary.adjustedTickets) : '—'} suffix="车" /></Col>
        <Col xs={24} sm={12} xl={4}><KpiCard label="加权扣量率" value={formatBp(summary?.weightedRateBp)} /></Col>
        <Col xs={24} sm={12} xl={4}><KpiCard label="样本中位数" value={formatBp(summary?.medianRateBp)} hint={`P90 ${formatBp(summary?.p90RateBp)}`} /></Col>
        <Col xs={24} sm={12} xl={4}><KpiCard label="调整覆盖率" value={formatBp(summary?.adjustmentCoverageBp)} /></Col>
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <ChartCard title="供应商平均扣量率">
            <EChart
              option={supplierRateBarOption(data?.top)}
              loading={loading}
              empty={!data?.top.length}
              ariaLabel="供应商平均扣量率图"
            />
          </ChartCard>
        </Col>
        <Col xs={24} xl={12}>
          <ChartCard title="Top 供应商扣量率趋势">
            <EChart
              option={supplierQualityTrendOption(data?.trend)}
              loading={loading}
              empty={!data?.trend.length}
              ariaLabel="供应商扣量率趋势图"
            />
          </ChartCard>
        </Col>
      </Row>
      <DataTable
        tableKey="analytics-supplier-quality"
        rowKey="partyCode"
        columns={columns}
        dataSource={data?.records ?? []}
        total={data?.total ?? 0}
        page={page}
        pageSize={pageSize}
        onPageChange={onPageChange}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={onSortChange}
        loading={loading}
        title="供应商扣量稳定性"
        emptyDescription="当前期间没有符合条件的核心原料入厂单据"
      />
      <FreshnessNote freshness={data?.freshness} />
    </Space>
  );
}
