import { useState } from 'react';
import { Alert, Button, DatePicker, Input, Select, Space, Tabs, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import { permits, rejections, stageLabel, tripStages, type Permit, type Trip } from '../../features/grain-intake/api';
import { sites } from '../../features/weighbridge/api';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { useListUrlState } from '../../hooks/useListUrlState';
import { getApiErrorMessage } from '../../lib/api/errors';
import { formatDateTime } from '../../utils/format';
const config = {
  filters: {
    mode: ['permits', 'rejections'],
    stage: tripStages.map((v) => v.value),
    siteCode: 'text',
    dateFrom: 'date',
    dateTo: 'date',
  },
  sortKeys: [],
  pageSizeOptions: [10, 20, 50],
  defaultPageSize: 10,
} as const;
export default function PermitsPage() {
  const { state, actions } = useListUrlState(config);
  const [keyword, setKeyword] = useState(state.keyword);
  const rejected = state.filters.mode === 'rejections';
  const siteList = useQuery({ queryKey: ['weighbridge-sites'], queryFn: sites });
  const siteOptions = (siteList.data ?? []).map((item) => ({ value: item.code, label: `${item.name}（${item.code}）` }));
  const dateRange: [string, string] | undefined = state.filters.dateFrom && state.filters.dateTo ? [state.filters.dateFrom, state.filters.dateTo] : undefined;
  const searchPlaceholder = rejected ? '搜索流转单号、车牌或供应商' : '搜索出门证号、流转单号或车牌';
  const datePlaceholder: [string, string] = rejected ? ['登记开始', '登记结束'] : ['开具开始', '开具结束'];
  const hasFilters = !!(state.keyword || state.filters.stage || state.filters.siteCode || dateRange);
  const params = { page: state.page, pageSize: state.pageSize, keyword: state.keyword, stage: state.filters.stage, siteCode: state.filters.siteCode, dateFrom: state.filters.dateFrom, dateTo: state.filters.dateTo };
  const normal = useQuery({ queryKey: ['grain-intake', 'permits', params], queryFn: () => permits(params), enabled: !rejected });
  const refusal = useQuery({ queryKey: ['grain-intake', 'rejections', params], queryFn: () => rejections(params), enabled: rejected });
  const active = rejected ? refusal : normal;
  const resetFilters = () => {
    setKeyword('');
    actions.applyFilters('', { mode: rejected ? 'rejections' : 'permits' });
  };
  const columns: ColumnsType<Permit> = [
    { title: '出门证号', dataIndex: 'number', render: (v: string, row) => <Link to={`/grain-intake/trips/${row.tripId}`}>{v}</Link> },
    { title: '流转单号', dataIndex: 'tripNumber' }, { title: '厂区', dataIndex: 'siteCode' }, { title: '车牌', dataIndex: 'plate' },
    { title: '当前阶段', dataIndex: 'stage', render: (v: string) => <Tag color={v === 'blocked' ? 'red' : 'blue'}>{stageLabel(v)}</Tag> },
    { title: '开具时间', dataIndex: 'createdAt', render: (v: string) => formatDateTime(v) }, { title: '审批时间', dataIndex: 'approvedAt', render: (v: string | null) => formatDateTime(v) },
    { title: '实际出厂', dataIndex: 'exitedAt', render: (v: string | null) => formatDateTime(v) },
    { title: '操作', key: 'action', render: (_, row) => <Link to={`/grain-intake/trips/${row.tripId}`}>查看流转单</Link> },
  ];
  const rejectionColumns: ColumnsType<Trip> = [
    { title: '流转单号', dataIndex: 'number' }, { title: '车牌', dataIndex: 'plate' }, { title: '货品', dataIndex: 'materialName' }, { title: '供应商', dataIndex: 'partyName' },
    { title: '当前阶段', dataIndex: 'stage', render: (v: string) => <Tag>{stageLabel(v)}</Tag> },
    { title: '实际出厂', dataIndex: 'exitedAt', render: (v: string | null) => formatDateTime(v) },
    { title: '操作', key: 'action', render: (_, row) => <Link to={`/grain-intake/trips/${row.id}`}>查看流转单</Link> },
  ];
  return <>
    <PageHeader title="出门证与出厂核验" />
    <Tabs activeKey={rejected ? 'rejections' : 'permits'} onChange={(v) => { setKeyword(''); actions.applyFilters('', { mode: v }); }} items={[{ key: 'permits', label: '正常出门证' }, { key: 'rejections', label: '拒收退厂' }]} />
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Space wrap align="center">
        <Input.Search
          aria-label={searchPlaceholder}
          placeholder={searchPlaceholder}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onSearch={(v) => actions.setKeyword(v)}
          allowClear
          style={{ width: 320 }}
        />
        <Select
          aria-label="厂区"
          allowClear
          placeholder="全部厂区"
          loading={siteList.isLoading}
          options={siteOptions}
          value={state.filters.siteCode}
          onChange={(v) => actions.setFilter('siteCode', v)}
          style={{ width: 180 }}
        />
        <Select
          aria-label="办理阶段"
          allowClear
          placeholder="全部阶段"
          options={tripStages.filter((v) => rejected ? ['rejected', 'exited', 'blocked'].includes(v.value) : ['permit_pending', 'permit_approved', 'exited', 'blocked'].includes(v.value))}
          value={state.filters.stage}
          onChange={(v) => actions.setFilter('stage', v)}
          style={{ width: 150 }}
        />
        <DatePicker.RangePicker
          allowClear
          placeholder={datePlaceholder}
          value={dateRange ? [dayjs(dateRange[0]), dayjs(dateRange[1])] : null}
          onChange={(dates) => actions.setFilters({
            dateFrom: dates?.[0]?.format('YYYY-MM-DD'),
            dateTo: dates?.[1]?.format('YYYY-MM-DD'),
          })}
          style={{ width: 260 }}
        />
        {hasFilters && <Button onClick={resetFilters}>重置筛选</Button>}
      </Space>
      {active.isError && <Alert type="error" title={getApiErrorMessage(active.error)} action={<Button onClick={() => void active.refetch()}>重试</Button>} />}
      {rejected ? <DataTable tableKey="grain-rejections" rowKey="id" columns={rejectionColumns} dataSource={refusal.data?.items ?? []} total={refusal.data?.total ?? 0} page={state.page} pageSize={state.pageSize} onPageChange={actions.setPage} loading={refusal.isLoading} onRefresh={() => void refusal.refetch()} /> : <DataTable tableKey="grain-permits" rowKey="id" columns={columns} dataSource={normal.data?.items ?? []} total={normal.data?.total ?? 0} page={state.page} pageSize={state.pageSize} onPageChange={actions.setPage} loading={normal.isLoading} onRefresh={() => void normal.refetch()} />}
    </Space>
  </>;
}
