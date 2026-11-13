import { useState } from 'react';
import { Alert, Button, DatePicker, Input, Select, Space, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { Link, useNavigate } from 'react-router-dom';
import { trips, tripStages, stageLabel, type Trip } from '../../features/grain-intake/api';
import { materials, sites } from '../../features/weighbridge/api';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { useListUrlState } from '../../hooks/useListUrlState';
import { usePermissions } from '../../hooks/usePermissions';
import { getApiErrorMessage } from '../../lib/api/errors';
import { formatDateTime } from '../../utils/format';
import TripEditor from './TripEditor';
const config = {
  filters: {
    stage: tripStages.map((v) => v.value),
    method: ['lab', 'visual'],
    siteCode: 'text',
    materialCode: 'text',
    dateFrom: 'date',
    dateTo: 'date',
  },
  sortKeys: [],
  pageSizeOptions: [10, 20, 50],
  defaultPageSize: 10,
} as const;
export default function TripsPage() {
  const { state, actions } = useListUrlState(config);
  const [keyword, setKeyword] = useState(state.keyword);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const { has } = usePermissions();
  const canEdit = has('grain-intake:trip-edit');
  const siteList = useQuery({ queryKey: ['weighbridge-sites'], queryFn: sites });
  const materialList = useQuery({ queryKey: ['weighbridge-materials'], queryFn: materials });
  const siteOptions = (siteList.data ?? []).map((item) => ({ value: item.code, label: `${item.name}（${item.code}）` }));
  const materialOptions = (materialList.data ?? []).filter((item) => item.enabled).map((item) => ({ value: item.code, label: `${item.name}（${item.code}）` }));
  const dateRange: [string, string] | undefined = state.filters.dateFrom && state.filters.dateTo ? [state.filters.dateFrom, state.filters.dateTo] : undefined;
  const hasFilters = !!(state.keyword || Object.keys(state.filters).length);
  const resetFilters = () => { setKeyword(''); actions.reset(); };
  const params = { page: state.page, pageSize: state.pageSize, keyword: state.keyword, ...state.filters };
  const list = useQuery({ queryKey: ['grain-intake', 'trips', params], queryFn: () => trips(params) });
  const columns: ColumnsType<Trip> = [
    { title: '流转单号', dataIndex: 'number', render: (value: string, row) => <Link to={`/grain-intake/trips/${row.id}`}>{value}</Link> },
    { title: '厂区', dataIndex: 'siteCode' }, { title: '车牌', dataIndex: 'plate' }, { title: '粮种', dataIndex: 'materialName' },
    { title: '供应商', dataIndex: 'partyName', render: (value: string) => value || <Tag color="orange">待核实</Tag> },
    { title: '办理阶段', dataIndex: 'stage', render: (value: string, row) => <Tag color={value === 'blocked' ? 'red' : value === 'exited' ? 'green' : 'blue'}>{stageLabel(value, row.inspectionMethod)}</Tag> },
    { title: '登记时间', dataIndex: 'createdAt', render: (value: string) => formatDateTime(value) },
    { title: '操作', key: 'actions', render: (_, row) => <Link to={`/grain-intake/trips/${row.id}`}>查看办理</Link> },
  ];
  return (
    <div className="pageStack">
      <PageHeader title="流转单" />
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Space wrap align="end">
        <Input.Search
          aria-label="搜索单号、车牌或供应商"
          placeholder="搜索单号、车牌或供应商"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onSearch={(v) => actions.setKeyword(v)}
          allowClear
          style={{ width: 300 }}
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
          aria-label="粮种"
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="全部粮种"
          loading={materialList.isLoading}
          options={materialOptions}
          value={state.filters.materialCode}
          onChange={(v) => actions.setFilter('materialCode', v)}
          style={{ width: 180 }}
        />
        <Select aria-label="办理阶段" allowClear placeholder="全部阶段" options={tripStages} value={state.filters.stage} onChange={(v) => actions.setFilter('stage', v)} style={{ width: 150 }} />
        <Select
          aria-label="检验方式"
          allowClear
          placeholder="全部方式"
          options={[{ value: 'lab', label: '化验' }, { value: 'visual', label: '目测' }]}
          value={state.filters.method}
          onChange={(v) => actions.setFilter('method', v)}
          style={{ width: 150 }}
        />
        <DatePicker.RangePicker
          allowClear
          placeholder={['登记开始', '登记结束']}
          value={dateRange ? [dayjs(dateRange[0]), dayjs(dateRange[1])] : null}
          onChange={(dates) => actions.setFilters({
            dateFrom: dates?.[0]?.format('YYYY-MM-DD'),
            dateTo: dates?.[1]?.format('YYYY-MM-DD'),
          })}
          style={{ width: 260 }}
        />
        {hasFilters && <Button onClick={resetFilters}>重置筛选</Button>}
        {canEdit && <Button type="primary" onClick={() => setCreating(true)}>登记流转单</Button>}
      </Space>
      {list.isError && <Alert type="error" title={getApiErrorMessage(list.error)} action={<Button onClick={() => void list.refetch()}>重试</Button>} />}
      <DataTable tableKey="grain-trips" columns={columns} rowKey="id" dataSource={list.data?.items ?? []} total={list.data?.total ?? 0} page={state.page} pageSize={state.pageSize} onPageChange={actions.setPage} loading={list.isLoading} onRefresh={() => void list.refetch()} />
      </Space>
      {creating && <TripEditor onClose={() => setCreating(false)} onSaved={(v) => navigate(`/grain-intake/trips/${v.trip.id}`)} />}
    </div>
  );
}
