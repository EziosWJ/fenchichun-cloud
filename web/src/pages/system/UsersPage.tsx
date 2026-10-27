import { useMemo, useState } from 'react';
import {
  App,
  Alert,
  Button,
  Checkbox,
  Col,
  Drawer,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Switch,
  Tag,
  TreeSelect,
  Typography,
} from 'antd';
import { KeyRound, Plus, ShieldCheck } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../components/PageHeader';
import { SearchFilterBar } from '../../components/SearchFilterBar';
import { DataTable } from '../../components/DataTable';
import { StatusTag } from '../../components/StatusTag';
import { ENABLED_STATUS_OPTIONS, GENDER_OPTIONS } from '../../config/options';
import { commonMessages } from '../../config/messages';
import { useListUrlState } from '../../hooks/useListUrlState';
import { useListDraft } from '../../hooks/useListDraft';
import { queryKeys } from '../../lib/queryKeys';
import { getApiErrorMessage } from '../../lib/api/errors';
import { formatDateTime } from '../../utils/format';
import { deptOptionsToTree } from '../../utils/tree';
import {
  assignUserRoles,
  createUser,
  deleteUser,
  deleteUsers,
  getRoleOptions,
  listUsers,
  resetUserPassword,
  setUserStatus,
  updateUser,
} from '../../features/users/api';
import { getDeptOptions } from '../../features/depts/api';
import type { UserInput, UserRecord } from '../../types/system';
import type { ColumnsType } from 'antd/es/table';

const listConfig = {
  filters: { username: 'text', nickname: 'text', status: ['0', '1'], deptId: 'text' },
  sortKeys: [],
  pageSizeOptions: [10, 20, 50, 100],
  defaultPageSize: 10,
} as const;

interface UserFormValues {
  username?: string;
  nickname: string;
  phone?: string;
  email?: string;
  gender?: UserInput['gender'];
  deptId?: number;
  status: 0 | 1;
  remark?: string;
}

