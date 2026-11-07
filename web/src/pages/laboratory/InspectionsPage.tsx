import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, App, AutoComplete, Button, Col, Descriptions, Form, Input, InputNumber, Modal, Row, Select, Space, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { FilterField } from '../../components/SearchFilterBar';
import { useListUrlState } from '../../hooks/useListUrlState';
import { getApiErrorMessage } from '../../lib/api/errors';
import { materials, parties, sites } from '../../features/weighbridge/api';
import { trips, type Trip } from '../../features/grain-intake/api';
import { inspection, inspectionAction, inspections, saveInspection, type Inspection, type InspectionInput } from '../../features/laboratory/api';
import { formatDateTime } from '../../utils/format';

const statuses = [{ value: 'draft', label: '草稿' }, { value: 'confirmed', label: '已确认' }, { value: 'void', label: '已作废' }];
const config = { filters: { status: ['draft', 'confirmed', 'void'] }, sortKeys: [], pageSizeOptions: [10, 20, 50], defaultPageSize: 10 } as const;
const blank: InspectionInput = { siteCode: '', plate: '', materialCode: '', partyCode: '', driver: '', driverPhone: '', contractNo: '', moisture: '', impurity: '', bulkDensity: '', conclusion: '', reason: '', remark: '' };
const conclusion = (value: string) => value === 'accept' ? '接收' : value === 'reject' ? '拒收' : '—';

function Section({ children }: { children: string }) {
  return <div className="sectionTitle" style={{ margin: '4px 0 12px' }}>{children}</div>;
}

