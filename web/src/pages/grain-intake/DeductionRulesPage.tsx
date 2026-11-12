import { useState } from 'react';
import { Alert, App, Button, Form, Input, InputNumber, Modal, Radio, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { usePermissions } from '../../hooks/usePermissions';
import {
  deductionCategories,
  deductionRules,
  deleteDeductionRule,
  saveDeductionRule,
  type DeductionCategory,
  type DeductionRangeInput,
  type DeductionRule,
  type DeductionRuleInput,
} from '../../features/deduction/api';
import { materials } from '../../features/weighbridge/api';
import { getApiErrorMessage } from '../../lib/api/errors';
import styles from './DeductionRulesPage.module.css';

interface RangeValues {
  minValue: string;
  maxValue: string;
  ratePercent: number;
}

interface Values {
  code: string;
  materialCode: string;
  categoryCode: string;
  mode: 'amount' | 'percent';
  basisField: '' | 'moisture';
  amountTonnes: number;
  effectiveFrom: string;
  enabled: boolean;
  remark: string;
  ranges: RangeValues[];
}

const blank: Values = {
  code: '', materialCode: '', categoryCode: '', mode: 'percent', basisField: 'moisture',
  amountTonnes: 0, effectiveFrom: '', enabled: true, remark: '',
  ranges: [{ minValue: '', maxValue: '', ratePercent: 0 }],
};

const modeLabel = { amount: '按吨扣减', percent: '按比例扣减' } as const;
const basisLabel: Record<string, string> = { moisture: '水分' };

function rangeText(rule: DeductionRule): string {
  if (rule.mode === 'amount') return `${(rule.amountMilliTonne / 1000).toFixed(3)} 吨`;
  if (rule.ranges.length === 0) return '—';
  return rule.ranges.map((item) => `${item.minValue}~${item.maxValue ?? '不限'} → ${(item.rateBp / 100).toFixed(2)}%`).join('；');
}

function toInput(values: Values): DeductionRuleInput {
  return {
    code: values.code?.trim() ?? '',
    materialCode: values.materialCode,
    categoryCode: values.categoryCode,
    mode: values.mode,
    basisField: values.mode === 'percent' ? values.basisField : '',
    amountMilliTonne: values.mode === 'amount' ? Math.round((values.amountTonnes ?? 0) * 1000) : 0,
    effectiveFrom: values.effectiveFrom?.trim() ?? '',
    enabled: values.enabled,
    remark: values.remark?.trim() ?? '',
    ranges: values.mode === 'percent'
      ? (values.ranges ?? []).map<DeductionRangeInput>((item) => ({
        minValue: item.minValue?.trim() ?? '',
        maxValue: item.maxValue?.trim() ?? '',
        rateBp: Math.round((item.ratePercent ?? 0) * 100),
      }))
      : [],
  };
}

export default function DeductionRulesPage() {
  const { message, modal } = App.useApp();
  const client = useQueryClient();
  const { has } = usePermissions();
  const canManage = has('grain-intake:deduction-rules');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DeductionRule | null>(null);
  const [materialFilter, setMaterialFilter] = useState<string>();
  const [form] = Form.useForm<Values>();
  const mode = Form.useWatch('mode', form) ?? 'percent';

  const categories = useQuery({ queryKey: ['deduction-categories'], queryFn: deductionCategories });
  const materialList = useQuery({ queryKey: ['weighbridge-materials'], queryFn: materials });
  const rules = useQuery({ queryKey: ['deduction-rules', materialFilter], queryFn: () => deductionRules(materialFilter) });
  const refresh = () => void client.invalidateQueries({ queryKey: ['deduction-rules'] });

  const save = useMutation({
    mutationFn: (values: Values) => saveDeductionRule(toInput(values), editing?.id),
    onSuccess: () => { setOpen(false); message.success('扣减规则已保存'); refresh(); },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const materialOptions = (materialList.data ?? []).filter((item) => item.enabled).map((item) => ({ value: item.code, label: `${item.name}（${item.code}）` }));
  const categoryOptions = (categories.data ?? []).filter((item: DeductionCategory) => item.enabled).map((item) => ({ value: item.code, label: item.name }));

  const edit = (rule: DeductionRule) => {
    setEditing(rule);
    form.setFieldsValue({
      code: rule.code, materialCode: rule.materialCode, categoryCode: rule.categoryCode,
      mode: rule.mode, basisField: rule.basisField === 'moisture' ? 'moisture' : '', amountTonnes: rule.amountMilliTonne / 1000,
      effectiveFrom: rule.effectiveFrom ? rule.effectiveFrom.slice(0, 10) : '', enabled: rule.enabled, remark: rule.remark,
      ranges: rule.ranges.length > 0
        ? rule.ranges.map((item) => ({ minValue: item.minValue, maxValue: item.maxValue ?? '', ratePercent: item.rateBp / 100 }))
        : [{ minValue: '', maxValue: '', ratePercent: 0 }],
    });
    setOpen(true);
  };

  const remove = (rule: DeductionRule) => {
    modal.confirm({
      title: '删除扣减规则',
      content: `确认删除“${rule.materialName} / ${rule.categoryName} / 版本 ${rule.version}”？同编码的其他版本不受影响，删除后不可恢复。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteDeductionRule(rule.id);
          message.success('扣减规则已删除');
          refresh();
        } catch (error) {
          message.error(getApiErrorMessage(error));
          throw error;
        }
      },
    });
  };

  const columns: ColumnsType<DeductionRule> = [
    { title: '物料', dataIndex: 'materialName', key: 'materialName' },
    { title: '扣减类别', dataIndex: 'categoryName', key: 'categoryName', width: 110 },
    { title: '方式', dataIndex: 'mode', key: 'mode', width: 110, render: (value: 'amount' | 'percent') => modeLabel[value] },
    { title: '依据', dataIndex: 'basisField', key: 'basisField', width: 90, render: (value: string) => basisLabel[value] ?? '—' },
    { title: '规则', key: 'rule', render: (_: unknown, row) => <Typography.Text ellipsis={{ tooltip: rangeText(row) }} style={{ maxWidth: 300 }}>{rangeText(row)}</Typography.Text> },
    { title: '版本', dataIndex: 'version', key: 'version', width: 70 },
    { title: '生效日期', dataIndex: 'effectiveFrom', key: 'effectiveFrom', width: 120, render: (value: string) => value ? value.slice(0, 10) : '立即' },
    { title: '状态', dataIndex: 'enabled', key: 'enabled', width: 90, render: (value: boolean) => value ? <Tag color="green">启用</Tag> : <Tag>停用</Tag> },
    ...(canManage ? [{
      title: '操作', key: 'actions', width: 130,
      render: (_: unknown, row: DeductionRule) => <Space size={4}>
        <Button type="link" size="small" onClick={() => edit(row)}>编辑</Button>
        <Button type="link" size="small" danger onClick={() => remove(row)}>删除</Button>
      </Space>,
    }] : []),
  ];

  return <>
    <PageHeader title="扣减规则" />
    <Space orientation="vertical" size="middle" style={{ width: '100%', marginTop: 20 }}>
      <Space wrap align="end" style={{ width: '100%', justifyContent: 'space-between' }}>
        <Select allowClear placeholder="按物料筛选" style={{ width: 260 }} options={materialOptions} value={materialFilter} onChange={setMaterialFilter} />
        {canManage && <Button type="primary" icon={<Plus size={16} />} onClick={() => {
          setEditing(null); form.resetFields(); form.setFieldsValue(blank); setOpen(true);
        }}>新增规则</Button>}
      </Space>
      {rules.isError && <Alert type="error" title={getApiErrorMessage(rules.error)} action={<Button onClick={() => void rules.refetch()}>重试</Button>} />}
      <Table
        rowKey="id"
        columns={columns}
        dataSource={rules.data ?? []}
        loading={rules.isLoading}
        pagination={false}
        size="middle"
      />
    </Space>
    <Modal
      title={editing ? '编辑扣减规则' : '新增扣减规则'}
      open={open}
      width={820}
      onCancel={() => setOpen(false)}
      onOk={() => {
        void form.validateFields().then((values) => save.mutate(values)).catch(() => {});
      }}
      confirmLoading={save.isPending}
      okText="保存"
      cancelText="取消"
      destroyOnHidden
    >
      <Form form={form} layout="vertical" initialValues={blank} className={styles.ruleForm}>
        <section className={styles.formSection}>
          <div className={styles.sectionTitle}>基本信息</div>
          <div className={styles.grid3}>
            <Form.Item name="materialCode" label="物料" rules={[{ required: true, message: '请选择物料' }]}>
              <Select showSearch optionFilterProp="label" options={materialOptions} />
            </Form.Item>
            <Form.Item name="categoryCode" label="扣减类别" rules={[{ required: true, message: '请选择扣减类别' }]}>
              <Select options={categoryOptions} />
            </Form.Item>
            <Form.Item name="code" label="规则编码" extra="留空自动生成">
              <Input maxLength={40} placeholder="留空自动生成" disabled={!!editing} />
            </Form.Item>
          </div>
        </section>
        <section className={styles.formSection}>
          <div className={styles.sectionTitle}>扣减方式</div>
          <Form.Item name="mode" rules={[{ required: true }]}>
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              options={[
                { value: 'amount', label: '按吨直接扣减' },
                { value: 'percent', label: '按水分比例扣减' },
              ]}
            />
          </Form.Item>
          {mode === 'amount'
            ? <div className={styles.grid2}>
              <Form.Item name="amountTonnes" label="每车扣减重量" rules={[{ required: true, message: '请填写扣减重量' }]}>
                <InputNumber min={0.001} step={0.001} precision={3} suffix="吨/车" style={{ width: '100%' }} />
              </Form.Item>
              <div className={styles.fieldHint}>按固定重量扣减，不依赖化验检测值。</div>
            </div>
            : <>
              <div className={styles.grid2}>
                <Form.Item name="basisField" label="检测值依据" rules={[{ required: true, message: '请选择依据' }]}>
                  <Select options={[{ value: 'moisture', label: '水分（%）' }]} />
                </Form.Item>
                <div className={styles.fieldHint}>按化验水分落入的区间比例扣减；比例由磅房按最终净重折算吨数。</div>
              </div>
              <Form.List name="ranges" rules={[{
                validator: async (_, value: RangeValues[]) => {
                  if (!value || value.length === 0) throw new Error('至少配置一个区间');
                },
              }]}>
                {(fields, { add, remove: removeRange }) => <div className={styles.ranges}>
                  <div className={styles.rangeHeader}>
                    <Typography.Text strong>扣减区间</Typography.Text>
                    <Button type="dashed" size="small" onClick={() => add({ minValue: '', maxValue: '', ratePercent: 0 })}>添加区间</Button>
                  </div>
                  {fields.map((field, index) => <div key={field.key} className={styles.rangeCard}>
                    <div className={styles.rangeCardHead}>
                      <span>区间 {index + 1}</span>
                      {fields.length > 1 && <Button type="text" size="small" danger onClick={() => removeRange(field.name)}>删除</Button>}
                    </div>
                    <div className={styles.rangeGrid}>
                      <Form.Item label="起点（含）" name={[field.name, 'minValue']} rules={[{ required: true, message: '必填' }]}>
                        <InputNumber stringMode min="0" precision={6} placeholder="例如 13.0" style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item label="终点（不含）" name={[field.name, 'maxValue']}>
                        <InputNumber stringMode min="0" precision={6} placeholder="留空表示不限" style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item label="扣减比例（%）" name={[field.name, 'ratePercent']} rules={[{ required: true, message: '必填' }]}>
                        <InputNumber min={0} max={100} step={0.01} precision={2} suffix="%" style={{ width: '100%' }} />
                      </Form.Item>
                    </div>
                  </div>)}
                </div>}
              </Form.List>
            </>}
        </section>
        <section className={styles.formSection}>
          <div className={styles.sectionTitle}>生效与备注</div>
          <div className={styles.grid3}>
            <Form.Item name="effectiveFrom" label="生效日期" extra="留空表示立即生效">
              <Input placeholder="2026-01-01" />
            </Form.Item>
            <Form.Item name="enabled" label="启用" valuePropName="checked">
              <Switch />
            </Form.Item>
            <div />
          </div>
          <Form.Item name="remark" label="备注" style={{ marginBottom: 0 }}>
            <Input.TextArea rows={3} maxLength={500} showCount placeholder="选填，说明规则来源或适用范围" />
          </Form.Item>
        </section>
      </Form>
    </Modal>
  </>;
}
