import { useQuery } from '@tanstack/react-query';
import { Alert, Input, Select, Space, Table, Typography } from 'antd';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { useListUrlState } from '../../hooks/useListUrlState';
import { taskSyncStatus, weighingTasks, type WeighingTask } from '../../features/weighbridge/api';
import { formatDateTime } from '../../utils/format';

const config = { filters: { siteCode: 'text', plate: 'text', status: ['awaiting_second', 'terminated', 'issued_pending_upload'] }, sortKeys: [], pageSizeOptions: [10, 20, 50, 100], defaultPageSize: 10 } as const;
export default function TasksPage() {
  const { state, actions } = useListUrlState(config);
  const status = state.filters.status || 'awaiting_second';
  const list = useQuery({ queryKey: ['weighbridge', 'tasks', state], queryFn: () => weighingTasks({ ...state.filters, status, pageNum: state.page, pageSize: state.pageSize }), refetchInterval: 60000 });
  const sites = useQuery({ queryKey: ['weighbridge', 'task-sync-status'], queryFn: taskSyncStatus, refetchInterval: 60000 });
  return <Space direction="vertical" size="middle" style={{ width: '100%' }}>
    <PageHeader title="待回磅任务" description="厂端数据可能尚未同步，任务仅供查询。" />
    {sites.isError && <Alert type="error" message="厂区同步状态加载失败" />}
    <Table rowKey="siteCode" size="small" pagination={false} loading={sites.isLoading} dataSource={sites.data ?? []} columns={[
      { title: '厂区', dataIndex: 'siteName' }, { title: '厂区编码', dataIndex: 'siteCode' },
      { title: '待回磅数量', dataIndex: 'awaitingCount', render: (v: number | null) => v ?? '尚未同步' },
      { title: '最近同步', dataIndex: 'lastSyncedAt', render: (v: string | null) => !v ? '尚未同步' : <>{formatDateTime(v)} {Date.now() - new Date(v).getTime() >= 300000 && <Typography.Text type="warning">数据可能滞后</Typography.Text>}</> },
    ]} />
    <Space wrap><Input placeholder="厂区编码" aria-label="厂区编码" value={state.filters.siteCode ?? ''} onChange={(e) => actions.setFilter('siteCode', e.target.value)} /><Input placeholder="车牌" aria-label="车牌" value={state.filters.plate ?? ''} onChange={(e) => actions.setFilter('plate', e.target.value)} /><Select aria-label="任务状态" value={status} onChange={(v) => actions.setFilter('status', v)} options={[{value:'awaiting_second',label:'待回磅'},{value:'terminated',label:'已终止'},{value:'issued_pending_upload',label:'已出单，待上传'}]} style={{ width: 180 }} /></Space>
    {list.isError && <Alert type="error" message="任务加载失败" />}
    <DataTable tableKey="weighbridge-tasks" rowKey={(r: WeighingTask) => `${r.siteCode}:${r.taskNo}`} dataSource={list.data?.items ?? []} total={list.data?.total ?? 0} page={state.page} pageSize={state.pageSize} onPageChange={actions.setPage} loading={list.isLoading} onRefresh={() => { void list.refetch(); void sites.refetch(); }} columns={[
      {title:'厂区',dataIndex:'siteName'}, {title:'任务号',dataIndex:'taskNo'}, {title:'车牌',dataIndex:'plate'}, {title:'方向',dataIndex:'direction',render:(v: string) => v === 'inbound' ? '入厂卸货' : '出厂装货'}, {title:'物料',dataIndex:'materialName'}, {title:'供收方',dataIndex:'partyName'}, {title:'首磅时间',dataIndex:'firstWeighedAt',render:(v:string)=>formatDateTime(v)}, {title:'等待时长',render:(_, r) => r.status === 'awaiting_second' ? `${Math.max(0, Math.floor((Date.now()-new Date(r.firstWeighedAt).getTime())/60000))} 分钟` : '—'}, {title:'终止时间',render:(_,r)=>r.termination ? formatDateTime(r.termination.at) : '—'}, {title:'终止人',render:(_,r)=>r.termination?.actor || '—'}, {title:'终止原因',render:(_,r)=>r.termination?.reason || '—'},
    ]} />
  </Space>;
}
