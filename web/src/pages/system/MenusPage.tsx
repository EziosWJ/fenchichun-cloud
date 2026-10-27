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
import { ENABLED_STATUS_OPTIONS, MENU_TYPE_OPTIONS, VISIBLE_OPTIONS } from '../../config/options';
import { commonMessages } from '../../config/messages';
import { queryKeys } from '../../lib/queryKeys';
import { getApiErrorMessage } from '../../lib/api/errors';
import { flattenTree, menuTreeToOptions } from '../../utils/tree';
import { useAuthStore } from '../../stores/useAuthStore';
import {
  createMenu,
  deleteMenu,
  getMenuTree,
  setMenuStatus,
  updateMenu,
} from '../../features/menus/api';
import type { MenuInput, MenuRecord } from '../../types/system';
import type { ColumnsType } from 'antd/es/table';

type MenuFormValues = MenuInput;

const MENU_TYPE_LABEL: Record<MenuRecord['menuType'], string> = {
  DIR: '目录',
  MENU: '菜单',
  LINK: '外链',
};

export default function MenusPage() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>();
  const [statusFilter, setStatusFilter] = useState<string>();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MenuRecord | null>(null);
  const [form] = Form.useForm<MenuFormValues>();

  const treeQuery = useQuery({ queryKey: queryKeys.menus.tree, queryFn: getMenuTree });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.menus.all });
    void useAuthStore.getState().reloadMenus().catch(() => undefined);
  };

  const saveMutation = useMutation({
    mutationFn: (values: MenuFormValues) =>
      editing ? updateMenu(editing.id, values) : createMenu(values),
    onSuccess: () => {
      message.success(editing ? commonMessages.updated : commonMessages.created);
      setFormOpen(false);
      setEditing(null);
      refresh();
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 0 | 1 }) => setMenuStatus(id, status),
    onSuccess: () => {
      message.success('状态已更新');
      refresh();
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteMenu(id),
    onSuccess: () => {
      message.success(commonMessages.deleted);
      refresh();
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const openCreate = (parent?: MenuRecord) => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      parentId: parent?.id ?? 0,
      menuType: parent ? 'MENU' : 'DIR',
      sortOrder: parent ? (parent.children?.length ?? 0) + 1 : 10,
      visible: 1,
      status: 1,
    });
    setFormOpen(true);
  };

  const openEdit = (record: MenuRecord) => {
    setEditing(record);
    form.setFieldsValue({
      parentId: record.parentId,
      menuName: record.menuName,
      menuType: record.menuType,
      path: record.path ?? undefined,
      component: record.component ?? undefined,
      externalUrl: record.externalUrl ?? undefined,
      icon: record.icon ?? undefined,
      permissionCode: record.permissionCode ?? undefined,
      sortOrder: record.sortOrder,
      visible: record.visible,
      status: record.status,
      remark: record.remark ?? undefined,
    });
    setFormOpen(true);
  };

  const filtered = useMemo(() => {
    const tree = treeQuery.data ?? [];
    if (!keyword && !typeFilter && !statusFilter) return tree;
    const filterTree = (items: MenuRecord[]): MenuRecord[] =>
      items
        .map((item): MenuRecord | null => {
          const children = item.children?.length ? filterTree(item.children) : [];
          const matchesKeyword =
            !keyword ||
            item.menuName.toLowerCase().includes(keyword.toLowerCase()) ||
            (item.path ?? '').toLowerCase().includes(keyword.toLowerCase()) ||
            (item.component ?? '').toLowerCase().includes(keyword.toLowerCase()) ||
            (item.permissionCode ?? '').toLowerCase().includes(keyword.toLowerCase());
          const matchesType = !typeFilter || item.menuType === typeFilter;
          const matchesStatus = !statusFilter || String(item.status) === statusFilter;
          const selfMatch = matchesKeyword && matchesType && matchesStatus;
          if (!selfMatch && children.length === 0) return null;
          return { ...item, children };
        })
        .filter((item): item is MenuRecord => item !== null);
    return filterTree(tree);
  }, [keyword, statusFilter, treeQuery.data, typeFilter]);

  const parentOptions = useMemo(
    () => menuTreeToOptions(treeQuery.data ?? []),
    [treeQuery.data],
  );

  const columns: ColumnsType<MenuRecord> = [
    {
      title: '菜单名称',
      dataIndex: 'menuName',
      width: 240,
      render: (value, record) => (
        <Space size={6}>
          <span>{value}</span>
          {record.isBuiltin === 1 && <Tag color="blue">内置</Tag>}
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'menuType',
      width: 90,
      render: (value: MenuRecord['menuType']) => <Tag>{MENU_TYPE_LABEL[value] ?? value}</Tag>,
    },
    { title: '路径', dataIndex: 'path', width: 180, render: (value) => value || '—' },
    { title: '组件标识', dataIndex: 'component', width: 190, render: (value) => value ? <Typography.Text code>{value}</Typography.Text> : '—' },
    { title: '权限标识', dataIndex: 'permissionCode', width: 160, render: (value) => value || '—' },
    { title: '图标', dataIndex: 'icon', width: 100, render: (value) => value || '—' },
    { title: '排序', dataIndex: 'sortOrder', width: 80 },
    {
      title: '显示',
      dataIndex: 'visible',
      width: 90,
      render: (value: 0 | 1) => <StatusTag value={value} options={VISIBLE_OPTIONS} />,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 130,
      render: (value: 0 | 1, record) => (
        <Space size={6}>
          <Switch
            size="small"
            checked={value === 1}
            aria-label={`切换菜单 ${record.menuName} 状态`}
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
      width: 220,
      fixed: 'right',
      render: (_, record) => (
        <Space size={2} wrap>
          {record.menuType !== 'MENU' && (
            <Button type="link" size="small" onClick={() => openCreate(record)}>新增子项</Button>
          )}
          <Button type="link" size="small" onClick={() => openEdit(record)}>编辑</Button>
          <Button
            type="link"
            size="small"
            danger
            onClick={() =>
              modal.confirm({
                title: `删除菜单“${record.menuName}”`,
                content: '存在子菜单或角色引用时后端会拒绝删除。',
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

  const flatCount = flattenTree(treeQuery.data ?? []).length;

  return (
    <div className="pageStack">
      <PageHeader
        title="菜单管理"
        description={`后台导航由菜单数据驱动，共 ${flatCount} 个节点。组件标识需要与前端本地页面注册一致，未注册的菜单不会出现在侧边栏。`}
        extra={
          <Button type="primary" icon={<Plus size={16} />} onClick={() => openCreate()}>
            新建菜单
          </Button>
        }
      />

      <Alert
        type="info"
        showIcon
        title="前端本地注册的组件标识"
        description="system/user/index、system/role/index、system/menu/index、system/dept/index、system/dict/index、system/config/index、system/file/index、system/login-log/index、system/oper-log/index、monitor/server/index。"
      />

      <Space wrap>
        <Input.Search
          allowClear
          placeholder="搜索名称、路径、组件标识或权限标识"
          style={{ width: 320 }}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <Select
          allowClear
          placeholder="菜单类型"
          style={{ width: 140 }}
          value={typeFilter}
          onChange={setTypeFilter}
          options={[...MENU_TYPE_OPTIONS]}
        />
        <Select
          allowClear
          placeholder="状态"
          style={{ width: 120 }}
          value={statusFilter}
          onChange={setStatusFilter}
          options={ENABLED_STATUS_OPTIONS.map((item) => ({ value: String(item.value), label: item.label }))}
        />
        <Button onClick={() => { setKeyword(''); setTypeFilter(undefined); setStatusFilter(undefined); }}>重置筛选</Button>
      </Space>

      {treeQuery.isError && <Alert type="error" showIcon title="菜单树加载失败" description={getApiErrorMessage(treeQuery.error)} />}

      <DataTable<MenuRecord>
        tableKey="system-menus"
        columns={columns}
        dataSource={filtered}
        rowKey="id"
        loading={treeQuery.isLoading}
        defaultExpandAllRows
        onRefresh={() => void treeQuery.refetch()}
        refreshing={treeQuery.isFetching}
      />

      <Modal
        title={editing ? `编辑菜单：${editing.menuName}` : '新建菜单'}
        open={formOpen}
        width={620}
        onCancel={() => setFormOpen(false)}
        onOk={() => void form.submit()}
        okText="保存"
        cancelText="取消"
        confirmLoading={saveMutation.isPending}
        destroyOnHidden
      >
        <Form<MenuFormValues>
          form={form}
          layout="vertical"
          onFinish={(values) => saveMutation.mutate(values)}
          onValuesChange={(changed) => {
            if (changed.menuType === 'LINK') form.setFieldsValue({ path: undefined, component: undefined });
            if (changed.menuType === 'DIR') form.setFieldsValue({ component: undefined, externalUrl: undefined });
          }}
        >
          <Form.Item name="parentId" label="上级菜单" rules={[{ required: true }]}>
            <TreeSelect treeData={parentOptions} treeDefaultExpandAll placeholder="请选择上级菜单" />
          </Form.Item>
          <Form.Item name="menuName" label="菜单名称" rules={[{ required: true, whitespace: true, message: '请输入菜单名称' }]}>
            <Input maxLength={50} />
          </Form.Item>
          <Form.Item name="menuType" label="菜单类型" rules={[{ required: true }]}>
            <Select options={[...MENU_TYPE_OPTIONS]} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, next) => prev.menuType !== next.menuType}>
            {({ getFieldValue }) => {
              const type = getFieldValue('menuType') as MenuRecord['menuType'];
              if (type === 'LINK') {
                return (
                  <Form.Item name="externalUrl" label="外链地址" rules={[{ required: true, message: '请输入外链地址' }, { type: 'url', message: '请输入合法的 URL' }]}>
                    <Input placeholder="https://example.com" maxLength={500} />
                  </Form.Item>
                );
              }
              return (
                <>
                  <Form.Item name="path" label="路由路径" rules={type === 'MENU' ? [{ required: true, message: '请输入路由路径' }] : []}>
                    <Input placeholder="/system/user" maxLength={200} />
                  </Form.Item>
                  <Form.Item
                    name="component"
                    label="组件标识"
                    extra="菜单类型为“菜单”时，需与前端本地页面注册一致。"
                  >
                    <Input placeholder="system/user/index" maxLength={200} />
                  </Form.Item>
                </>
              );
            }}
          </Form.Item>
          <Space size={12} wrap style={{ display: 'flex' }}>
            <Form.Item name="icon" label="图标名称">
              <Input placeholder="User / Shield / Settings" maxLength={50} />
            </Form.Item>
            <Form.Item name="permissionCode" label="权限标识">
              <Input placeholder="system:user" maxLength={100} />
            </Form.Item>
            <Form.Item name="sortOrder" label="排序" rules={[{ required: true }]}>
              <InputNumber min={0} max={9999} />
            </Form.Item>
          </Space>
          <Space size={12} wrap>
            <Form.Item name="visible" label="是否显示">
              <Select style={{ width: 120 }} options={VISIBLE_OPTIONS} />
            </Form.Item>
            <Form.Item name="status" label="状态">
              <Select style={{ width: 120 }} options={ENABLED_STATUS_OPTIONS} />
            </Form.Item>
          </Space>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} maxLength={500} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
