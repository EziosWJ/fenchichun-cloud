import { useState } from 'react';
import { Alert, Button, Collapse, Descriptions, Input, Modal, Select, Space, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { FilterField } from '../../components/SearchFilterBar';
import { useListUrlState } from '../../hooks/useListUrlState';
import { getApiErrorMessage } from '../../lib/api/errors';
import { tickets, totals, type Ticket, type TicketRecord } from '../../features/weighbridge/api';
import { formatDateTime } from '../../utils/format';
import styles from './TicketsPage.module.css';

const config = { filters: { siteCode: 'text', direction: ['inbound', 'outbound'], status: ['valid', 'void'], from: 'text', to: 'text', materialCode: 'text', partyCode: 'text' }, sortKeys: [], pageSizeOptions: [10, 20, 50, 100], defaultPageSize: 10 } as const;
function difference(a: string, b: string): string {
  const milli = (value: string) => { const negative = value.startsWith('-'); const [whole, fractional = ''] = (negative ? value.slice(1) : value).split('.'); const result = BigInt(whole) * 1000n + BigInt((fractional + '000').slice(0, 3)); return negative ? -result : result; };
  const value = milli(a) - milli(b);
  const absolute = value < 0n ? -value : value;
  const fraction = (absolute % 1000n).toString().padStart(3, '0');
  return `${value < 0n ? '-' : ''}${absolute / 1000n}.${fraction}`;
}
function weight(value: string): string {
  const [whole, fractional = ''] = value.split('.');
  return `${whole}.${(fractional + '000').slice(0, 3)}`;
}
function source(value: string): string {
  return ({ manual: '手工录入', collected: '设备采集' } as Record<string, string>)[value] || value || '—';
}
function finalNet(ticket: Ticket): string {
  return ticket.finalNet || difference(ticket.finalGross, ticket.finalTare);
}
function formatAdjustment(ticket: Ticket): string {
  if (!ticket.netAdjustment || Number(ticket.netAdjustment) === 0) return '—';
  const category = ticket.netAdjustmentCategoryName || ticket.netAdjustmentCategory || '—';
  return `${ticket.netAdjustment} 吨（${category}）`;
}
function formatAdjustmentMode(ticket: Ticket): string {
  if (!ticket.netAdjustment || Number(ticket.netAdjustment) === 0) return '—';
  if (ticket.netAdjustmentMode === 'percent') {
    return `按比例 ${(Number(ticket.netAdjustmentRateBp ?? 0) / 100).toFixed(2).replace(/\.?0+$/, '')}%`;
  }
  return '按吨';
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
  { title: '净重（吨）', key: 'net', render: (_, row) => finalNet(row.ticket) },
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
      <Space wrap align="end">
        <FilterField label="单号或车牌" wide>
          <Input.Search aria-label="单号或车牌" placeholder="单号或车牌" value={keyword} onChange={(e) => setKeyword(e.target.value)} onSearch={(v) => actions.setKeyword(v)} allowClear />
        </FilterField>
        <FilterField label="厂区编码">
          <Input aria-label="厂区编码" placeholder="厂区编码" value={state.filters.siteCode ?? ''} onChange={(e) => actions.setFilter('siteCode', e.target.value)} />
        </FilterField>
        <FilterField label="开始日期" date>
          <Input aria-label="开始日期" type="date" value={state.filters.from ?? ''} onChange={(e) => actions.setFilter('from', e.target.value)} />
        </FilterField>
        <FilterField label="结束日期" date>
          <Input aria-label="结束日期" type="date" value={state.filters.to ?? ''} onChange={(e) => actions.setFilter('to', e.target.value)} />
        </FilterField>
        <FilterField label="物料编码">
          <Input aria-label="物料编码" placeholder="物料编码" value={state.filters.materialCode ?? ''} onChange={(e) => actions.setFilter('materialCode', e.target.value)} />
        </FilterField>
        <FilterField label="供收方编码">
          <Input aria-label="供收方编码" placeholder="供收方编码" value={state.filters.partyCode ?? ''} onChange={(e) => actions.setFilter('partyCode', e.target.value)} />
        </FilterField>
        <FilterField label="方向">
          <Select aria-label="方向" placeholder="全部方向" allowClear value={state.filters.direction || undefined} onChange={(v) => actions.setFilter('direction', v)} options={[{value:'inbound',label:'入厂卸货'},{value:'outbound',label:'出厂装货'}]} />
        </FilterField>
        <FilterField label="状态">
          <Select aria-label="状态" placeholder="全部状态" allowClear value={state.filters.status || undefined} onChange={(v) => actions.setFilter('status', v)} options={[{value:'valid',label:'有效'},{value:'void',label:'作废'}]} />
        </FilterField>
        <Button onClick={() => { actions.reset(); setKeyword(''); }}>重置</Button>
      </Space>
      {summary.isError ? <Alert type="error" message={`统计加载失败：${getApiErrorMessage(summary.error)}`} /> : <Typography.Text type="secondary">{summary.isLoading ? '正在统计…' : (summary.data?.length ? summary.data.map((v) => `${v.direction === 'inbound' ? '入厂卸货' : '出厂装货'}，物料 ${v.materialCode}，供收方 ${v.partyCode}：${v.count} 趟，${v.netMilliTonne / 1000} 吨`).join('；') : '当前筛选条件下暂无有效单')}</Typography.Text>}
      {list.isError && <Alert type="error" message={`单据加载失败：${getApiErrorMessage(list.error)}`} action={<Button onClick={() => void list.refetch()}>重试</Button>} />}
      <DataTable tableKey="weighbridge-tickets" rowKey={(row) => `${row.siteCode}:${row.ticket.ticketNo}`} columns={columns} dataSource={list.data?.items ?? []} total={list.data?.total ?? 0} page={state.page} pageSize={state.pageSize} onPageChange={actions.setPage} loading={list.isLoading} onRefresh={() => { void list.refetch(); void summary.refetch(); }} />
    </Space>
    <Modal title="过磅单详情" open={!!detail} onCancel={() => setDetail(null)} footer={<Button onClick={() => setDetail(null)}>关闭</Button>} width={800}>
      {detail && <div className={styles.detail}>
        <div className={styles.overview}>
          <div><Typography.Text strong copyable={{ text: detail.ticket.ticketNo }}>{detail.ticket.ticketNo}</Typography.Text> <Tag color={detail.status === 'valid' ? 'green' : 'default'}>{detail.status === 'valid' ? '有效' : '作废'}</Tag></div>
          <div className={styles.overviewMeta}>{detail.ticket.title} · {detail.ticket.direction === 'inbound' ? '入厂卸货' : '出厂装货'} · {detail.ticket.plate}</div>
        </div>
        <section className={styles.weights} aria-label="重量对照">
          <h3>重量对照 <span>单位：吨</span></h3>
          <div className={styles.tableWrap}><table className={styles.weightTable}>
            <thead><tr><th scope="col">重量</th><th scope="col">原始值</th><th scope="col">最终值</th><th scope="col">差额（原始值 − 最终值）</th></tr></thead>
            <tbody>{[
              { label: '毛重', original: detail.ticket.originalGross, final: detail.ticket.finalGross },
              { label: '皮重', original: detail.ticket.originalTare, final: detail.ticket.finalTare },
              { label: '净重', original: difference(detail.ticket.originalGross, detail.ticket.originalTare), final: finalNet(detail.ticket) },
            ].map((row) => <tr key={row.label}><th scope="row">{row.label}</th><td>{weight(row.original)}</td><td className={styles.finalWeight}>{weight(row.final)}</td><td>{difference(row.original, row.final)}</td></tr>)}</tbody>
          </table></div>
          <div className={styles.adjustment}>调整备注：{detail.ticket.adjustmentRemark || '—'} {' · '}调整人：{detail.ticket.adjustedBy || '—'} {' · '}调整时间：{detail.ticket.adjustedAt ? formatDateTime(detail.ticket.adjustedAt) : '—'}</div>
          <div className={styles.adjustment}>净重调整／方式：{formatAdjustment(detail.ticket)} / {formatAdjustmentMode(detail.ticket)}</div>
        </section>
        <section className={styles.section}><h3>业务信息</h3><Descriptions size="small" layout="vertical" column={{ xs: 1, sm: 2 }} items={[
          {key:'material',label:'物料',children:`${detail.ticket.materialName} ${detail.ticket.materialSpec} (${detail.ticket.materialCode})`}, {key:'party',label:'供收方',children:`${detail.ticket.partyName} (${detail.ticket.partyCode})`},
          {key:'site',label:'出单厂区编码',children:detail.siteCode}, {key:'previous',label:'关联原单',children:detail.ticket.previousTicketNo || '—'},
        ]} /></section>
        <section className={styles.section}><h3>称重信息</h3><Descriptions size="small" layout="vertical" column={{ xs: 1, sm: 2 }} items={[
          {key:'first',label:'首次称重',children:formatDateTime(detail.ticket.firstConfirmedAt)}, {key:'second',label:'二次称重',children:formatDateTime(detail.ticket.secondConfirmedAt)},
          {key:'source',label:'毛重／皮重来源',children:`${source(detail.ticket.grossSource)} / ${source(detail.ticket.tareSource)}`}, {key:'driver',label:'司机／电话',children:`${detail.ticket.driver || '—'} / ${detail.ticket.driverPhone || '—'}`},
        ]} /></section>
        <section className={styles.section}><h3>出单信息</h3><Descriptions size="small" layout="vertical" column={{ xs: 1, sm: 2 }} items={[
          {key:'contact',label:'联系人／电话',children:`${detail.ticket.contactName || '—'} / ${detail.ticket.contactPhone || '—'}`}, {key:'issuer',label:'出单人',children:detail.ticket.issuerName}, {key:'issued',label:'出单时间',children:formatDateTime(detail.ticket.issuedAt)},
        ]} /></section>
        {detail.status === 'void' && <section className={styles.section}><h3>作废信息</h3><Descriptions size="small" layout="vertical" column={{ xs: 1, sm: 2 }} items={[
          {key:'void',label:'作废原因',children:detail.voidReason || '—'}, {key:'voidedAt',label:'作废时间',children:detail.voidedAt ? formatDateTime(detail.voidedAt) : '—'},
        ]} /></section>}
        <Collapse size="small" items={[{ key: 'previousWeights', label: '上版重量', children: <Descriptions size="small" column={{ xs: 1, sm: 2 }} items={[
          {key:'gross',label:'上版最终毛重（吨）',children:detail.ticket.previousFinalGross != null ? weight(detail.ticket.previousFinalGross) : '—'}, {key:'tare',label:'上版最终皮重（吨）',children:detail.ticket.previousFinalTare != null ? weight(detail.ticket.previousFinalTare) : '—'},
          {key:'previousNet',label:'上版最终净重／净重调整（吨）',children:detail.ticket.previousFinalNet ? `${detail.ticket.previousFinalNet} / ${detail.ticket.previousNetAdjustment || '0'}` : '—'},
        ]} /> }]} />
      </div>}
    </Modal>
  </>;
}
