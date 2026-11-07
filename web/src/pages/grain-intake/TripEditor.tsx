import { Alert, App, Button, Form, Input, Modal, Select, Space } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { materials, parties, sites } from '../../features/weighbridge/api';
import { saveTrip, type Trip, type TripDetail, type TripInput } from '../../features/grain-intake/api';
import { getApiErrorMessage } from '../../lib/api/errors';
const blank: TripInput = { siteCode: '', plate: '', materialCode: '', partyCode: '', driver: '', driverPhone: '', contractNo: '', remark: '' };
export default function TripEditor({ original, onClose, onSaved }: { original?: Trip; onClose: () => void; onSaved: (value: TripDetail) => void }) {
  const { message } = App.useApp();
  const client = useQueryClient();
  const [form] = Form.useForm<TripInput>();
  const siteQuery = useQuery({ queryKey: ['weighbridge', 'sites'], queryFn: sites });
  const materialQuery = useQuery({ queryKey: ['weighbridge', 'materials'], queryFn: materials });
  const partyQuery = useQuery({ queryKey: ['weighbridge', 'parties'], queryFn: parties });
  const save = useMutation({
    mutationFn: (v: TripInput) => saveTrip({ ...blank, ...v, partyCode: v.partyCode || '' }, original),
    onSuccess: (value) => { message.success('流转单已保存'); void client.invalidateQueries({ queryKey: ['grain-intake'] }); onSaved(value); },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });
  const error = siteQuery.error ?? materialQuery.error ?? partyQuery.error;
  return <Modal title={original ? `更正 ${original.number}` : '登记流转单'} open onCancel={onClose} onOk={() => void form.validateFields().then((v) => save.mutate(v))} confirmLoading={save.isPending} width={640}>
    {error && <Alert type="error" title={getApiErrorMessage(error)} action={<Button onClick={() => { void siteQuery.refetch(); void materialQuery.refetch(); void partyQuery.refetch(); }}>重试资料加载</Button>} />}
    <Form form={form} layout="vertical" initialValues={original ?? blank}>
      <Form.Item name="siteCode" label="厂区" rules={[{ required: true, message: '请选择厂区' }]}><Select loading={siteQuery.isLoading} options={(siteQuery.data ?? []).filter((v) => v.enabled || v.code === original?.siteCode).map((v) => ({ value: v.code, label: v.name, disabled: !v.enabled }))} /></Form.Item>
      <Form.Item name="plate" label="车牌号" rules={[{ required: true, whitespace: true, message: '请输入车牌号' }]}><Input maxLength={40} /></Form.Item>
      <Form.Item name="materialCode" label="粮种（物料）" rules={[{ required: true, message: '请选择粮种' }]}><Select showSearch optionFilterProp="label" loading={materialQuery.isLoading} options={(materialQuery.data ?? []).filter((v) => v.enabled || v.code === original?.materialCode).map((v) => ({ value: v.code, label: v.name, disabled: !v.enabled }))} /></Form.Item>
      <Form.Item name="partyCode" label="供应商" extra="暂未明确可留空，正式确认接收前须补齐。"><Select allowClear showSearch optionFilterProp="label" loading={partyQuery.isLoading} options={(partyQuery.data ?? []).filter((v) => v.isSupplier && (v.enabled || v.code === original?.partyCode)).map((v) => ({ value: v.code, label: v.name, disabled: !v.enabled }))} /></Form.Item>
      <Space wrap><Form.Item name="driver" label="司机姓名（选填）"><Input maxLength={100} /></Form.Item><Form.Item name="driverPhone" label="联系电话（选填）"><Input maxLength={50} /></Form.Item></Space>
      <Form.Item name="contractNo" label="合同编号（选填）"><Input maxLength={100} /></Form.Item>
      <Form.Item name="remark" label="备注"><Input.TextArea maxLength={2000} /></Form.Item>
    </Form>
  </Modal>;
}
