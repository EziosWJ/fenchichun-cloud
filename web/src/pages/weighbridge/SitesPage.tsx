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
const codeChangePrerequisite = '请先在厂端核对待上传队列，确认旧编码下的出单、作废和重开变化均已收到云端回执。';

export default function SitesPage() {
  const { message, modal } = App.useApp();
  const client = useQueryClient();
  const { state, actions } = useListUrlState(config);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Site | null>(null);
  const [form] = Form.useForm<SiteInput>();
  const draftCode = Form.useWatch('code', form);
  const changingCode = editing && draftCode != null && draftCode.trim() !== editing.code;
  const list = useQuery({ queryKey: ['weighbridge', 'sites'], queryFn: sites });
  const save = useMutation({
    mutationFn: async ({ input, original }: { input: SiteInput; original: Site | null }) => {
      await (original ? updateSite(input, original) : createSite(input));
    },
    onSuccess: () => {
      setOpen(false);
      message.success('保存成功');
      void client.invalidateQueries({ queryKey: ['weighbridge', 'sites'] });
      void client.invalidateQueries({ queryKey: ['weighbridge', 'task-sync-status'] });
      void client.invalidateQueries({ queryKey: ['weighbridge', 'tasks'] });
      void client.invalidateQueries({ queryKey: ['weighbridge', 'sync'] });
      void client.invalidateQueries({ queryKey: ['weighbridge', 'tickets'] });
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  function submit(values: SiteInput) {
    const input = { code: values.code.trim(), name: values.name.trim() };
    const original = editing;
    if (!original || original.code === input.code) {
      save.mutate({ input, original });
      return;
    }
    modal.confirm({
      title: '确认更改厂区编码',
      content: (
        <>
          <p>将 {original.name} 的编码从 <strong>{original.code}</strong> 改为 <strong>{input.code}</strong>。</p>
          <p>{codeChangePrerequisite}请与现场协调切换厂端编码，并确认资料和单据同步恢复。</p>
          <p>保存后旧编码停止接收写入，未确认的旧编码变化需由维护人员处理。已接收数据保留原出单编码，旧编码仅供原厂使用。</p>
        </>
      ),
      okText: '确认改码',
      cancelText: '返回检查',
      onOk: () => save.mutateAsync({ input, original }),
    });
  }

  const columns: ColumnsType<Site> = [
    { title: '厂区编码', dataIndex: 'code', key: 'code' },
    { title: '厂区名称', dataIndex: 'name', key: 'name' },
    { title: '操作', key: 'actions', render: (_, row) => (
      <Button type="link" onClick={() => { setEditing(row); form.setFieldsValue(row); setOpen(true); }}>编辑</Button>
    ) },
  ];
  const rows = list.data ?? [];

  return (
    <>
      <PageHeader title="厂区接入" description="维护厂区编码和名称。厂端使用厂区编码同步业务数据和基础资料。" />
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Button type="primary" onClick={() => { setEditing(null); form.resetFields(); setOpen(true); }}>登记厂区</Button>
        {list.isError && <Alert type="error" message={getApiErrorMessage(list.error)} action={<Button onClick={() => void list.refetch()}>重试</Button>} />}
        <DataTable
          tableKey="weighbridge-sites"
          rowKey="code"
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
        title={editing ? '编辑厂区' : '登记厂区'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        okText={changingCode ? '核对改码' : '保存'}
        confirmLoading={save.isPending}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item
            name="code"
            label="厂区编码"
            extra={editing ? '编码修改后需同步调整厂端配置。' : '请与厂端配置使用同一编码。'}
            rules={[
              { required: true, whitespace: true },
              { transform: (value: string) => value?.trim(), pattern: /^[A-Za-z0-9_.-]{1,40}$/, message: '请输入 1 至 40 位字母、数字、下划线、点或连字符' },
            ]}
          >
            <Input maxLength={40} />
          </Form.Item>
          <Form.Item name="name" label="厂区名称" rules={[{ required: true, whitespace: true }]}>
            <Input maxLength={100} />
          </Form.Item>
          {changingCode && <Alert type="warning" showIcon message="改码前请确认旧编码已完成同步" description={codeChangePrerequisite} />}
        </Form>
      </Modal>
    </>
  );
}
