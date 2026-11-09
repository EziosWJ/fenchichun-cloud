import { useState } from 'react';
import { Alert, App, Button, Form, Input, Modal, Space, Switch, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { useListUrlState } from '../../hooks/useListUrlState';
import { usePermissions } from '../../hooks/usePermissions';
import { deleteGranary, granaries, saveGranary, type Granary, type GranaryInput } from '../../features/granary/api';
import { getApiErrorMessage } from '../../lib/api/errors';

const config = { filters: {}, sortKeys: [], pageSizeOptions: [10, 20, 50], defaultPageSize: 10 } as const;
const blank: GranaryInput = { name: '', enabled: true, remark: '' };

export default function GranariesPage() {
  const { message, modal } = App.useApp();
  const client = useQueryClient();
  const { state, actions } = useListUrlState(config);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Granary | null>(null);
  const [keyword, setKeyword] = useState('');
  const [form] = Form.useForm<GranaryInput>();
  const { has } = usePermissions();
  const canManage = has('grain-intake:granaries:manage');
  const list = useQuery({ queryKey: ['granaries'], queryFn: () => granaries() });
  const refresh = () => void client.invalidateQueries({ queryKey: ['granaries'] });
  const save = useMutation({
    mutationFn: (input: GranaryInput) => saveGranary(input, editing?.id),
    onSuccess: () => { setOpen(false); message.success('保存成功'); refresh(); },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: (id: number) => deleteGranary(id),
    onSuccess: () => { message.success('已删除'); refresh(); },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });
  const columns: ColumnsType<Granary> = [
    { title: '粮仓名称', dataIndex: 'name', key: 'name' },
    { title: '状态', dataIndex: 'enabled', key: 'enabled', width: 100, render: (value: boolean) => value ? <Tag color="green">启用</Tag> : <Tag>停用</Tag> },
    { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true, render: (value: string) => value || '—' },
    ...(canManage ? [{
      title: '操作', key: 'actions', width: 140, render: (_: unknown, row: Granary) => <Space size={4}>
        <Button type="link" size="small" onClick={() => { setEditing(row); form.setFieldsValue({ name: row.name, enabled: row.enabled, remark: row.remark }); setOpen(true); }}>编辑</Button>
        <Button type="link" size="small" danger onClick={() => modal.confirm({
          title: `删除粮仓「${row.name}」？`,
          content: '已办理的流转单保留原卸粮地点记录，不受影响。',
          okText: '删除', okButtonProps: { danger: true }, cancelText: '取消',
          onOk: () => remove.mutateAsync(row.id).then(() => undefined),
        })}>删除</Button>
      </Space>,
    }] : []),
  ];
  const rows = (list.data ?? []).filter((row) => !keyword || row.name.toLowerCase().includes(keyword.trim().toLowerCase()));
  return <>
    <PageHeader title="粮仓维护" />
    <Space orientation="vertical" size="middle" style={{ width: '100%', marginTop: 20 }}>
      <Space wrap align="end" style={{ width: '100%', justifyContent: 'space-between' }}>
        <Input.Search aria-label="粮仓名称" placeholder="搜索粮仓名称" allowClear value={keyword} onChange={(e) => { setKeyword(e.target.value); actions.setPage(1); }} style={{ maxWidth: 320 }} />
        {canManage && <Button type="primary" icon={<Plus size={16} />} onClick={() => { setEditing(null); form.resetFields(); form.setFieldsValue(blank); setOpen(true); }}>新增粮仓</Button>}
      </Space>
      {list.isError && <Alert type="error" title={getApiErrorMessage(list.error)} action={<Button onClick={() => void list.refetch()}>重试</Button>} />}
      <DataTable
        tableKey="grain-granaries"
        rowKey="id"
        columns={columns}
        dataSource={rows.slice((state.page - 1) * state.pageSize, state.page * state.pageSize)}
        total={rows.length}
        page={state.page}
        pageSize={state.pageSize}
        onPageChange={actions.setPage}
        loading={list.isLoading}
        onRefresh={() => void list.refetch()}
      />
    </Space>
    <Modal
      title={editing ? '编辑粮仓' : '新增粮仓'}
      open={open}
      onCancel={() => setOpen(false)}
      onOk={() => void form.validateFields().then((v) => save.mutate(v))}
      confirmLoading={save.isPending}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" initialValues={blank}>
        <Form.Item name="name" label="粮仓名称" rules={[{ required: true, whitespace: true, message: '请输入粮仓名称' }]}>
          <Input maxLength={100} placeholder="例如：1 号仓" />
        </Form.Item>
        <Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item>
        <Form.Item name="remark" label="备注"><Input.TextArea maxLength={500} rows={2} /></Form.Item>
      </Form>
    </Modal>
  </>;
}
