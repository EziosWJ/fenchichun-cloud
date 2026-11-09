import { useDeferredValue, useMemo, useState } from 'react';
import { Alert, App, AutoComplete, Button, Col, Form, Input, Modal, Row, Select } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { materials, parties, sites } from '../../features/weighbridge/api';
import { saveTrip, trips, type Trip, type TripDetail, type TripInput } from '../../features/grain-intake/api';
import { getApiErrorMessage } from '../../lib/api/errors';
const blank: TripInput = { siteCode: '', plate: '', materialCode: '', partyCode: '', driver: '', driverPhone: '', contractNo: '', remark: '' };

function Section({ children }: { children: string }) {
  return <div className="sectionTitle" style={{ margin: '4px 0 12px' }}>{children}</div>;
}

export default function TripEditor({ original, onClose, onSaved }: { original?: Trip; onClose: () => void; onSaved: (value: TripDetail) => void }) {
  const { message } = App.useApp();
  const client = useQueryClient();
  const [form] = Form.useForm<TripInput>();
  const materialCode = Form.useWatch('materialCode', form);
  const [plateKeyword, setPlateKeyword] = useState(original?.plate ?? '');
  const siteQuery = useQuery({ queryKey: ['weighbridge', 'sites'], queryFn: sites });
  const materialQuery = useQuery({ queryKey: ['weighbridge', 'materials'], queryFn: materials });
  const partyQuery = useQuery({ queryKey: ['weighbridge', 'parties'], queryFn: parties });
  const deferredPlate = useDeferredValue(plateKeyword.trim());
  const recentTrips = useQuery({
    queryKey: ['grain-intake', 'trips', 'plate-options', deferredPlate],
    queryFn: () => trips({ page: 1, pageSize: 10, keyword: deferredPlate }),
    enabled: deferredPlate.length > 0,
  });
  const plateOptions = useMemo(() => {
    const seen = new Set<string>();
    const needle = deferredPlate.toLowerCase();
    return (recentTrips.data?.items ?? [])
      .filter((item) => item.plate && item.plate.toLowerCase().includes(needle))
      .filter((item) => { if (seen.has(item.plate)) return false; seen.add(item.plate); return true; })
      .map((item) => ({ value: item.plate, label: `${item.plate} · ${item.materialName}${item.partyName ? ` · ${item.partyName}` : ''}` }));
  }, [recentTrips.data, deferredPlate]);
  const applyPlate = (value: string) => {
    const matched = recentTrips.data?.items.find((item) => item.plate === value);
    if (matched) form.setFieldsValue({ siteCode: matched.siteCode, materialCode: matched.materialCode, partyCode: matched.partyCode, driver: matched.driver, driverPhone: matched.driverPhone });
  };
  const save = useMutation({
    mutationFn: (v: TripInput) => saveTrip({ ...blank, ...v, partyCode: v.partyCode || '' }, original),
    onSuccess: (value) => { message.success('流转单已保存'); void client.invalidateQueries({ queryKey: ['grain-intake'] }); onSaved(value); },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });
  const error = siteQuery.error ?? materialQuery.error ?? partyQuery.error;
  return <Modal title={original ? `更正 ${original.number}` : '登记流转单'} open onCancel={onClose} onOk={() => void form.validateFields().then((v) => save.mutate(v))} confirmLoading={save.isPending} width={720}>
    {error && <Alert type="error" title={getApiErrorMessage(error)} action={<Button onClick={() => { void siteQuery.refetch(); void materialQuery.refetch(); void partyQuery.refetch(); }}>重试资料加载</Button>} />}
    <Form form={form} layout="vertical" initialValues={original ?? blank}>
      <Section>车辆与来源</Section>
      <Row gutter={16}>
        <Col xs={24} sm={12}>
          <Form.Item name="siteCode" label="厂区" rules={[{ required: true, message: '请选择厂区' }]}><Select placeholder="请选择厂区" loading={siteQuery.isLoading} options={(siteQuery.data ?? []).filter((v) => v.enabled || v.code === original?.siteCode).map((v) => ({ value: v.code, label: v.name, disabled: !v.enabled }))} /></Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item name="plate" label="车牌号" rules={[{ required: true, whitespace: true, message: '请输入车牌号' }]}><AutoComplete allowClear placeholder="输入车牌，联想最近送粮记录" options={plateOptions} onSearch={setPlateKeyword} onSelect={applyPlate} notFoundContent={recentTrips.isFetching ? '正在查询…' : undefined} /></Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item name="materialCode" label="货品（物料）" rules={[{ required: true, message: '请选择货品' }]} extra={materialCode ? `检验方式：${original?.materialCode === materialCode ? (original.inspectionMethod === 'visual' ? '目测' : '化验') : (materialQuery.data?.find((v) => v.code === materialCode)?.inspectionMethod === 'visual' ? '目测' : '化验')}` : undefined}><Select showSearch optionFilterProp="label" placeholder="请选择货品" loading={materialQuery.isLoading} options={(materialQuery.data ?? []).filter((v) => v.enabled || v.code === original?.materialCode).map((v) => ({ value: v.code, label: v.name, disabled: !v.enabled }))} /></Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item name="partyCode" label="供应商" rules={[{ required: true, message: '请选择供应商' }]}><Select showSearch optionFilterProp="label" placeholder="请选择供应商" loading={partyQuery.isLoading} options={(partyQuery.data ?? []).filter((v) => v.isSupplier && (v.enabled || v.code === original?.partyCode)).map((v) => ({ value: v.code, label: v.name, disabled: !v.enabled }))} /></Form.Item>
        </Col>
      </Row>
      <Section>其他信息（选填）</Section>
      <Row gutter={16}>
        <Col xs={24} sm={12}><Form.Item name="driver" label="司机姓名"><Input maxLength={100} /></Form.Item></Col>
        <Col xs={24} sm={12}><Form.Item name="driverPhone" label="联系电话"><Input maxLength={50} /></Form.Item></Col>
      </Row>
      <Form.Item name="contractNo" label="合同编号"><Input maxLength={100} /></Form.Item>
      <Form.Item name="remark" label="备注" style={{ marginBottom: 0 }}><Input.TextArea maxLength={2000} /></Form.Item>
    </Form>
  </Modal>;
}