export default function UsersPage() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const { state, actions } = useListUrlState(listConfig);
  const { draft, setKeyword, setFilter, reset } = useListDraft(state.keyword, state.filters);
  const [editing, setEditing] = useState<UserRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [roleUser, setRoleUser] = useState<UserRecord | null>(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState<number[]>([]);
  const [passwordResult, setPasswordResult] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<UserRecord[]>([]);
  const [form] = Form.useForm<UserFormValues>();

  const query = useMemo(
    () => ({
      page: state.page,
      pageSize: state.pageSize,
      username: state.filters.username || undefined,
      nickname: state.filters.nickname || undefined,
      status: state.filters.status === '0' ? (0 as const) : state.filters.status === '1' ? (1 as const) : undefined,
      deptId: state.filters.deptId ? Number(state.filters.deptId) : undefined,
    }),
    [state],
  );

  const usersQuery = useQuery({
    queryKey: queryKeys.users.list(query),
    queryFn: () => listUsers(query),
  });
  const deptQuery = useQuery({ queryKey: queryKeys.depts.options, queryFn: getDeptOptions });
  const rolesQuery = useQuery({ queryKey: queryKeys.roles.options, queryFn: getRoleOptions });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unread });
  };

  const saveMutation = useMutation({
    mutationFn: async (values: UserFormValues) => {
      if (editing) {
        const payload = { ...values };
        delete payload.username;
        await updateUser(editing.id, payload);
      } else {
        await createUser(values);
      }
    },
    onSuccess: () => {
      message.success(editing ? commonMessages.updated : commonMessages.created);
      setFormOpen(false);
      setEditing(null);
      invalidate();
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 0 | 1 }) => setUserStatus(id, status),
    onSuccess: () => {
      message.success('状态已更新');
      invalidate();
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteUser(id),
    onSuccess: () => {
      message.success(commonMessages.deleted);
      invalidate();
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const batchDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => deleteUsers(ids),
    onSuccess: () => {
      message.success(commonMessages.deleted);
      setSelectedRows([]);
      invalidate();
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, roleIds }: { id: number; roleIds: number[] }) => assignUserRoles(id, roleIds),
    onSuccess: () => {
      message.success('角色已更新');
      setRoleUser(null);
      invalidate();
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const resetMutation = useMutation({
    mutationFn: (id: number) => resetUserPassword(id),
    onSuccess: (result) => {
      setPasswordResult(result.password);
      invalidate();
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: 1 });
    setFormOpen(true);
  };

  const openEdit = (record: UserRecord) => {
    setEditing(record);
    form.setFieldsValue({
      username: record.username,
      nickname: record.nickname,
      phone: record.phone ?? undefined,
      email: record.email ?? undefined,
      gender: record.gender ?? undefined,
      deptId: record.deptId ?? undefined,
      status: record.status,
      remark: record.remark ?? undefined,
    });
    setFormOpen(true);
  };

  const openRoles = (record: UserRecord) => {
    setRoleUser(record);
    setSelectedRoleIds(record.roles?.map((role) => role.id) ?? []);
  };

  const confirmDelete = (record: UserRecord) => {
    modal.confirm({
      title: `删除用户“${record.nickname || record.username}”`,
      content: '删除后该账号无法登录，操作会写入审计日志。',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => deleteMutation.mutateAsync(record.id),
    });
  };

  const columns: ColumnsType<UserRecord> = [
    { title: '用户名', dataIndex: 'username', width: 140, fixed: 'left' },
    { title: '昵称', dataIndex: 'nickname', width: 140 },
    { title: '部门', dataIndex: 'deptName', width: 140, render: (value) => value || '—' },
    {
      title: '角色',
      dataIndex: 'roles',
      width: 200,
      render: (_, record) =>
        record.roles?.length ? (
          <Space size={4} wrap>
            {record.roles.map((role) => (
              <Tag key={role.id} color={role.roleCode === 'ADMIN' ? 'blue' : 'default'}>
                {role.roleName}
              </Tag>
            ))}
          </Space>
        ) : '—',
    },
    { title: '手机号', dataIndex: 'phone', width: 140, render: (value) => value || '—' },
    {
      title: '状态',
      dataIndex: 'status',
      width: 120,
      render: (value: 0 | 1, record) => (
        <Space size={6}>
          <Switch
            size="small"
            checked={value === 1}
            aria-label={`切换用户 ${record.username} 状态`}
            loading={statusMutation.isPending}
            onChange={(checked) => statusMutation.mutate({ id: record.id, status: checked ? 1 : 0 })}
          />
          <StatusTag value={value} options={ENABLED_STATUS_OPTIONS} />
        </Space>
      ),
    },
    {
      title: '最近登录',
      dataIndex: 'lastLoginTime',
      width: 170,
      render: (value) => formatDateTime(value),
    },
    {
      title: '操作',
      key: 'actions',
      width: 240,
      fixed: 'right',
      render: (_, record) => (
        <Space size={2} wrap>
          <Button type="link" size="small" onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Button type="link" size="small" icon={<ShieldCheck size={14} />} onClick={() => openRoles(record)}>
            角色
          </Button>
          <Button
            type="link"
            size="small"
            icon={<KeyRound size={14} />}
            onClick={() =>
              modal.confirm({
                title: `重置“${record.username}”的密码`,
                content: '重置后该账号需使用新密码登录，当前登录会话不会自动撤销。',
                okText: '重置',
                cancelText: '取消',
                onOk: () => resetMutation.mutateAsync(record.id),
              })
            }
          >
            重置密码
          </Button>
          <Button type="link" size="small" danger onClick={() => confirmDelete(record)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  const deptTree = useMemo(() => deptOptionsToTree(deptQuery.data ?? []), [deptQuery.data]);

  return (
    <div className="pageStack">
      <PageHeader
        title="用户管理"
        description="系统账号、部门归属、角色与登录状态。演示用的业务用户资料不属于这里。"
        extra={
          <Button type="primary" icon={<Plus size={16} />} onClick={openCreate}>
            新建用户
          </Button>
        }
      />

      <SearchFilterBar
        onSubmit={() =>
          actions.applyFilters(draft.keyword, {
            username: draft.filters.username,
            nickname: draft.filters.nickname,
            status: draft.filters.status,
            deptId: draft.filters.deptId,
          })
        }
        onReset={() => {
          reset();
          actions.reset();
        }}
      >
        <Input
          allowClear
          placeholder="用户名"
          value={draft.filters.username ?? ''}
          onChange={(event) => setFilter('username', event.target.value)}
          style={{ width: 180 }}
          aria-label="按用户名筛选"
        />
        <Input
          allowClear
          placeholder="昵称"
          value={draft.filters.nickname ?? ''}
          onChange={(event) => setFilter('nickname', event.target.value)}
          style={{ width: 180 }}
          aria-label="按昵称筛选"
        />
        <Select
          allowClear
          placeholder="状态"
          value={draft.filters.status}
          onChange={(value) => setFilter('status', value)}
          style={{ width: 120 }}
          options={ENABLED_STATUS_OPTIONS}
          aria-label="按状态筛选"
        />
        <TreeSelect
          allowClear
          placeholder="部门"
          value={draft.filters.deptId ? Number(draft.filters.deptId) : undefined}
          onChange={(value) => setFilter('deptId', value ? String(value) : undefined)}
          treeData={deptTree}
          treeDefaultExpandAll
          style={{ width: 200 }}
          aria-label="按部门筛选"
        />
        <Input
          allowClear
          placeholder="关键词（用户名/昵称/手机号/邮箱）"
          value={draft.keyword}
          onChange={(event) => setKeyword(event.target.value)}
          style={{ width: 260 }}
          aria-label="关键词搜索"
        />
      </SearchFilterBar>

      {usersQuery.isError && (
        <Alert type="error" showIcon title="用户列表加载失败" description={getApiErrorMessage(usersQuery.error)} />
      )}

      <DataTable<UserRecord>
        tableKey="system-users"
        columns={columns}
        dataSource={usersQuery.data?.items ?? []}
        rowKey="id"
        total={usersQuery.data?.total}
        page={state.page}
        pageSize={state.pageSize}
        onPageChange={(page, pageSize) => actions.setPage(page, pageSize)}
        loading={usersQuery.isLoading}
        selectable
        onSelectionChange={setSelectedRows}
        selectionResetKey={JSON.stringify(query)}
        batchActions={(rows) => (
          <Button
            danger
            disabled={rows.length === 0}
            onClick={() =>
              modal.confirm({
                title: `批量删除 ${rows.length} 个用户`,
                content: '删除后不可恢复。',
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
        onRefresh={() => void usersQuery.refetch()}
        refreshing={usersQuery.isFetching}
        toolbarActions={
          <Typography.Text type="secondary">
            已选 {selectedRows.length} 项
          </Typography.Text>
        }
      />

      <Drawer
        title={editing ? `编辑用户：${editing.username}` : '新建用户'}
        size={520}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        destroyOnHidden
        extra={
          <Space>
            <Button onClick={() => setFormOpen(false)}>取消</Button>
            <Button type="primary" loading={saveMutation.isPending} onClick={() => void form.submit()}>
              保存
            </Button>
          </Space>
        }
      >
        <Form<UserFormValues>
          form={form}
          layout="vertical"
          onFinish={(values) => saveMutation.mutate(values)}
        >
          <Form.Item name="username" label="用户名" rules={[{ required: !editing, message: '请输入用户名' }]}>
            <Input disabled={Boolean(editing)} maxLength={50} autoComplete="off" />
          </Form.Item>
          <Form.Item name="nickname" label="昵称" rules={[{ required: true, whitespace: true, message: '请输入昵称' }]}>
            <Input maxLength={50} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="phone" label="手机号">
                <Input maxLength={20} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="email" label="邮箱" rules={[{ type: 'email', message: '邮箱格式不正确' }]}>
                <Input maxLength={100} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="gender" label="性别">
                <Select allowClear options={[...GENDER_OPTIONS]} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="deptId" label="部门">
                <TreeSelect allowClear treeData={deptTree} treeDefaultExpandAll />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select options={ENABLED_STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} maxLength={500} showCount />
          </Form.Item>
        </Form>
      </Drawer>

      <Modal
        title={`分配角色：${roleUser?.username ?? ''}`}
        open={Boolean(roleUser)}
        onCancel={() => setRoleUser(null)}
        onOk={() => roleUser && roleMutation.mutate({ id: roleUser.id, roleIds: selectedRoleIds })}
        okText="保存"
        cancelText="取消"
        confirmLoading={roleMutation.isPending}
      >
        <Checkbox.Group
          value={selectedRoleIds}
          onChange={(values) => setSelectedRoleIds(values as number[])}
          style={{ display: 'grid', gap: 10 }}
        >
          {(rolesQuery.data ?? []).map((role) => (
            <Checkbox key={role.id} value={role.id} disabled={role.status === 0}>
              {role.roleName} <Typography.Text type="secondary">（{role.roleCode}）</Typography.Text>
            </Checkbox>
          ))}
        </Checkbox.Group>
      </Modal>

      <Modal
        title="密码已重置"
        open={passwordResult !== null}
        onCancel={() => setPasswordResult(null)}
        footer={<Button type="primary" onClick={() => setPasswordResult(null)}>我已记录</Button>}
      >
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Alert type="warning" showIcon title="请通过安全渠道告知用户，并提醒登录后修改密码。" />
          <Typography.Paragraph copyable={{ text: passwordResult ?? '' }} style={{ margin: 0, fontSize: 16 }}>
            {passwordResult}
          </Typography.Paragraph>
        </Space>
      </Modal>
    </div>
  );
}
