import { useState } from 'react';
import { Alert, App, Button, Form, Input, Modal, Select, Space, Switch, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { useListUrlState } from '../../hooks/useListUrlState';
import { sites } from '../../features/weighbridge/api';
import { deleteGranary, granaries, saveGranary, type Granary, type GranaryInput } from '../../features/granary/api';
import { getApiErrorMessage } from '../../lib/api/errors';

const config = { filters: {}, sortKeys: [], pageSizeOptions: [10, 20, 50], defaultPageSize: 10 } as const;
const blank: GranaryInput = { siteCode: '', name: '', enabled: true, remark: '' };

export default function GranariesPage() {
  const { message, modal } = App.useApp();
  const client = useQueryClient();
  const { state, actions } = useListUrlState(config);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Granary | null>(null);
  const [form] = Form.useForm<GranaryInput>();
  const list = useQuery({ queryKey: ['granaries'], queryFn: () => granaries() });
  const siteQuery = useQuery({ queryKey: ['weighbridge', 'sites'], queryFn: sites });
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
  const siteName = (code: string) => siteQuery.data?.find((v) => v.code === code)?.name ?? code;
  const columns: ColumnsType<Granary> = [
    { title: '厂区', dataIndex: 'siteCode', key: 'siteCode', render: (value: string) => siteName(value) },
    { title: '粮仓名称', dataIndex: 'name', key: 'name' },
    { title: '状态', dataIndex: 'enabled', key: 'enabled', render: (value: boolean) => value ? <Tag color="green">启用</Tag> : <Tag>停用</Tag> },
    { title: '备注', dataIndex: 'remark', key: 'remark', render: (value: string) => value || '—' },
    {
      title: '操作', key: 'actions', render: (_, row) => <Space>
        <Button type="link" onClick={() => { setEditing(row); form.setFieldsValue({ siteCode: row.siteCode, name: row.name, enabled: row.enabled, remark: row.remark }); setOpen(true); }}>编辑</Button>
        <Button type="link" danger onClick={() => modal.confirm({
          title: `删除粮仓「${row.name}」？`,
          content: '已办理的流转单保留原卸粮地点记录，不受影响。',
          okText: '删除', okButtonProps: { danger: true }, cancelText: '取消',
          onOk: () => remove.mutateAsync(row.id).then(() => undefined),
        })}>删除</Button>
      </Space>,
    },
  ];
  const rows = list.data ?? [];
  return <>
    <PageHeader title="粮仓维护" />
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Button type="primary" onClick={() => { setEditing(null); form.resetFields(); form.setFieldsValue(blank); setOpen(true); }}>新增粮仓</Button>
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
        <Form.Item name="siteCode" label="厂区" rules={[{ required: true, message: '请选择厂区' }]}>
          <Select loading={siteQuery.isLoading} placeholder="请选择厂区" options={(siteQuery.data ?? []).filter((v) => v.enabled).map((v) => ({ value: v.code, label: v.name }))} />
        </Form.Item>
        <Form.Item name="name" label="粮仓名称" rules={[{ required: true, whitespace: true, message: '请输入粮仓名称' }]}>
          <Input maxLength={100} placeholder="例如：1 号仓" />
        </Form.Item>
        <Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item>
        <Form.Item name="remark" label="备注"><Input.TextArea maxLength={500} rows={2} /></Form.Item>
      </Form>
    </Modal>
  </>;
}
