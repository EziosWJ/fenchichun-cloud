import { useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd';
import { Plus } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../components/PageHeader';
import { SearchFilterBar } from '../../components/SearchFilterBar';
import { DataTable } from '../../components/DataTable';
import { StatusTag } from '../../components/StatusTag';
import { CONFIG_TYPE_OPTIONS, ENABLED_STATUS_OPTIONS, VALUE_TYPE_OPTIONS } from '../../config/options';
import { commonMessages } from '../../config/messages';
import { useListUrlState } from '../../hooks/useListUrlState';
import { useListDraft } from '../../hooks/useListDraft';
import { queryKeys } from '../../lib/queryKeys';
import { getApiErrorMessage } from '../../lib/api/errors';
import { formatDateTime } from '../../utils/format';
import {
  createConfig,
  deleteConfig,
  deleteConfigs,
  listConfigs,
  setConfigStatus,
  updateConfig,
} from '../../features/configs/api';
import type { ConfigInput, ConfigRecord } from '../../types/system';
import type { ColumnsType } from 'antd/es/table';

const listConfig = {
  filters: { configName: 'text', configKey: 'text', configType: ['SYSTEM', 'CUSTOM'], status: ['0', '1'] },
  sortKeys: [],
  pageSizeOptions: [10, 20, 50, 100],
  defaultPageSize: 10,
} as const;

type ConfigFormValues = ConfigInput;

export default function ConfigsPage() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const { state, actions } = useListUrlState(listConfig);
  const { draft, setKeyword, setFilter, reset } = useListDraft(state.keyword, state.filters);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ConfigRecord | null>(null);
  const [selectedRows, setSelectedRows] = useState<ConfigRecord[]>([]);
  const [form] = Form.useForm<ConfigFormValues>();

  const query = useMemo(
    () => ({
      page: state.page,
      pageSize: state.pageSize,
      configName: state.filters.configName || undefined,
      configKey: state.filters.configKey || undefined,
      configType: (state.filters.configType as ConfigRecord['configType']) || undefined,
      status: state.filters.status === '0' ? (0 as const) : state.filters.status === '1' ? (1 as const) : undefined,
    }),
    [state],
  );

  const configsQuery = useQuery({ queryKey: queryKeys.configs.list(query), queryFn: () => listConfigs(query) });
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: queryKeys.configs.all });

  const saveMutation = useMutation({
    mutationFn: (values: ConfigFormValues) => (editing ? updateConfig(editing.id, values) : createConfig(values)),
    onSuccess: () => {
      message.success(editing ? commonMessages.updated : commonMessages.created);
      setFormOpen(false);
      setEditing(null);
      invalidate();
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 0 | 1 }) => setConfigStatus(id, status),
    onSuccess: () => {
      message.success('状态已更新');
      invalidate();
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteConfig(id),
    onSuccess: () => {
      message.success(commonMessages.deleted);
      invalidate();
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const batchDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => deleteConfigs(ids),
    onSuccess: () => {
      message.success(commonMessages.deleted);
      setSelectedRows([]);
      invalidate();
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: 1, configType: 'CUSTOM', valueType: 'TEXT' });
    setFormOpen(true);
  };

  const openEdit = (record: ConfigRecord) => {
    setEditing(record);
    form.setFieldsValue({
      configName: record.configName,
      configKey: record.configKey,
      configValue: record.configValue ?? undefined,
      configType: record.configType,
      valueType: record.valueType,
      status: record.status,
      remark: record.remark ?? undefined,
    });
    setFormOpen(true);
  };

  const columns: ColumnsType<ConfigRecord> = [
    { title: '配置名称', dataIndex: 'configName', width: 180 },
    {
      title: '配置键',
      dataIndex: 'configKey',
      width: 220,
      render: (value, record) => (
        <Space size={6}>
          <Typography.Text code>{value}</Typography.Text>
          {record.isBuiltin === 1 && <Tag color="blue">内置</Tag>}
        </Space>
      ),
    },
    { title: '配置值', dataIndex: 'configValue', width: 200, ellipsis: true, render: (value) => value ?? '—' },
    {
      title: '类型',
      dataIndex: 'configType',
      width: 110,
      render: (value: ConfigRecord['configType']) => (value === 'SYSTEM' ? '系统配置' : '自定义'),
    },
    {
      title: '值类型',
      dataIndex: 'valueType',
      width: 100,
      render: (value: ConfigRecord['valueType']) => VALUE_TYPE_OPTIONS.find((item) => item.value === value)?.label ?? value,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 140,
      render: (value: 0 | 1, record) => (
        <Space size={6}>
          <Switch
            size="small"
            checked={value === 1}
            disabled={record.isBuiltin === 1}
            aria-label={`切换配置 ${record.configKey} 状态`}
            loading={statusMutation.isPending}
            onChange={(checked) => statusMutation.mutate({ id: record.id, status: checked ? 1 : 0 })}
          />
          <StatusTag value={value} options={ENABLED_STATUS_OPTIONS} />
        </Space>
      ),
    },
    { title: '更新时间', dataIndex: 'updateTime', width: 170, render: (value) => formatDateTime(value) },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      fixed: 'right',
      render: (_, record) => (
        <Space size={2}>
          <Button type="link" size="small" onClick={() => openEdit(record)}>编辑</Button>
          <Button
            type="link"
            size="small"
            danger
            disabled={record.isBuiltin === 1}
            onClick={() =>
              modal.confirm({
                title: `删除配置“${record.configName}”`,
                content: '删除后依赖该配置键的功能可能回退到默认行为。',
                okText: '删除',
                cancelText: '取消',
                okButtonProps: { danger: true },
                onOk: () => deleteMutation.mutateAsync(record.id),
              })
            }
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="pageStack">
      <PageHeader
        title="配置管理"
        description="系统运行参数与自定义配置。新增或修改后以数据库为准，内置配置受保护。"
        extra={<Button type="primary" icon={<Plus size={16} />} onClick={openCreate}>新建配置</Button>}
      />

      <SearchFilterBar
        onSubmit={() =>
          actions.applyFilters(draft.keyword, {
            configName: draft.filters.configName,
            configKey: draft.filters.configKey,
            configType: draft.filters.configType,
            status: draft.filters.status,
          })
        }
        onReset={() => {
          reset();
          actions.reset();
        }}
      >
        <Input allowClear placeholder="配置名称" value={draft.filters.configName ?? ''} onChange={(event) => setFilter('configName', event.target.value)} style={{ width: 180 }} aria-label="按配置名称筛选" />
        <Input allowClear placeholder="配置键" value={draft.filters.configKey ?? ''} onChange={(event) => setFilter('configKey', event.target.value)} style={{ width: 200 }} aria-label="按配置键筛选" />
        <Select allowClear placeholder="配置类型" value={draft.filters.configType} onChange={(value) => setFilter('configType', value)} style={{ width: 140 }} options={[...CONFIG_TYPE_OPTIONS]} aria-label="按配置类型筛选" />
        <Select allowClear placeholder="状态" value={draft.filters.status} onChange={(value) => setFilter('status', value)} style={{ width: 120 }} options={ENABLED_STATUS_OPTIONS} aria-label="按状态筛选" />
        <Input allowClear placeholder="关键词" value={draft.keyword} onChange={(event) => setKeyword(event.target.value)} style={{ width: 200 }} aria-label="关键词搜索" />
      </SearchFilterBar>

      {configsQuery.isError && <Alert type="error" showIcon title="配置列表加载失败" description={getApiErrorMessage(configsQuery.error)} />}

      <DataTable<ConfigRecord>
        tableKey="system-configs"
        columns={columns}
        dataSource={configsQuery.data?.items ?? []}
        rowKey="id"
        total={configsQuery.data?.total}
        page={state.page}
        pageSize={state.pageSize}
        onPageChange={(page, pageSize) => actions.setPage(page, pageSize)}
        loading={configsQuery.isLoading}
        selectable
        onSelectionChange={setSelectedRows}
        selectionResetKey={JSON.stringify(query)}
        batchActions={(rows) => (
          <Button
            danger
            disabled={rows.length === 0}
            onClick={() =>
              modal.confirm({
                title: `批量删除 ${rows.length} 条配置`,
                content: '内置配置会在后端被拒绝删除。',
                okText: '删除',
                cancelText: '取消',
                okButtonProps: { danger: true },
                onOk: () => batchDeleteMutation.mutateAsync(rows.map((row) => row.id)),
              })
            }
          >
            批量删除
          </Button>
        )}
        onRefresh={() => void configsQuery.refetch()}
        refreshing={configsQuery.isFetching}
        toolbarActions={<Typography.Text type="secondary">已选 {selectedRows.length} 项</Typography.Text>}
      />

      <Modal
        title={editing ? `编辑配置：${editing.configName}` : '新建配置'}
        open={formOpen}
        width={560}
        onCancel={() => setFormOpen(false)}
        onOk={() => void form.submit()}
        okText="保存"
        cancelText="取消"
        confirmLoading={saveMutation.isPending}
        destroyOnHidden
      >
        <Form<ConfigFormValues> form={form} layout="vertical" onFinish={(values) => saveMutation.mutate(values)}>
          <Form.Item name="configName" label="配置名称" rules={[{ required: true, whitespace: true, message: '请输入配置名称' }]}>
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="configKey" label="配置键" rules={[{ required: true, whitespace: true, message: '请输入配置键' }]}>
            <Input maxLength={100} disabled={Boolean(editing?.isBuiltin)} placeholder="system.example.enabled" />
          </Form.Item>
          <Form.Item name="configValue" label="配置值">
            <Input.TextArea rows={3} maxLength={2000} />
          </Form.Item>
          <Space size={12} wrap>
            <Form.Item name="configType" label="配置类型" rules={[{ required: true }]}>
              <Select style={{ width: 140 }} options={[...CONFIG_TYPE_OPTIONS]} disabled={Boolean(editing?.isBuiltin)} />
            </Form.Item>
            <Form.Item name="valueType" label="值类型" rules={[{ required: true }]}>
              <Select style={{ width: 140 }} options={[...VALUE_TYPE_OPTIONS]} />
            </Form.Item>
            <Form.Item name="status" label="状态" rules={[{ required: true }]}>
              <Select style={{ width: 120 }} options={ENABLED_STATUS_OPTIONS} />
            </Form.Item>
          </Space>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={2} maxLength={500} showCount /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
