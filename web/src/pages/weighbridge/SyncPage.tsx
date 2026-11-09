import { useEffect, useState } from 'react';
import { Alert, Button, DatePicker, Descriptions, Input, Modal, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { useListUrlState } from '../../hooks/useListUrlState';
import { getApiErrorMessage } from '../../lib/api/errors';
import {
  sites,
  syncTicketReceipt,
  tickets,
  type Site,
  type SyncChangeConfirmation,
  type SyncTicketReceipt,
  type NetAdjustmentItem,
  type SyncTicketRef,
  type Ticket,
  type TicketRecord,
} from '../../features/weighbridge/api';
import { formatDateTime } from '../../utils/format';
import styles from './SyncPage.module.css';

const config = {
  filters: {
    direction: ['inbound', 'outbound'],
    status: ['valid', 'void'],
    from: 'text',
    to: 'text',
    materialCode: 'text',
    partyCode: 'text',
  },
  sortKeys: [],
  pageSizeOptions: [10, 20, 50],
  defaultPageSize: 10,
} as const;

const CHANGE_TYPES: Record<string, string> = { issue: '出单', void: '作废', reopen: '重开' };

function formatTime(value: string | null | undefined): string {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '—';
}

function changeType(value: string | null | undefined): string {
  return value ? CHANGE_TYPES[value] ?? value : '—';
}

function digestText(value: string | null | undefined) {
  if (!value) return '—';
  return (
    <Typography.Text code copyable={{ text: value }} style={{ fontSize: 12 }}>
      {value.slice(0, 16)}…
    </Typography.Text>
  );
}

function difference(a: string, b: string): string {
  const milli = (value: string) => {
    const negative = value.startsWith('-');
    const [whole, fractional = ''] = (negative ? value.slice(1) : value).split('.');
    const result = BigInt(whole) * 1000n + BigInt((fractional + '000').slice(0, 3));
    return negative ? -result : result;
  };
  const value = milli(a) - milli(b);
  const absolute = value < 0n ? -value : value;
  const fraction = (absolute % 1000n).toString().padStart(3, '0');
  return `${value < 0n ? '-' : ''}${absolute / 1000n}.${fraction}`;
}

function finalNet(ticket: Ticket): string {
  return ticket.finalNet || difference(ticket.finalGross, ticket.finalTare);
}

function weight(value: string): string {
  const [whole, fractional = ''] = value.split('.');
  return `${whole}.${(fractional + '000').slice(0, 3)}`;
}

function adjustmentModeLabel(mode: string, rateBp: number | null): string {
  return mode === 'percent'
    ? `按比例 ${(Number(rateBp ?? 0) / 100).toFixed(2).replace(/\.?0+$/, '')}%`
    : '按吨';
}

function dateValue(value?: string) {
  return value && dayjs(value).isValid() ? dayjs(value) : null;
}

const adjustmentColumns: ColumnsType<NetAdjustmentItem> = [
  { title: '序号', key: 'index', width: 70, render: (_, __, index) => index + 1 },
  { title: '方式', key: 'mode', render: (_, item) => adjustmentModeLabel(item.mode, item.rateBp) },
  { title: '折算重量（吨）', key: 'amount', render: (_, item) => weight(item.amount) },
  { title: '类别', key: 'category', render: (_, item) => item.categoryName || item.category || '—' },
  { title: '备注', key: 'remark', render: (_, item) => item.remark || '—' },
];

const changeColumns: ColumnsType<SyncChangeConfirmation> = [
  { title: '变化类型', dataIndex: 'changeType', key: 'changeType', render: (value: string) => <Tag>{changeType(value)}</Tag> },
  { title: '摘要', dataIndex: 'digest', key: 'digest', render: (value: string) => digestText(value) },
  { title: '摘要规则', dataIndex: 'digestVersion', key: 'digestVersion', render: (value: number) => `v${value}` },
  { title: '协议版本', dataIndex: 'schemaVersion', key: 'schemaVersion', render: (value: number) => `v${value}` },
  { title: '接收时间', dataIndex: 'receivedAt', key: 'receivedAt', render: (value: string) => formatTime(value) },
];

function TicketDetail({ detail, onOpenRef }: { detail: SyncTicketReceipt; onOpenRef: (ref: SyncTicketRef) => void }) {
  const ticket = detail.ticket;
  const previousSiteCode = detail.previousSiteCode ?? detail.siteCode;
  const previousTicketNo = detail.previousTicketNo;
  const reopenedBy = detail.reopenedBy;
  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Descriptions
        bordered
        size="small"
        column={{ xs: 1, sm: 2 }}
        items={[
          { key: 'site', label: '出单厂区编码', children: detail.siteCode },
          { key: 'status', label: '状态', children: <Tag color={detail.status === 'valid' ? 'green' : 'default'}>{detail.status === 'valid' ? '有效' : '作废'}</Tag> },
          { key: 'latest', label: '最新变化摘要', children: digestText(detail.latestDigest) },
          { key: 'latestType', label: '最新变化类型', children: changeType(detail.latestChangeType) },
          { key: 'latestVersion', label: '最新摘要规则', children: detail.latestDigestVersion ? `v${detail.latestDigestVersion}` : '—' },
          { key: 'received', label: '最近接收时间', children: formatTime(detail.latestReceivedAt) },
          {
            key: 'previous',
            label: '原单关联',
            children: previousTicketNo ? (
              <Button type="link" size="small" onClick={() => onOpenRef({ siteCode: previousSiteCode, ticketNo: previousTicketNo })}>
                {previousSiteCode} / {previousTicketNo}
              </Button>
            ) : '—',
          },
          {
            key: 'reopenedBy',
            label: '重开单关联',
            children: reopenedBy ? (
              <Button type="link" size="small" onClick={() => onOpenRef(reopenedBy)}>
                {reopenedBy.siteCode} / {reopenedBy.ticketNo}
              </Button>
            ) : '—',
          },
        ]}
      />
      {ticket && (
        <Descriptions
          bordered
          size="small"
          column={{ xs: 1, sm: 2 }}
          items={[
            { key: 'plate', label: '车牌', children: ticket.plate },
            { key: 'direction', label: '方向', children: ticket.direction === 'inbound' ? '入厂卸货' : '出厂装货' },
            { key: 'material', label: '物料', children: `${ticket.materialName} ${ticket.materialSpec} (${ticket.materialCode})` },
            { key: 'party', label: '供收方', children: `${ticket.partyName} (${ticket.partyCode})` },
            { key: 'gross', label: '最终毛重（吨）', children: ticket.finalGross },
            { key: 'tare', label: '最终皮重（吨）', children: ticket.finalTare },
            { key: 'net', label: '最终净重（吨）', children: ticket.finalNet || '—' },
            { key: 'issued', label: '出单时间', children: formatTime(ticket.issuedAt) },
            ...(detail.status === 'void'
              ? [
                  { key: 'voidReason', label: '作废原因', children: detail.voidReason || '—' },
                  { key: 'voidedBy', label: '作废操作人', children: detail.voidedBy || '—' },
                  { key: 'voidedAt', label: '作废时间', children: formatTime(detail.voidedAt) },
                ]
              : []),
          ]}
        />
      )}
      {ticket?.netAdjustments && ticket.netAdjustments.length > 0 && (
        <Table
          rowKey={(item) => `${item.mode}:${item.amount}:${item.category}:${item.remark}`}
          size="small"
          pagination={false}
          title={() => '净重调整明细'}
          columns={adjustmentColumns}
          dataSource={ticket.netAdjustments}
        />
      )}
      <Table
        rowKey="digest"
        size="small"
        pagination={false}
        columns={changeColumns}
        dataSource={detail.changes}
        locale={{ emptyText: '云端尚未保存该单据的摘要变化' }}
      />
    </Space>
  );
}

