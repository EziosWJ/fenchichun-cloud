import { useState } from 'react';
import { Alert, App, Button, Form, Input, Modal, Space, Typography } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { useListUrlState } from '../../hooks/useListUrlState';
import { getApiErrorMessage } from '../../lib/api/errors';
import { createSite, updateSite, getSiteCredential, sites, type Site, type SiteCredential, type SiteInput } from '../../features/weighbridge/api';

const config = { filters: {}, sortKeys: [], pageSizeOptions: [10, 20, 50], defaultPageSize: 10 } as const;
export default function SitesPage() {
  const { message } = App.useApp(); const client = useQueryClient(); const { state, actions } = useListUrlState(config);
  const [open, setOpen] = useState(false); const [editing, setEditing] = useState<Site | null>(null); const [credential, setCredential] = useState<SiteCredential | null>(null); const [form] = Form.useForm<SiteInput>();
  const list = useQuery({ queryKey: ['weighbridge', 'sites'], queryFn: sites });
  const save = useMutation({ mutationFn: createSite, onSuccess: (result) => { setOpen(false); setCredential(result); void client.invalidateQueries({ queryKey: ['weighbridge', 'sites'] }); }, onError: (error) => message.error(getApiErrorMessage(error)) });
  const update = useMutation({ mutationFn: (input: SiteInput) => updateSite(input, editing!), onSuccess: () => { setOpen(false); message.success('保存成功'); void client.invalidateQueries({ queryKey: ['weighbridge', 'sites'] }); }, onError: (error) => message.error(getApiErrorMessage(error)) });
  const credentialQuery = useMutation({ mutationFn: getSiteCredential, onSuccess: setCredential, onError: (error) => message.error(getApiErrorMessage(error)) });
  const columns: ColumnsType<Site> = [
    { title: '厂区编码', dataIndex: 'code', key: 'code' }, { title: '厂区名称', dataIndex: 'name', key: 'name' },
    { title: '地磅编码', dataIndex: 'scaleCode', key: 'scaleCode' }, { title: '地磅名称', dataIndex: 'scaleName', key: 'scaleName' },
    { title: '操作', key: 'actions', render: (_, row) => <Space><Button type="link" onClick={() => { setEditing(row); form.setFieldsValue(row); setOpen(true); }}>编辑</Button><Button type="link" onClick={() => credentialQuery.mutate(row.code)}>查看凭据</Button></Space> },
  ];
  const rows = list.data ?? [];
  return <><PageHeader title="厂区接入" description="登记厂区和地磅，为本厂配置接入凭据。" />
    <Space direction="vertical" size="middle" style={{width:'100%'}}>
      <Button type="primary" onClick={() => { setEditing(null); form.resetFields(); form.setFieldsValue({scaleCode:'WB01',scaleName:'本厂地磅'}); setOpen(true); }}>登记厂区</Button>
      {list.isError && <Alert type="error" message={getApiErrorMessage(list.error)} action={<Button onClick={() => void list.refetch()}>重试</Button>} />}
      <DataTable tableKey="weighbridge-sites" rowKey={(r) => `${r.code}:${r.scaleCode}`} columns={columns} dataSource={rows.slice((state.page-1)*state.pageSize,state.page*state.pageSize)} total={rows.length} page={state.page} pageSize={state.pageSize} onPageChange={actions.setPage} loading={list.isLoading} onRefresh={() => void list.refetch()} />
    </Space>
    <Modal title={editing ? '编辑厂区' : '登记厂区'} open={open} onCancel={() => setOpen(false)} onOk={() => void form.validateFields().then((v) => editing ? update.mutate(v) : save.mutate(v))} confirmLoading={save.isPending || update.isPending} destroyOnHidden>
      <Form form={form} layout="vertical"><Form.Item name="code" label="厂区编码" rules={[{required:true,whitespace:true}]}><Input maxLength={40} /></Form.Item><Form.Item name="name" label="厂区名称" rules={[{required:true,whitespace:true}]}><Input maxLength={100} /></Form.Item><Form.Item name="scaleCode" label="地磅编码" rules={[{required:true,whitespace:true}]}><Input maxLength={40} /></Form.Item><Form.Item name="scaleName" label="地磅名称" rules={[{required:true,whitespace:true}]}><Input maxLength={100} /></Form.Item></Form>
    </Modal>
    <Modal title="厂端接入凭据" open={!!credential} onOk={() => setCredential(null)} onCancel={() => setCredential(null)} cancelButtonProps={{style:{display:'none'}}}>
      <Typography.Paragraph copyable={{ text: credential?.token }} style={{marginTop:16, userSelect: 'text', wordBreak: 'break-all'}}>{credential?.token}</Typography.Paragraph>
    </Modal>
  </>;
}
