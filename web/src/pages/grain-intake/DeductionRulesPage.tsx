import { useState } from 'react';
import { Alert, App, Button, Form, Input, InputNumber, Modal, Radio, Select, Space, Switch, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { useListUrlState } from '../../hooks/useListUrlState';
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
import { checkRanges, deductionMilliTonnes, matchRange, type RangeValues } from './deductionRuleDraft';
import styles from './DeductionRulesPage.module.css';

interface Values {
  code: string;
  materialCode: string;
  categoryCode: string;
  mode: 'amount' | 'percent';
  amountTonnes: number;
  enabled: boolean;
  remark: string;
  ranges: RangeValues[];
  trialMoisture?: number;
  trialNetTonnes?: number;
}

const blank: Values = {
  code: '', materialCode: '', categoryCode: '', mode: 'percent',
  amountTonnes: 0, enabled: true, remark: '',
  ranges: [{ minValue: '', maxValue: '', ratePercent: 0 }],
};

const modeLabel = { amount: '按吨扣减', percent: '按百分比扣减' } as const;
const listConfig = { filters: { material: 'text' }, sortKeys: [], defaultPageSize: 10, pageSizeOptions: [10, 20, 50] } as const;
const effectiveTimeFormat = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'medium',
});

function effectiveTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? effectiveTimeFormat.format(date) : '—';
}

function bandText(min: string, max: string | null) {
  return max ? `[${min}%, ${max}%)` : `≥ ${min}%`;
}