function tabLabel(site: Site) {
  return (
    <span className={styles.tabLabel}>
      {site.name}
      <span className={styles.tabCode}>{site.code}</span>
      {!site.enabled && <Tag>停用</Tag>}
    </span>
  );
}

const baseColumns: ColumnsType<TicketRecord> = [
  { title: '单号', key: 'ticketNo', render: (_, row) => row.ticket.ticketNo },
  { title: '车牌', key: 'plate', render: (_, row) => row.ticket.plate },
  { title: '方向', key: 'direction', render: (_, row) => row.ticket.direction === 'inbound' ? '入厂卸货' : '出厂装货' },
  { title: '物料', key: 'material', render: (_, row) => [row.ticket.materialName, row.ticket.materialSpec].filter(Boolean).join(' / ') },
  { title: '供收方', key: 'party', render: (_, row) => row.ticket.partyName },
  { title: '毛重（吨）', key: 'gross', render: (_, row) => row.ticket.finalGross },
  { title: '皮重（吨）', key: 'tare', render: (_, row) => row.ticket.finalTare },
  { title: '净重（吨）', key: 'net', render: (_, row) => finalNet(row.ticket) },
  { title: '状态', dataIndex: 'status', key: 'status', render: (value: string) => <Tag color={value === 'valid' ? 'green' : 'default'}>{value === 'valid' ? '有效' : '作废'}</Tag> },
  { title: '出单时间', key: 'issuedAt', render: (_, row) => formatDateTime(row.ticket.issuedAt) },
];

