import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Input, Select, Space, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { useListUrlState } from '../../hooks/useListUrlState';
import { taskSyncStatus, weighingTasks, type TaskSyncStatus, type WeighingTask } from '../../features/weighbridge/api';
import { formatBeijingTime } from '../../features/weighbridge/time';

const taskStatuses = {
  awaiting_second: { label: '待回磅', color: 'processing' },
  terminated: { label: '已终止', color: 'default' },
  issued_pending_upload: { label: '已出单，待上传', color: 'gold' },
} as const;
const statusOptions = Object.entries(taskStatuses).map(([value, { label }]) => ({ value, label }));
const config = { filters: { siteCode: 'text', plate: 'text', status: ['awaiting_second', 'terminated', 'issued_pending_upload'] }, sortKeys: [], pageSizeOptions: [10, 20, 50, 100], defaultPageSize: 10 } as const;
const refreshInterval = 60_000;
const staleAfter = 5 * refreshInterval;

function freshness(lastSyncedAt: string | null, now: number) {
  if (!lastSyncedAt) return 'never';
  return now - new Date(lastSyncedAt).getTime() >= staleAfter ? 'stale' : 'recent';
}

const taskColumns: ColumnsType<WeighingTask> = [
  { title: '厂区', dataIndex: 'siteName' },
  { title: '任务号', dataIndex: 'taskNo' },
  { title: '状态', dataIndex: 'status', render: (value: keyof typeof taskStatuses) => {
    const status = taskStatuses[value];
    return <Tag color={status?.color}>{status?.label ?? '未知状态'}</Tag>;
  } },
  { title: '车牌', dataIndex: 'plate' },
  { title: '方向', dataIndex: 'direction', render: (value: string) => value === 'inbound' ? '入厂卸货' : '出厂装货' },
  { title: '物料', dataIndex: 'materialName' },
  { title: '供收方', dataIndex: 'partyName' },
  { title: '首磅时间', dataIndex: 'firstWeighedAt', render: (value: string) => formatBeijingTime(value) },
];

const terminationColumns: ColumnsType<WeighingTask> = [
  { title: '终止时间', key: 'terminatedAt', render: (_, row) => formatBeijingTime(row.termination?.at) },
  { title: '终止人', key: 'terminatedBy', render: (_, row) => row.termination?.actor || '—' },
  { title: '终止原因', key: 'terminationReason', width: 180, render: (_, row) => row.termination?.reason || '—', onCell: () => ({ style: { whiteSpace: 'normal', overflowWrap: 'anywhere' } }) },
];

export default function TasksPage() {
  const { state, actions } = useListUrlState(config);
  const status = state.filters.status || 'awaiting_second';
  const siteCode = state.filters.siteCode;
  const list = useQuery({
    queryKey: ['weighbridge', 'tasks', state],
    queryFn: () => weighingTasks({ ...state.filters, status, pageNum: state.page, pageSize: state.pageSize }),
    refetchInterval: refreshInterval,
  });
  const sites = useQuery({ queryKey: ['weighbridge', 'task-sync-status'], queryFn: taskSyncStatus, refetchInterval: refreshInterval });
  // dataUpdatedAt advances with each successful poll, including unchanged heartbeats.
  const now = Math.max(Date.now(), sites.dataUpdatedAt);
  const siteRows = sites.data ?? [];
  const siteOptions = siteRows.map((site) => ({ value: site.siteCode, label: `${site.siteName}（${site.siteCode}）` }));
  if (siteCode && !siteOptions.some((site) => site.value === siteCode)) {
    siteOptions.push({ value: siteCode, label: siteCode });
  }

  const selectedSite = siteRows.find((site) => site.siteCode === siteCode);
  const selectedFreshness = selectedSite && freshness(selectedSite.lastSyncedAt, now);
  let emptyDescription = '暂无符合条件的任务';
  if (!sites.isError && selectedFreshness === 'never') emptyDescription = '该厂区尚未同步任务数据';
  if (!sites.isError && selectedFreshness === 'stale') emptyDescription = '最近同步的记录中暂无符合条件的任务，数据可能滞后';
  if (list.isError) emptyDescription = '任务加载失败';

  const columns = [...taskColumns];
  if (status === 'awaiting_second') {
    columns.push({ title: '等待时长', key: 'wait', render: (_, row) => {
      const elapsed = now - new Date(row.firstWeighedAt).getTime();
      return row.status === status && Number.isFinite(elapsed) ? `${Math.max(0, Math.floor(elapsed / 60_000))} 分钟` : '—';
    } });
  }
  if (status === 'terminated') columns.push(...terminationColumns);

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <PageHeader title="待回磅任务" description="查看各厂最近同步的任务。连续 5 分钟未收到成功同步时提示数据可能滞后。" />
      {sites.isError && <Alert type="error" title="厂区同步状态加载失败" action={<Button onClick={() => void sites.refetch()}>重试</Button>} />}
      <Table<TaskSyncStatus>
        rowKey="siteCode"
        size="small"
        pagination={false}
        loading={sites.isLoading}
        dataSource={siteRows}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: sites.isError ? '厂区同步状态加载失败' : '暂无厂区同步记录' }}
        columns={[
          { title: '厂区', dataIndex: 'siteName' },
          { title: '厂区编码', dataIndex: 'siteCode' },
          { title: '待回磅数量', dataIndex: 'awaitingCount', render: (value: number | null) => value ?? '—' },
          { title: '最近成功同步（北京时间）', dataIndex: 'lastSyncedAt', render: (value: string | null) => formatBeijingTime(value) },
          { title: '数据新鲜度', key: 'freshness', render: (_, site) => {
            const status = freshness(site.lastSyncedAt, now);
            if (sites.isError) return <Tag>状态获取失败</Tag>;
            if (status === 'never') return <Tag>尚未同步</Tag>;
            if (status === 'stale') return <Tag color="warning">数据可能滞后</Tag>;
            return <Tag color="success">近期已同步</Tag>;
          } },
        ]}
      />
      <Space wrap role="group" aria-label="筛选条件">
        <Select
          aria-label="厂区"
          placeholder="全部厂区"
          showSearch={{ optionFilterProp: 'label' }}
          allowClear
          value={siteCode || undefined}
          onChange={(value) => actions.setFilter('siteCode', value)}
          options={siteOptions}
          loading={sites.isLoading}
          notFoundContent={sites.isError ? '厂区加载失败' : '没有匹配的厂区'}
          style={{ width: 224 }}
        />
        <Input placeholder="车牌" aria-label="车牌" allowClear value={state.filters.plate ?? ''} onChange={(event) => actions.setFilter('plate', event.target.value)} />
        <Select aria-label="任务状态" value={status} onChange={(value) => actions.setFilter('status', value)} options={statusOptions} style={{ width: 180 }} />
      </Space>
      {list.isError && <Alert type="error" title="任务加载失败" action={<Button onClick={() => void list.refetch()}>重试</Button>} />}
      <DataTable
        tableKey="weighbridge-tasks"
        rowKey={(row) => `${row.siteCode}:${row.taskNo}`}
        dataSource={list.data?.items ?? []}
        total={list.data?.total ?? 0}
        page={state.page}
        pageSize={state.pageSize}
        onPageChange={actions.setPage}
        loading={list.isLoading}
        onRefresh={() => { void list.refetch(); void sites.refetch(); }}
        emptyDescription={emptyDescription}
        scrollX={status === 'terminated' ? 980 : 'max-content'}
        columns={columns}
      />
    </Space>
  );
}
