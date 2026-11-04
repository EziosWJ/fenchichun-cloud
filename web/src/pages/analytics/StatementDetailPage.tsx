import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { getApiErrorMessage } from '../../lib/api/errors';
import { paths } from '../../config/paths';
import {
  exportStatementDetail,
  statementDetail,
  type StatementDaily,
  type StatementMaterial,
} from '../../features/analytics/api';
import { formatMilliTonne, statementDirectionLabel } from '../../features/analytics/format';
import { tickets, type Ticket, type TicketRecord } from '../../features/weighbridge/api';
import { formatDateTime, formatPercent } from '../../utils/format';

function finalNet(ticket: Ticket): string {
  const value = ticket.finalNet
    ? Number(ticket.finalNet)
    : Number(ticket.finalGross) - Number(ticket.finalTare) - Number(ticket.netAdjustment ?? 0);
  return Number.isFinite(value) ? value.toFixed(3) : '—';
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function StatementDetailPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [searchParams] = useSearchParams();
  const siteCode = searchParams.get('siteCode') ?? '';
  const partyCode = searchParams.get('partyCode') ?? '';
  const direction = searchParams.get('direction') === 'inbound' ? 'inbound' : 'outbound';
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [siteCode, partyCode, direction, from, to]);

  const detail = useQuery({
    queryKey: ['weighbridge', 'statement-detail', siteCode, partyCode, direction, from, to],
    queryFn: () => statementDetail({ siteCode, partyCode, direction, from, to }),
    enabled: Boolean(siteCode && partyCode && direction),
  });

  const ticketParams = useMemo(
    () => ({ siteCode, partyCode, direction, from, to, status: 'valid', page, pageSize }),
    [siteCode, partyCode, direction, from, to, page, pageSize],
  );
  const ticketList = useQuery({
    queryKey: ['weighbridge', 'statement-tickets', ticketParams],
    queryFn: () => tickets(ticketParams),
    enabled: Boolean(siteCode && partyCode && direction),
  });

  const back = () => {
    const query = new URLSearchParams({ direction, from, to });
    if (siteCode) query.set('siteCode', siteCode);
    navigate(`${paths.analyticsStatement}?${query.toString()}`);
  };

  const exportDetail = async () => {
    setExporting(true);
    try {
      const blob = await exportStatementDetail({ siteCode, partyCode, direction, from, to });
      const period = `${detail.data?.from || from}至${detail.data?.to || to}`;
      downloadBlob(blob, `对账单-${siteCode}-${partyCode}-${period}.csv`);
      message.success('对账单明细 CSV 已导出');
    } catch (error) {
      message.error(getApiErrorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  const materialColumns: ColumnsType<StatementMaterial> = [
    {
      title: '物料',
      key: 'material',
      render: (_, row) => (
        <div>
          <div>{[row.materialName, row.materialSpec].filter(Boolean).join(' / ')}</div>
          <Typography.Text type="secondary">{row.materialCode}</Typography.Text>
        </div>
      ),
    },
    { title: '车次', dataIndex: 'ticketCount', key: 'ticketCount', align: 'right', width: 90 },
    { title: '毛重（吨）', key: 'gross', align: 'right', width: 130, render: (_, row) => formatMilliTonne(row.grossMilliTonne) },
    { title: '皮重（吨）', key: 'tare', align: 'right', width: 130, render: (_, row) => formatMilliTonne(row.tareMilliTonne) },
    { title: '净重调整（吨）', key: 'adjustment', align: 'right', width: 140, render: (_, row) => formatMilliTonne(row.netAdjustmentMilliTonne) },
    { title: '最终净重（吨）', key: 'net', align: 'right', width: 150, render: (_, row) => <strong>{formatMilliTonne(row.netMilliTonne)}</strong> },
    {
      title: '占比',
      key: 'share',
      align: 'right',
      width: 90,
      render: (_, row) => (detail.data?.netMilliTonne ? formatPercent((row.netMilliTonne / detail.data.netMilliTonne) * 100, 2) : '—'),
    },
  ];

  const dailyColumns: ColumnsType<StatementDaily> = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 120 },
    { title: '车次', dataIndex: 'ticketCount', key: 'ticketCount', align: 'right', width: 90 },
    { title: '毛重（吨）', key: 'gross', align: 'right', width: 130, render: (_, row) => formatMilliTonne(row.grossMilliTonne) },
    { title: '皮重（吨）', key: 'tare', align: 'right', width: 130, render: (_, row) => formatMilliTonne(row.tareMilliTonne) },
    { title: '净重调整（吨）', key: 'adjustment', align: 'right', width: 140, render: (_, row) => formatMilliTonne(row.netAdjustmentMilliTonne) },
    { title: '最终净重（吨）', key: 'net', align: 'right', width: 150, render: (_, row) => <strong>{formatMilliTonne(row.netMilliTonne)}</strong> },
  ];

  const ticketColumns: ColumnsType<TicketRecord> = [
    { title: '出单时间', key: 'issuedAt', width: 150, render: (_, row) => formatDateTime(row.ticket.issuedAt) },
    { title: '单号', key: 'ticketNo', width: 190, render: (_, row) => row.ticket.ticketNo },
    { title: '车牌', key: 'plate', width: 120, render: (_, row) => row.ticket.plate },
    {
      title: '物料 / 规格',
      key: 'material',
      width: 190,
      render: (_, row) => [row.ticket.materialName, row.ticket.materialSpec].filter(Boolean).join(' / '),
    },
    { title: '毛重（吨）', key: 'gross', align: 'right', width: 120, render: (_, row) => row.ticket.finalGross },
    { title: '皮重（吨）', key: 'tare', align: 'right', width: 120, render: (_, row) => row.ticket.finalTare },
    { title: '净重调整（吨）', key: 'adjustment', align: 'right', width: 140, render: (_, row) => row.ticket.netAdjustment || '0.000' },
    { title: '最终净重（吨）', key: 'net', align: 'right', width: 150, render: (_, row) => <strong>{finalNet(row.ticket)}</strong> },
    { title: '状态', key: 'status', width: 90, render: () => <Tag color="green">有效</Tag> },
  ];

  if (!siteCode || !partyCode) {
    return (
      <>
        <PageHeader title="客户对账单" onBack={back} />
        <Alert type="error" showIcon message="缺少厂区或往来方参数，请从客户对账列表进入。" action={<Button onClick={back}>返回列表</Button>} />
      </>
    );
  }

  const data = detail.data;
  const cards = [
    { label: '有效车次', value: data ? String(data.ticketCount) : '—', unit: '车' },
    { label: '毛重合计', value: data ? formatMilliTonne(data.grossMilliTonne) : '—', unit: '吨' },
    { label: '皮重合计', value: data ? formatMilliTonne(data.tareMilliTonne) : '—', unit: '吨' },
    { label: '净重调整合计', value: data ? formatMilliTonne(data.netAdjustmentMilliTonne) : '—', unit: '吨' },
    { label: '最终净重合计', value: data ? formatMilliTonne(data.netMilliTonne) : '—', unit: '吨' },
  ];

  return (
    <>
      <PageHeader
        title="客户对账单"
        description={data ? `${statementDirectionLabel(direction)} · ${data.from || from} 至 ${data.to || to}` : '按厂区与往来方核对有效过磅单重量。'}
        onBack={back}
        extra={<Button onClick={() => void exportDetail()} loading={exporting}>导出对账单明细 CSV</Button>}
      />
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {detail.isError && (
          <Alert type="error" message={`对账单加载失败：${getApiErrorMessage(detail.error)}`} action={<Button onClick={() => void detail.refetch()}>重试</Button>} />
        )}
        <Card loading={detail.isLoading} size="small">
          {data && (
            <Descriptions
              size="small"
              column={{ xs: 1, sm: 2, xl: 4 }}
              items={[
                { key: 'site', label: '厂区', children: `${data.siteName || data.siteCode}（${data.siteCode}）` },
                { key: 'party', label: '往来方', children: `${data.partyName}（${data.partyCode}）` },
                { key: 'period', label: '对账期间', children: `${data.from || from} 至 ${data.to || to}` },
                { key: 'direction', label: '方向', children: statementDirectionLabel(direction) },
              ]}
            />
          )}
        </Card>
        <Row gutter={[16, 16]}>
          {cards.map((card) => (
            <Col xs={24} sm={12} xl={4} key={card.label}>
              <Card size="small">
                <Statistic title={card.label} value={card.value} suffix={card.unit} />
              </Card>
            </Col>
          ))}
        </Row>
        <Card title="按物料汇总" size="small">
          <Table<StatementMaterial>
            rowKey={(row) => `${row.materialCode}:${row.materialName}:${row.materialSpec}`}
            columns={materialColumns}
            dataSource={data?.materials ?? []}
            pagination={false}
            size="small"
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无物料汇总" /> }}
          />
        </Card>
        <Card title="按日期汇总" size="small">
          <Table<StatementDaily>
            rowKey="date"
            columns={dailyColumns}
            dataSource={data?.daily ?? []}
            pagination={false}
            size="small"
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无日期汇总" /> }}
          />
        </Card>
        <DataTable
          tableKey="weighbridge-statement-tickets"
          rowKey={(row) => `${row.siteCode}:${row.ticket.ticketNo}`}
          columns={ticketColumns}
          dataSource={ticketList.data?.items ?? []}
          total={ticketList.data?.total ?? 0}
          page={page}
          pageSize={pageSize}
          onPageChange={(nextPage, nextPageSize) => {
            setPage(nextPage);
            setPageSize(nextPageSize);
          }}
          loading={ticketList.isLoading}
          onRefresh={() => void ticketList.refetch()}
          title="过磅单明细"
          emptyDescription="当前期间没有有效过磅单"
        />
      </Space>
    </>
  );
}