export default function SyncPage() {
  const { state, actions } = useListUrlState(config);
  const [keyword, setKeyword] = useState(state.keyword);
  const [activeSite, setActiveSite] = useState('');
  const [detailQuery, setDetailQuery] = useState<SyncTicketRef | null>(null);

  const sitesQuery = useQuery({ queryKey: ['weighbridge', 'sync', 'sites'], queryFn: sites });
  useEffect(() => {
    const list = sitesQuery.data ?? [];
    if (list.length === 0) {
      if (activeSite) setActiveSite('');
      return;
    }
    if (!activeSite || !list.some((site) => site.code === activeSite)) {
      setActiveSite(list[0].code);
    }
  }, [activeSite, sitesQuery.data]);

  const list = useQuery({
    queryKey: ['weighbridge', 'sync', 'tickets', activeSite, state.page, state.pageSize, state.keyword, state.filters],
    queryFn: () => tickets({
      page: state.page,
      pageSize: state.pageSize,
      keyword: state.keyword || undefined,
      siteCode: activeSite,
      ...state.filters,
    }),
    enabled: Boolean(activeSite),
  });

  const receiptQuery = useQuery({
    queryKey: ['weighbridge', 'sync', 'ticket', detailQuery],
    queryFn: () => {
      if (!detailQuery) throw new Error('missing sync ticket query');
      return syncTicketReceipt(detailQuery.siteCode, detailQuery.ticketNo);
    },
    enabled: detailQuery !== null,
  });
  const detail = receiptQuery.data?.found ? receiptQuery.data : null;

  const columns: ColumnsType<TicketRecord> = [
    ...baseColumns,
    {
      title: '操作',
      key: 'actions',
      render: (_, row) => (
        <Button
          type="link"
          onClick={() => setDetailQuery({ siteCode: row.siteCode, ticketNo: row.ticket.ticketNo })}
        >
          详情
        </Button>
      ),
    },
  ];

  const tabItems = (sitesQuery.data ?? []).map((site) => ({
    key: site.code,
    label: tabLabel(site),
    children: site.code === activeSite ? (
      <>
        <div className={styles.filters} role="group" aria-label="筛选条件">
          <Input.Search
            className={styles.keyword}
            aria-label="单号或车牌"
            placeholder="单号/车牌"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onSearch={(value) => actions.setKeyword(value)}
            allowClear
          />
          <DatePicker
            className={styles.date}
            aria-label="开始日期"
            placeholder="开始日期"
            format="YYYY-MM-DD"
            allowClear
            value={dateValue(state.filters.from)}
            onChange={(value) => actions.setFilter('from', value ? value.format('YYYY-MM-DD') : '')}
          />
          <DatePicker
            className={styles.date}
            aria-label="结束日期"
            placeholder="结束日期"
            format="YYYY-MM-DD"
            allowClear
            value={dateValue(state.filters.to)}
            onChange={(value) => actions.setFilter('to', value ? value.format('YYYY-MM-DD') : '')}
          />
          <Input
            className={styles.field}
            aria-label="物料编码"
            placeholder="物料编码"
            value={state.filters.materialCode ?? ''}
            onChange={(event) => actions.setFilter('materialCode', event.target.value)}
          />
          <Input
            className={styles.field}
            aria-label="供收方编码"
            placeholder="供收方编码"
            value={state.filters.partyCode ?? ''}
            onChange={(event) => actions.setFilter('partyCode', event.target.value)}
          />
          <Select
            className={styles.select}
            aria-label="方向"
            placeholder="方向"
            allowClear
            value={state.filters.direction || undefined}
            onChange={(value) => actions.setFilter('direction', value)}
            options={[{ value: 'inbound', label: '入厂卸货' }, { value: 'outbound', label: '出厂装货' }]}
          />
          <Select
            className={styles.select}
            aria-label="状态"
            placeholder="状态"
            allowClear
            value={state.filters.status || undefined}
            onChange={(value) => actions.setFilter('status', value)}
            options={[{ value: 'valid', label: '有效' }, { value: 'void', label: '作废' }]}
          />
          <Button className={styles.reset} onClick={() => { actions.reset(); setKeyword(''); }}>重置</Button>
        </div>
        {list.isError && (
          <Alert
            type="error"
            message={`单据加载失败：${getApiErrorMessage(list.error)}`}
            action={<Button onClick={() => void list.refetch()}>重试</Button>}
          />
        )}
        <DataTable
          tableKey="weighbridge-sync-tickets"
          rowKey={(row) => `${row.siteCode}:${row.ticket.ticketNo}`}
          columns={columns}
          dataSource={list.data?.items ?? []}
          total={list.data?.total ?? 0}
          page={state.page}
          pageSize={state.pageSize}
          onPageChange={actions.setPage}
          loading={list.isLoading}
          onRefresh={() => void list.refetch()}
          emptyDescription="该厂区暂无已同步单据"
        />
      </>
    ) : null,
  }));

  return (
    <>
      <PageHeader title="厂云同步" description="按厂区查看云端已接收的过磅单。" />
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message="本页只展示云端已经接收并保存的单据；厂端尚未上传或上传失败的数据不会出现在这里。"
        />
        {sitesQuery.isError && (
          <Alert
            type="error"
            message={`厂区加载失败：${getApiErrorMessage(sitesQuery.error)}`}
            action={<Button onClick={() => void sitesQuery.refetch()}>重试</Button>}
          />
        )}
        {sitesQuery.isLoading && <Typography.Text type="secondary">正在加载厂区…</Typography.Text>}
        {!sitesQuery.isLoading && !sitesQuery.isError && !(sitesQuery.data?.length) && (
          <Alert type="info" showIcon message="尚未登记厂区" />
        )}
        {!!sitesQuery.data?.length && (
          <Tabs
            activeKey={activeSite}
            onChange={(code) => {
              setActiveSite(code);
              actions.setPage(1);
            }}
            items={tabItems}
          />
        )}
      </Space>
      <Modal
        title="单据同步详情"
        open={detailQuery !== null}
        onCancel={() => setDetailQuery(null)}
        footer={<Button onClick={() => setDetailQuery(null)}>关闭</Button>}
        width={960}
      >
        {receiptQuery.isLoading && <Typography.Text type="secondary">正在查询云端已接收变化…</Typography.Text>}
        {receiptQuery.isError && (
          <Alert
            type="error"
            message={`单据核对失败：${getApiErrorMessage(receiptQuery.error)}`}
            action={<Button onClick={() => void receiptQuery.refetch()}>重试</Button>}
          />
        )}
        {receiptQuery.data && !receiptQuery.data.found && detailQuery && (
          <Alert
            type="warning"
            showIcon
            message={`云端未找到 ${detailQuery.siteCode} / ${detailQuery.ticketNo} 的已接收单据。`}
            description="缺单可能尚未上传或已被拒绝。"
          />
        )}
        {detail && <TicketDetail detail={detail} onOpenRef={setDetailQuery} />}
      </Modal>
    </>
  );
}
