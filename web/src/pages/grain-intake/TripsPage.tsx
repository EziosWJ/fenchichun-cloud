import { useState } from 'react';
import { Alert, Button, Input, Select, Space, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { trips, tripStages, stageLabel, type Trip } from '../../features/grain-intake/api';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { FilterField } from '../../components/SearchFilterBar';
import { useListUrlState } from '../../hooks/useListUrlState';
import { getApiErrorMessage } from '../../lib/api/errors';
import { formatDateTime } from '../../utils/format';
import TripEditor from './TripEditor';
const config = { filters: { stage: tripStages.map((v) => v.value) }, sortKeys: [], pageSizeOptions: [10, 20, 50], defaultPageSize: 10 };
export default function TripsPage() {
  const { state, actions } = useListUrlState(config);
  const [keyword, setKeyword] = useState(state.keyword);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const params = { page: state.page, pageSize: state.pageSize, keyword: state.keyword, ...state.filters };
  const list = useQuery({ queryKey: ['grain-intake', 'trips', params], queryFn: () => trips(params) });
  const columns: ColumnsType<Trip> = [
    { title: '流转单号', dataIndex: 'number', render: (value: string, row) => <Link to={`/grain-intake/trips/${row.id}`}>{value}</Link> },
    { title: '厂区', dataIndex: 'siteCode' }, { title: '车牌', dataIndex: 'plate' }, { title: '粮种', dataIndex: 'materialName' },
    { title: '供应商', dataIndex: 'partyName', render: (value: string) => value || <Tag color="orange">待核实</Tag> },
    { title: '办理阶段', dataIndex: 'stage', render: (value: string) => <Tag color={value === 'blocked' ? 'red' : value === 'exited' ? 'green' : 'blue'}>{stageLabel(value)}</Tag> },
    { title: '登记时间', dataIndex: 'createdAt', render: (value: string) => formatDateTime(value) },
    { title: '操作', key: 'actions', render: (_, row) => <Link to={`/grain-intake/trips/${row.id}`}>查看办理</Link> },
  ];
  return <>
    <PageHeader title="流转单" />
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Space wrap align="end"><FilterField label="单号、车牌或供应商" wide><Input.Search aria-label="单号、车牌或供应商" value={keyword} onChange={(e) => setKeyword(e.target.value)} onSearch={(v) => actions.setKeyword(v)} allowClear /></FilterField><FilterField label="办理阶段"><Select aria-label="办理阶段" style={{ width: 160 }} allowClear options={tripStages} value={state.filters.stage} onChange={(v) => actions.setFilter('stage', v)} /></FilterField><Button type="primary" onClick={() => setCreating(true)}>登记流转单</Button></Space>
      {list.isError && <Alert type="error" title={getApiErrorMessage(list.error)} action={<Button onClick={() => void list.refetch()}>重试</Button>} />}
      <DataTable tableKey="grain-trips" columns={columns} rowKey="id" dataSource={list.data?.items ?? []} total={list.data?.total ?? 0} page={state.page} pageSize={state.pageSize} onPageChange={actions.setPage} loading={list.isLoading} onRefresh={() => void list.refetch()} />
    </Space>
    {creating && <TripEditor onClose={() => setCreating(false)} onSaved={(v) => navigate(`/grain-intake/trips/${v.trip.id}`)} />}
  </>;
}