export default function InspectionsPage({ trip, locked = false, onMakeEffective }: { trip?: Trip; locked?: boolean; onMakeEffective?: (row: Inspection) => void }) {
  const { message, modal } = App.useApp();
  const client = useQueryClient();
  const { state, actions } = useListUrlState(config);
  const [keyword, setKeyword] = useState(state.keyword);
  const [editing, setEditing] = useState<Inspection>();
  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<number>();
  const [voiding, setVoiding] = useState<Inspection>();
  const [reason, setReason] = useState('');
  const [plateKeyword, setPlateKeyword] = useState('');
  const [form] = Form.useForm<InspectionInput>();
  const conclusionValue = Form.useWatch('conclusion', form);
  const params = { page: state.page, pageSize: state.pageSize, keyword: state.keyword, ...state.filters, ...(trip ? { tripId: trip.id } : {}) };
  const list = useQuery({ queryKey: ['laboratory', 'inspections', params], queryFn: () => inspections(params) });
  const detail = useQuery({ queryKey: ['laboratory', 'inspection', detailId], queryFn: () => inspection(detailId!), enabled: detailId !== undefined });
  const siteQuery = useQuery({ queryKey: ['weighbridge', 'sites'], queryFn: sites });
  const materialQuery = useQuery({ queryKey: ['weighbridge', 'materials'], queryFn: materials });
  const partyQuery = useQuery({ queryKey: ['weighbridge', 'parties'], queryFn: parties });
  const deferredPlate = useDeferredValue(plateKeyword.trim());
  const recentTrips = useQuery({
    queryKey: ['grain-intake', 'trips', 'plate-options', deferredPlate],
    queryFn: () => trips({ page: 1, pageSize: 10, keyword: deferredPlate }),
    enabled: open && !trip && deferredPlate.length > 0,
  });
  const plateOptions = useMemo(() => {
    const seen = new Set<string>();
    const needle = deferredPlate.toLowerCase();
    return (recentTrips.data?.items ?? [])
      .filter((item) => item.plate && item.plate.toLowerCase().includes(needle))
      .filter((item) => { if (seen.has(item.plate)) return false; seen.add(item.plate); return true; })
      .map((item) => ({ value: item.plate, label: `${item.plate} · ${item.materialName}${item.partyName ? ` · ${item.partyName}` : ''}` }));
  }, [recentTrips.data, deferredPlate]);
  const enabledSites = useMemo(() => (siteQuery.data ?? []).filter((item) => item.enabled), [siteQuery.data]);
  const siteOptions = useMemo(() => {
    const current = (siteQuery.data ?? []).find((item) => item.code === editing?.siteCode && !item.enabled);
    return (current ? [current, ...enabledSites] : enabledSites).map((item) => ({ value: item.code, label: item.name }));
  }, [siteQuery.data, editing, enabledSites]);
  const singleSiteCode = enabledSites.length === 1 ? enabledSites[0].code : undefined;
  useEffect(() => {
    if (!open || editing || trip || !singleSiteCode) return;
    if (!form.getFieldValue('siteCode')) form.setFieldValue('siteCode', singleSiteCode);
  }, [open, editing, trip, singleSiteCode, form]);
  const refresh = () => { void client.invalidateQueries({ queryKey: ['laboratory'] }); void client.invalidateQueries({ queryKey: ['grain-intake'] }); };
  const edit = (row?: Inspection) => { setEditing(row); setPlateKeyword(row?.plate ?? ''); form.resetFields(); form.setFieldsValue({ ...(row ?? blank), ...(trip ? { siteCode: trip.siteCode, plate: trip.plate, materialCode: trip.materialCode, partyCode: trip.partyCode, driver: trip.driver, driverPhone: trip.driverPhone, contractNo: trip.contractNo } : {}) }); setOpen(true); };
  const save = useMutation({
    mutationFn: (values: InspectionInput) => {
      const identity: Partial<InspectionInput> = trip ? { siteCode: trip.siteCode, plate: trip.plate, materialCode: trip.materialCode, partyCode: trip.partyCode } : {};
      return saveInspection({
        ...blank,
        ...values,
        ...identity,
        ...(trip || editing?.tripId ? { tripId: trip?.id ?? editing?.tripId } : {}),
        siteCode: values.siteCode ?? identity.siteCode ?? '',
        moisture: values.moisture ?? '',
        impurity: values.impurity ?? '',
        bulkDensity: values.bulkDensity ?? '',
        materialCode: values.materialCode ?? identity.materialCode ?? '',
        partyCode: values.partyCode ?? identity.partyCode ?? '',
        conclusion: values.conclusion || '',
      }, editing);
    },
    onSuccess: () => { message.success('草稿已保存'); setOpen(false); refresh(); },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });
  const applyPlate = (value: string) => {
    const matched = recentTrips.data?.items.find((item) => item.plate === value);
    if (!matched) return;
    form.setFieldsValue({ siteCode: matched.siteCode, materialCode: matched.materialCode, partyCode: matched.partyCode, driver: matched.driver, driverPhone: matched.driverPhone });
  };
  const action = useMutation({
    mutationFn: ({ row, kind, text }: { row: Inspection; kind: 'confirm' | 'void' | 'delete' | 'retest'; text?: string }) => inspectionAction(row, kind, text),
    onSuccess: (value, variables) => { message.success(variables.kind === 'retest' ? '已创建复检草稿' : '操作成功'); setVoiding(undefined); refresh(); if (variables.kind === 'retest') edit(value); },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });
  const confirmAction = (row: Inspection, kind: 'confirm' | 'delete' | 'retest') => {
    const label = kind === 'confirm' ? '确认化验结果' : kind === 'delete' ? '删除草稿' : '创建复检单';
    modal.confirm({ title: `${label}？`, content: kind === 'confirm' ? '确认后不能编辑原单；录错需作废，复检需另建关联单。' : row.number, okText: label, cancelText: '取消', okButtonProps: { danger: kind === 'delete' }, onOk: () => action.mutateAsync({ row, kind }).then(() => undefined) });
  };
  const columns: ColumnsType<Inspection> = [
    { title: '化验单号', dataIndex: 'number', render: (value: string, row) => <Button type="link" onClick={() => setDetailId(row.id)}>{value}</Button> },
    { title: '归属', key: 'trip', render: (_, row) => row.tripId ? <Link to={`/grain-intake/trips/${row.tripId}`}>{trip?.effectiveInspectionId === row.id ? '本趟生效' : '查看流转单'}</Link> : '独立化验单' },
    { title: '车牌', dataIndex: 'plate', render: (value: string) => value || '—' },
    { title: '粮种', dataIndex: 'materialName', render: (value: string) => value || '—' },
    { title: '供应商', dataIndex: 'partyName', render: (value: string) => value || '待补齐' },
    { title: '检测值', key: 'values', render: (_, row) => `水分 ${row.moisture || '—'}% / 杂质 ${row.impurity || '—'}% / 容重 ${row.bulkDensity || '—'} g/L` },
    { title: '结论', dataIndex: 'conclusion', render: conclusion },
    { title: '状态', dataIndex: 'status', render: (value: string) => <Tag color={value === 'confirmed' ? 'green' : value === 'void' ? 'red' : 'default'}>{statuses.find((item) => item.value === value)?.label}</Tag> },
    { title: '创建时间', dataIndex: 'createdAt', render: (value: string) => formatDateTime(value) },
    { title: '操作', key: 'actions', render: (_, row) => <Space wrap>
      {!locked && row.status === 'draft' && <><Button type="link" onClick={() => edit(row)}>编辑</Button><Button type="link" disabled={action.isPending} onClick={() => confirmAction(row, 'confirm')}>确认</Button><Button type="link" danger disabled={action.isPending} onClick={() => confirmAction(row, 'delete')}>删除</Button></>}
      {!locked && row.status === 'confirmed' && <><Button type="link" disabled={action.isPending} onClick={() => confirmAction(row, 'retest')}>复检</Button><Button type="link" danger onClick={() => { setVoiding(row); setReason(''); }}>作废</Button></>}
      {!locked && onMakeEffective && row.status === 'confirmed' && trip?.effectiveInspectionId !== row.id && <Button type="link" onClick={() => onMakeEffective(row)}>设为本趟生效</Button>}
    </Space> },
  ];
  const value = detail.data;
  const referenceError = siteQuery.error ?? materialQuery.error ?? partyQuery.error;
  return <>
    {!trip && <PageHeader title="化验单" description="记录水分、杂质和容重，可独立建单或关联流转单；复检保留原始结果。" />}
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Space wrap align="end">
        <FilterField label="单号、车牌、粮种或供应商" wide><Input.Search aria-label="单号、车牌、粮种或供应商" value={keyword} onChange={(e) => setKeyword(e.target.value)} onSearch={(value) => actions.setKeyword(value)} allowClear /></FilterField>
        <FilterField label="状态"><Select aria-label="状态" allowClear options={statuses} value={state.filters.status} onChange={(v) => actions.setFilter('status', v)} style={{ width: 140 }} /></FilterField>
        {!locked && <Button type="primary" onClick={() => edit()}>新建化验单</Button>}
      </Space>
      {list.isError && <Alert type="error" title={getApiErrorMessage(list.error)} action={<Button onClick={() => void list.refetch()}>重试</Button>} />}
      <DataTable tableKey="laboratory-inspections" rowKey="id" columns={columns} dataSource={list.data?.items ?? []} total={list.data?.total ?? 0} page={state.page} pageSize={state.pageSize} onPageChange={actions.setPage} loading={list.isLoading} onRefresh={() => void list.refetch()} />
    </Space>
    <Modal title={editing ? `编辑草稿 ${editing.number}` : '新建化验单'} open={open} onCancel={() => setOpen(false)} onOk={() => void form.validateFields().then((v) => save.mutate(v))} okText="保存草稿" confirmLoading={save.isPending} destroyOnHidden width={760} styles={{ body: { maxHeight: '68vh', overflowY: 'auto' } }}>
      {referenceError && <Alert type="error" title={getApiErrorMessage(referenceError)} action={<Button onClick={() => { void siteQuery.refetch(); void materialQuery.refetch(); void partyQuery.refetch(); }}>重试资料加载</Button>} />}
      <Form form={form} layout="vertical">
        <Section>车辆与来源</Section>
        {trip ? <Descriptions size="small" column={{ xs: 1, sm: 2 }} items={[
          { key: 'site', label: '厂区', children: trip.siteCode || '—' }, { key: 'plate', label: '车牌', children: trip.plate },
          { key: 'material', label: '粮种', children: trip.materialName }, { key: 'party', label: '供应商', children: trip.partyName || '待核实' },
        ]} /> : <Row gutter={16}>
          <Col xs={24} sm={12}><Form.Item name="siteCode" label="厂区"><Select allowClear placeholder="请选择厂区（确认前须补齐）" loading={siteQuery.isLoading} options={siteOptions} /></Form.Item></Col>
          <Col xs={24} sm={12}><Form.Item name="plate" label="车牌号"><AutoComplete allowClear placeholder="输入车牌，联想最近送粮记录" options={plateOptions} onSearch={setPlateKeyword} onSelect={applyPlate} notFoundContent={recentTrips.isFetching ? '正在查询…' : undefined} /></Form.Item></Col>
          <Col xs={24} sm={12}><Form.Item name="materialCode" label="粮种（复用物料）"><Select showSearch optionFilterProp="label" allowClear placeholder="请选择粮种" loading={materialQuery.isLoading} options={(materialQuery.data ?? []).filter((v) => v.enabled || v.code === editing?.materialCode).map((v) => ({ value: v.code, label: v.name, disabled: !v.enabled }))} /></Form.Item></Col>
          <Col xs={24} sm={12}><Form.Item name="partyCode" label="供应商"><Select showSearch optionFilterProp="label" allowClear placeholder="请选择供应商（确认前须补齐）" loading={partyQuery.isLoading} options={(partyQuery.data ?? []).filter((v) => v.isSupplier && (v.enabled || v.code === editing?.partyCode)).map((v) => ({ value: v.code, label: v.name, disabled: !v.enabled }))} /></Form.Item></Col>
        </Row>}
        <Section>检测数据</Section>
        <Row gutter={16}>
          <Col xs={24} sm={8}><Form.Item name="moisture" label="水分（%）"><InputNumber stringMode min="0" max="100" step={0.01} placeholder="例如 14.1" style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={24} sm={8}><Form.Item name="impurity" label="杂质（%）"><InputNumber stringMode min="0" max="100" step={0.01} placeholder="例如 1.0" style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={24} sm={8}><Form.Item name="bulkDensity" label="容重（g/L）"><InputNumber stringMode min="0.000001" max="999999.999999" step={1} placeholder="例如 760" style={{ width: '100%' }} /></Form.Item></Col>
        </Row>
        <Section>化验结论</Section>
        <Row gutter={16}>
          <Col xs={24} sm={8}><Form.Item name="conclusion" label="人工结论"><Select allowClear placeholder="请选择" options={[{ value: 'accept', label: '接收' }, { value: 'reject', label: '拒收' }]} /></Form.Item></Col>
        </Row>
        <Form.Item name="reason" label="结论原因" hidden={conclusionValue !== 'reject'} extra="拒收确认时必须填写原因。"><Input.TextArea maxLength={2000} placeholder="说明拒收依据；确认拒收后此项不可补录" /></Form.Item>
        <Section>其他信息（选填）</Section>
        <Row gutter={16}>
          <Col xs={24} sm={12}><Form.Item name="driver" label="司机姓名"><Input maxLength={100} /></Form.Item></Col>
          <Col xs={24} sm={12}><Form.Item name="driverPhone" label="司机电话"><Input maxLength={50} /></Form.Item></Col>
        </Row>
        <Form.Item name="contractNo" label="合同编号"><Input maxLength={100} /></Form.Item>
        <Form.Item name="remark" label="备注" style={{ marginBottom: 0 }}><Input.TextArea maxLength={2000} /></Form.Item>
      </Form>
    </Modal>
    <Modal title="作废化验单" open={!!voiding} onCancel={() => setVoiding(undefined)} confirmLoading={action.isPending} okButtonProps={{ danger: true, disabled: !reason.trim() }} okText="确认作废" onOk={() => { if (voiding) action.mutate({ row: voiding, kind: 'void', text: reason }); }}>
      <p>原检测结果将保留；作废后不能修改或继续使用该单。</p><Input.TextArea aria-label="作废原因" placeholder="请输入作废原因" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} />
    </Modal>
    <Modal title="化验单详情" open={detailId !== undefined} onCancel={() => setDetailId(undefined)} footer={<Button onClick={() => setDetailId(undefined)}>关闭</Button>} width={720}>
      {detail.isLoading && <p>正在加载…</p>}
      {detail.isError && <Alert type="error" title={getApiErrorMessage(detail.error)} action={<Button onClick={() => void detail.refetch()}>重试</Button>} />}
      {value && <Descriptions bordered column={{ xs: 1, sm: 2 }} items={[
        { key: 'number', label: '单号', children: value.number }, { key: 'status', label: '状态', children: statuses.find((v) => v.value === value.status)?.label },
        { key: 'original', label: '原化验单', children: value.originalId ? <Button type="link" onClick={() => setDetailId(value.originalId!)}>查看原化验单</Button> : '初检' },
        { key: 'site', label: '厂区', children: value.siteCode || '—' }, { key: 'plate', label: '车牌', children: value.plate || '—' }, { key: 'material', label: '粮种', children: value.materialName || '—' }, { key: 'party', label: '供应商', children: value.partyName || '—' },
        { key: 'moisture', label: '水分（%）', children: value.moisture || '—' }, { key: 'impurity', label: '杂质（%）', children: value.impurity || '—' }, { key: 'density', label: '容重（g/L）', children: value.bulkDensity || '—' },
        { key: 'conclusion', label: '结论', children: conclusion(value.conclusion) }, { key: 'reason', label: '结论原因', children: value.reason || '—' },
        { key: 'driver', label: '司机', children: `${value.driver || '—'} ${value.driverPhone}` }, { key: 'contract', label: '合同编号', children: value.contractNo || '—' },
        { key: 'created', label: '创建', children: `${formatDateTime(value.createdAt)} / 用户 #${value.createdBy}` }, { key: 'confirmed', label: '确认', children: value.confirmedAt ? `${formatDateTime(value.confirmedAt)} / 用户 #${value.confirmedBy}` : '—' },
        { key: 'void', label: '作废', children: value.voidedAt ? `${formatDateTime(value.voidedAt)} / 用户 #${value.voidedBy}` : '—' }, { key: 'voidReason', label: '作废原因', children: value.voidReason || '—' }, { key: 'remark', label: '备注', children: value.remark || '—' },
      ]} />}
    </Modal>
  </>;
}
