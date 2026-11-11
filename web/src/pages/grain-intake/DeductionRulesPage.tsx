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
  saveDeductionRule,
  type DeductionCategory,
  type DeductionRangeInput,
  type DeductionRule,
  type DeductionRuleInput,
} from '../../features/deduction/api';
import { materials } from '../../features/weighbridge/api';
import { getApiErrorMessage } from '../../lib/api/errors';

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
  basisField: '' | 'moisture' | 'impurity';
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
const basisLabel: Record<string, string> = { moisture: '水分', impurity: '杂质' };

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
  const { message } = App.useApp();
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
      mode: rule.mode, basisField: rule.basisField, amountTonnes: rule.amountMilliTonne / 1000,
      effectiveFrom: rule.effectiveFrom ? rule.effectiveFrom.slice(0, 10) : '', enabled: rule.enabled, remark: rule.remark,
      ranges: rule.ranges.length > 0
        ? rule.ranges.map((item) => ({ minValue: item.minValue, maxValue: item.maxValue ?? '', ratePercent: item.rateBp / 100 }))
        : [{ minValue: '', maxValue: '', ratePercent: 0 }],
    });
    setOpen(true);
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
      title: '操作', key: 'actions', width: 90,
      render: (_: unknown, row: DeductionRule) => <Button type="link" size="small" onClick={() => edit(row)}>编辑</Button>,
    }] : []),
  ];

  return <>
    <PageHeader title="扣减规则" description="按物料配置水分、杂质等扣减类别。比例规则由云端给出比例，磅房按最终净重折算吨数；编辑生成新版本，未来生效的版本不覆盖当前版本。" />
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
      width={760}
      onCancel={() => setOpen(false)}
      onOk={() => void form.validateFields().then((values) => save.mutate(values))}
      confirmLoading={save.isPending}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" initialValues={blank}>
        <Space wrap align="start">
          <Form.Item name="materialCode" label="物料" rules={[{ required: true, message: '请选择物料' }]} style={{ width: 280 }}>
            <Select showSearch optionFilterProp="label" options={materialOptions} />
          </Form.Item>
          <Form.Item name="categoryCode" label="扣减类别" rules={[{ required: true, message: '请选择扣减类别' }]} style={{ width: 180 }}>
            <Select options={categoryOptions} />
          </Form.Item>
          <Form.Item name="code" label="规则编码" style={{ width: 180 }}>
            <Input maxLength={40} placeholder="留空自动生成" disabled={!!editing} />
          </Form.Item>
        </Space>
        <Form.Item name="mode" label="扣减方式" rules={[{ required: true }]}>
          <Radio.Group options={[{ value: 'amount', label: '按吨直接扣减' }, { value: 'percent', label: '按检测值比例扣减' }]} />
        </Form.Item>
        {mode === 'amount'
          ? <Form.Item name="amountTonnes" label="每车扣减重量（吨）" rules={[{ required: true, message: '请填写扣减重量' }]}>
            <InputNumber min={0.001} step={0.001} precision={3} style={{ width: 200 }} />
          </Form.Item>
          : <>
            <Form.Item name="basisField" label="检测值依据" rules={[{ required: true, message: '请选择依据' }]}>
              <Select style={{ width: 200 }} options={[
                { value: 'moisture', label: '水分（%）' },
                { value: 'impurity', label: '杂质（%）' },
              ]} />
            </Form.Item>
            <Form.List name="ranges" rules={[{
              validator: async (_, value: RangeValues[]) => {
                if (!value || value.length === 0) throw new Error('至少配置一个区间');
              },
            }]}>
              {(fields, { add, remove }) => <Space orientation="vertical" style={{ width: '100%' }}>
                <Typography.Text strong>扣减区间</Typography.Text>
                {fields.map((field, index) => <Space key={field.key} align="baseline" wrap>
                  <Form.Item label={index === 0 ? '起点（含）' : '起点'} name={[field.name, 'minValue']} rules={[{ required: true, message: '必填' }]}>
                    <Input style={{ width: 120 }} placeholder="例如 13.0" />
                  </Form.Item>
                  <Form.Item label="终点（不含）" name={[field.name, 'maxValue']}>
                    <Input style={{ width: 120 }} placeholder="留空表示不限" />
                  </Form.Item>
                  <Form.Item label="扣减比例（%）" name={[field.name, 'ratePercent']} rules={[{ required: true, message: '必填' }]}>
                    <InputNumber min={0} max={100} step={0.01} precision={2} style={{ width: 140 }} />
                  </Form.Item>
                  <Button type="link" danger onClick={() => remove(field.name)}>删除</Button>
                </Space>)}
                <Button type="dashed" onClick={() => add({ minValue: '', maxValue: '', ratePercent: 0 })}>添加区间</Button>
              </Space>}
            </Form.List>
          </>}
        <Space wrap align="start">
          <Form.Item name="effectiveFrom" label="生效日期" style={{ width: 180 }}>
            <Input placeholder="2026-01-01，留空立即" />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item>
        </Space>
        <Form.Item name="remark" label="备注"><Input.TextArea rows={3} maxLength={500} /></Form.Item>
      </Form>
    </Modal>
  </>;
}
