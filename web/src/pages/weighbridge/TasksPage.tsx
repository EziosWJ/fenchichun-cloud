import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Input, Select, Skeleton, Space, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { FilterField } from '../../components/SearchFilterBar';
import { useListUrlState } from '../../hooks/useListUrlState';
import { getApiErrorMessage } from '../../lib/api/errors';
import { taskSyncStatus, weighingTasks, type WeighingTask } from '../../features/weighbridge/api';
import { formatBeijingTime } from '../../features/weighbridge/time';
import styles from './TasksPage.module.css';

const taskStatuses = {
  awaiting_second: { label: '待回磅', color: 'processing' },
  terminated: { label: '已终止', color: 'default' },
  issued_pending_upload: { label: '已出单，待上传', color: 'warning' },
} as const;

const statusOptions = Object.entries(taskStatuses).map(([value, { label }]) => ({ value, label }));
const config = {
  filters: {
    siteCode: 'text',
    plate: 'text',
    status: ['awaiting_second', 'terminated', 'issued_pending_upload'],
  },
  sortKeys: [],
  pageSizeOptions: [10, 20, 50, 100],
  defaultPageSize: 10,
} as const;
const refreshInterval = 60_000;
const staleAfter = 5 * refreshInterval;

function freshness(lastSyncedAt: string | null, now: number) {
  if (!lastSyncedAt) return 'never';
  return now - new Date(lastSyncedAt).getTime() >= staleAfter ? 'stale' : 'recent';
}

const taskColumns: ColumnsType<WeighingTask> = [
  { title: '厂区', dataIndex: 'siteName' },
  { title: '任务号', dataIndex: 'taskNo', render: (v: string) => <span className="monoCode">{v}</span> },
  {
    title: '状态',
    dataIndex: 'status',
    render: (value: keyof typeof taskStatuses) => {
      const status = taskStatuses[value];
      return <Tag color={status?.color}>{status?.label ?? '未知状态'}</Tag>;
    },
  },
  { title: '车牌', dataIndex: 'plate', render: (v: string) => <span className="plateBadge">{v}</span> },
  {
    title: '方向',
    dataIndex: 'direction',
    render: (value: string) => (
      <Tag color={value === 'inbound' ? 'volcano' : 'cyan'}>
        {value === 'inbound' ? '入厂卸货' : '出厂装货'}
      </Tag>
    ),
  },
  { title: '物料', dataIndex: 'materialName' },
  { title: '供收方', dataIndex: 'partyName' },
  { title: '首磅时间', dataIndex: 'firstWeighedAt', render: (value: string) => formatBeijingTime(value) },
];

const terminationColumns: ColumnsType<WeighingTask> = [
  { title: '终止时间', key: 'terminatedAt', render: (_, row) => formatBeijingTime(row.termination?.at) },
  { title: '终止人', key: 'terminatedBy', render: (_, row) => row.termination?.actor || '—' },
  {
    title: '终止原因',
    key: 'terminationReason',
    width: 180,
    render: (_, row) => row.termination?.reason || '—',
    onCell: () => ({ style: { whiteSpace: 'normal', overflowWrap: 'anywhere' } }),
  },
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
    columns.push({
      title: '等待时长',
      key: 'wait',
      align: 'right',
      render: (_, row) => {
        const elapsed = now - new Date(row.firstWeighedAt).getTime();
        return row.status === status && Number.isFinite(elapsed) ? `${Math.max(0, Math.floor(elapsed / 60_000))} 分钟` : '—';
      },
    });
  }
  if (status === 'terminated') columns.push(...terminationColumns);

  return (
    <div className="pageStack">
      <PageHeader
        title="待回磅任务"
        description="实时查看各厂区待回磅任务。点击厂区卡片可快速筛选，连续 5 分钟未收到成功同步将提示滞后。"
      />

      {sites.isError && (
        <Alert
          type="error"
          title="厂区同步状态加载失败"
          action={<Button onClick={() => void sites.refetch()}>重试</Button>}
        />
      )}

      {sites.isLoading ? (
        <div className={styles.siteStrip}>
          {[0, 1, 2].map((idx) => (
            <div key={idx} className={styles.siteCard}>
              <Skeleton active title={{ width: '60%' }} paragraph={{ rows: 1 }} />
            </div>
          ))}
        </div>
      ) : siteRows.length === 0 ? (
        <div className={styles.emptySites}>
          {sites.isError ? '厂区同步状态加载失败' : '暂无厂区同步记录'}
        </div>
      ) : (
        <section className={styles.siteStrip} aria-label="厂区同步状态">
          {siteRows.map((site) => {
            const stateKind = freshness(site.lastSyncedAt, now);
            const active = siteCode === site.siteCode;
            return (
              <button
                type="button"
                key={site.siteCode}
                className={`${styles.siteCard} ${active ? styles.siteCardActive : ''}`.trim()}
                onClick={() => actions.setFilter('siteCode', active ? undefined : site.siteCode)}
                aria-pressed={active}
              >
                <div className={styles.siteHeader}>
                  <div className={styles.siteTitle}>
                    <span className={styles.siteName}>{site.siteName}</span>
                    <span className={styles.siteCode}>{site.siteCode}</span>
                  </div>
                  {stateKind === 'never' ? (
                    <Tag style={{ marginInlineEnd: 0 }}>尚未同步</Tag>
                  ) : stateKind === 'stale' ? (
                    <Tag color="warning" style={{ marginInlineEnd: 0 }}>数据可能滞后</Tag>
                  ) : (
                    <Tag color="success" style={{ marginInlineEnd: 0 }}>近期已同步</Tag>
                  )}
                </div>
                <div className={styles.siteBody}>
                  <span className={styles.siteCount}>
                    {site.awaitingCount ?? '—'}
                    <span className={styles.siteCountUnit}>车待回磅</span>
                  </span>
                  <span className={styles.siteTime}>同步 {formatBeijingTime(site.lastSyncedAt)}</span>
                </div>
              </button>
            );
          })}
        </section>
      )}

      <div className="filterCard" role="group" aria-label="筛选条件">
        <Space wrap align="end" size={[14, 12]} style={{ width: '100%' }}>
          <FilterField label="厂区">
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
            />
          </FilterField>
          <FilterField label="车牌">
            <Input
              placeholder="输入车牌号"
              aria-label="车牌"
              allowClear
              value={state.filters.plate ?? ''}
              onChange={(event) => actions.setFilter('plate', event.target.value)}
            />
          </FilterField>
          <FilterField label="任务状态">
            <Select
              aria-label="任务状态"
              value={status}
              onChange={(value) => actions.setFilter('status', value)}
              options={statusOptions}
            />
          </FilterField>
        </Space>
      </div>

      {list.isError && (
        <Alert
          type="error"
          title={`任务加载失败：${getApiErrorMessage(list.error)}`}
          action={<Button onClick={() => void list.refetch()}>重试</Button>}
        />
      )}

      <DataTable
        tableKey="weighbridge-tasks"
        title="任务列表"
        rowKey={(row) => `${row.siteCode}:${row.taskNo}`}
        columns={columns}
        dataSource={list.data?.items ?? []}
        total={list.data?.total ?? 0}
        page={state.page}
        pageSize={state.pageSize}
        onPageChange={actions.setPage}
        loading={list.isLoading}
        emptyDescription={emptyDescription}
        onRefresh={() => {
          void list.refetch();
          void sites.refetch();
        }}
      />
    </div>
  );
}
