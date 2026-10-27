import { useMemo, useState } from 'react';
import { Alert, App, Button, Descriptions, Input, Modal, Select, Space, Tag } from 'antd';
import { Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../components/PageHeader';
import { SearchFilterBar } from '../../components/SearchFilterBar';
import { DataTable } from '../../components/DataTable';
import { useListUrlState } from '../../hooks/useListUrlState';
import { useListDraft } from '../../hooks/useListDraft';
import { queryKeys } from '../../lib/queryKeys';
import { getApiErrorMessage } from '../../lib/api/errors';
import { formatDateTime } from '../../utils/format';
import { clearLoginLogs, getLoginLog, listLoginLogs } from '../../features/logs/api';
import type { LoginLogRecord } from '../../types/logs';
import type { ColumnsType } from 'antd/es/table';

const listConfig = {
  filters: { username: 'text', loginStatus: ['SUCCESS', 'FAIL'], loginIp: 'text' },
  sortKeys: [],
  pageSizeOptions: [10, 20, 50, 100],
  defaultPageSize: 10,
} as const;

const STATUS_OPTIONS = [
  { value: 'SUCCESS', label: '成功', color: 'green' },
  { value: 'FAIL', label: '失败', color: 'red' },
];

export default function LoginLogsPage() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const { state, actions } = useListUrlState(listConfig);
  const { draft, setKeyword, setFilter, reset } = useListDraft(state.keyword, state.filters);
  const [detailId, setDetailId] = useState<number | null>(null);

  const query = useMemo(
    () => ({
      page: state.page,
      pageSize: state.pageSize,
      username: state.filters.username || undefined,
      loginStatus: state.filters.loginStatus || undefined,
      loginIp: state.filters.loginIp || undefined,
    }),
    [state],
  );

  const logsQuery = useQuery({ queryKey: queryKeys.logs.login(query), queryFn: () => listLoginLogs(query) });
  const detailQuery = useQuery({
    queryKey: ['system', 'logs', 'login', 'detail', detailId],
    queryFn: () => getLoginLog(detailId!),
    enabled: detailId !== null,
  });

  const clearMutation = useMutation({
    mutationFn: clearLoginLogs,
    onSuccess: () => {
      message.success('登录日志已清空');
      void queryClient.invalidateQueries({ queryKey: queryKeys.logs.loginAll });
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const columns: ColumnsType<LoginLogRecord> = [
    { title: '用户名', dataIndex: 'username', width: 140 },
    {
      title: '结果',
      dataIndex: 'loginStatus',
      width: 100,
      render: (value: string) => {
        const option = STATUS_OPTIONS.find((item) => item.value === value);
        return <Tag color={option?.color ?? 'default'}>{option?.label ?? value}</Tag>;
      },
    },
    { title: '登录 IP', dataIndex: 'loginIp', width: 150, render: (value) => value || '—' },
    { title: '浏览器', dataIndex: 'browser', width: 160, ellipsis: true, render: (value) => value || '—' },
    { title: '操作系统', dataIndex: 'os', width: 160, ellipsis: true, render: (value) => value || '—' },
    { title: '消息', dataIndex: 'message', ellipsis: true, render: (value) => value || '—' },
    { title: '登录时间', dataIndex: 'loginTime', width: 170, render: (value) => formatDateTime(value) },
    {
      title: '操作',
      key: 'actions',
      width: 90,
      render: (_, record) => <Button type="link" size="small" onClick={() => setDetailId(record.id)}>详情</Button>,
    },
  ];

  return (
    <div className="pageStack">
      <PageHeader
        title="登录日志"
        description="记录成功与失败的登录尝试；清空操作受 system.log-clear-enabled 配置控制。"
        extra={
          <Button
            danger
            icon={<Trash2 size={15} />}
            onClick={() =>
              modal.confirm({
                title: '清空全部登录日志',
                content: '清空后不可恢复。若配置未开启日志清空，后端会拒绝该操作。',
                okText: '清空',
                cancelText: '取消',
                okButtonProps: { danger: true },
                onOk: () => clearMutation.mutateAsync(),
              })
            }
          >
            清空日志
          </Button>
        }
      />

      <SearchFilterBar
        onSubmit={() => actions.applyFilters(draft.keyword, { username: draft.filters.username, loginStatus: draft.filters.loginStatus, loginIp: draft.filters.loginIp })}
        onReset={() => { reset(); actions.reset(); }}
      >
        <Input allowClear placeholder="用户名" value={draft.filters.username ?? ''} onChange={(event) => setFilter('username', event.target.value)} style={{ width: 170 }} aria-label="按用户名筛选" />
        <Select allowClear placeholder="登录结果" value={draft.filters.loginStatus} onChange={(value) => setFilter('loginStatus', value)} style={{ width: 130 }} options={STATUS_OPTIONS.map(({ value, label }) => ({ value, label }))} aria-label="按登录结果筛选" />
        <Input allowClear placeholder="登录 IP" value={draft.filters.loginIp ?? ''} onChange={(event) => setFilter('loginIp', event.target.value)} style={{ width: 170 }} aria-label="按登录 IP 筛选" />
        <Input allowClear placeholder="关键词" value={draft.keyword} onChange={(event) => setKeyword(event.target.value)} style={{ width: 200 }} aria-label="关键词搜索" />
      </SearchFilterBar>

      {logsQuery.isError && <Alert type="error" showIcon title="登录日志加载失败" description={getApiErrorMessage(logsQuery.error)} />}

      <DataTable<LoginLogRecord>
        tableKey="system-login-logs"
        columns={columns}
        dataSource={logsQuery.data?.items ?? []}
        rowKey="id"
        total={logsQuery.data?.total}
        page={state.page}
        pageSize={state.pageSize}
        onPageChange={(page, pageSize) => actions.setPage(page, pageSize)}
        loading={logsQuery.isLoading}
        onRefresh={() => void logsQuery.refetch()}
        refreshing={logsQuery.isFetching}
      />

      <Modal
        title="登录日志详情"
        open={detailId !== null}
        onCancel={() => setDetailId(null)}
        footer={<Button onClick={() => setDetailId(null)}>关闭</Button>}
        width={640}
        destroyOnHidden
      >
        {detailQuery.isError ? (
          <Alert type="error" showIcon title="详情加载失败" description={getApiErrorMessage(detailQuery.error)} />
        ) : (
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="用户名">{detailQuery.data?.username ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="结果">{detailQuery.data?.loginStatus ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="登录 IP">{detailQuery.data?.loginIp ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="登录地点">{detailQuery.data?.loginLocation ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="浏览器">{detailQuery.data?.browser ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="操作系统">{detailQuery.data?.os ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="消息">{detailQuery.data?.message ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="登录时间">{formatDateTime(detailQuery.data?.loginTime)}</Descriptions.Item>
            <Descriptions.Item label="User-Agent"><Space><span style={{ wordBreak: 'break-all' }}>{detailQuery.data?.userAgent ?? '—'}</span></Space></Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}
