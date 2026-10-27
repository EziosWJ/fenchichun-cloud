import { useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Tag,
  TreeSelect,
  Typography,
} from 'antd';
import { Plus } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../components/PageHeader';
import { DataTable } from '../../components/DataTable';
import { StatusTag } from '../../components/StatusTag';
import { ENABLED_STATUS_OPTIONS } from '../../config/options';
import { commonMessages } from '../../config/messages';
import { queryKeys } from '../../lib/queryKeys';
import { getApiErrorMessage } from '../../lib/api/errors';
import { deptOptionsToTree, flattenTree } from '../../utils/tree';
import {
  createDept,
  deleteDept,
  getDeptOptions,
  getDeptTree,
  setDeptStatus,
  updateDept,
} from '../../features/depts/api';
import type { DeptInput, DeptRecord } from '../../types/system';
import type { ColumnsType } from 'antd/es/table';

type DeptFormValues = DeptInput;

export default function DeptsPage() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DeptRecord | null>(null);
  const [form] = Form.useForm<DeptFormValues>();

  const treeQuery = useQuery({ queryKey: queryKeys.depts.tree, queryFn: getDeptTree });
  const optionsQuery = useQuery({ queryKey: queryKeys.depts.options, queryFn: getDeptOptions });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.depts.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
  };

  const saveMutation = useMutation({
    mutationFn: (values: DeptFormValues) => (editing ? updateDept(editing.id, values) : createDept(values)),
    onSuccess: () => {
      message.success(editing ? commonMessages.updated : commonMessages.created);
      setFormOpen(false);
      setEditing(null);
      invalidate();
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 0 | 1 }) => setDeptStatus(id, status),
    onSuccess: () => {
      message.success('状态已更新');
      invalidate();
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteDept(id),
    onSuccess: () => {
      message.success(commonMessages.deleted);
      invalidate();
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const openCreate = (parent?: DeptRecord) => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ parentId: parent?.id ?? 0, sortOrder: 10, status: 1 });
    setFormOpen(true);
  };

  const openEdit = (record: DeptRecord) => {
    setEditing(record);
    form.setFieldsValue({
      parentId: record.parentId,
      deptName: record.deptName,
      deptCode: record.deptCode,
      leader: record.leader ?? undefined,
      phone: record.phone ?? undefined,
      email: record.email ?? undefined,
      sortOrder: record.sortOrder,
      status: record.status,
      remark: record.remark ?? undefined,
    });
    setFormOpen(true);
  };

  const parentOptions = useMemo(() => {
    const nodes = [{ value: 0, title: '顶级部门' }, ...deptOptionsToTree(optionsQuery.data ?? [])];
    return nodes;
  }, [optionsQuery.data]);

  const filtered = useMemo(() => {
    const tree = treeQuery.data ?? [];
    if (!keyword && !statusFilter) return tree;
    const walk = (items: DeptRecord[]): DeptRecord[] =>
      items
        .map((item): DeptRecord | null => {
          const children = item.children?.length ? walk(item.children) : [];
          const matchesKeyword =
            !keyword ||
            item.deptName.toLowerCase().includes(keyword.toLowerCase()) ||
            item.deptCode.toLowerCase().includes(keyword.toLowerCase()) ||
            (item.leader ?? '').toLowerCase().includes(keyword.toLowerCase());
          const matchesStatus = !statusFilter || String(item.status) === statusFilter;
          if (!(matchesKeyword && matchesStatus) && children.length === 0) return null;
          return { ...item, children };
        })
        .filter((item): item is DeptRecord => item !== null);
    return walk(tree);
  }, [keyword, statusFilter, treeQuery.data]);

  const columns: ColumnsType<DeptRecord> = [
    {
      title: '部门名称',
      dataIndex: 'deptName',
      width: 240,
      render: (value, record) => (
        <Space size={6}>
          <span>{value}</span>
          {record.isBuiltin === 1 && <Tag color="blue">内置</Tag>}
        </Space>
      ),
    },
    { title: '部门编码', dataIndex: 'deptCode', width: 160 },
    { title: '负责人', dataIndex: 'leader', width: 120, render: (value) => value || '—' },
    { title: '联系电话', dataIndex: 'phone', width: 140, render: (value) => value || '—' },
    { title: '邮箱', dataIndex: 'email', width: 180, render: (value) => value || '—' },
    { title: '排序', dataIndex: 'sortOrder', width: 80 },
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
            aria-label={`切换部门 ${record.deptName} 状态`}
            loading={statusMutation.isPending}
            onChange={(checked) => statusMutation.mutate({ id: record.id, status: checked ? 1 : 0 })}
          />
          <StatusTag value={value} options={ENABLED_STATUS_OPTIONS} />
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 210,
      fixed: 'right',
      render: (_, record) => (
        <Space size={2} wrap>
          <Button type="link" size="small" onClick={() => openCreate(record)}>新增子部门</Button>
          <Button type="link" size="small" onClick={() => openEdit(record)}>编辑</Button>
          <Button
            type="link"
            size="small"
            danger
            disabled={record.isBuiltin === 1}
            onClick={() =>
              modal.confirm({
                title: `删除部门“${record.deptName}”`,
                content: '存在子部门或用户引用时后端会拒绝删除。',
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
        title="部门管理"
        description="部门树用于用户归属与筛选；内置根部门不可删除。"
        extra={
          <Button type="primary" icon={<Plus size={16} />} onClick={() => openCreate()}>
            新建部门
          </Button>
        }
      />

      <Space wrap>
        <Input.Search
          allowClear
          placeholder="搜索部门名称、编码或负责人"
          style={{ width: 300 }}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <Select
          allowClear
          placeholder="状态"
          style={{ width: 120 }}
          value={statusFilter}
          onChange={setStatusFilter}
          options={ENABLED_STATUS_OPTIONS.map((item) => ({ value: String(item.value), label: item.label }))}
        />
        <Button onClick={() => { setKeyword(''); setStatusFilter(undefined); }}>重置筛选</Button>
        <Typography.Text type="secondary">共 {flattenTree(treeQuery.data ?? []).length} 个部门节点</Typography.Text>
      </Space>

      {treeQuery.isError && <Alert type="error" showIcon title="部门树加载失败" description={getApiErrorMessage(treeQuery.error)} />}

      <DataTable<DeptRecord>
        tableKey="system-depts"
        columns={columns}
        dataSource={filtered}
        rowKey="id"
        loading={treeQuery.isLoading}
        defaultExpandAllRows
        onRefresh={() => void treeQuery.refetch()}
        refreshing={treeQuery.isFetching}
      />

      <Modal
        title={editing ? `编辑部门：${editing.deptName}` : '新建部门'}
        open={formOpen}
        width={560}
        onCancel={() => setFormOpen(false)}
        onOk={() => void form.submit()}
        okText="保存"
        cancelText="取消"
        confirmLoading={saveMutation.isPending}
        destroyOnHidden
      >
        <Form<DeptFormValues> form={form} layout="vertical" onFinish={(values) => saveMutation.mutate(values)}>
          <Form.Item name="parentId" label="上级部门" rules={[{ required: true }]}>
            <TreeSelect treeData={parentOptions} treeDefaultExpandAll placeholder="请选择上级部门" />
          </Form.Item>
          <Form.Item name="deptName" label="部门名称" rules={[{ required: true, whitespace: true, message: '请输入部门名称' }]}>
            <Input maxLength={50} />
          </Form.Item>
          <Form.Item name="deptCode" label="部门编码" rules={[{ required: true, whitespace: true, message: '请输入部门编码' }]}>
            <Input maxLength={50} disabled={Boolean(editing?.isBuiltin)} />
          </Form.Item>
          <Space size={12} wrap>
            <Form.Item name="leader" label="负责人"><Input maxLength={50} /></Form.Item>
            <Form.Item name="phone" label="联系电话"><Input maxLength={20} /></Form.Item>
            <Form.Item name="sortOrder" label="排序" rules={[{ required: true }]}><InputNumber min={0} max={9999} /></Form.Item>
          </Space>
          <Form.Item name="email" label="邮箱" rules={[{ type: 'email', message: '邮箱格式不正确' }]}>
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select options={ENABLED_STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} maxLength={500} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
