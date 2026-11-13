import { useState } from 'react';
import { Alert, App, Button, Card, Descriptions, Empty, Input, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  CalendarClock,
  ClipboardList,
  Droplets,
  FileSignature,
  FlaskConical,
  Gauge,
  Phone,
  StickyNote,
  UserRound,
  Users,
  Wheat,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { ticketCandidates, tripAction, tripDetail, stageLabel, type TripAction, type TripCommand } from '../../features/grain-intake/api';
import { granaries } from '../../features/granary/api';
import { PageHeader } from '../../components/PageHeader';
import { getApiErrorMessage } from '../../lib/api/errors';
import { usePermissions } from '../../hooks/usePermissions';
import { formatDateTime } from '../../utils/format';
import { formatTonnes, subtractTonnes } from '../../utils/weight';
import TripEditor from './TripEditor';
import styles from './TripWorkspace.module.css';

type NextStep = { tab?: 'inspections' | 'weighing' | 'exit'; title: string; description: string };

function formatMetric(value: string): string {
  if (!value) return '—';
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('zh-CN', { maximumFractionDigits: 6 }) : value;
}

export default function TripWorkspace({ gate = false }: { gate?: boolean }) {
  const { id } = useParams();
  const key = Number(id);
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const client = useQueryClient();
  const { has } = usePermissions();
  const canEditTrip = has('grain-intake:trip-edit');
  const canVisual = has('grain-intake:visual');
  const canUnload = has('grain-intake:unload');
  const canTicket = has('grain-intake:ticket');
  const canIssue = has('grain-intake:issue-permit');
  const canApprove = has('grain-intake:approve-permit');
  const canRelease = has('grain-intake:release');
  const canInspect = has('laboratory:inspect');
  const query = useQuery({ queryKey: ['grain-intake', 'detail', key, gate], queryFn: () => tripDetail(key, gate), enabled: Number.isSafeInteger(key) && key > 0 });
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState('inspections');
  const [actionError, setActionError] = useState('');
  const [location, setLocation] = useState('');
  const [visualConclusion, setVisualConclusion] = useState<'accept' | 'reject'>('accept');
  const [visualReason, setVisualReason] = useState('');
  const [ticketNo, setTicketNo] = useState('');
  const granaryQuery = useQuery({
    queryKey: ['granaries', 'enabled'],
    queryFn: () => granaries({ enabled: true }),
    enabled: !!query.data,
  });
  const ticketOptions = useQuery({
    queryKey: ['grain-intake', 'ticket-candidates', key, query.data?.trip.version],
    queryFn: () => ticketCandidates(key),
    enabled: !!query.data && !gate && canTicket && !query.data.permit && !query.data.trip.exitedAt && !query.data.trip.ticketId && !!query.data.trip.unloadedAt,
  });
  const refresh = () => { void client.invalidateQueries({ queryKey: ['grain-intake'] }); void client.invalidateQueries({ queryKey: ['laboratory'] }); };
  const action = useMutation({
    mutationFn: ({ kind, input }: { kind: TripAction; input?: TripCommand }) => tripAction(query.data!.trip, kind, input),
    onSuccess: () => { setActionError(''); message.success('办理成功'); refresh(); },
    onError: (error) => { const text = getApiErrorMessage(error); setActionError(text); message.error(text); refresh(); },
  });
  if (!Number.isSafeInteger(key) || key <= 0) return <Alert type="error" title="流转单地址无效" />;
  if (query.isLoading) return <Card loading />;
  if (query.isError) return <Alert type="error" title={getApiErrorMessage(query.error)} action={<Button onClick={() => void query.refetch()}>重试</Button>} />;
  if (!query.data) return <Empty description="未找到流转单" />;
  const { trip, permit, ticket, events, ticketWarning } = query.data;
  const effective = query.data.inspections.find((i) => i.id === trip.effectiveInspectionId && i.status === 'confirmed');
  const selectedTicket = ticketOptions.data?.find((c) => c.ticketNo === ticketNo);
  const unloadLocked = !!(trip.unloadedAt || permit || trip.exitedAt);
  const labLocked = !!(trip.ticketId || permit || trip.exitedAt);
  const visual = trip.inspectionMethod === 'visual';
  const activeTab = visual && tab === 'inspections' ? 'weighing' : tab;
  const ask = (title: string, kind: TripAction, input?: TripCommand, content?: string) => modal.confirm({ title, content, okText: '确认', cancelText: '取消', onOk: () => action.mutateAsync({ kind, input }).then(() => undefined) });
  const conclusionText = effective ? (effective.conclusion === 'accept' ? '接收' : effective.conclusion === 'reject' ? '拒收' : '—') : '—';
  const nextStep: NextStep | null = (() => {
    if (trip.stage === 'blocked' || trip.exitedAt) return null;
    if (trip.stage === 'pending_inspection') {
      return visual
        ? { title: '下一步：记录目测结果', description: '目测记录是本趟的检验依据，确认后不能修改。' }
        : { tab: 'inspections', title: '下一步：录入化验单', description: '录入化验结果后自动生效。' };
    }
    if (trip.stage === 'pending_unload') return { tab: 'weighing', title: '下一步：确认现场卸货', description: '在现场首磅及卸货完成后，填写实际卸货地点并确认。' };
    if (trip.stage === 'pending_ticket') return { tab: 'weighing', title: '下一步：关联正式磅单', description: '磅单联网同步至云端后，选择厂区、车牌、货品、供应商一致的单据。' };
    if (trip.stage === 'ready') {
      return trip.ticketConfirmedAt
        ? { tab: 'exit', title: '下一步：开具出门证', description: '实际卸货和有效磅单就绪后开具出门证。' }
        : { tab: 'weighing', title: '下一步：确认过磅单关联', description: '过磅端已关联磅单，请核对厂区、车牌、货品和供应商是否一致。' };
    }
    if (trip.stage === 'permit_pending') return { tab: 'exit', title: '下一步：审批出门证', description: '审批通过后，仍需门卫在实际放行时确认出厂。' };
    if (trip.stage === 'permit_approved') return { tab: 'exit', title: '下一步：门卫确认出厂', description: '核对车辆与出门证后确认出厂，确认后本趟凭据不能再次使用。' };
    if (trip.stage === 'rejected') return { tab: 'exit', title: '下一步：核验拒收依据并确认出厂', description: visual ? '核对目测拒收结论与说明后，确认车辆实际出厂。' : '核对生效化验单的拒收结论与原因后，确认车辆实际出厂。' };
    return null;
  })();
  const inspection = effective;
  const labView = <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
    {inspection ? <Descriptions size="small" column={{ xs: 1, sm: 2, lg: 3 }} items={[
      { key: 'number', label: '化验单号', children: inspection.number },
      { key: 'conclusion', label: '结论', children: inspection.conclusion === 'accept' ? <Tag color="green">接收</Tag> : <Tag color="red">拒收</Tag> },
      { key: 'confirmed', label: '化验时间', children: formatDateTime(inspection.confirmedAt ?? inspection.createdAt) },
      { key: 'moisture', label: '水分（%）', children: inspection.moisture || '—' },
      { key: 'bulkDensity', label: '容量（g/L）', children: inspection.bulkDensity || '—' },
      { key: 'reason', label: '拒收原因', children: inspection.reason || '—' },
    ]} /> : <span style={{ color: 'var(--ant-color-text-secondary)' }}>尚未录入化验结果</span>}
    {!gate && canInspect && !labLocked && !inspection && <Button type="primary" onClick={() => navigate(`/laboratory/inspections?keyword=${encodeURIComponent(trip.number)}`)}>去录入化验结果</Button>}
  </Space>;
  return <>
    <PageHeader
      title={<Typography.Text copyable={{ text: trip.number, tooltips: ['复制流转单号', '已复制'] }}>{gate ? `出厂核验 · ${trip.number}` : trip.number}</Typography.Text>}
      meta={<Tag color={trip.stage === 'blocked' ? 'red' : trip.exitedAt ? 'green' : 'blue'}>{stageLabel(trip.stage, trip.inspectionMethod)}</Tag>}
      onBack={() => navigate(gate ? '/grain-intake/permits' : '/grain-intake/trips')}
    />
    <div className="pageStack" style={{ marginTop: 20, gap: 12 }}>
      {actionError && <Alert type="error" showIcon closable title="操作未完成" description={actionError} onClose={() => setActionError('')} />}
      {ticketWarning && <Alert type="warning" showIcon title="磅单需要核对" description={ticketWarning} />}
      {trip.stage === 'blocked' && <Alert type="error" title="当前依据已失效或存在冲突，暂停开证和放行，请核查磅单与化验记录。" />}
      {trip.exitedAt && <Alert type="success" title={`已于 ${formatDateTime(trip.exitedAt)} 确认出厂，本趟凭据不能再次使用。`} />}
      {nextStep && <Alert type={trip.stage === 'pending_unload' || trip.stage === 'pending_ticket' ? 'warning' : 'info'} showIcon title={nextStep.title} description={nextStep.description} action={nextStep.tab ? <Button size="small" onClick={() => { if (nextStep.tab) setTab(nextStep.tab); }}>去办理</Button> : undefined} />}
      <Card
        className={styles.summaryCard}
        title={<span className={styles.cardTitle}><ClipboardList size={16} aria-hidden />本趟摘要</span>}
        extra={!gate && canEditTrip && !permit && !trip.exitedAt ? <Button onClick={() => setEditing(true)}>更正登记</Button> : undefined}
      >
        <div className={styles.summary}>
          <div className={styles.identity}>
            <div className={styles.identityMain}>
              <span className={styles.materialIcon} aria-hidden><Wheat size={18} /></span>
              <div className={styles.identityText}>
                <strong className={styles.material}>{trip.materialName}</strong>
                <span className={styles.supplier}>
                  <Users size={13} aria-hidden />
                  <span className={styles.supplierLabel}>供应商</span>
                  {trip.partyName || <Tag color="orange">待核实</Tag>}
                </span>
              </div>
            </div>
            <div className={styles.identityMeta}>
              <span className={styles.metaItem}><Building2 size={14} aria-hidden />厂区 {trip.siteCode || '未配置'}</span>
              <span className={styles.metaItem}><CalendarClock size={14} aria-hidden />登记 {formatDateTime(trip.createdAt)}</span>
            </div>
          </div>
          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <span className={styles.infoIcon} aria-hidden><UserRound size={15} /></span>
              <div className={styles.infoBody}>
                <span className={styles.infoLabel}>司机 / 车牌</span>
                <div className={styles.driverLine}>
                  <strong className={styles.infoValue}>{trip.driver || '—'}</strong>
                  <span className={styles.plateSmall}>{trip.plate}</span>
                </div>
              </div>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoIcon} aria-hidden><Phone size={15} /></span>
              <div className={styles.infoBody}><span className={styles.infoLabel}>联系电话</span><strong className={styles.infoValue}>{trip.driverPhone || '—'}</strong></div>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoIcon} aria-hidden><FileSignature size={15} /></span>
              <div className={styles.infoBody}><span className={styles.infoLabel}>合同编号</span><strong className={styles.infoValue}>{trip.contractNo || '—'}</strong></div>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoIcon} aria-hidden><FlaskConical size={15} /></span>
              <div className={styles.infoBody}><span className={styles.infoLabel}>检验方式</span><strong className={styles.infoValue}>{visual ? '目测' : '化验'}</strong></div>
            </div>
          </div>
          {trip.remark && <div className={styles.remarkCard}>
            <span className={styles.remarkIcon} aria-hidden><StickyNote size={15} /></span>
            <div className={styles.remarkBody}>
              <span className={styles.remarkLabel}>备注</span>
              <p className={styles.remarkText}>{trip.remark}</p>
            </div>
          </div>}
          <section className={styles.resultSection}>
            <div className={styles.resultSectionHead}>
              <span className={styles.resultSectionTitle}>{visual ? '目测结果' : '化验结果'}</span>
            </div>
            {visual ? (trip.visualInspectedAt ? <div className={`${styles.resultCard} ${trip.visualConclusion === 'accept' ? styles.resultAccept : styles.resultReject}`}>
              <div className={styles.resultTop}>
                <Tag color={trip.visualConclusion === 'accept' ? 'green' : 'red'}>{trip.visualConclusion === 'accept' ? '接收' : '拒收'}</Tag>
                <span className={styles.resultTime}><CalendarClock size={13} aria-hidden />{formatDateTime(trip.visualInspectedAt)}</span>
              </div>
              <p className={styles.resultReason}>{trip.visualReason || '未填写说明'}</p>
              <div className={styles.resultFacts}>
                <div className={styles.fact}><span>检查人</span><strong>{trip.visualInspectedBy ?? '—'}</strong></div>
              </div>
            </div> : !gate && canVisual ? <div className={styles.actionPanel}>
              <Space wrap>
                <Select aria-label="目测结论" value={visualConclusion} onChange={setVisualConclusion} options={[{ value: 'accept', label: '接收' }, { value: 'reject', label: '拒收' }]} />
                <Input aria-label="目测说明" placeholder={visualConclusion === 'reject' ? '请输入拒收原因' : '目测说明（选填）'} maxLength={2000} value={visualReason} onChange={(e) => setVisualReason(e.target.value)} style={{ minWidth: 320 }} />
                <Button type="primary" disabled={action.isPending || !trip.partyCode || (visualConclusion === 'reject' && !visualReason.trim())} onClick={() => ask('确认记录目测结果？', 'record-visual', { conclusion: visualConclusion, reason: visualReason }, '确认后不能修改，请核对货品与检查结论。')}>确认目测</Button>
                {!trip.partyCode && <span>请先核实供应商</span>}
              </Space>
            </div> : <Empty description="尚未记录目测结果" />) : (effective ? <div className={`${styles.resultCard} ${effective.conclusion === 'accept' ? styles.resultAccept : effective.conclusion === 'reject' ? styles.resultReject : ''}`}>
              <div className={styles.resultTop}>
                <div className={styles.resultHeadline}>
                  <Tag color={effective.conclusion === 'accept' ? 'green' : effective.conclusion === 'reject' ? 'red' : 'default'}>{conclusionText}</Tag>
                  <Typography.Text className={styles.resultNumber} copyable={{ text: effective.number, tooltips: ['复制化验单号', '已复制'] }}>{effective.number}</Typography.Text>
                </div>
                <span className={styles.resultTime}><CalendarClock size={13} aria-hidden />生效 {formatDateTime(trip.effectiveSelectedAt)}</span>
              </div>
              <div className={styles.metricGrid}>
                <div className={styles.metric}>
                  <span className={styles.metricLabel}><Droplets size={14} aria-hidden />水分</span>
                  <strong className={styles.metricValue}>{formatMetric(effective.moisture)}<small>%</small></strong>
                </div>
                <div className={styles.metric}>
                  <span className={styles.metricLabel}><Gauge size={14} aria-hidden />容量</span>
                  <strong className={styles.metricValue}>{formatMetric(effective.bulkDensity)}<small>g/L</small></strong>
                </div>
              </div>
              {effective.reason && <div className={styles.reasonBox}>
                <span>{effective.conclusion === 'reject' ? '拒收原因' : '说明'}</span>
                <p>{effective.reason}</p>
              </div>}
              {query.data.deductions.length > 0 && <div className={styles.deductions}>
                <span className={styles.deductionsLabel}>扣减规则</span>
                <div className={styles.deductionTags}>
                  {query.data.deductions.map((item) => <Tag key={`${item.ruleCode}-${item.ruleVersion}`}>
                    {item.categoryName}：{item.mode === 'amount' ? `${(item.amountMilliTonne / 1000).toFixed(3)} 吨` : `${((item.rateBp ?? 0) / 100).toFixed(2)}%`}
                    {item.basisValue ? `（${item.basisValue}）` : ''}
                  </Tag>)}
                </div>
              </div>}
            </div> : <div className={styles.resultEmpty}>
              <FlaskConical size={18} aria-hidden />
              <span>尚未录入化验结果</span>
            </div>)}
          </section>
        </div>
        <Tabs className={styles.tabs} activeKey={activeTab} onChange={setTab} items={[
        ...(visual ? [] : [{ key: 'inspections', label: '化验结果', children: <Space orientation="vertical" size="small" style={{ width: '100%' }}>
          {labView}
        </Space> }]),
        { key: 'weighing', label: '卸货与磅单', children: <Space orientation="vertical" size="small" style={{ width: '100%' }}>
          <Card size="small" title="现场卸货确认">
            {trip.unloadedAt ? <Descriptions size="small" column={{ xs: 1, sm: 2 }} items={[{ key: 'location', label: '实际卸货地点', children: trip.unloadingLocation }, { key: 'time', label: '确认时间', children: formatDateTime(trip.unloadedAt) }]} /> : <>
              {!gate && canUnload && !unloadLocked && trip.effectiveConclusion === 'accept' ? <Space.Compact style={{ width: '100%', maxWidth: 560, marginTop: 16 }}>
                <Select aria-label="实际卸货地点" placeholder="选择仓库" style={{ minWidth: 220 }} loading={granaryQuery.isLoading} value={location || undefined} onChange={(value?: string) => setLocation(value ?? '')} options={(granaryQuery.data ?? []).map((g) => ({ value: g.name, label: g.name }))} notFoundContent={granaryQuery.isLoading ? '加载中…' : '请先在仓库维护中添加'} />
                <Button type="primary" disabled={!location.trim() || action.isPending} onClick={() => ask('确认实际卸货完成？', 'confirm-unloading', { location }, '请确认现场已经完成首磅及卸货，地点填写准确。')}>确认卸货</Button>
              </Space.Compact> : <p style={{ marginTop: 16, marginBottom: 0 }}>待确认接收并完成现场卸货。</p>}
            </>}
          </Card>
          <Card size="small" title="关联正式磅单">
            {ticket ? <>
              <Descriptions size="small" column={{ xs: 1, sm: 2 }} items={[
              { key: 'number', label: '单号', children: ticket.ticket.ticketNo }, { key: 'status', label: '状态', children: ticket.status === 'valid' ? '有效' : '已作废' },
              { key: 'confirmed', label: '关联确认', children: trip.ticketConfirmedAt ? <Tag color="green">已确认</Tag> : <Tag color="orange">待确认</Tag> },
              { key: 'gross', label: '毛重（吨）', children: formatTonnes(ticket.ticket.finalGross) }, { key: 'tare', label: '皮重（吨）', children: formatTonnes(ticket.ticket.finalTare) },
              { key: 'actualNet', label: '实际净重（吨）', children: subtractTonnes(ticket.ticket.finalGross, ticket.ticket.finalTare) }, { key: 'net', label: '扣减后重量（吨）', children: formatTonnes(ticket.ticket.finalNet) },
              { key: 'first', label: '首磅时间', children: formatDateTime(ticket.ticket.firstConfirmedAt) }, { key: 'second', label: '回磅时间', children: formatDateTime(ticket.ticket.secondConfirmedAt) },
            ]} />
              {!trip.ticketConfirmedAt && canTicket && !permit && !trip.exitedAt && <Space style={{ marginTop: 12 }}>
                <Button type="primary" loading={action.isPending} onClick={() => ask('确认过磅单关联？', 'confirm-ticket', undefined, `${ticket.ticket.plate} · ${ticket.ticket.materialName} · 实际净重 ${subtractTonnes(ticket.ticket.finalGross, ticket.ticket.finalTare)} 吨 · 扣减后 ${formatTonnes(ticket.ticket.finalNet)} 吨`)}>确认过磅单关联</Button>
              </Space>}
            </> : <>
              {!gate && canTicket && !permit && !trip.exitedAt && <Space wrap style={{ marginTop: 16 }}>
                <Select
                  aria-label="选择正式磅单"
                  placeholder={trip.unloadedAt ? '选择已同步的正式磅单' : '请先确认卸货'}
                  style={{ minWidth: 420 }}
                  showSearch
                  optionFilterProp="label"
                  loading={ticketOptions.isLoading}
                  disabled={!trip.unloadedAt || action.isPending}
                  value={ticketNo || undefined}
                  onChange={(value?: string) => setTicketNo(value ?? '')}
                  options={(ticketOptions.data ?? []).map((c) => ({
                    value: c.ticketNo,
                    label: `${c.ticketNo}｜${c.plate}｜实际净重 ${subtractTonnes(c.finalGross, c.finalTare)} 吨｜扣减后 ${formatTonnes(c.finalNet)}｜回磅 ${formatDateTime(c.secondConfirmedAt)}${c.linkable ? '' : `（${c.reason}）`}`,
                    disabled: !c.linkable,
                  }))}
                  notFoundContent={ticketOptions.isLoading ? '加载中…' : trip.unloadedAt ? '没有匹配的正式磅单' : '请先确认卸货'}
                />
                <Button disabled={!trip.unloadedAt || !selectedTicket || action.isPending} onClick={() => selectedTicket && ask(`关联磅单 ${selectedTicket.ticketNo}？`, 'link-ticket', { ticketSiteCode: selectedTicket.siteCode, ticketNo: selectedTicket.ticketNo }, `${selectedTicket.plate} · ${selectedTicket.materialName} · 实际净重 ${subtractTonnes(selectedTicket.finalGross, selectedTicket.finalTare)} 吨 · 扣减后 ${formatTonnes(selectedTicket.finalNet)} 吨`)}>关联磅单</Button>
              </Space>}
              {ticketOptions.isError && <Alert type="error" title={getApiErrorMessage(ticketOptions.error)} action={<Button onClick={() => void ticketOptions.refetch()}>重试</Button>} />}
            </>}
          </Card>
        </Space> },
        { key: 'exit', label: '出门证与出厂', children: <Card title="出厂办理">
          {permit ? <Descriptions size="small" column={{ xs: 1, sm: 2 }} items={[
            { key: 'number', label: '出门证号', children: permit.number }, { key: 'status', label: '审批状态', children: permit.status === 'approved' ? '已审批' : '待审批' },
            { key: 'created', label: '开具时间', children: formatDateTime(permit.createdAt) }, { key: 'approved', label: '审批时间', children: formatDateTime(permit.approvedAt) },
          ]} /> : trip.effectiveConclusion === 'reject' ? <Alert type="warning" title="本趟拒收，不另开出门证。" /> : null}
          <Space wrap style={{ marginTop: 16 }}>
            {!gate && canIssue && trip.stage === 'ready' && !permit && trip.ticketConfirmedAt && <Button type="primary" loading={action.isPending} onClick={() => ask('开具本趟出门证？', 'issue-permit')}>开具出门证</Button>}
            {canApprove && trip.stage === 'permit_pending' && permit && <Button type="primary" loading={action.isPending} onClick={() => ask('审批通过该出门证？', 'approve-permit', { permitId: permit.id }, '审批通过仍需门卫在实际放行时确认出厂。')}>审批通过</Button>}
            {canRelease && trip.stage === 'permit_approved' && permit && <Button type="primary" loading={action.isPending} onClick={() => ask('车辆实际出厂，确认放行？', 'confirm-exit', { basis: 'permit', permitId: permit.id }, '核对车辆与出门证；确认后本趟凭据不可再次使用。')}>确认出厂</Button>}
            {canRelease && trip.stage === 'rejected' && (effective || visual) && <Button type="primary" loading={action.isPending} onClick={() => ask('核验拒收依据并确认车辆实际出厂？', 'confirm-exit', { basis: 'rejection', inspectionId: effective?.id, inspectionVersion: effective?.version }, effective?.reason || trip.visualReason)}>确认拒收出厂</Button>}
          </Space>
        </Card> },
        { key: 'events', label: '过程记录', children: <Table rowKey="id" dataSource={events} pagination={{ pageSize: 10 }} columns={[{ title: '时间', dataIndex: 'createdAt', render: (v: string) => formatDateTime(v) }, { title: '操作人员', dataIndex: 'actorName', render: (v: string) => v || '系统' }, { title: '记录', dataIndex: 'description' }]} /> },
      ]} />
      </Card>
    </div>
    {editing && <TripEditor original={trip} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refresh(); }} />}
  </>;
}
