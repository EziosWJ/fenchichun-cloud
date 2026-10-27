import { useMemo, useState } from 'react';
import { Alert, App, Button, Descriptions, Input, Modal, Select, Typography } from 'antd';
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
import { clearOperLogs, getOperLog, listOperLogs } from '../../features/logs/api';
import type { OperLogRecord } from '../../types/logs';
import type { ColumnsType } from 'antd/es/table';

const listConfig = {
  filters: { moduleName: 'text', operationType: 'text', operatorName: 'text', operationStatus: ['SUCCESS', 'FAIL'] },
  sortKeys: [],
  pageSizeOptions: [10, 20, 50, 100],
  defaultPageSize: 10,
} as const;

export default function OperLogsPage() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const { state, actions } = useListUrlState(listConfig);
  const { draft, setKeyword, setFilter, reset } = useListDraft(state.keyword, state.filters);
  const [detailId, setDetailId] = useState<number | null>(null);

  const query = useMemo(
    () => ({
      page: state.page,
      pageSize: state.pageSize,
      moduleName: state.filters.moduleName || undefined,
      operationType: state.filters.operationType || undefined,
      operatorName: state.filters.operatorName || undefined,
      operationStatus: state.filters.operationStatus || undefined,
    }),
    [state],
  );

  const logsQuery = useQuery({ queryKey: queryKeys.logs.oper(query), queryFn: () => listOperLogs(query) });
  const detailQuery = useQuery({
    queryKey: ['system', 'logs', 'oper', 'detail', detailId],
    queryFn: () => getOperLog(detailId!),
    enabled: detailId !== null,
  });

  const clearMutation = useMutation({
    mutationFn: clearOperLogs,
    onSuccess: () => {
      message.success('操作日志已清空');
      void queryClient.invalidateQueries({ queryKey: queryKeys.logs.operAll });
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const columns: ColumnsType<OperLogRecord> = [
    { title: '模块', dataIndex: 'moduleName', width: 140, render: (value) => value || '—' },
    { title: '操作类型', dataIndex: 'operationType', width: 160, render: (value) => <Typography.Text code>{value}</Typography.Text> },
    { title: '请求方式', dataIndex: 'requestMethod', width: 100 },
    { title: '请求地址', dataIndex: 'requestUrl', width: 260, ellipsis: true },
    { title: '操作人', dataIndex: 'operatorName', width: 130, render: (value) => value || '—' },
    { title: '操作 IP', dataIndex: 'operatorIp', width: 140, render: (value) => value || '—' },
    {
      title: '结果',
      dataIndex: 'operationStatus',
      width: 90,
      render: (value: string) => (value === 'SUCCESS' ? '成功' : value === 'FAIL' ? '失败' : value),
    },
    { title: '耗时', dataIndex: 'costTime', width: 90, render: (value: number) => `${value} ms` },
    { title: '操作时间', dataIndex: 'operationTime', width: 170, render: (value) => formatDateTime(value) },
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
        title="操作日志"
        description="记录管理模块成功写操作的审计信息；清空操作受系统配置控制。"
        extra={
          <Button
            danger
            icon={<Trash2 size={15} />}
            onClick={() =>
              modal.confirm({
                title: '清空全部操作日志',
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
        onSubmit={() =>
          actions.applyFilters(draft.keyword, {
            moduleName: draft.filters.moduleName,
            operationType: draft.filters.operationType,
            operatorName: draft.filters.operatorName,
            operationStatus: draft.filters.operationStatus,
          })
        }
        onReset={() => { reset(); actions.reset(); }}
      >
        <Input allowClear placeholder="模块名称" value={draft.filters.moduleName ?? ''} onChange={(event) => setFilter('moduleName', event.target.value)} style={{ width: 160 }} aria-label="按模块筛选" />
        <Input allowClear placeholder="操作类型" value={draft.filters.operationType ?? ''} onChange={(event) => setFilter('operationType', event.target.value)} style={{ width: 170 }} aria-label="按操作类型筛选" />
        <Input allowClear placeholder="操作人" value={draft.filters.operatorName ?? ''} onChange={(event) => setFilter('operatorName', event.target.value)} style={{ width: 150 }} aria-label="按操作人筛选" />
        <Select allowClear placeholder="结果" value={draft.filters.operationStatus} onChange={(value) => setFilter('operationStatus', value)} style={{ width: 120 }} options={[{ value: 'SUCCESS', label: '成功' }, { value: 'FAIL', label: '失败' }]} aria-label="按结果筛选" />
        <Input allowClear placeholder="关键词" value={draft.keyword} onChange={(event) => setKeyword(event.target.value)} style={{ width: 200 }} aria-label="关键词搜索" />
      </SearchFilterBar>

      {logsQuery.isError && <Alert type="error" showIcon title="操作日志加载失败" description={getApiErrorMessage(logsQuery.error)} />}

      <DataTable<OperLogRecord>
        tableKey="system-oper-logs"
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
        title="操作日志详情"
        open={detailId !== null}
        onCancel={() => setDetailId(null)}
        footer={<Button onClick={() => setDetailId(null)}>关闭</Button>}
        width={720}
        destroyOnHidden
      >
        {detailQuery.isError ? (
          <Alert type="error" showIcon title="详情加载失败" description={getApiErrorMessage(detailQuery.error)} />
        ) : (
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="模块">{detailQuery.data?.moduleName ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="操作类型">{detailQuery.data?.operationType ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="请求">{`${detailQuery.data?.requestMethod ?? ''} ${detailQuery.data?.requestUrl ?? ''}`}</Descriptions.Item>
            <Descriptions.Item label="操作人">{detailQuery.data?.operatorName ?? '—'}（{detailQuery.data?.operatorIp ?? '—'}）</Descriptions.Item>
            <Descriptions.Item label="结果">{detailQuery.data?.operationStatus ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="耗时">{detailQuery.data?.costTime ?? 0} ms</Descriptions.Item>
            <Descriptions.Item label="操作时间">{formatDateTime(detailQuery.data?.operationTime)}</Descriptions.Item>
            <Descriptions.Item label="请求参数"><pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{detailQuery.data?.requestParams || '—'}</pre></Descriptions.Item>
            <Descriptions.Item label="响应结果"><pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{detailQuery.data?.responseResult || '—'}</pre></Descriptions.Item>
            <Descriptions.Item label="错误信息">{detailQuery.data?.errorMessage || '—'}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}