function rangeText(rule: DeductionRule): string {
  if (rule.mode === 'amount') return `${(rule.amountMilliTonne / 1000).toFixed(3)} 吨`;
  if (rule.ranges.length === 0) return '—';
  return rule.ranges.map((item) => `${bandText(item.minValue, item.maxValue)} 扣 ${(item.rateBp / 100).toFixed(2)}%`).join('；');
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
  const { state, actions } = useListUrlState(listConfig);
  const canManage = has('grain-intake:deduction-rules');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DeductionRule | null>(null);
  const materialFilter = state.filters.material;
  const [form] = Form.useForm<Values>();
  const mode = Form.useWatch('mode', form) ?? 'percent';
  const materialCode = Form.useWatch('materialCode', form);
  const enabled = Form.useWatch('enabled', form);
  const ranges = Form.useWatch('ranges', form) ?? blank.ranges;
  const amountTonnes = Form.useWatch('amountTonnes', form);
  const trialMoisture = Form.useWatch('trialMoisture', form);
  const trialNetTonnes = Form.useWatch('trialNetTonnes', form);
  const rangeCheck = checkRanges(ranges);
  const matchedIndex = mode === 'percent' && rangeCheck.complete && !rangeCheck.error &&
    trialMoisture != null && trialMoisture >= 0 && trialMoisture <= 100 ? matchRange(ranges, trialMoisture) : undefined;

  const categories = useQuery({ queryKey: ['deduction-categories'], queryFn: deductionCategories });
  const materialList = useQuery({ queryKey: ['weighbridge', 'materials'], queryFn: materials });
  const rules = useQuery({ queryKey: ['deduction-rules'], queryFn: () => deductionRules() });
  const refresh = () => void client.invalidateQueries({ queryKey: ['deduction-rules'] });

  const save = useMutation({
    mutationFn: (values: Values) => saveDeductionRule(toInput(values), editing?.id),
    onSuccess: (rule) => { setOpen(false); message.success(`已保存 ${rule.code} 版本 ${rule.version}`); refresh(); },
  });
  const rows = (rules.data ?? []).filter((rule) => !materialFilter || rule.materialCode === materialFilter);
  const now = Date.now();
  const currentVersions = new Map<string, number>();
  for (const rule of rules.data ?? []) {
    if (Date.parse(rule.effectiveFrom) <= now) {
      currentVersions.set(rule.code, Math.max(currentVersions.get(rule.code) ?? 0, rule.version));
    }
  }

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
    save.reset();
    setEditing(rule);
    form.resetFields();
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

  const submit = async () => {
    const values = await form.validateFields().catch(() => undefined);
    if (!values) return;
    if (values.mode === 'percent') {
      const { error, complete } = checkRanges(values.ranges ?? []);
      if (error || !complete) return;
    }
    if (materialsByCode.get(values.materialCode)?.inspectionMethod === 'visual' && values.enabled) {
      message.error('目测检验物料不能启用扣减规则，请先停用规则或调整物料检验方式');
      return;
    }
    if (editing && !values.enabled && (rules.data ?? []).some((rule) =>
      rule.code === editing.code && rule.version === currentVersions.get(rule.code) && rule.enabled)) {
      modal.confirm({
        title: `停用规则「${editing.code}」？`,
        content: '保存后，当前版本由停用的新版本替代，此编码的规则将停止用于后续计算。',
        okText: '确认停用',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: async () => {
          try {
            await save.mutateAsync(values);
          } catch (error) {
            message.error(getApiErrorMessage(error));
            throw error;
          }
        },
      });
    } else {
      save.mutate(values);
    }
  };

  const remove = (rule: DeductionRule) => {
    modal.confirm({
      title: '删除扣减规则',
      content: `确认删除「${rule.code}」版本 ${rule.version}？删除后无法恢复。若删除当前版本，系统将按同编码其余版本的生效时间和启用状态重新判定。`,
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
      title: '物料', dataIndex: 'materialName', key: 'materialName', width: 150,
      render: (value: string, row) => <Space size={4}><span>{value}</span>{materialsByCode.get(row.materialCode)?.inspectionMethod === 'visual' && <Tag color="orange">目测</Tag>}</Space>,
    },
    { title: '扣减类别', dataIndex: 'categoryName', key: 'categoryName', width: 90 },
    { title: '方式', dataIndex: 'mode', key: 'mode', width: 110, render: (value: 'amount' | 'percent') => modeLabel[value] },
    { title: '规则', key: 'rule', ellipsis: { showTitle: false }, render: (_: unknown, row) => <Tooltip title={rangeText(row)}><span>{rangeText(row)}</span></Tooltip> },
    { title: '规则编码 / 版本', key: 'version', width: 140, render: (_, row) => `${row.code} / ${row.version}` },
    { title: '生效时间（北京时间）', dataIndex: 'effectiveFrom', key: 'effectiveFrom', width: 170, render: effectiveTime },
    {
      title: '状态', dataIndex: 'enabled', key: 'enabled', width: 110,
      render: (value: boolean, row) => {
        if (Date.parse(row.effectiveFrom) > now) {
          return <Tag color="blue">{value ? '待生效' : '待停用'}</Tag>;
        }
        if ((currentVersions.get(row.code) ?? 0) > row.version) return <Tag>已被替代</Tag>;
        if (!value) return <Tag>停用</Tag>;
        if (materialsByCode.get(row.materialCode)?.inspectionMethod === 'visual') {
          return <Tooltip title="物料为目测检验，不会生成化验单，规则不会生效"><Tag color="orange">启用 · 不生效</Tag></Tooltip>;
        }
        return <Tag color="green">启用</Tag>;
      },
    },
    ...(canManage ? [{
      title: '操作', key: 'actions', width: 110,
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
        <Select aria-label="按物料筛选" allowClear placeholder="按物料筛选" style={{ width: 260 }} options={filterMaterialOptions} value={materialFilter} onChange={(value) => actions.setFilter('material', value)} />
        {canManage && <Button type="primary" icon={<Plus size={16} />} onClick={() => {
          save.reset(); setEditing(null); form.resetFields(); form.setFieldsValue(blank); setOpen(true);
        }}>新增规则</Button>}
      </Space>
      {rules.isError && <Alert type="error" title={getApiErrorMessage(rules.error)} action={<Button onClick={() => void rules.refetch()}>重试</Button>} />}
      <Table
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={rules.isLoading}
        scroll={{ x: 1050 }}
        pagination={{
          current: state.page, pageSize: state.pageSize, pageSizeOptions: [...listConfig.pageSizeOptions],
          onChange: actions.setPage,
        }}
        size="middle"
      />
    </Space>
    <Modal
      title={editing ? '编辑扣减规则' : '新增扣减规则'}
      open={open}
      width={820}
      centered
      onCancel={() => { if (!save.isPending) setOpen(false); }}
      onOk={() => void submit()}
      confirmLoading={save.isPending}
      okButtonProps={{ disabled: mode === 'percent' && !!rangeCheck.error }}
      okText="保存"
      cancelText="取消"
      destroyOnHidden
    >
      {save.isError && <Alert type="error" title={getApiErrorMessage(save.error)} style={{ marginBottom: 12 }} />}
      <Form form={form} layout="vertical" initialValues={blank} className={styles.ruleForm}>
        {selectedIsVisual && <Alert
          type="warning"
          showIcon
          title="该物料的扣减规则不会生效"
          description="物料为目测检验，云端不会生成化验单。可以保存为停用以便后续清理；如需启用，请先在物料维护中改为化验检验。"
          style={{ marginBottom: 16 }}
        />}
        <section className={styles.formSection}>
          <div className={styles.sectionTitle}>基本信息</div>
          <p className={styles.formNote}>{editing
            ? `当前编辑版本 ${editing.version}，生效时间 ${effectiveTime(editing.effectiveFrom)}（北京时间）。保存将生成下一版本，生效时间为保存时刻。`
            : '保存将生成版本 1，生效时间为保存时刻。'}</p>
          <div className={styles.grid3}>
            <Form.Item name="materialCode" label="物料" rules={[{ required: true, message: '请选择物料' }]}>
              <Select showSearch={{ optionFilterProp: 'label' }} options={ruleMaterialOptions} />
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
            ? <Form.Item name="amountTonnes" label="每车扣减重量" rules={[{ required: true, type: 'number', min: 0.001, message: '请填写大于零的扣减重量' }]} style={{ maxWidth: 320 }}>
              <InputNumber min={0.001} step={0.001} precision={3} suffix="吨/车" style={{ width: '100%' }} />
            </Form.Item>
            : <Form.List name="ranges">
                {(fields, { add, remove: removeRange }) => <div className={styles.ranges}>
                  <div className={styles.rangeHeader}>
                    <Typography.Text strong>扣减区间</Typography.Text>
                    <Button type="dashed" size="small" onClick={() => add({ minValue: '', maxValue: '', ratePercent: 0 })}>添加区间</Button>
                  </div>
                  <Typography.Text type="secondary">
                    按化验水分（%）匹配。起点计入，终点不计入。最后一个区间可留空终点。未覆盖的水分不会触发本规则。
                  </Typography.Text>
                  {rangeCheck.error && <Alert type="error" showIcon title={rangeCheck.error} />}
                  {!rangeCheck.error && rangeCheck.gaps.length > 0 && <Alert type="warning" showIcon
                    title={`区间存在断档：${rangeCheck.gaps.join('、')}`}
                    description="这些水分值不会触发本规则，允许保存。" />}
                  {fields.map((field, index) => <div key={field.key} className={styles.rangeCard}>
                    <div className={styles.rangeCardHead}>
                      <span>区间 {index + 1}</span>
                      {fields.length > 1 && <Button type="text" size="small" danger onClick={() => removeRange(field.name)}>删除</Button>}
                    </div>
                    <div className={styles.rangeGrid}>
                      <Form.Item label="水分起点（含）" name={[field.name, 'minValue']} rules={[{ required: true, message: '必填' }]}>
                        <InputNumber stringMode min="0" precision={6} placeholder="例如 13.0" style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item label="水分终点（不含）" name={[field.name, 'maxValue']}>
                        <InputNumber stringMode min="0" precision={6} placeholder="留空表示不限" style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item label="扣减比例（%）" name={[field.name, 'ratePercent']} rules={[{ required: true, type: 'number', min: 0, max: 100, message: '请输入 0 至 100 的比例' }]}>
                        <InputNumber min={0} max={100} step={0.01} precision={2} suffix="%" style={{ width: '100%' }} />
                      </Form.Item>
                    </div>
                  </div>)}
                </div>}
              </Form.List>}
        </section>
        <section className={styles.formSection}>
          <div className={styles.sectionTitle}>试算当前规则</div>
          <p className={styles.formNote}>按表单中的规则试算单项扣减，结果四舍五入至 0.001 吨。</p>
          {mode === 'percent' && <div className={styles.grid3}>
            <Form.Item name="trialMoisture" label="试算水分（%）">
              <InputNumber min={0} max={100} precision={6} placeholder="例如 14" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="trialNetTonnes" label="实际净重（吨）">
              <InputNumber min={0} max={Number.MAX_SAFE_INTEGER / 1000} precision={3} placeholder="例如 20" style={{ width: '100%' }} />
            </Form.Item>
          </div>}
          <div className={styles.trialResult} role="status">
            {mode === 'amount'
              ? (amountTonnes > 0 ? `预计扣减 ${amountTonnes.toFixed(3)} 吨/车` : '填写每车扣减重量后显示结果')
              : matchedIndex === undefined
                ? '配置有效区间并输入 0 至 100% 的水分后显示结果'
                : matchedIndex === -1
                  ? '未命中区间，本规则扣减 0.000 吨'
                  : <>命中区间 {matchedIndex + 1}，扣减比例 {ranges[matchedIndex].ratePercent?.toFixed(2)}%。
                    {trialNetTonnes != null && trialNetTonnes >= 0 && Number.isSafeInteger(Math.round(trialNetTonnes * 1000))
                      ? `预计扣减 ${(deductionMilliTonnes(trialNetTonnes, ranges[matchedIndex].ratePercent ?? 0) / 1000).toFixed(3)} 吨`
                      : '填写实际净重后显示扣减吨数'}</>}
          </div>
        </section>
        <section className={styles.formSection}>
          <div className={styles.sectionTitle}>状态与备注</div>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
          {enabled === false && <Alert type="warning" title="停用版本生效后，此编码的规则不再参与后续扣减计算。"
            style={{ marginBottom: 12 }} />}
          <Form.Item name="remark" label="备注" style={{ marginBottom: 0 }}>
            <Input.TextArea rows={3} maxLength={500} showCount placeholder="选填，说明规则来源或适用范围" />
          </Form.Item>
        </section>
      </Form>
    </Modal>
  </>;
}
