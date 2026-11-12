import { useEffect, useState } from 'react';
import { Building2, FileText, Truck, Users, Wheat } from 'lucide-react';
import { Alert, App, Button, Descriptions, Form, Input, InputNumber, Modal, Space, Tooltip, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { Trip } from '../../features/grain-intake/api';
import { createInspection } from '../../features/laboratory/api';
import { deductionPreview } from '../../features/deduction/api';
import { getApiErrorMessage } from '../../lib/api/errors';
import styles from './InspectionModal.module.css';

interface Values {
  moisture: string;
  bulkDensity: string;
  reason: string;
  remark: string;
}

const blank: Values = { moisture: '', bulkDensity: '', reason: '', remark: '' };
const decimal = /^(0|[1-9][0-9]{0,5})(\.[0-9]{1,6})?$/;

function formatRate(rateBp: number) {
  return `${(rateBp / 100).toFixed(2)}%`;
}

/**
 * 化验结果录入：身份信息来自流转单，只读展示；拒收原因默认隐藏。
 * 一张流转单只能录入一次，提交即生效。容量只作为化验指标展示，不参与扣减；
 * 杂质现场无法检测，改由称重台二次称重时录入。
 */
export default function InspectionFormModal({ trip, open, onClose, onSaved }: {
  trip: Trip;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<Values>();
  const moisture = Form.useWatch('moisture', form);
  const [previewMoisture, setPreviewMoisture] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const canReject = !trip.unloadedAt;
  const save = useMutation({
    mutationFn: createInspection,
    onSuccess: () => { message.success('化验结果已保存并生效'); onSaved(); },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });
  useEffect(() => {
    const timer = window.setTimeout(() => setPreviewMoisture(typeof moisture === 'string' ? moisture.trim() : ''), 400);
    return () => window.clearTimeout(timer);
  }, [moisture]);
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    setPreviewMoisture('');
    setRejecting(false);
  }, [open, form]);
  const moistureValid = decimal.test(previewMoisture) && Number(previewMoisture) <= 100;
  const preview = useQuery({
    queryKey: ['deduction-preview', trip.materialCode, previewMoisture],
    queryFn: () => deductionPreview(trip.materialCode, previewMoisture),
    enabled: moistureValid,
    retry: false,
    staleTime: 30_000,
  });
  const previewItems = preview.data ?? [];
  const previewMoistureValue = previewItems[0]?.basisValue || previewMoisture;
  const previewRates = previewItems.map((item) => formatRate(item.rateBp ?? 0)).join('、');
  const submit = async (conclusion: 'accept' | 'reject') => {
    let values: Values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    if (conclusion === 'reject' && !canReject) {
      message.error('已确认卸粮，不能改判拒收');
      return;
    }
    save.mutate({
      tripId: trip.id,
      moisture: values.moisture,
      bulkDensity: values.bulkDensity,
      conclusion,
      reason: conclusion === 'reject' ? values.reason.trim() : '',
      remark: values.remark ?? '',
    });
  };
  return <Modal
    open={open}
    onCancel={onClose}
    title="录入化验结果"
    width={780}
    destroyOnHidden
    footer={rejecting
      ? <Space><Button onClick={() => setRejecting(false)}>返回</Button><Button danger loading={save.isPending} onClick={() => void submit('reject')}>确认拒收</Button></Space>
      : <Space><Button onClick={onClose}>取消</Button>{canReject && <Button danger onClick={() => setRejecting(true)}>拒收</Button>}<Button type="primary" loading={save.isPending} onClick={() => void submit('accept')}>接收</Button></Space>}
  >
    {save.isError && <Alert type="error" title={getApiErrorMessage(save.error)} />}
    {!canReject && <Alert type="info" title="已确认卸粮，重录只能选择接收。" />}
    <Form form={form} layout="vertical" initialValues={blank}>
      <div className={styles.detail}>
        <div className={styles.identity}>
          <div className={styles.identityTop}>
            <div className={styles.tripLine} title="流转单号 / 车次">
              <FileText size={14} aria-hidden />
              <Typography.Text className={styles.tripNo} copyable={{ text: trip.number }}>{trip.number}</Typography.Text>
            </div>
            <div className={styles.siteLine} title="厂区">
              <Building2 size={13} aria-hidden />
              <span>{trip.siteCode}</span>
            </div>
          </div>
          <div className={styles.identityMain}>
            <div className={styles.plateLine} title="车牌">
              <Truck size={16} aria-hidden />
              <strong className={styles.plateBadge}>{trip.plate}</strong>
            </div>
            <div className={styles.identityText}>
              <div className={styles.materialLine} title="粮种">
                <Wheat size={15} aria-hidden />
                <span className={styles.materialName}>{trip.materialName}</span>
              </div>
              <div className={styles.supplierLine} title="供应商">
                <Users size={13} aria-hidden />
                <span className={styles.supplierName}>{trip.partyName || '—'}</span>
              </div>
            </div>
          </div>
        </div>
        <section className={styles.resultCard}>
          <div className={styles.resultHead}>
            <h3>检测结果</h3>
            <span>水分用于匹配扣减规则，容量仅作化验记录</span>
          </div>
          <div className={styles.resultGrid}>
            <Form.Item className={styles.resultField} name="moisture" label="水分（%）" rules={[{ required: true, message: '请填写水分' }]}>
              <InputNumber stringMode min="0" max="100" precision={6} suffix="%" />
            </Form.Item>
            <Form.Item className={styles.resultField} name="bulkDensity" label="容量（g/L）" rules={[{ required: true, message: '请填写容量' }]}>
              <InputNumber stringMode min="0.000001" max="999999.999999" precision={6} suffix="g/L" />
            </Form.Item>
          </div>
          <div className={styles.preview}>
            <div className={styles.previewTitle}>水分扣减</div>
            {!moisture ? <span className={styles.previewHint}>填写水分后自动匹配扣减规则</span>
              : !moistureValid ? <span className={styles.previewHint}>请填写 0 至 100 的水分</span>
              : preview.isFetching ? <span className={styles.previewHint}>正在匹配扣减规则…</span>
              : preview.isError ? <span className={styles.previewError}>扣减规则查询失败：{getApiErrorMessage(preview.error)}</span>
              : previewItems.length > 0
                ? <>
                    <div className={styles.previewSummary}>
                      <span className={styles.previewCurrent}>当前 <strong>{previewMoistureValue}%</strong></span>
                      <span className={styles.previewArrow} aria-hidden>→</span>
                      <span className={styles.previewRateLabel}>净重扣减比例</span>
                      <strong className={styles.previewRate}>{previewRates}</strong>
                      <Tooltip title="按最终净重折算；比例来自当前物料的区间规则。">
                        <button type="button" className={styles.previewHelp} aria-label="净重扣减比例说明">?</button>
                      </Tooltip>
                    </div>
                  </>
                : <span className={styles.previewHint}>当前数值未匹配到扣减规则</span>}
          </div>
          {rejecting && <Form.Item name="reason" label="拒收原因" rules={[{ required: true, whitespace: true, message: '请填写拒收原因' }]} style={{ marginTop: 14, marginBottom: 0 }}><Input.TextArea maxLength={2000} rows={2} placeholder="请填写拒收原因" /></Form.Item>}
        </section>
        {(trip.driver || trip.driverPhone || trip.contractNo) && <section className={styles.infoCard}>
          <div className={styles.sectionTitle}>其他信息</div>
          <Descriptions size="small" layout="vertical" column={{ xs: 1, sm: 2 }} items={[
            { key: 'driver', label: '司机', children: `${trip.driver || '—'} ${trip.driverPhone}` },
            { key: 'contract', label: '合同编号', children: trip.contractNo || '—' },
          ]} />
        </section>}
        <section className={styles.remarkSection}>
          <div className={styles.sectionTitle}>备注</div>
          <Form.Item name="remark" noStyle><Input.TextArea maxLength={2000} rows={2} placeholder="选填，补充化验或现场情况" /></Form.Item>
        </section>
      </div>
    </Form>
  </Modal>;
}
