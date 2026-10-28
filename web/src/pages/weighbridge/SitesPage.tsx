import { useState } from 'react';
import { Alert, App, Button, Form, Input, Modal, Space } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { useListUrlState } from '../../hooks/useListUrlState';
import { getApiErrorMessage } from '../../lib/api/errors';
import { createSite, updateSite, sites, type Site, type SiteInput } from '../../features/weighbridge/api';

const config = { filters: {}, sortKeys: [], pageSizeOptions: [10, 20, 50], defaultPageSize: 10 } as const;
export default function SitesPage() {
  const { message } = App.useApp(); const client = useQueryClient(); const { state, actions } = useListUrlState(config);
  const [open, setOpen] = useState(false); const [editing, setEditing] = useState<Site | null>(null); const [form] = Form.useForm<SiteInput>();
  const list = useQuery({ queryKey: ['weighbridge', 'sites'], queryFn: sites });
  const save = useMutation({ mutationFn: createSite, onSuccess: () => { setOpen(false); message.success('保存成功'); void client.invalidateQueries({ queryKey: ['weighbridge', 'sites'] }); }, onError: (error) => message.error(getApiErrorMessage(error)) });
  const update = useMutation({ mutationFn: (input: SiteInput) => updateSite(input, editing!), onSuccess: () => { setOpen(false); message.success('保存成功'); void client.invalidateQueries({ queryKey: ['weighbridge', 'sites'] }); }, onError: (error) => message.error(getApiErrorMessage(error)) });
  const columns: ColumnsType<Site> = [
    { title: '厂区编码', dataIndex: 'code', key: 'code' }, { title: '厂区名称', dataIndex: 'name', key: 'name' },
    { title: '操作', key: 'actions', render: (_, row) => <Button type="link" onClick={() => { setEditing(row); form.setFieldsValue(row); setOpen(true); }}>编辑</Button> },
  ];
  const rows = list.data ?? [];
  return <><PageHeader title="厂区接入" description="维护厂区编码和名称。修改编码前请先完成旧编码单据上传；历史编码不能分配给其他厂区。" />
    <Space direction="vertical" size="middle" style={{width:'100%'}}>
      <Button type="primary" onClick={() => { setEditing(null); form.resetFields(); setOpen(true); }}>登记厂区</Button>
      {list.isError && <Alert type="error" message={getApiErrorMessage(list.error)} action={<Button onClick={() => void list.refetch()}>重试</Button>} />}
      <DataTable tableKey="weighbridge-sites" rowKey="code" columns={columns} dataSource={rows.slice((state.page-1)*state.pageSize,state.page*state.pageSize)} total={rows.length} page={state.page} pageSize={state.pageSize} onPageChange={actions.setPage} loading={list.isLoading} onRefresh={() => void list.refetch()} />
    </Space>
    <Modal title={editing ? '编辑厂区' : '登记厂区'} open={open} onCancel={() => setOpen(false)} onOk={() => void form.validateFields().then((v) => editing ? update.mutate(v) : save.mutate(v))} confirmLoading={save.isPending || update.isPending} destroyOnHidden>
      <Form form={form} layout="vertical"><Form.Item name="code" label="厂区编码" rules={[{required:true,whitespace:true}]}><Input maxLength={40} /></Form.Item><Form.Item name="name" label="厂区名称" rules={[{required:true,whitespace:true}]}><Input maxLength={100} /></Form.Item></Form>
    </Modal>
  </>;
}
