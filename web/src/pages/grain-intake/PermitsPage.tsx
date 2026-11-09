import { useState } from 'react';
import { Alert, Button, Input, Select, Space, Tabs, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { permits, rejections, stageLabel, tripStages, type Permit, type Trip } from '../../features/grain-intake/api';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { FilterField } from '../../components/SearchFilterBar';
import { useListUrlState } from '../../hooks/useListUrlState';
import { getApiErrorMessage } from '../../lib/api/errors';
import { formatDateTime } from '../../utils/format';
const config = { filters: { mode: ['permits', 'rejections'], stage: tripStages.map((v) => v.value) }, sortKeys: [], pageSizeOptions: [10, 20, 50], defaultPageSize: 10 };
export default function PermitsPage() {
  const { state, actions } = useListUrlState(config);
  const [keyword, setKeyword] = useState(state.keyword);
  const rejected = state.filters.mode === 'rejections';
  const params = { page: state.page, pageSize: state.pageSize, keyword: state.keyword, stage: state.filters.stage };
  const normal = useQuery({ queryKey: ['grain-intake', 'permits', params], queryFn: () => permits(params), enabled: !rejected });
  const refusal = useQuery({ queryKey: ['grain-intake', 'rejections', params], queryFn: () => rejections(params), enabled: rejected });
  const active = rejected ? refusal : normal;
  const columns: ColumnsType<Permit> = [
    { title: '出门证号', dataIndex: 'number', render: (v: string, row) => <Link to={`/grain-intake/permits/${row.tripId}`}>{v}</Link> },
    { title: '流转单号', dataIndex: 'tripNumber' }, { title: '厂区', dataIndex: 'siteCode' }, { title: '车牌', dataIndex: 'plate' },
    { title: '当前阶段', dataIndex: 'stage', render: (v: string) => <Tag color={v === 'blocked' ? 'red' : 'blue'}>{stageLabel(v)}</Tag> },
    { title: '开具时间', dataIndex: 'createdAt', render: (v: string) => formatDateTime(v) }, { title: '审批时间', dataIndex: 'approvedAt', render: (v: string | null) => formatDateTime(v) },
    { title: '实际出厂', dataIndex: 'exitedAt', render: (v: string | null) => formatDateTime(v) },
    { title: '操作', key: 'action', render: (_, row) => <Link to={`/grain-intake/permits/${row.tripId}`}>查看核验</Link> },
  ];
  const rejectionColumns: ColumnsType<Trip> = [
    { title: '流转单号', dataIndex: 'number' }, { title: '车牌', dataIndex: 'plate' }, { title: '货品', dataIndex: 'materialName' }, { title: '供应商', dataIndex: 'partyName' },
    { title: '当前阶段', dataIndex: 'stage', render: (v: string) => <Tag>{stageLabel(v)}</Tag> },
    { title: '实际出厂', dataIndex: 'exitedAt', render: (v: string | null) => formatDateTime(v) },
    { title: '操作', key: 'action', render: (_, row) => <Link to={`/grain-intake/permits/${row.id}`}>核验拒收依据</Link> },
  ];
  return <>
    <PageHeader title="出门证与出厂核验" />
    <Tabs activeKey={rejected ? 'rejections' : 'permits'} onChange={(v) => actions.setFilters({ mode: v, stage: undefined })} items={[{ key: 'permits', label: '正常出门证' }, { key: 'rejections', label: '拒收退厂' }]} />
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Space wrap align="end"><FilterField label="单号或车牌" wide><Input.Search aria-label="单号或车牌" value={keyword} onChange={(e) => setKeyword(e.target.value)} onSearch={(v) => actions.setKeyword(v)} allowClear /></FilterField><FilterField label="办理阶段"><Select aria-label="办理阶段" style={{ width: 160 }} allowClear options={tripStages.filter((v) => rejected ? ['rejected', 'exited', 'blocked'].includes(v.value) : ['permit_pending', 'permit_approved', 'exited', 'blocked'].includes(v.value))} value={state.filters.stage} onChange={(v) => actions.setFilter('stage', v)} /></FilterField></Space>
      {active.isError && <Alert type="error" title={getApiErrorMessage(active.error)} action={<Button onClick={() => void active.refetch()}>重试</Button>} />}
      {rejected ? <DataTable tableKey="grain-rejections" rowKey="id" columns={rejectionColumns} dataSource={refusal.data?.items ?? []} total={refusal.data?.total ?? 0} page={state.page} pageSize={state.pageSize} onPageChange={actions.setPage} loading={refusal.isLoading} onRefresh={() => void refusal.refetch()} /> : <DataTable tableKey="grain-permits" rowKey="id" columns={columns} dataSource={normal.data?.items ?? []} total={normal.data?.total ?? 0} page={state.page} pageSize={state.pageSize} onPageChange={actions.setPage} loading={normal.isLoading} onRefresh={() => void normal.refetch()} />}
    </Space>
  </>;
}
