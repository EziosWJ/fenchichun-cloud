import { useState } from 'react';
import { Alert, App, Button, Card, Descriptions, Divider, Empty, Input, Select, Space, Table, Tabs, Tag } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ticketCandidates, tripAction, tripDetail, stageLabel, type TripAction, type TripCommand } from '../../features/grain-intake/api';
import { granaries } from '../../features/granary/api';
import { PageHeader } from '../../components/PageHeader';
import { getApiErrorMessage } from '../../lib/api/errors';
import { usePermissions } from '../../hooks/usePermissions';
import { formatDateTime } from '../../utils/format';
import { formatTonnes, subtractTonnes } from '../../utils/weight';
import TripEditor from './TripEditor';

type NextStep = { tab?: 'inspections' | 'weighing' | 'exit'; title: string; description: string };

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
    onSuccess: () => { message.success('办理成功'); refresh(); },
    onError: (error) => { message.error(getApiErrorMessage(error)); refresh(); },
  });
  if (!Number.isSafeInteger(key) || key <= 0) return <Alert type="error" title="流转单地址无效" />;
  if (query.isLoading) return <Card loading />;
  if (query.isError) return <Alert type="error" title={getApiErrorMessage(query.error)} action={<Button onClick={() => void query.refetch()}>重试</Button>} />;
  if (!query.data) return <Empty description="未找到流转单" />;
  const { trip, permit, ticket, events } = query.data;
  const effective = query.data.inspections.find((i) => i.id === trip.effectiveInspectionId);
  const selectedTicket = ticketOptions.data?.find((c) => c.ticketNo === ticketNo);
  const locked = !!(trip.unloadedAt || trip.ticketId || permit || trip.exitedAt);
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
  const inspection = query.data.inspections[0];
  const labView = <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
    {inspection ? <Descriptions size="small" column={{ xs: 1, sm: 2, lg: 3 }} items={[
      { key: 'number', label: '化验单号', children: inspection.number },
      { key: 'conclusion', label: '结论', children: inspection.conclusion === 'accept' ? <Tag color="green">接收</Tag> : <Tag color="red">拒收</Tag> },
      { key: 'confirmed', label: '化验时间', children: formatDateTime(inspection.confirmedAt ?? inspection.createdAt) },
      { key: 'moisture', label: '水分（%）', children: inspection.moisture || '—' },
      { key: 'bulkDensity', label: '容量（g/L）', children: inspection.bulkDensity || '—' },
      { key: 'reason', label: '拒收原因', children: inspection.reason || '—' },
    ]} /> : <span style={{ color: 'var(--ant-color-text-secondary)' }}>尚未录入化验结果</span>}
    {!gate && canInspect && !locked && !inspection && <Button type="primary" onClick={() => navigate(`/laboratory/inspections?keyword=${encodeURIComponent(trip.number)}`)}>去录入化验结果</Button>}
  </Space>;
  return <>
    <PageHeader
      title={gate ? `出厂核验 · ${trip.number}` : trip.number}
      meta={<Tag color={trip.stage === 'blocked' ? 'red' : trip.exitedAt ? 'green' : 'blue'}>{stageLabel(trip.stage, trip.inspectionMethod)}</Tag>}
      onBack={() => navigate(gate ? '/grain-intake/permits' : '/grain-intake/trips')}
    />
    <div className="pageStack" style={{ marginTop: 20, gap: 12 }}>
      {trip.stage === 'blocked' && <Alert type="error" title="当前依据已失效或存在冲突，暂停开证和放行，请核查磅单与化验记录。" />}
      {trip.exitedAt && <Alert type="success" title={`已于 ${formatDateTime(trip.exitedAt)} 确认出厂，本趟凭据不能再次使用。`} />}
      {nextStep && <Alert type={trip.stage === 'pending_unload' || trip.stage === 'pending_ticket' ? 'warning' : 'info'} showIcon title={nextStep.title} description={nextStep.description} action={nextStep.tab ? <Button size="small" onClick={() => { if (nextStep.tab) setTab(nextStep.tab); }}>去办理</Button> : undefined} />}
      <Card title="本趟摘要" extra={!gate && canEditTrip && !permit && !trip.exitedAt ? <Button onClick={() => setEditing(true)}>更正登记</Button> : undefined}>
        <Descriptions size="small" column={{ xs: 1, sm: 2, lg: 3 }} items={[
          { key: 'site', label: '厂区', children: trip.siteCode || '—' }, { key: 'plate', label: '车牌', children: trip.plate }, { key: 'grain', label: '货品', children: trip.materialName },
          { key: 'party', label: '供应商', children: trip.partyName || '待核实' }, { key: 'driver', label: '司机', children: `${trip.driver || '—'}${trip.driverPhone ? ` ${trip.driverPhone}` : ''}` }, { key: 'contract', label: '合同编号', children: trip.contractNo || '—' },
          { key: 'method', label: '检验方式', children: visual ? '目测' : '化验' }, { key: 'created', label: '登记时间', children: formatDateTime(trip.createdAt) }, { key: 'remark', label: '备注', children: trip.remark || '—' },
        ]} />
        <Divider style={{ margin: '8px 0' }} />
        {visual ? (trip.visualInspectedAt ? <Descriptions size="small" column={{ xs: 1, sm: 2, lg: 3 }} items={[
          { key: 'result', label: '目测结论', children: <Tag color={trip.visualConclusion === 'accept' ? 'green' : 'red'}>{trip.visualConclusion === 'accept' ? '接收' : '拒收'}</Tag> },
          { key: 'reason', label: '说明', children: trip.visualReason || '—' },
          { key: 'time', label: '检查时间', children: formatDateTime(trip.visualInspectedAt) }, { key: 'actor', label: '检查人', children: trip.visualInspectedBy },
        ]} /> : !gate && canVisual ? <Space wrap>
          <Select aria-label="目测结论" value={visualConclusion} onChange={setVisualConclusion} options={[{ value: 'accept', label: '接收' }, { value: 'reject', label: '拒收' }]} />
          <Input aria-label="目测说明" placeholder={visualConclusion === 'reject' ? '请输入拒收原因' : '目测说明（选填）'} maxLength={2000} value={visualReason} onChange={(e) => setVisualReason(e.target.value)} style={{ minWidth: 320 }} />
          <Button type="primary" disabled={action.isPending || !trip.partyCode || (visualConclusion === 'reject' && !visualReason.trim())} onClick={() => ask('确认记录目测结果？', 'record-visual', { conclusion: visualConclusion, reason: visualReason }, '确认后不能修改，请核对货品与检查结论。')}>确认目测</Button>
          {!trip.partyCode && <span>请先核实供应商</span>}
        </Space> : <Empty description="尚未记录目测结果" />) : (effective ? <><Descriptions size="small" column={{ xs: 1, sm: 2, lg: 3 }} items={[
          { key: 'number', label: '生效化验单', children: effective.number },
          { key: 'conclusion', label: '化验结论', children: <Tag color={effective.conclusion === 'accept' ? 'green' : effective.conclusion === 'reject' ? 'red' : 'default'}>{conclusionText}</Tag> },
          { key: 'selected', label: '生效时间', children: formatDateTime(trip.effectiveSelectedAt) },
          { key: 'moisture', label: '水分（%）', children: effective.moisture || '—' }, { key: 'bulkDensity', label: '容量（g/L）', children: effective.bulkDensity || '—' },
          { key: 'reason', label: '原因', children: effective.reason || '—' },
        ]} />
          {query.data.deductions.length > 0 && <div style={{ marginTop: 8 }}>
            <Tag color="blue">扣减规则</Tag>
            {query.data.deductions.map((item) => <Tag key={`${item.ruleCode}-${item.ruleVersion}`}>
              {item.categoryName}：{item.mode === 'amount' ? `${(item.amountMilliTonne / 1000).toFixed(3)} 吨` : `${((item.rateBp ?? 0) / 100).toFixed(2)}%`}
              {item.basisValue ? `（${item.basisValue}）` : ''}
            </Tag>)}
          </div>}
        </> : <span style={{ color: 'var(--ant-color-text-secondary)' }}>尚未录入化验结果</span>)}
      </Card>
      <Tabs activeKey={activeTab} onChange={setTab} items={[
        ...(visual ? [] : [{ key: 'inspections', label: '化验结果', children: <Space orientation="vertical" size="small" style={{ width: '100%' }}>
          {labView}
        </Space> }]),
        { key: 'weighing', label: '卸货与磅单', children: <Space orientation="vertical" size="small" style={{ width: '100%' }}>
          <Card size="small" title="现场卸货确认">
            {trip.unloadedAt ? <Descriptions size="small" column={{ xs: 1, sm: 2 }} items={[{ key: 'location', label: '实际卸货地点', children: trip.unloadingLocation }, { key: 'time', label: '确认时间', children: formatDateTime(trip.unloadedAt) }]} /> : <>
              {!gate && canUnload && !locked && trip.effectiveConclusion === 'accept' ? <Space.Compact style={{ width: '100%', maxWidth: 560, marginTop: 16 }}>
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
                <Button type="primary" loading={action.isPending} onClick={() => ask('确认过磅单关联？', 'confirm-ticket', undefined, `${ticket.ticket.plate} · ${ticket.ticket.materialName} · 净重 ${formatTonnes(ticket.ticket.finalNet)} 吨`)}>确认过磅单关联</Button>
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
                    label: `${c.ticketNo}｜${c.plate}｜净重 ${(c.finalNetMilliTonne / 1000).toFixed(3)} 吨｜回磅 ${formatDateTime(c.secondConfirmedAt)}${c.linkable ? '' : `（${c.reason}）`}`,
                    disabled: !c.linkable,
                  }))}
                  notFoundContent={ticketOptions.isLoading ? '加载中…' : trip.unloadedAt ? '没有匹配的正式磅单' : '请先确认卸货'}
                />
                <Button disabled={!trip.unloadedAt || !selectedTicket || action.isPending} onClick={() => selectedTicket && ask(`关联磅单 ${selectedTicket.ticketNo}？`, 'link-ticket', { ticketSiteCode: selectedTicket.siteCode, ticketNo: selectedTicket.ticketNo }, `${selectedTicket.plate} · ${selectedTicket.materialName} · 净重 ${(selectedTicket.finalNetMilliTonne / 1000).toFixed(3)} 吨`)}>关联磅单</Button>
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
    </div>
    {editing && <TripEditor original={trip} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refresh(); }} />}
  </>;
}
