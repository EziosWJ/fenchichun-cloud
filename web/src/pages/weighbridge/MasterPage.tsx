import { useState } from 'react';
import { Alert, App, Button, Checkbox, Form, Input, Modal, Select, Space, Switch, Tag, Row as GridRow, Col } from 'antd';
import { useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { useListUrlState } from '../../hooks/useListUrlState';
import { getApiErrorMessage } from '../../lib/api/errors';
import { categories, materials, parties, saveCategory, saveMaterial, saveParty, type Category, type Material, type Party } from '../../features/weighbridge/api';

type Kind = 'categories' | 'materials' | 'parties';
type Row = Category | Material | Party;
type FormValues = Omit<Party, 'code'> & Omit<Material, 'code'>;
const config = { filters: {}, sortKeys: [], pageSizeOptions: [10, 20, 50], defaultPageSize: 10 } as const;
export default function MasterPage() {
  const { message } = App.useApp();
  const client = useQueryClient();
  const { state, actions } = useListUrlState(config);
  const pathname = useLocation().pathname;
  const kind: Kind = pathname.endsWith('/materials') ? 'materials' : pathname.endsWith('/parties') ? 'parties' : 'categories';
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [keyword, setKeyword] = useState(state.keyword);
  const [form] = Form.useForm<FormValues>();
  const categoryQuery = useQuery({ queryKey: ['weighbridge', 'categories'], queryFn: categories });
  const materialQuery = useQuery({ queryKey: ['weighbridge', 'materials'], queryFn: materials, enabled: kind === 'materials' });
  const partyQuery = useQuery({ queryKey: ['weighbridge', 'parties'], queryFn: parties, enabled: kind === 'parties' });
  const active = kind === 'categories' ? categoryQuery : kind === 'materials' ? materialQuery : partyQuery;
  const rows: Row[] = active.data ?? [];
  const filtered = rows.filter((row) => !state.keyword || `${row.name} ${row.code}`.includes(state.keyword));
  const save = useMutation({
    mutationFn: (v: FormValues) => kind === 'categories' ? saveCategory({ name: v.name, enabled: v.enabled }, editing?.code) : kind === 'materials' ? saveMaterial({ name: v.name, categoryCode: v.categoryCode || null, spec: v.spec || '', remark: v.remark || '', enabled: v.enabled }, editing?.code) : saveParty({ name: v.name, shortName: v.shortName || '', nature: v.nature, isSupplier: !!v.isSupplier, isCustomer: !!v.isCustomer, isCarrier: !!v.isCarrier, phone: v.phone || '', address: v.address || '', creditCode: v.creditCode || '', remark: v.remark || '', enabled: v.enabled, contacts: (v.contacts || []).map((c) => ({ id: c.id || 0, name: c.name, phone: c.phone || '', purpose: c.purpose || '', remark: c.remark || '', isDefault: !!c.isDefault })) }, editing?.code),
    onSuccess: () => { message.success('保存成功'); setOpen(false); void client.invalidateQueries({ queryKey: ['weighbridge'] }); },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });
  const edit = (row: Row | null) => { setEditing(row); form.resetFields(); form.setFieldsValue(row ? { ...row } : { enabled: true, nature: 'enterprise', contacts: [] }); setOpen(true); };
  const columns: ColumnsType<Row> = [
    { title: '编码', dataIndex: 'code', key: 'code' }, { title: '名称', dataIndex: 'name', key: 'name' },
    { title: '状态', dataIndex: 'enabled', key: 'enabled', render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? '启用' : '停用'}</Tag> },
    { title: '操作', key: 'actions', render: (_, row) => <Button type="link" onClick={() => edit(row)}>编辑</Button> },
  ];
  return <>
    <PageHeader title={kind === 'categories' ? '物料分类' : kind === 'materials' ? '物料' : '往来主体'} description="维护下发各厂的基础资料。" />
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Space wrap><Input.Search aria-label="名称或编码" placeholder="名称或编码" value={keyword} onChange={(e) => setKeyword(e.target.value)} onSearch={(value) => actions.setKeyword(value)} allowClear /><Button type="primary" onClick={() => edit(null)}>新增</Button></Space>
      {active.isError && <Alert type="error" message={getApiErrorMessage(active.error)} action={<Button onClick={() => void active.refetch()}>重试</Button>} />}
      <DataTable tableKey={`weighbridge-${kind}`} columns={columns} rowKey="code" dataSource={filtered.slice((state.page - 1) * state.pageSize, state.page * state.pageSize)} total={filtered.length} page={state.page} pageSize={state.pageSize} onPageChange={actions.setPage} loading={active.isLoading} onRefresh={() => void active.refetch()} />
    </Space>
    <Modal title={`${editing ? '编辑' : '新增'}${kind === 'categories' ? '分类' : kind === 'materials' ? '物料' : '往来主体'}`} open={open} onCancel={() => setOpen(false)} onOk={() => void form.validateFields().then((v) => save.mutate(v))} confirmLoading={save.isPending} destroyOnHidden width={kind === 'parties' ? 800 : 520}>
      <Form form={form} layout="vertical">
        <GridRow gutter={16}>
        <Col xs={24} sm={kind === 'parties' ? 12 : 24}><Form.Item name="name" label="名称" rules={[{required:true, whitespace:true, message:'请输入名称'}]}><Input maxLength={100} /></Form.Item></Col>
        {kind === 'materials' && <Col span={24}><Form.Item name="categoryCode" label="分类"><Select allowClear options={(categoryQuery.data || []).filter((c) => c.enabled || ('categoryCode' in (editing || {}) && (editing as Material).categoryCode === c.code)).map((c) => ({value:c.code,label:c.name,disabled:!c.enabled}))} /></Form.Item><Form.Item name="spec" label="规格／等级"><Input maxLength={200} /></Form.Item><Form.Item name="remark" label="备注"><Input.TextArea maxLength={2000} /></Form.Item></Col>}
        {kind === 'parties' && <>
          <Col xs={24} sm={12}><Form.Item name="shortName" label="简称"><Input maxLength={100} /></Form.Item></Col>
          <Col xs={24} sm={12}><Form.Item name="nature" label="主体性质" rules={[{required:true}]}><Select options={[{value:'enterprise',label:'企业'},{value:'individual',label:'个人'}]} /></Form.Item></Col>
          <Col xs={24} sm={12}><Space wrap><Form.Item name="isSupplier" valuePropName="checked"><Checkbox>供货商</Checkbox></Form.Item><Form.Item name="isCustomer" valuePropName="checked"><Checkbox>客户</Checkbox></Form.Item><Form.Item name="isCarrier" valuePropName="checked"><Checkbox>承运商</Checkbox></Form.Item></Space></Col>
          <Col xs={24} sm={12}><Form.Item name="phone" label="联系电话"><Input maxLength={50} /></Form.Item></Col><Col xs={24} sm={12}><Form.Item name="address" label="业务地址"><Input maxLength={500} /></Form.Item></Col><Col xs={24} sm={12}><Form.Item name="creditCode" label="企业信用代码"><Input maxLength={50} /></Form.Item></Col><Col span={24}><Form.Item name="remark" label="备注"><Input.TextArea maxLength={2000} /></Form.Item></Col>
          <Col span={24}><Form.List name="contacts">{(fields, { add, remove }) => <><strong>联系人</strong>{fields.map(({key, name, ...rest}) => <Space key={key} align="baseline" wrap><Form.Item {...rest} name={[name, 'id']} hidden><Input /></Form.Item><Form.Item {...rest} name={[name, 'name']} rules={[{required:true,whitespace:true,message:'请输入姓名'}]}><Input placeholder="姓名" /></Form.Item><Form.Item {...rest} name={[name, 'phone']}><Input placeholder="电话" /></Form.Item><Form.Item {...rest} name={[name, 'purpose']}><Input placeholder="用途／职务" /></Form.Item><Form.Item {...rest} name={[name, 'remark']}><Input placeholder="备注" /></Form.Item><Form.Item {...rest} name={[name, 'isDefault']} valuePropName="checked"><Checkbox>默认</Checkbox></Form.Item><Button onClick={() => remove(name)}>移除</Button></Space>)}<Button onClick={() => add({id:0,isDefault:fields.length === 0})}>添加联系人</Button></>}</Form.List></Col>
        </>}
        <Col span={24}><Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item></Col>
        </GridRow>
      </Form>
    </Modal>
  </>;
}
