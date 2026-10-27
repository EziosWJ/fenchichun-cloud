import { useEffect, useMemo, useState } from 'react';
import {
  App,
  Alert,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Tag,
  Tree,
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
import { formatDateTime } from '../../utils/format';
import { useAuthStore } from '../../stores/useAuthStore';
import {
  assignRoleMenus,
  createRole,
  deleteRole,
  getMenuTree,
  getRole,
  listRoles,
  setRoleStatus,
  updateRole,
} from '../../features/roles/api';
import type { MenuRecord, RoleInput, RoleRecord } from '../../types/system';
import type { ColumnsType } from 'antd/es/table';
import type { DataNode } from 'antd/es/tree';

const listConfig = {
  filters: { roleName: 'text', roleCode: 'text', status: ['0', '1'] },
  sortKeys: [],
  pageSizeOptions: [10, 20, 50],
  defaultPageSize: 10,
} as const;

type RoleFormValues = RoleInput;

function menuTreeData(menus: MenuRecord[]): DataNode[] {
  return menus.map((menu) => ({
    key: menu.id,
    title: `${menu.menuName}${menu.menuType === 'DIR' ? '（目录）' : menu.menuType === 'LINK' ? '（外链）' : ''}`,
    children: menu.children?.length ? menuTreeData(menu.children) : undefined,
  }));
}

export default function RolesPage() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const { state, actions } = useListUrlState(listConfig);
  const { draft, setKeyword, setFilter, reset } = useListDraft(state.keyword, state.filters);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RoleRecord | null>(null);
  const [menuRole, setMenuRole] = useState<RoleRecord | null>(null);
  const [checkedMenuIds, setCheckedMenuIds] = useState<number[]>([]);
  const [halfCheckedMenuIds, setHalfCheckedMenuIds] = useState<number[]>([]);
  const [form] = Form.useForm<RoleFormValues>();

  const query = useMemo(
    () => ({
      page: state.page,
      pageSize: state.pageSize,
      roleName: state.filters.roleName || undefined,
      roleCode: state.filters.roleCode || undefined,
      status: state.filters.status === '0' ? (0 as const) : state.filters.status === '1' ? (1 as const) : undefined,
    }),
    [state],
  );

  const rolesQuery = useQuery({ queryKey: queryKeys.roles.list(query), queryFn: () => listRoles(query) });
  const menuTreeQuery = useQuery({ queryKey: queryKeys.menus.tree, queryFn: getMenuTree });
  const roleDetailQuery = useQuery({
    queryKey: ['system', 'roles', 'detail', menuRole?.id],
    queryFn: () => getRole(menuRole!.id),
    enabled: Boolean(menuRole),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.roles.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
  };

  const saveMutation = useMutation({
    mutationFn: (values: RoleFormValues) =>
      editing ? updateRole(editing.id, values) : createRole(values),
    onSuccess: () => {
      message.success(editing ? commonMessages.updated : commonMessages.created);
      setFormOpen(false);
      setEditing(null);
      invalidate();
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 0 | 1 }) => setRoleStatus(id, status),
    onSuccess: () => {
      message.success('状态已更新');
      invalidate();
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteRole(id),
    onSuccess: () => {
      message.success(commonMessages.deleted);
      invalidate();
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const menusMutation = useMutation({
    mutationFn: ({ id, menuIds }: { id: number; menuIds: number[] }) => assignRoleMenus(id, menuIds),
    onSuccess: async () => {
      message.success('角色菜单已更新');
      setMenuRole(null);
      invalidate();
      await useAuthStore.getState().reloadMenus().catch(() => undefined);
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: 1, sortOrder: 10 });
    setFormOpen(true);
  };

  const openEdit = (record: RoleRecord) => {
    setEditing(record);
    form.setFieldsValue({
      roleName: record.roleName,
      roleCode: record.roleCode,
      status: record.status,
      sortOrder: record.sortOrder,
      remark: record.remark ?? undefined,
    });
    setFormOpen(true);
  };

  const openMenus = (record: RoleRecord) => {
    setCheckedMenuIds([]);
    setHalfCheckedMenuIds([]);
    setMenuRole(record);
  };

  useEffect(() => {
    if (roleDetailQuery.data) {
      setCheckedMenuIds(roleDetailQuery.data.menuIds);
      setHalfCheckedMenuIds([]);
    }
  }, [roleDetailQuery.data]);

  const treeData = useMemo(() => menuTreeData(menuTreeQuery.data ?? []), [menuTreeQuery.data]);

  const columns: ColumnsType<RoleRecord> = [
    { title: '角色名称', dataIndex: 'roleName', width: 180 },
    {
      title: '角色编码',
      dataIndex: 'roleCode',
      width: 160,
      render: (value, record) => (
        <Space size={6}>
          <Typography.Text code>{value}</Typography.Text>
          {record.isBuiltin === 1 && <Tag color="blue">内置</Tag>}
        </Space>
      ),
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
            aria-label={`切换角色 ${record.roleName} 状态`}
            loading={statusMutation.isPending}
            onChange={(checked) => statusMutation.mutate({ id: record.id, status: checked ? 1 : 0 })}
          />
          <StatusTag value={value} options={ENABLED_STATUS_OPTIONS} />
        </Space>
      ),
    },
    { title: '排序', dataIndex: 'sortOrder', width: 90 },
    { title: '备注', dataIndex: 'remark', ellipsis: true, render: (value) => value || '—' },
    { title: '创建时间', dataIndex: 'createTime', width: 170, render: (value) => formatDateTime(value) },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      fixed: 'right',
      render: (_, record) => (
        <Space size={2} wrap>
          <Button type="link" size="small" onClick={() => openEdit(record)}>编辑</Button>
          <Button type="link" size="small" onClick={() => openMenus(record)}>菜单权限</Button>
          <Button
            type="link"
            size="small"
            danger
            disabled={record.isBuiltin === 1}
            onClick={() =>
              modal.confirm({
                title: `删除角色“${record.roleName}”`,
                content: '删除前请确认没有用户仍在使用该角色。',
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
        title="角色管理"
        description="角色菜单决定登录后可见的侧边栏与页面访问范围；后端接口目前仍沿用既有授权规则。"
        extra={
          <Button type="primary" icon={<Plus size={16} />} onClick={openCreate}>
            新建角色
          </Button>
        }
      />

      <SearchFilterBar
        onSubmit={() =>
          actions.applyFilters(draft.keyword, {
            roleName: draft.filters.roleName,
            roleCode: draft.filters.roleCode,
            status: draft.filters.status,
          })
        }
        onReset={() => {
          reset();
          actions.reset();
        }}
      >
        <Input allowClear placeholder="角色名称" value={draft.filters.roleName ?? ''} onChange={(event) => setFilter('roleName', event.target.value)} style={{ width: 180 }} aria-label="按角色名称筛选" />
        <Input allowClear placeholder="角色编码" value={draft.filters.roleCode ?? ''} onChange={(event) => setFilter('roleCode', event.target.value)} style={{ width: 180 }} aria-label="按角色编码筛选" />
        <Select allowClear placeholder="状态" value={draft.filters.status} onChange={(value) => setFilter('status', value)} style={{ width: 120 }} options={ENABLED_STATUS_OPTIONS} aria-label="按状态筛选" />
        <Input allowClear placeholder="关键词" value={draft.keyword} onChange={(event) => setKeyword(event.target.value)} style={{ width: 220 }} aria-label="关键词搜索" />
      </SearchFilterBar>

      {rolesQuery.isError && <Alert type="error" showIcon title="角色列表加载失败" description={getApiErrorMessage(rolesQuery.error)} />}

      <DataTable<RoleRecord>
        tableKey="system-roles"
        columns={columns}
        dataSource={rolesQuery.data?.items ?? []}
        rowKey="id"
        total={rolesQuery.data?.total}
        page={state.page}
        pageSize={state.pageSize}
        onPageChange={(page, pageSize) => actions.setPage(page, pageSize)}
        loading={rolesQuery.isLoading}
        onRefresh={() => void rolesQuery.refetch()}
        refreshing={rolesQuery.isFetching}
      />

      <Modal
        title={editing ? `编辑角色：${editing.roleName}` : '新建角色'}
        open={formOpen}
        onCancel={() => setFormOpen(false)}
        onOk={() => void form.submit()}
        okText="保存"
        cancelText="取消"
        confirmLoading={saveMutation.isPending}
      >
        <Form<RoleFormValues> form={form} layout="vertical" onFinish={(values) => saveMutation.mutate(values)}>
          <Form.Item name="roleName" label="角色名称" rules={[{ required: true, whitespace: true, message: '请输入角色名称' }]}>
            <Input maxLength={50} />
          </Form.Item>
          <Form.Item name="roleCode" label="角色编码" rules={[{ required: true, whitespace: true, message: '请输入角色编码' }, { pattern: /^[A-Za-z0-9_-]+$/, message: '仅支持字母、数字、下划线和短横线' }]}>
            <Input maxLength={50} disabled={Boolean(editing?.isBuiltin)} />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select options={ENABLED_STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序" rules={[{ required: true }]}>
            <InputNumber min={0} max={9999} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} maxLength={500} showCount />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`菜单权限：${menuRole?.roleName ?? ''}`}
        open={Boolean(menuRole)}
        onCancel={() => setMenuRole(null)}
        okText="保存"
        cancelText="取消"
        width={520}
        confirmLoading={menusMutation.isPending}
        onOk={() =>
          menuRole &&
          menusMutation.mutate({
            id: menuRole.id,
            menuIds: Array.from(new Set([...checkedMenuIds, ...halfCheckedMenuIds])),
          })
        }
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          title="取消勾选后，对应用户重新登录或菜单刷新后不再看到该入口。"
        />
        <Tree
          checkable
          defaultExpandAll
          treeData={treeData}
          checkedKeys={checkedMenuIds}
          onCheck={(checked, info) => {
            setCheckedMenuIds(checked as number[]);
            setHalfCheckedMenuIds(info.halfCheckedKeys as number[]);
          }}
        />
      </Modal>
    </div>
  );
}
