import { useState } from 'react';
import { Alert, App, Button, Descriptions, Form, Input, InputNumber, Modal, Space, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import type { Trip } from '../../features/grain-intake/api';
import { createInspection } from '../../features/laboratory/api';
import { getApiErrorMessage } from '../../lib/api/errors';
import styles from './InspectionModal.module.css';

interface Values {
  moisture: string;
  impurity: string;
  reason: string;
  remark: string;
}

const blank: Values = { moisture: '', impurity: '', reason: '', remark: '' };

/**
 * 化验结果录入：身份信息来自流转单，只读展示；拒收原因默认隐藏。
 * 一张流转单只能录入一次，提交即生效。
 */
export default function InspectionFormModal({ trip, open, onClose, onSaved }: {
  trip: Trip;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<Values>();
  const [rejecting, setRejecting] = useState(false);
  const save = useMutation({
    mutationFn: createInspection,
    onSuccess: () => { message.success('化验结果已保存并生效'); onSaved(); },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });
  const submit = async (conclusion: 'accept' | 'reject') => {
    let values: Values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    if (conclusion === 'reject' && !values.reason?.trim()) {
      message.error('拒收必须填写原因');
      return;
    }
    save.mutate({
      tripId: trip.id,
      moisture: values.moisture,
      impurity: values.impurity,
      conclusion,
      reason: conclusion === 'reject' ? values.reason.trim() : '',
      remark: values.remark ?? '',
    });
  };
  return <Modal
    open={open}
    onCancel={onClose}
    title="录入化验结果"
    width={760}
    destroyOnHidden
    footer={rejecting
      ? <Space><Button onClick={() => setRejecting(false)}>返回</Button><Button danger loading={save.isPending} onClick={() => void submit('reject')}>确认拒收</Button></Space>
      : <Space><Button onClick={onClose}>取消</Button><Button danger onClick={() => setRejecting(true)}>拒收</Button><Button type="primary" loading={save.isPending} onClick={() => void submit('accept')}>接收</Button></Space>}
  >
    {save.isError && <Alert type="error" title={getApiErrorMessage(save.error)} />}
    <Form form={form} layout="vertical" initialValues={blank}>
      <div className={styles.detail}>
        <div className={styles.overview}>
          <Typography.Text strong copyable={{ text: trip.number }}>{trip.number}</Typography.Text>
          <div className={styles.overviewMeta}>
            {[trip.plate, trip.siteCode, trip.materialName, trip.partyName].filter(Boolean).join(' · ')}
          </div>
        </div>
        <section className={styles.section}>
          <h3>单据信息</h3>
          <Descriptions size="small" layout="vertical" column={{ xs: 1, sm: 2, lg: 3 }} items={[
            { key: 'plate', label: '车牌', children: trip.plate },
            { key: 'site', label: '厂区', children: trip.siteCode },
            { key: 'material', label: '粮种', children: trip.materialName },
            { key: 'party', label: '供应商', children: trip.partyName || '—' },
            { key: 'driver', label: '司机', children: `${trip.driver || '—'} ${trip.driverPhone}` },
            { key: 'contract', label: '合同编号', children: trip.contractNo || '—' },
          ]} />
        </section>
        <section className={styles.section}>
          <h3>检测结果</h3>
          <Space wrap align="start">
            <Form.Item name="moisture" label="水分（%）" rules={[{ required: true, message: '请填写水分' }]}><InputNumber stringMode min="0" max="100" precision={6} style={{ width: 160 }} /></Form.Item>
            <Form.Item name="impurity" label="杂质（%）" rules={[{ required: true, message: '请填写杂质' }]}><InputNumber stringMode min="0" max="100" precision={6} style={{ width: 160 }} /></Form.Item>
          </Space>
          {rejecting && <Form.Item name="reason" label="拒收原因"><Input.TextArea maxLength={2000} rows={2} placeholder="请填写拒收原因" /></Form.Item>}
        </section>
        <section className={styles.section}>
          <h3>备注</h3>
          <Form.Item name="remark" noStyle><Input.TextArea maxLength={2000} rows={2} /></Form.Item>
        </section>
      </div>
    </Form>
  </Modal>;
}
