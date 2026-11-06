import { Alert, Card, Col, Row, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DataTable } from '../../components/DataTable';
import { EChart } from '../../components/charts/EChart';
import { ChartCard, FreshnessNote, KpiCard } from '../../features/analytics/ui';
import { formatBp, formatMilliTonne } from '../../features/analytics/format';
import { byproductTrendOption, topBarChartOption } from '../../features/analytics/charts';
import type { ByproductData, ByproductMaterial, ByproductRow, TopRow } from '../../features/analytics/api';
import { formatDateTime, formatNumber } from '../../utils/format';

interface ByproductFlowTabProps {
  data: ByproductData | undefined;
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

function toTopRows(rows: ByproductRow[] | undefined): TopRow[] {
  return (rows ?? []).map((row) => ({
    code: row.partyCode,
    name: row.partyName || row.partyCode,
    netMilliTonne: row.netMilliTonne,
    ticketCount: row.ticketCount,
    shareBp: row.shareBp,
  }));
}

export function ByproductFlowTab({
  data,
  loading,
  error,
  page,
  pageSize,
  onPageChange,
  sortBy,
  sortOrder,
  onSortChange,
}: ByproductFlowTabProps) {
  const summary = data?.summary;
  const columns: ColumnsType<ByproductRow> = [
    {
      title: '客户 / 个人', key: 'party', width: 240,
      render: (_, row) => (
        <div>
          <div>{row.partyName || row.partyCode}</div>
          <Typography.Text type="secondary">
            {row.partyCode} · {natureLabel(row.nature)}
          </Typography.Text>
        </div>
      ),
    },
    { title: '车次', dataIndex: 'ticketCount', key: 'tickets', align: 'right', width: 90, sorter: true },
    { title: '出库净重（吨）', key: 'net', align: 'right', width: 150, sorter: true, render: (_, row) => <Typography.Text strong>{formatMilliTonne(row.netMilliTonne)}</Typography.Text> },
    { title: '平均单车（吨）', key: 'avg', align: 'right', width: 130, sorter: true, render: (_, row) => row.avgNetPerTicketMilliTonne == null ? '—' : formatMilliTonne(row.avgNetPerTicketMilliTonne) },
    { title: '占比', key: 'share', align: 'right', width: 100, render: (_, row) => formatBp(row.shareBp) },
    { title: '首次采购', key: 'firstIssuedAt', width: 150, render: (_, row) => formatDateTime(row.firstIssuedAt) },
    { title: '最后采购', key: 'lastIssuedAt', width: 150, sorter: true, render: (_, row) => formatDateTime(row.lastIssuedAt) },
    { title: '物料', key: 'materials', width: 180, render: (_, row) => row.materialNames || '—' },
  ];
  const materialColumns: ColumnsType<ByproductMaterial> = [
    { title: '物料', dataIndex: 'materialName', key: 'materialName' },
    { title: '车次', dataIndex: 'ticketCount', key: 'ticketCount', align: 'right' },
    { title: '出库净重（吨）', key: 'net', align: 'right', render: (_, row) => formatMilliTonne(row.netMilliTonne) },
    { title: '占比', key: 'share', align: 'right', render: (_, row) => formatBp(row.shareBp) },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        message="副产品出库流向"
        description="统计副产品（酒糟等）出厂方向的客户采购量、占比和集中度。当前系统没有价格/金额字段，核心客户按采购量和频次识别，不代表利润贡献。"
      />
      {error && <Alert type="error" showIcon message={`副产品出库流向加载失败：${error}`} />}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={4}><KpiCard label="活跃客户" value={summary ? formatNumber(summary.activeCustomers) : '—'} suffix="家" /></Col>
        <Col xs={24} sm={12} xl={4}><KpiCard label="出库车次" value={summary ? formatNumber(summary.ticketCount) : '—'} suffix="车" /></Col>
        <Col xs={24} sm={12} xl={4}><KpiCard label="出库净重" value={summary ? formatMilliTonne(summary.totalNetMilliTonne) : '—'} suffix="吨" /></Col>
        <Col xs={24} sm={12} xl={4}><KpiCard label="户均净重" value={summary?.avgNetPerCustomerMilliTonne != null ? formatMilliTonne(summary.avgNetPerCustomerMilliTonne) : '—'} suffix="吨" /></Col>
        <Col xs={24} sm={12} xl={4}><KpiCard label="CR3" value={formatBp(summary?.cr3Bp)} hint={`CR5 ${formatBp(summary?.cr5Bp)} · CR10 ${formatBp(summary?.cr10Bp)}`} /></Col>
        <Col xs={24} sm={12} xl={4}><KpiCard label="第一大客户占比" value={formatBp(summary?.topCustomerShareBp)} hint={summary ? `物料 ${summary.materialCount} 种` : undefined} /></Col>
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <ChartCard title="客户出库量 Top">
            <EChart
              option={topBarChartOption(toTopRows(data?.top))}
              loading={loading}
              empty={!data?.top.length}
              ariaLabel="副产品客户出库量图"
            />
          </ChartCard>
        </Col>
        <Col xs={24} xl={12}>
          <ChartCard title="副产品出库趋势">
            <EChart
              option={byproductTrendOption(data?.trend)}
              loading={loading}
              empty={!data?.trend.length}
              ariaLabel="副产品出库趋势图"
            />
          </ChartCard>
        </Col>
      </Row>
      <Card size="small" title="按物料">
        <Row gutter={[16, 16]}>
          {(data?.materials ?? []).map((item) => (
            <Col xs={24} sm={12} xl={8} key={item.materialCode}>
              <Card size="small">
                <Typography.Text strong>{item.materialName || item.materialCode}</Typography.Text>
                <div>出库 {formatMilliTonne(item.netMilliTonne)} 吨 · 占比 {formatBp(item.shareBp)} · {formatNumber(item.ticketCount)} 车</div>
              </Card>
            </Col>
          ))}
        </Row>
        <Table<ByproductMaterial>
          rowKey="materialCode"
          columns={materialColumns}
          dataSource={data?.materials ?? []}
          pagination={false}
          size="small"
          locale={{ emptyText: '当前期间没有副产品出库单据' }}
        />
      </Card>
      <DataTable
        tableKey="analytics-byproduct-customers"
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
        title="客户流向"
        emptyDescription="当前期间没有副产品出库单据"
      />
      <FreshnessNote freshness={data?.freshness} />
    </Space>
  );
}
