import { useState } from 'react';
import { Alert, App, Button, Form, Input, InputNumber, Modal, Radio, Select, Space, Switch, Table, Tag, Tooltip, Typography } from 'antd';
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
  amountTonnes: number;
  enabled: boolean;
  remark: string;
  ranges: RangeValues[];
}

const blank: Values = {
  code: '', materialCode: '', categoryCode: '', mode: 'percent',
  amountTonnes: 0, enabled: true, remark: '',
  ranges: [{ minValue: '', maxValue: '', ratePercent: 0 }],
};

const modeLabel = { amount: '按吨扣减', percent: '按百分比扣减' } as const;

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
    basisField: values.mode === 'percent' ? 'moisture' : '',
    amountMilliTonne: values.mode === 'amount' ? Math.round((values.amountTonnes ?? 0) * 1000) : 0,
    effectiveFrom: '',
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
  const materialCode = Form.useWatch('materialCode', form);

  const categories = useQuery({ queryKey: ['deduction-categories'], queryFn: deductionCategories });
  const materialList = useQuery({ queryKey: ['weighbridge-materials'], queryFn: materials });
  const rules = useQuery({ queryKey: ['deduction-rules', materialFilter], queryFn: () => deductionRules(materialFilter) });
  const refresh = () => void client.invalidateQueries({ queryKey: ['deduction-rules'] });

  const save = useMutation({
    mutationFn: (values: Values) => saveDeductionRule(toInput(values), editing?.id),
    onSuccess: () => { setOpen(false); message.success('扣减规则已保存'); refresh(); },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const materialsByCode = new Map((materialList.data ?? []).map((item) => [item.code, item]));
  const filterMaterialOptions = (materialList.data ?? []).map((item) => ({ value: item.code, label: `${item.name}（${item.code}）` }));
  const ruleMaterialOptions = (materialList.data ?? [])
    .filter((item) => item.enabled || item.code === editing?.materialCode)
    .map((item) => ({
      value: item.code,
      label: `${item.name}（${item.code}）${item.inspectionMethod === 'visual' ? ' · 目测检验，不适用扣减规则' : ''}`,
      disabled: item.inspectionMethod === 'visual' && item.code !== editing?.materialCode,
    }));
  const categoryOptions = (categories.data ?? []).filter((item: DeductionCategory) => item.enabled).map((item) => ({ value: item.code, label: item.name }));
  const selectedMaterial = materialCode ? materialsByCode.get(materialCode) : undefined;
  const selectedIsVisual = selectedMaterial?.inspectionMethod === 'visual';

  const edit = (rule: DeductionRule) => {
    setEditing(rule);
    form.setFieldsValue({
      code: rule.code, materialCode: rule.materialCode, categoryCode: rule.categoryCode,
      mode: rule.mode, amountTonnes: rule.amountMilliTonne / 1000,
      enabled: rule.enabled, remark: rule.remark,
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
    {
      title: '物料', dataIndex: 'materialName', key: 'materialName', width: 200,
      render: (value: string, row) => <Space size={4}><span>{value}</span>{materialsByCode.get(row.materialCode)?.inspectionMethod === 'visual' && <Tag color="orange">目测</Tag>}</Space>,
    },
    { title: '扣减类别', dataIndex: 'categoryName', key: 'categoryName', width: 110 },
    { title: '方式', dataIndex: 'mode', key: 'mode', width: 120, render: (value: 'amount' | 'percent') => modeLabel[value] },
    { title: '规则', key: 'rule', ellipsis: { showTitle: false }, render: (_: unknown, row) => <Tooltip title={rangeText(row)}><span>{rangeText(row)}</span></Tooltip> },
    { title: '版本', dataIndex: 'version', key: 'version', width: 70 },
    {
      title: '状态', dataIndex: 'enabled', key: 'enabled', width: 120,
      render: (value: boolean, row) => {
        if (!value) return <Tag>停用</Tag>;
        if (materialsByCode.get(row.materialCode)?.inspectionMethod === 'visual') {
          return <Tooltip title="物料为目测检验，不会生成化验单，规则不会生效"><Tag color="orange">启用 · 不生效</Tag></Tooltip>;
        }
        return <Tag color="green">启用</Tag>;
      },
    },
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
        <Select allowClear placeholder="按物料筛选" style={{ width: 260 }} options={filterMaterialOptions} value={materialFilter} onChange={setMaterialFilter} />
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
        void form.validateFields().then((values) => {
          const material = materialsByCode.get(values.materialCode);
          if (material?.inspectionMethod === 'visual' && values.enabled) {
            message.error('目测检验物料不能启用扣减规则，请先停用规则或调整物料检验方式');
            return;
          }
          save.mutate(values);
        }).catch(() => {});
      }}
      confirmLoading={save.isPending}
      okText="保存"
      cancelText="取消"
      destroyOnHidden
    >
      {selectedIsVisual && <Alert
        type="warning"
        showIcon
        title="该物料的扣减规则不会生效"
        description="物料为目测检验，云端不会生成化验单。可以保存为停用以便后续清理；如需启用，请先在物料维护中改为化验检验。"
        style={{ marginBottom: 16 }}
      />}
      <Form form={form} layout="vertical" initialValues={blank} className={styles.ruleForm}>
        <section className={styles.formSection}>
          <div className={styles.sectionTitle}>基本信息</div>
          <div className={styles.grid3}>
            <Form.Item name="materialCode" label="物料" rules={[{ required: true, message: '请选择物料' }]}>
              <Select showSearch optionFilterProp="label" options={ruleMaterialOptions} />
            </Form.Item>
            <Form.Item name="categoryCode" label="扣减类别" rules={[{ required: true, message: '请选择扣减类别' }]}>
              <Select options={categoryOptions} />
            </Form.Item>
            <Form.Item name="code" label="规则编码（选填）">
              <Input maxLength={40} disabled={!!editing} />
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
                { value: 'percent', label: '按百分比扣减' },
              ]}
            />
          </Form.Item>
          {mode === 'amount'
            ? <Form.Item name="amountTonnes" label="每车扣减重量" rules={[{ required: true, message: '请填写扣减重量' }]} style={{ maxWidth: 320 }}>
              <InputNumber min={0.001} step={0.001} precision={3} suffix="吨/车" style={{ width: '100%' }} />
            </Form.Item>
            : <Form.List name="ranges" rules={[{
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
              </Form.List>}
        </section>
        <section className={styles.formSection}>
          <div className={styles.sectionTitle}>状态与备注</div>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="remark" label="备注" style={{ marginBottom: 0 }}>
            <Input.TextArea rows={3} maxLength={500} showCount placeholder="选填，说明规则来源或适用范围" />
          </Form.Item>
        </section>
      </Form>
    </Modal>
  </>;
}
