import { useState } from 'react';
import { Alert, Button, DatePicker, Descriptions, Input, Modal, Select, Space, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { useListUrlState } from '../../hooks/useListUrlState';
import { getApiErrorMessage } from '../../lib/api/errors';
import { tickets, type Ticket, type TicketRecord } from '../../features/weighbridge/api';
import { formatBeijingTime } from '../../features/weighbridge/time';
import styles from './TicketsPage.module.css';

const config = { filters: { entryType: ['manual_supplement', 'mobile_direct', 'mobile_scan'], siteCode: 'text', direction: ['inbound', 'outbound'], status: ['valid', 'void'], from: 'text', to: 'text', materialCode: 'text', partyCode: 'text' }, sortKeys: [], pageSizeOptions: [10, 20, 50, 100], defaultPageSize: 10 } as const;
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
function dateValue(value?: string) {
  return value && dayjs(value).isValid() ? dayjs(value) : null;
}
function finalNet(ticket: Ticket): string {
  return ticket.finalNet || difference(ticket.finalGross, ticket.finalTare);
}
function formatRate(rateBp: number | null | undefined): string {
  return (Number(rateBp ?? 0) / 100).toFixed(2).replace(/\.?0+$/, '');
}
function adjustmentModeLabel(mode: string, rateBp: number | null | undefined): string {
  return mode === 'percent' ? `按比例 ${formatRate(rateBp)}%` : '按吨';
}
function formatAdjustment(ticket: Ticket): string {
  if (!ticket.netAdjustment || Number(ticket.netAdjustment) === 0) return '—';
  const items = ticket.netAdjustments;
  if (items) {
    if (items.length === 0) return '—';
    if (items.length > 1) return `${ticket.netAdjustment} 吨（多项调整）`;
    return `${ticket.netAdjustment} 吨（${items[0].categoryName || items[0].category || '—'}）`;
  }
  const category = ticket.netAdjustmentCategoryName || ticket.netAdjustmentCategory || '—';
  return `${ticket.netAdjustment} 吨（${category}）`;
}
function formatAdjustmentMode(ticket: Ticket): string {
  if (!ticket.netAdjustment || Number(ticket.netAdjustment) === 0) return '—';
  const items = ticket.netAdjustments;
  if (items) {
    if (items.length === 0) return '—';
    if (items.length > 1) return '多项调整';
    return adjustmentModeLabel(items[0].mode, items[0].rateBp);
  }
  if (ticket.netAdjustmentMode === 'percent') return `按比例 ${formatRate(ticket.netAdjustmentRateBp)}%`;
  return '按吨';
}
const baseColumns: ColumnsType<TicketRecord> = [
  { title: '厂区编码', dataIndex: 'siteCode', key: 'siteCode' },
  { title: '单号', key: 'ticketNo', render: (_, row) => <Space size={4} orientation="vertical">
    {row.ticket.ticketNo}
    {row.ticket.entryType === 'manual_supplement' && <Tag color="blue">人工补单</Tag>}
    {row.ticket.entryType === 'mobile_direct' && <Tag color="orange">手机直出</Tag>}
    {row.ticket.entryType === 'mobile_scan' && <Tag color="green">手机扫码</Tag>}
  </Space> },
  { title: '车牌', key: 'plate', render: (_, row) => row.ticket.plate },
  { title: '方向', key: 'direction', render: (_, row) => row.ticket.direction === 'inbound' ? '入厂卸货' : '出厂装货' },
  { title: '物料', key: 'material', render: (_, row) => [row.ticket.materialName, row.ticket.materialSpec].filter(Boolean).join(' / ') },
  { title: '供收方', key: 'party', render: (_, row) => row.ticket.partyName },
  { title: '毛重（吨）', key: 'gross', render: (_, row) => row.ticket.finalGross },
  { title: '皮重（吨）', key: 'tare', render: (_, row) => row.ticket.finalTare },
  { title: '净重（吨）', key: 'net', render: (_, row) => finalNet(row.ticket) },
  { title: '状态', dataIndex: 'status', key: 'status', render: (v: string) => <Tag color={v === 'valid' ? 'green' : 'red'}>{v === 'valid' ? '有效' : '作废'}</Tag> },
  { title: '出单时间', key: 'issuedAt', render: (_, row) => formatBeijingTime(row.ticket.issuedAt) },
];
export default function TicketsPage() {
  const { state, actions } = useListUrlState(config);
  const [keyword, setKeyword] = useState(state.keyword);
  const [detail, setDetail] = useState<TicketRecord | null>(null);
  const columns: ColumnsType<TicketRecord> = [...baseColumns, { title: '操作', key: 'actions', render: (_, row) => <Button type="link" onClick={() => setDetail(row)}>详情</Button> }];
  const params = { page: state.page, pageSize: state.pageSize, keyword: state.keyword || undefined, ...state.filters };
  const list = useQuery({ queryKey: ['weighbridge', 'tickets', params], queryFn: () => tickets(params) });
  const originalTicketNo = detail?.ticket.previousTicketNo;
  const manualSupplement = detail?.ticket.entryType === 'manual_supplement';
  const actualSecond = manualSupplement ? detail?.ticket.secondWeighedAt : detail?.ticket.secondConfirmedAt;
  return <>
    <PageHeader title="过磅单查询" description="查看各厂已同步的过磅单。" />
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <div className={styles.filters} role="group" aria-label="筛选条件">
        <Input.Search className={styles.keyword} aria-label="单号或车牌" placeholder="单号/车牌" value={keyword} onChange={(e) => setKeyword(e.target.value)} onSearch={(v) => actions.setKeyword(v)} allowClear />
        <Input className={styles.field} aria-label="厂区编码" placeholder="厂区编码" value={state.filters.siteCode ?? ''} onChange={(e) => actions.setFilter('siteCode', e.target.value)} />
        <DatePicker className={styles.date} aria-label="开始日期" placeholder="出单开始日期" format="YYYY-MM-DD" allowClear value={dateValue(state.filters.from)} onChange={(value) => actions.setFilter('from', value ? value.format('YYYY-MM-DD') : '')} />
        <DatePicker className={styles.date} aria-label="结束日期" placeholder="出单结束日期" format="YYYY-MM-DD" allowClear value={dateValue(state.filters.to)} onChange={(value) => actions.setFilter('to', value ? value.format('YYYY-MM-DD') : '')} />
        <Input className={styles.field} aria-label="物料编码" placeholder="物料编码" value={state.filters.materialCode ?? ''} onChange={(e) => actions.setFilter('materialCode', e.target.value)} />
        <Input className={styles.field} aria-label="供收方编码" placeholder="供收方编码" value={state.filters.partyCode ?? ''} onChange={(e) => actions.setFilter('partyCode', e.target.value)} />
        <Select className={styles.select} aria-label="方向" placeholder="方向" allowClear value={state.filters.direction || undefined} onChange={(v) => actions.setFilter('direction', v)} options={[{value:'inbound',label:'入厂卸货'},{value:'outbound',label:'出厂装货'}]} />
        <Select className={styles.select} aria-label="单据类型" placeholder="单据类型" allowClear value={state.filters.entryType || undefined} onChange={(v) => actions.setFilter('entryType', v)} options={[{value:'manual_supplement',label:'人工补单'},{value:'mobile_direct',label:'手机直出'},{value:'mobile_scan',label:'手机扫码'}]} />
        <Select className={styles.select} aria-label="状态" placeholder="状态" allowClear value={state.filters.status || undefined} onChange={(v) => actions.setFilter('status', v)} options={[{value:'valid',label:'有效'},{value:'void',label:'作废'}]} />
        <Button className={styles.reset} onClick={() => { actions.reset(); setKeyword(''); }}>重置</Button>
      </div>
      {list.isError && <Alert type="error" message={`单据加载失败：${getApiErrorMessage(list.error)}`} action={<Button onClick={() => void list.refetch()}>重试</Button>} />}
      <DataTable tableKey="weighbridge-tickets" rowKey={(row) => `${row.siteCode}:${row.ticket.ticketNo}`} columns={columns} dataSource={list.data?.items ?? []} total={list.data?.total ?? 0} page={state.page} pageSize={state.pageSize} onPageChange={actions.setPage} loading={list.isLoading} onRefresh={() => void list.refetch()} />
    </Space>
    <Modal title="过磅单详情" open={!!detail} onCancel={() => setDetail(null)} footer={<Button onClick={() => setDetail(null)}>关闭</Button>} width={800}>
      {detail && <div className={styles.detail}>
        <div className={styles.overview}>
          <div><Typography.Text strong copyable={{ text: detail.ticket.ticketNo }}>{detail.ticket.ticketNo}</Typography.Text> <Tag color={detail.status === 'valid' ? 'green' : 'red'}>{detail.status === 'valid' ? '有效' : '作废'}</Tag>
            {manualSupplement && <Tag color="blue">人工补单</Tag>}
            {originalTicketNo && <Tag>重开单</Tag>}
          </div>
          <div className={styles.overviewMeta}>{detail.ticket.title} · {detail.ticket.direction === 'inbound' ? '入厂卸货' : '出厂装货'} · {detail.ticket.plate}</div>
        </div>
        <section className={styles.timeline} aria-label="单据时间（北京时间）">
          <div className={styles.timelineHeading}>北京时间</div>
          <dl>
            <div><dt>{manualSupplement ? '实际回磅时间' : '回磅确认时间'}</dt><dd>{formatBeijingTime(actualSecond)}</dd></div>
            <div><dt>出单时间</dt><dd>{formatBeijingTime(detail.ticket.issuedAt)}</dd></div>
            {manualSupplement && <div><dt>对账归属日</dt><dd>{formatBeijingTime(actualSecond, 'day')}</dd></div>}
          </dl>
        </section>
        {(detail.status === 'void' || originalTicketNo) && (
          <section className={styles.review} aria-label="作废与重开核对">
            <h3>作废与重开核对</h3>
            <Descriptions size="small" layout="vertical" column={{ xs: 1, sm: 3 }} items={[
              ...(detail.status === 'void' ? [
                { key: 'reason', label: '作废原因', children: detail.voidReason || '—' },
                { key: 'operator', label: '作废操作人', children: detail.voidedBy || '—' },
                { key: 'voidedAt', label: '作废时间', children: formatBeijingTime(detail.voidedAt) },
              ] : []),
              ...(originalTicketNo ? [{
                key: 'previous', label: '关联原单号', span: 'filled' as const,
                children: <Typography.Text copyable={{ text: originalTicketNo }}>{originalTicketNo}</Typography.Text>,
              }] : []),
            ]} />
          </section>
        )}
        <section className={styles.weights} aria-label="重量对照">
          <h3>重量对照 <span>单位：吨</span></h3>
          <div className={styles.tableWrap}><table className={styles.weightTable}>
            <thead><tr><th scope="col">重量</th><th scope="col">原始值</th><th scope="col">最终值</th><th scope="col">差额（原始值 − 最终值）</th>{originalTicketNo && <th scope="col">上版最终值</th>}</tr></thead>
            <tbody>{[
              { label: '毛重', original: detail.ticket.originalGross, final: detail.ticket.finalGross, previous: detail.ticket.previousFinalGross },
              { label: '皮重', original: detail.ticket.originalTare, final: detail.ticket.finalTare, previous: detail.ticket.previousFinalTare },
              { label: '净重', original: difference(detail.ticket.originalGross, detail.ticket.originalTare), final: finalNet(detail.ticket), previous: detail.ticket.previousFinalNet },
            ].map((row) => <tr key={row.label}><th scope="row">{row.label}</th><td>{weight(row.original)}</td><td className={styles.finalWeight}>{weight(row.final)}</td><td>{difference(row.original, row.final)}</td>{originalTicketNo && <td>{row.previous != null ? weight(row.previous) : '—'}</td>}</tr>)}</tbody>
          </table></div>
          <div className={styles.adjustment}>调整备注：{detail.ticket.adjustmentRemark || '—'} {' · '}调整人：{detail.ticket.adjustedBy || '—'} {' · '}调整时间：{detail.ticket.adjustedAt ? formatBeijingTime(detail.ticket.adjustedAt) : '—'}</div>
          <div className={styles.adjustment}>净重调整／方式：{formatAdjustment(detail.ticket)} / {formatAdjustmentMode(detail.ticket)}</div>
          {originalTicketNo && <div className={styles.adjustment}>上版净重调整（吨） {detail.ticket.previousNetAdjustment != null ? weight(detail.ticket.previousNetAdjustment) : '—'}</div>}
        </section>
        {detail.ticket.netAdjustments && detail.ticket.netAdjustments.length > 0 && (
          <section className={styles.section} aria-label="净重调整明细">
            <h3>净重调整明细</h3>
            <div className={styles.tableWrap}><table className={styles.weightTable}>
              <thead><tr><th scope="col">序号</th><th scope="col">方式</th><th scope="col">折算重量（吨）</th><th scope="col">类别</th><th scope="col">备注</th></tr></thead>
              <tbody>{detail.ticket.netAdjustments.map((item, index) => (
                <tr key={`${index}:${item.category}`}><th scope="row">{index + 1}</th><td>{adjustmentModeLabel(item.mode, item.rateBp)}</td><td>{weight(item.amount)}</td><td>{item.categoryName || item.category || '—'}</td><td>{item.remark || '—'}</td></tr>
              ))}</tbody>
            </table></div>
          </section>
        )}
        <section className={styles.section}><h3>业务信息</h3><Descriptions size="small" layout="vertical" column={{ xs: 1, sm: 2 }} items={[
          {key:'material',label:'物料',children:`${detail.ticket.materialName} ${detail.ticket.materialSpec} (${detail.ticket.materialCode})`}, {key:'party',label:'供收方',children:`${detail.ticket.partyName} (${detail.ticket.partyCode})`},
          {key:'site',label:'出单厂区编码',children:detail.siteCode},
        ]} /></section>
        <section className={styles.section}><h3>称重信息</h3><Descriptions size="small" layout="vertical" column={{ xs: 1, sm: 2 }} items={[
          {key:'entryType',label:'单据类型',children:detail.ticket.entryType === 'manual_supplement' ? '人工补单' : detail.ticket.entryType === 'mobile_direct' ? '手机直出' : detail.ticket.entryType === 'mobile_scan' ? '手机扫码' : '普通单据'},
          ...(detail.ticket.entryType === 'manual_supplement' ? [{key:'actualFirst',label:'实际首磅时间',children:detail.ticket.firstWeighedAt ? formatBeijingTime(detail.ticket.firstWeighedAt) : '—'}] : []),
          {key:'first',label:'首次称重',children:formatBeijingTime(detail.ticket.firstConfirmedAt)},
          ...(manualSupplement ? [{key:'second',label:'二次称重确认',children:formatBeijingTime(detail.ticket.secondConfirmedAt)}] : []),
          {key:'source',label:'毛重／皮重来源',children:`${source(detail.ticket.grossSource)} / ${source(detail.ticket.tareSource)}`}, {key:'driver',label:'司机／电话',children:`${detail.ticket.driver || '—'} / ${detail.ticket.driverPhone || '—'}`},
        ]} /></section>
        <section className={styles.section}><h3>出单信息</h3><Descriptions size="small" layout="vertical" column={{ xs: 1, sm: 2 }} items={[
          {key:'contact',label:'联系人／电话',children:`${detail.ticket.contactName || '—'} / ${detail.ticket.contactPhone || '—'}`}, {key:'issuer',label:'出单人',children:detail.ticket.issuerName},
        ]} /></section>
      </div>}
    </Modal>
  </>;
}
