import { useState } from 'react';
import { Alert, Button, Descriptions, Input, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { FilterField } from '../../components/SearchFilterBar';
import { useListUrlState } from '../../hooks/useListUrlState';
import { getApiErrorMessage } from '../../lib/api/errors';
import {
  syncSiteReceipts,
  syncTicketReceipt,
  type SyncChangeConfirmation,
  type SyncSiteReceipt,
  type SyncTicketReceipt,
  type SyncTicketRef,
} from '../../features/weighbridge/api';

const config = { filters: {}, sortKeys: [], pageSizeOptions: [10, 20, 50], defaultPageSize: 10 } as const;
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

const changeColumns: ColumnsType<SyncChangeConfirmation> = [
  { title: '变化类型', dataIndex: 'changeType', key: 'changeType', render: (value: string) => <Tag>{changeType(value)}</Tag> },
  { title: '摘要', dataIndex: 'digest', key: 'digest', render: (value: string) => digestText(value) },
  { title: '摘要规则', dataIndex: 'digestVersion', key: 'digestVersion', render: (value: number) => `v${value}` },
  { title: '协议版本', dataIndex: 'schemaVersion', key: 'schemaVersion', render: (value: number) => `v${value}` },
  { title: '接收时间', dataIndex: 'receivedAt', key: 'receivedAt', render: (value: string) => formatTime(value) },
];

const siteColumns: ColumnsType<SyncSiteReceipt> = [
  { title: '厂区编码', dataIndex: 'siteCode', key: 'siteCode' },
  { title: '厂区名称', dataIndex: 'siteName', key: 'siteName' },
  { title: '状态', dataIndex: 'enabled', key: 'enabled', render: (value: boolean) => <Tag color={value ? 'green' : 'default'}>{value ? '启用' : '停用'}</Tag> },
  { title: '最近接收时间', dataIndex: 'lastReceivedAt', key: 'lastReceivedAt', render: (value: string | null) => formatTime(value) },
  { title: '最近单据', dataIndex: 'lastTicketNo', key: 'lastTicketNo', render: (value: string | null) => value || '—' },
  { title: '最近变化', dataIndex: 'lastChangeType', key: 'lastChangeType', render: (value: string | null) => changeType(value) },
  { title: '出单编码', dataIndex: 'lastIssuedSiteCode', key: 'lastIssuedSiteCode', render: (value: string | null) => value || '—' },
  { title: '云端已接收摘要变化数', dataIndex: 'receivedChanges', key: 'receivedChanges' },
];

function TicketDetail({ detail, onOpenRef }: { detail: SyncTicketReceipt; onOpenRef: (ref: SyncTicketRef) => void }) {
  const ticket = detail.ticket;
  const previousSiteCode = detail.previousSiteCode ?? detail.siteCode;
  const previousTicketNo = detail.previousTicketNo;
  const reopenedBy = detail.reopenedBy;
  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Alert type="info" showIcon message="摘要一致只表示双方保存的最新变化摘要相同，不代表云端独立校验了业务内容；接收时间不代表厂端在线或已完整上传。" />
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

export default function SyncPage() {
  const { state, actions } = useListUrlState(config);
  const sitesQuery = useQuery({ queryKey: ['weighbridge', 'sync', 'sites'], queryFn: syncSiteReceipts });
  const [siteCode, setSiteCode] = useState('');
  const [ticketNo, setTicketNo] = useState('');
  const [query, setQuery] = useState<SyncTicketRef | null>(null);
  const ticketQuery = useQuery({
    queryKey: ['weighbridge', 'sync', 'ticket', query],
    queryFn: () => {
      if (!query) throw new Error('missing sync ticket query');
      return syncTicketReceipt(query.siteCode, query.ticketNo);
    },
    enabled: query !== null,
  });

  const search = () => {
    const nextSite = siteCode.trim();
    const nextTicket = ticketNo.trim();
    if (!nextSite || !nextTicket) return;
    setQuery({ siteCode: nextSite, ticketNo: nextTicket });
  };
  const openRef = (ref: SyncTicketRef) => {
    setSiteCode(ref.siteCode);
    setTicketNo(ref.ticketNo);
    setQuery({ ...ref });
  };

  const rows = sitesQuery.data ?? [];
  const columns: ColumnsType<SyncSiteReceipt> = [
    ...siteColumns,
    {
      title: '操作',
      key: 'actions',
      render: (_, row) => (
        <Button type="link" onClick={() => setSiteCode(row.lastIssuedSiteCode ?? row.siteCode)}>
          填入出单编码
        </Button>
      ),
    },
  ];
  const detail = ticketQuery.data?.found ? ticketQuery.data : null;

  return (
    <>
      <PageHeader title="厂云同步" description="按厂区查看云端最近成功接收的变化，并按单据核对已保存的变化。只展示云端已知的接收结果。" />
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message="接收时间只表示云端最近一次成功保存变化的时间，不代表厂端在线、没有积压或数据完整；云端不展示厂端待上传数量和在线状态。"
        />
        <Typography.Title level={4}>厂区最近接收</Typography.Title>
        {sitesQuery.isError && (
          <Alert
            type="error"
            message={`厂区接收情况加载失败：${getApiErrorMessage(sitesQuery.error)}`}
            action={<Button onClick={() => void sitesQuery.refetch()}>重试</Button>}
          />
        )}
        <DataTable
          tableKey="weighbridge-sync-sites"
          rowKey="siteCode"
          columns={columns}
          dataSource={rows.slice((state.page - 1) * state.pageSize, state.page * state.pageSize)}
          total={rows.length}
          page={state.page}
          pageSize={state.pageSize}
          onPageChange={actions.setPage}
          loading={sitesQuery.isLoading}
          onRefresh={() => void sitesQuery.refetch()}
          emptyDescription="尚未登记厂区，或云端还没有可展示的接收记录"
        />

        <Typography.Title level={4}>按单据核对</Typography.Title>
        <Space wrap align="end">
          <FilterField label="出单厂区编码">
            <Input aria-label="出单厂区编码" placeholder="出单厂区编码" value={siteCode} onChange={(event) => setSiteCode(event.target.value)} onPressEnter={search} />
          </FilterField>
          <FilterField label="单号">
            <Input aria-label="单号" placeholder="单号" value={ticketNo} onChange={(event) => setTicketNo(event.target.value)} onPressEnter={search} />
          </FilterField>
          <Button type="primary" onClick={search} disabled={!siteCode.trim() || !ticketNo.trim()} loading={ticketQuery.isFetching}>
            查询
          </Button>
        </Space>
        {ticketQuery.isError && (
          <Alert
            type="error"
            message={`单据核对失败：${getApiErrorMessage(ticketQuery.error)}`}
            action={<Button onClick={() => void ticketQuery.refetch()}>重试</Button>}
          />
        )}
        {ticketQuery.isLoading && <Typography.Text type="secondary">正在查询云端已接收变化…</Typography.Text>}
        {ticketQuery.data && !ticketQuery.data.found && (
          <Alert
            type="warning"
            showIcon
            message={`云端未找到 ${ticketQuery.data.siteCode} / ${ticketQuery.data.ticketNo} 的已接收单据。`}
            description="缺单可能表示前序变化尚未上传或已被拒绝；请结合厂端同步状态处理，云端无法得知厂端积压。"
          />
        )}
        {detail && <TicketDetail detail={detail} onOpenRef={openRef} />}
      </Space>
    </>
  );
}
