import { useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
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
import { ENABLED_STATUS_OPTIONS } from '../../config/options';
import { commonMessages } from '../../config/messages';
import { useListUrlState } from '../../hooks/useListUrlState';
import { useListDraft } from '../../hooks/useListDraft';
import { queryKeys } from '../../lib/queryKeys';
import { getApiErrorMessage } from '../../lib/api/errors';
import {
  createDictData,
  createDictType,
  deleteDictData,
  deleteDictType,
  listDictData,
  listDictTypes,
  setDictTypeStatus,
  updateDictData,
  updateDictType,
} from '../../features/dicts/api';
import type { DictDataInput, DictDataRecord, DictTypeInput, DictTypeRecord } from '../../types/system';
import type { ColumnsType } from 'antd/es/table';

const typeListConfig = {
  filters: { dictName: 'text', dictCode: 'text', status: ['0', '1'] },
  sortKeys: [],
  pageSizeOptions: [10, 20, 50],
  defaultPageSize: 10,
} as const;

export default function DictsPage() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const { state, actions } = useListUrlState(typeListConfig);
  const { draft, setKeyword, setFilter, reset } = useListDraft(state.keyword, state.filters);

  const [selectedType, setSelectedType] = useState<DictTypeRecord | null>(null);
  const [dataPage, setDataPage] = useState(1);
  const [dataPageSize, setDataPageSize] = useState(10);
  const [dataKeyword, setDataKeyword] = useState('');

  const [typeFormOpen, setTypeFormOpen] = useState(false);
  const [editingType, setEditingType] = useState<DictTypeRecord | null>(null);
  const [dataFormOpen, setDataFormOpen] = useState(false);
  const [editingData, setEditingData] = useState<DictDataRecord | null>(null);
  const [typeForm] = Form.useForm<DictTypeInput>();
  const [dataForm] = Form.useForm<DictDataInput>();

  const typeQuery = useMemo(
    () => ({
      page: state.page,
      pageSize: state.pageSize,
      dictName: state.filters.dictName || undefined,
      dictCode: state.filters.dictCode || undefined,
      status: state.filters.status === '0' ? (0 as const) : state.filters.status === '1' ? (1 as const) : undefined,
    }),
    [state],
  );

  const typesQuery = useQuery({
    queryKey: queryKeys.dicts.types(typeQuery),
    queryFn: () => listDictTypes(typeQuery),
  });

  const dataQueryParams = useMemo(
    () => ({
      page: dataPage,
      pageSize: dataPageSize,
      dictTypeId: selectedType?.id,
      dictLabel: dataKeyword || undefined,
    }),
    [dataKeyword, dataPage, dataPageSize, selectedType],
  );

  const dataQuery = useQuery({
    queryKey: queryKeys.dicts.data(dataQueryParams),
    queryFn: () => listDictData(dataQueryParams),
    enabled: Boolean(selectedType),
  });

  const invalidateTypes = () => void queryClient.invalidateQueries({ queryKey: queryKeys.dicts.all });
  const invalidateData = () => void queryClient.invalidateQueries({ queryKey: ['system', 'dicts', 'data'] });

  const typeSaveMutation = useMutation({
    mutationFn: (values: DictTypeInput) =>
      editingType ? updateDictType(editingType.id, values) : createDictType(values),
    onSuccess: () => {
      message.success(editingType ? commonMessages.updated : commonMessages.created);
      setTypeFormOpen(false);
      setEditingType(null);
      invalidateTypes();
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const typeStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 0 | 1 }) => setDictTypeStatus(id, status),
    onSuccess: () => {
      message.success('状态已更新');
      invalidateTypes();
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const typeDeleteMutation = useMutation({
    mutationFn: (id: number) => deleteDictType(id),
    onSuccess: (_data, id) => {
      message.success(commonMessages.deleted);
      if (selectedType?.id === id) setSelectedType(null);
      invalidateTypes();
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const dataSaveMutation = useMutation({
    mutationFn: (values: DictDataInput) =>
      editingData ? updateDictData(editingData.id, values) : createDictData(values),
    onSuccess: () => {
      message.success(editingData ? commonMessages.updated : commonMessages.created);
      setDataFormOpen(false);
      setEditingData(null);
      invalidateData();
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const dataDeleteMutation = useMutation({
    mutationFn: (id: number) => deleteDictData(id),
    onSuccess: () => {
      message.success(commonMessages.deleted);
      invalidateData();
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const openCreateType = () => {
    setEditingType(null);
    typeForm.resetFields();
    typeForm.setFieldsValue({ status: 1, sortOrder: 10 });
    setTypeFormOpen(true);
  };

  const openEditType = (record: DictTypeRecord) => {
    setEditingType(record);
    typeForm.setFieldsValue({
      dictName: record.dictName,
      dictCode: record.dictCode,
      status: record.status,
      sortOrder: record.sortOrder,
      remark: record.remark ?? undefined,
    });
    setTypeFormOpen(true);
  };

  const openCreateData = () => {
    if (!selectedType) return;
    setEditingData(null);
    dataForm.resetFields();
    dataForm.setFieldsValue({ dictTypeId: selectedType.id, sortOrder: 10 });
    setDataFormOpen(true);
  };

  const openEditData = (record: DictDataRecord) => {
    setEditingData(record);
    dataForm.setFieldsValue({
      dictTypeId: record.dictTypeId,
      dictLabel: record.dictLabel,
      dictValue: record.dictValue,
      sortOrder: record.sortOrder,
      remark: record.remark ?? undefined,
    });
    setDataFormOpen(true);
  };

  const typeColumns: ColumnsType<DictTypeRecord> = [
    {
      title: '字典名称',
      dataIndex: 'dictName',
      width: 150,
      render: (value, record) => (
        <Button
          type="link"
          style={{ paddingInline: 0, fontWeight: selectedType?.id === record.id ? 600 : 400 }}
          onClick={() => {
            setSelectedType(record);
            setDataPage(1);
            setDataKeyword('');
          }}
        >
          {value}
        </Button>
      ),
    },
    { title: '编码', dataIndex: 'dictCode', width: 150, render: (value, record) => <Space size={4}><Typography.Text code>{value}</Typography.Text>{record.isBuiltin === 1 && <Tag color="blue">内置</Tag>}</Space> },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (value: 0 | 1, record) => (
        <Space size={6}>
          <Switch
            size="small"
            checked={value === 1}
            disabled={record.isBuiltin === 1}
            aria-label={`切换字典 ${record.dictName} 状态`}
            loading={typeStatusMutation.isPending}
            onChange={(checked) => typeStatusMutation.mutate({ id: record.id, status: checked ? 1 : 0 })}
          />
          <StatusTag value={value} options={ENABLED_STATUS_OPTIONS} />
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 130,
      render: (_, record) => (
        <Space size={2}>
          <Button type="link" size="small" onClick={() => openEditType(record)}>编辑</Button>
          <Button
            type="link"
            size="small"
            danger
            disabled={record.isBuiltin === 1}
            onClick={() =>
              modal.confirm({
                title: `删除字典“${record.dictName}”`,
                content: '字典下仍有数据时后端会拒绝删除。',
                okText: '删除',
                cancelText: '取消',
                okButtonProps: { danger: true },
                onOk: () => typeDeleteMutation.mutateAsync(record.id),
              })
            }
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  const dataColumns: ColumnsType<DictDataRecord> = [
    { title: '标签', dataIndex: 'dictLabel', width: 180 },
    { title: '键值', dataIndex: 'dictValue', width: 160, render: (value) => <Typography.Text code>{value}</Typography.Text> },
    { title: '排序', dataIndex: 'sortOrder', width: 80 },
    { title: '备注', dataIndex: 'remark', ellipsis: true, render: (value) => value || '—' },
    {
      title: '操作',
      key: 'actions',
      width: 130,
      render: (_, record) => (
        <Space size={2}>
          <Button type="link" size="small" onClick={() => openEditData(record)}>编辑</Button>
          <Button
            type="link"
            size="small"
            danger
            onClick={() =>
              modal.confirm({
                title: `删除字典数据“${record.dictLabel}”`,
                content: '删除后使用该键值的业务显示可能受影响。',
                okText: '删除',
                cancelText: '取消',
                okButtonProps: { danger: true },
                onOk: () => dataDeleteMutation.mutateAsync(record.id),
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
      <PageHeader title="字典管理" description="左侧维护字典类型，右侧维护选中类型的字典数据。" extra={<Button type="primary" icon={<Plus size={16} />} onClick={openCreateType}>新建字典类型</Button>} />

      <SearchFilterBar
        onSubmit={() =>
          actions.applyFilters(draft.keyword, {
            dictName: draft.filters.dictName,
            dictCode: draft.filters.dictCode,
            status: draft.filters.status,
          })
        }
        onReset={() => {
          reset();
          actions.reset();
        }}
      >
        <Input allowClear placeholder="字典名称" value={draft.filters.dictName ?? ''} onChange={(event) => setFilter('dictName', event.target.value)} style={{ width: 170 }} aria-label="按字典名称筛选" />
        <Input allowClear placeholder="字典编码" value={draft.filters.dictCode ?? ''} onChange={(event) => setFilter('dictCode', event.target.value)} style={{ width: 170 }} aria-label="按字典编码筛选" />
        <Select allowClear placeholder="状态" value={draft.filters.status} onChange={(value) => setFilter('status', value)} style={{ width: 120 }} options={ENABLED_STATUS_OPTIONS} aria-label="按状态筛选" />
        <Input allowClear placeholder="关键词" value={draft.keyword} onChange={(event) => setKeyword(event.target.value)} style={{ width: 200 }} aria-label="关键词搜索" />
      </SearchFilterBar>

      {typesQuery.isError && <Alert type="error" showIcon title="字典类型加载失败" description={getApiErrorMessage(typesQuery.error)} />}

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={11}>
          <DataTable<DictTypeRecord>
            tableKey="system-dict-types"
            title="字典类型"
            columns={typeColumns}
            dataSource={typesQuery.data?.items ?? []}
            rowKey="id"
            total={typesQuery.data?.total}
            page={state.page}
            pageSize={state.pageSize}
            onPageChange={(page, pageSize) => actions.setPage(page, pageSize)}
            loading={typesQuery.isLoading}
            onRefresh={() => void typesQuery.refetch()}
            refreshing={typesQuery.isFetching}
          />
        </Col>
        <Col xs={24} xl={13}>
          {selectedType ? (
            <>
              <Space wrap style={{ marginBottom: 12 }}>
                <Typography.Text strong>当前字典：{selectedType.dictName}</Typography.Text>
                <Input.Search
                  allowClear
                  placeholder="按标签搜索"
                  style={{ width: 220 }}
                  value={dataKeyword}
                  onChange={(event) => { setDataKeyword(event.target.value); setDataPage(1); }}
                />
                <Button type="primary" icon={<Plus size={16} />} onClick={openCreateData}>新增数据</Button>
              </Space>
              {dataQuery.isError && <Alert type="error" showIcon title="字典数据加载失败" description={getApiErrorMessage(dataQuery.error)} style={{ marginBottom: 12 }} />}
              <DataTable<DictDataRecord>
                tableKey={`system-dict-data-${selectedType.id}`}
                title="字典数据"
                columns={dataColumns}
                dataSource={dataQuery.data?.items ?? []}
                rowKey="id"
                total={dataQuery.data?.total}
                page={dataPage}
                pageSize={dataPageSize}
                onPageChange={(page, pageSize) => { setDataPage(page); setDataPageSize(pageSize); }}
                loading={dataQuery.isLoading}
                onRefresh={() => void dataQuery.refetch()}
                refreshing={dataQuery.isFetching}
              />
            </>
          ) : (
            <Alert type="info" showIcon title="请选择字典类型" description="点击左侧字典名称后查看和维护其字典数据。" />
          )}
        </Col>
      </Row>

      <Modal
        title={editingType ? `编辑字典类型：${editingType.dictName}` : '新建字典类型'}
        open={typeFormOpen}
        onCancel={() => setTypeFormOpen(false)}
        onOk={() => void typeForm.submit()}
        okText="保存"
        cancelText="取消"
        confirmLoading={typeSaveMutation.isPending}
        destroyOnHidden
      >
        <Form<DictTypeInput> form={typeForm} layout="vertical" onFinish={(values) => typeSaveMutation.mutate(values)}>
          <Form.Item name="dictName" label="字典名称" rules={[{ required: true, whitespace: true, message: '请输入字典名称' }]}>
            <Input maxLength={50} />
          </Form.Item>
          <Form.Item name="dictCode" label="字典编码" rules={[{ required: true, whitespace: true, message: '请输入字典编码' }]}>
            <Input maxLength={50} disabled={Boolean(editingType?.isBuiltin)} />
          </Form.Item>
          <Space size={12}>
            <Form.Item name="status" label="状态" rules={[{ required: true }]}><Select style={{ width: 140 }} options={ENABLED_STATUS_OPTIONS} /></Form.Item>
            <Form.Item name="sortOrder" label="排序" rules={[{ required: true }]}><InputNumber min={0} max={9999} /></Form.Item>
          </Space>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={2} maxLength={500} showCount /></Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingData ? `编辑字典数据：${editingData.dictLabel}` : '新增字典数据'}
        open={dataFormOpen}
        onCancel={() => setDataFormOpen(false)}
        onOk={() => void dataForm.submit()}
        okText="保存"
        cancelText="取消"
        confirmLoading={dataSaveMutation.isPending}
        destroyOnHidden
      >
        <Form<DictDataInput> form={dataForm} layout="vertical" onFinish={(values) => dataSaveMutation.mutate(values)}>
          <Form.Item name="dictTypeId" hidden><InputNumber /></Form.Item>
          <Form.Item name="dictLabel" label="标签" rules={[{ required: true, whitespace: true, message: '请输入标签' }]}>
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="dictValue" label="键值" rules={[{ required: true, whitespace: true, message: '请输入键值' }]}>
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序" rules={[{ required: true }]}>
            <InputNumber min={0} max={9999} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={2} maxLength={500} showCount /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
