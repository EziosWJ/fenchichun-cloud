import { useState } from 'react';
import { Alert, Button, Descriptions, Input, Modal, Select, Space, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { useListUrlState } from '../../hooks/useListUrlState';
import { getApiErrorMessage } from '../../lib/api/errors';
import { tickets, totals, type TicketRecord } from '../../features/weighbridge/api';
import { formatDateTime } from '../../utils/format';

const config = { filters: { siteCode: 'text', direction: ['inbound', 'outbound'], status: ['valid', 'void'], from: 'text', to: 'text', materialCode: 'text', partyCode: 'text' }, sortKeys: [], pageSizeOptions: [10, 20, 50, 100], defaultPageSize: 10 } as const;
function difference(a: string, b: string): string {
  const milli = (value: string) => { const [whole, fractional = ''] = value.split('.'); return BigInt(whole) * 1000n + BigInt((fractional + '000').slice(0, 3)); };
  const value = milli(a) - milli(b);
  const absolute = value < 0n ? -value : value;
  const fraction = (absolute % 1000n).toString().padStart(3, '0').replace(/0+$/, '');
  return `${value < 0n ? '-' : ''}${absolute / 1000n}${fraction ? `.${fraction}` : ''}`;
}
const baseColumns: ColumnsType<TicketRecord> = [
  { title: '厂区编码', dataIndex: 'siteCode', key: 'siteCode' },
  { title: '单号', key: 'ticketNo', render: (_, row) => row.ticket.ticketNo },
  { title: '车牌', key: 'plate', render: (_, row) => row.ticket.plate },
  { title: '方向', key: 'direction', render: (_, row) => row.ticket.direction === 'inbound' ? '入厂卸货' : '出厂装货' },
  { title: '物料', key: 'material', render: (_, row) => [row.ticket.materialName, row.ticket.materialSpec].filter(Boolean).join(' / ') },
  { title: '供收方', key: 'party', render: (_, row) => row.ticket.partyName },
  { title: '毛重（吨）', key: 'gross', render: (_, row) => row.ticket.finalGross },
  { title: '皮重（吨）', key: 'tare', render: (_, row) => row.ticket.finalTare },
  { title: '状态', dataIndex: 'status', key: 'status', render: (v: string) => <Tag color={v === 'valid' ? 'green' : 'default'}>{v === 'valid' ? '有效' : '作废'}</Tag> },
  { title: '出单时间', key: 'issuedAt', render: (_, row) => formatDateTime(row.ticket.issuedAt) },
];
export default function TicketsPage() {
  const { state, actions } = useListUrlState(config);
  const [keyword, setKeyword] = useState(state.keyword);
  const [detail, setDetail] = useState<TicketRecord | null>(null);
  const columns: ColumnsType<TicketRecord> = [...baseColumns, { title: '操作', key: 'actions', render: (_, row) => <Button type="link" onClick={() => setDetail(row)}>详情</Button> }];
  const params = { page: state.page, pageSize: state.pageSize, keyword: state.keyword || undefined, ...state.filters };
  const list = useQuery({ queryKey: ['weighbridge', 'tickets', params], queryFn: () => tickets(params) });
  const summary = useQuery({ queryKey: ['weighbridge', 'totals', params], queryFn: () => totals(params) });
  return <>
    <PageHeader title="过磅单查询" description="查看各厂已同步的过磅单和有效单统计。" />
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Alert type="info" showIcon message="各厂断网或同步期间，数据可能尚未上传；作废后重开的单据可能暂时少计。" />
      <Space wrap>
        <Input.Search aria-label="单号或车牌" placeholder="单号或车牌" value={keyword} onChange={(e) => setKeyword(e.target.value)} onSearch={(v) => actions.setKeyword(v)} allowClear />
        <Input aria-label="厂区编码" placeholder="厂区编码" value={state.filters.siteCode ?? ''} onChange={(e) => actions.setFilter('siteCode', e.target.value)} />
        <Input aria-label="开始日期" type="date" value={state.filters.from ?? ''} onChange={(e) => actions.setFilter('from', e.target.value)} />
        <Input aria-label="结束日期" type="date" value={state.filters.to ?? ''} onChange={(e) => actions.setFilter('to', e.target.value)} />
        <Input aria-label="物料编码" placeholder="物料编码" value={state.filters.materialCode ?? ''} onChange={(e) => actions.setFilter('materialCode', e.target.value)} />
        <Input aria-label="供收方编码" placeholder="供收方编码" value={state.filters.partyCode ?? ''} onChange={(e) => actions.setFilter('partyCode', e.target.value)} />
        <Select aria-label="方向" placeholder="全部方向" allowClear style={{ width: 140 }} value={state.filters.direction || undefined} onChange={(v) => actions.setFilter('direction', v)} options={[{value:'inbound',label:'入厂卸货'},{value:'outbound',label:'出厂装货'}]} />
        <Select aria-label="状态" placeholder="全部状态" allowClear style={{ width: 120 }} value={state.filters.status || undefined} onChange={(v) => actions.setFilter('status', v)} options={[{value:'valid',label:'有效'},{value:'void',label:'作废'}]} />
        <Button onClick={() => { actions.reset(); setKeyword(''); }}>重置</Button>
      </Space>
      {summary.isError ? <Alert type="error" message={`统计加载失败：${getApiErrorMessage(summary.error)}`} /> : <Typography.Text type="secondary">{summary.isLoading ? '正在统计…' : (summary.data?.length ? summary.data.map((v) => `${v.direction === 'inbound' ? '入厂卸货' : '出厂装货'}，物料 ${v.materialCode}，供收方 ${v.partyCode}：${v.count} 趟，${v.netMilliTonne / 1000} 吨`).join('；') : '当前筛选条件下暂无有效单')}</Typography.Text>}
      {list.isError && <Alert type="error" message={`单据加载失败：${getApiErrorMessage(list.error)}`} action={<Button onClick={() => void list.refetch()}>重试</Button>} />}
      <DataTable tableKey="weighbridge-tickets" rowKey={(row) => `${row.siteCode}:${row.ticket.ticketNo}`} columns={columns} dataSource={list.data?.items ?? []} total={list.data?.total ?? 0} page={state.page} pageSize={state.pageSize} onPageChange={actions.setPage} loading={list.isLoading} onRefresh={() => { void list.refetch(); void summary.refetch(); }} />
    </Space>
    <Modal title="过磅单详情" open={!!detail} onCancel={() => setDetail(null)} footer={<Button onClick={() => setDetail(null)}>关闭</Button>} width={800}>
      {detail && <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }} items={[
        {key:'ticketNo',label:'单号',children:detail.ticket.ticketNo}, {key:'previous',label:'关联原单',children:detail.ticket.previousTicketNo || '—'},
        {key:'site',label:'厂区／地磅',children:`${detail.siteCode} / ${detail.ticket.scaleCode}`}, {key:'title',label:'单据标题',children:detail.ticket.title},
        {key:'plate',label:'车牌',children:detail.ticket.plate}, {key:'direction',label:'方向',children:detail.ticket.direction === 'inbound' ? '入厂卸货' : '出厂装货'},
        {key:'material',label:'物料',children:`${detail.ticket.materialName} ${detail.ticket.materialSpec} (${detail.ticket.materialCode})`}, {key:'party',label:'供收方',children:`${detail.ticket.partyName} (${detail.ticket.partyCode})`},
        {key:'original',label:'原始毛重／皮重（吨）',children:`${detail.ticket.originalGross} / ${detail.ticket.originalTare}`}, {key:'final',label:'最终毛重／皮重（吨）',children:`${detail.ticket.finalGross} / ${detail.ticket.finalTare}`},
        {key:'previousWeights',label:'上版最终毛重／皮重（吨）',children:detail.ticket.previousFinalGross && detail.ticket.previousFinalTare ? `${detail.ticket.previousFinalGross} / ${detail.ticket.previousFinalTare}` : '—'},
        {key:'net',label:'原始／最终净重（吨）',children:`${difference(detail.ticket.originalGross, detail.ticket.originalTare)} / ${difference(detail.ticket.finalGross, detail.ticket.finalTare)}`}, {key:'difference',label:'毛重／皮重调整差额（吨）',children:`${difference(detail.ticket.originalGross, detail.ticket.finalGross)} / ${difference(detail.ticket.originalTare, detail.ticket.finalTare)}`},
        {key:'source',label:'毛重／皮重来源',children:`${detail.ticket.grossSource || '—'} / ${detail.ticket.tareSource || '—'}`}, {key:'adjustment',label:'调整备注',children:detail.ticket.adjustmentRemark || '—'},
        {key:'adjuster',label:'调整人',children:detail.ticket.adjustedBy || '—'}, {key:'adjustedAt',label:'调整时间',children:detail.ticket.adjustedAt ? formatDateTime(detail.ticket.adjustedAt) : '—'},
        {key:'first',label:'首次称重',children:formatDateTime(detail.ticket.firstConfirmedAt)}, {key:'second',label:'二次称重',children:formatDateTime(detail.ticket.secondConfirmedAt)},
        {key:'driver',label:'司机／电话',children:`${detail.ticket.driver || '—'} / ${detail.ticket.driverPhone || '—'}`}, {key:'contact',label:'联系人／电话',children:`${detail.ticket.contactName || '—'} / ${detail.ticket.contactPhone || '—'}`},
        {key:'issuer',label:'出单人',children:detail.ticket.issuerName}, {key:'issued',label:'出单时间',children:formatDateTime(detail.ticket.issuedAt)},
        {key:'void',label:'作废原因',children:detail.voidReason || '—'}, {key:'voidedAt',label:'作废时间',children:detail.voidedAt ? formatDateTime(detail.voidedAt) : '—'},
      ]} />}
    </Modal>
  </>;
}
