import { useState } from 'react';
import { Alert, Button, DatePicker, Input, Select, Space, Tabs, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { RotateCcw } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { permits, rejections, stageLabel, tripStages, type Permit, type Trip } from '../../features/grain-intake/api';
import { sites } from '../../features/weighbridge/api';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { FilterField } from '../../components/SearchFilterBar';
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

function permitStageColor(stage: string): string {
  if (stage === 'blocked' || stage === 'rejected') return 'error';
  if (stage === 'exited') return 'success';
  if (stage === 'permit_pending') return 'warning';
  return 'processing';
}

export default function PermitsPage() {
  const { state, actions } = useListUrlState(config);
  const { search } = useLocation();
  const verification = (id: number) => ({ pathname: `/grain-intake/permits/${id}`, search });
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
    { title: '出门证号', dataIndex: 'number', render: (v: string, row) => <Link className="monoCode" to={verification(row.tripId)}>{v}</Link> },
    { title: '流转单号', dataIndex: 'tripNumber', render: (v: string) => <span className="monoCode">{v}</span> },
    { title: '厂区', dataIndex: 'siteCode', render: (v: string) => <span className="monoCode">{v || '—'}</span> },
    { title: '车牌', dataIndex: 'plate', render: (v: string) => <span className="plateBadge">{v}</span> },
    { title: '当前阶段', dataIndex: 'stage', render: (v: string) => <Tag color={permitStageColor(v)}>{stageLabel(v)}</Tag> },
    { title: '开具时间', dataIndex: 'createdAt', render: (v: string) => formatDateTime(v) },
    { title: '审批时间', dataIndex: 'approvedAt', render: (v: string | null) => formatDateTime(v) },
    { title: '实际出厂', dataIndex: 'exitedAt', render: (v: string | null) => formatDateTime(v) },
    { title: '操作', key: 'action', render: (_, row) => <Link to={verification(row.tripId)}>出厂核验</Link> },
  ];

  const rejectionColumns: ColumnsType<Trip> = [
    { title: '流转单号', dataIndex: 'number', render: (v: string) => <span className="monoCode">{v}</span> },
    { title: '车牌', dataIndex: 'plate', render: (v: string) => <span className="plateBadge">{v}</span> },
    { title: '货品', dataIndex: 'materialName' },
    { title: '供应商', dataIndex: 'partyName' },
    { title: '当前阶段', dataIndex: 'stage', render: (v: string) => <Tag color={permitStageColor(v)}>{stageLabel(v)}</Tag> },
    { title: '实际出厂', dataIndex: 'exitedAt', render: (v: string | null) => formatDateTime(v) },
    { title: '操作', key: 'action', render: (_, row) => <Link to={verification(row.id)}>出厂核验</Link> },
  ];

  return (
    <div className="pageStack">
      <PageHeader
        title="出门证与出厂核验"
        description="核验正常放行出门证或拒收退厂依据，并确认车辆实际出厂。"
      />

      <div className="filterCard" style={{ paddingTop: 6 }}>
        <Tabs
          style={{ marginBottom: 12 }}
          activeKey={rejected ? 'rejections' : 'permits'}
          onChange={(v) => { setKeyword(''); actions.applyFilters('', { mode: v }); }}
          items={[
            { key: 'permits', label: '正常出门证' },
            { key: 'rejections', label: '拒收退厂' },
          ]}
        />
        <Space wrap align="end" size={[14, 12]} style={{ width: '100%' }}>
          <FilterField label="关键词" wide>
            <Input.Search
              aria-label={searchPlaceholder}
              placeholder={searchPlaceholder}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onSearch={(v) => actions.setKeyword(v)}
              allowClear
            />
          </FilterField>
          <FilterField label="厂区">
            <Select
              aria-label="厂区"
              allowClear
              placeholder="全部厂区"
              loading={siteList.isLoading}
              options={siteOptions}
              value={state.filters.siteCode}
              onChange={(v) => actions.setFilter('siteCode', v)}
            />
          </FilterField>
          <FilterField label="办理阶段">
            <Select
              aria-label="办理阶段"
              allowClear
              placeholder="全部阶段"
              options={tripStages.filter((v) => rejected ? ['rejected', 'exited', 'blocked'].includes(v.value) : ['permit_pending', 'permit_approved', 'exited', 'blocked'].includes(v.value))}
              value={state.filters.stage}
              onChange={(v) => actions.setFilter('stage', v)}
            />
          </FilterField>
          <FilterField label={rejected ? '登记日期' : '开具日期'} date>
            <DatePicker.RangePicker
              allowClear
              placeholder={datePlaceholder}
              value={dateRange ? [dayjs(dateRange[0]), dayjs(dateRange[1])] : null}
              onChange={(dates) => actions.setFilters({
                dateFrom: dates?.[0]?.format('YYYY-MM-DD'),
                dateTo: dates?.[1]?.format('YYYY-MM-DD'),
              })}
            />
          </FilterField>
          {hasFilters && (
            <Button icon={<RotateCcw size={14} aria-hidden="true" />} onClick={resetFilters}>
              重置筛选
            </Button>
          )}
        </Space>
      </div>

      {active.isError && (
        <Alert
          type="error"
          title={getApiErrorMessage(active.error)}
          action={<Button onClick={() => void active.refetch()}>重试</Button>}
        />
      )}

      {rejected ? (
        <DataTable
          tableKey="grain-rejections"
          title="拒收退厂列表"
          rowKey="id"
          columns={rejectionColumns}
          dataSource={refusal.data?.items ?? []}
          total={refusal.data?.total ?? 0}
          page={state.page}
          pageSize={state.pageSize}
          onPageChange={actions.setPage}
          loading={refusal.isLoading}
          onRefresh={() => void refusal.refetch()}
        />
      ) : (
        <DataTable
          tableKey="grain-permits"
          title="正常出门证列表"
          rowKey="id"
          columns={columns}
          dataSource={normal.data?.items ?? []}
          total={normal.data?.total ?? 0}
          page={state.page}
          pageSize={state.pageSize}
          onPageChange={actions.setPage}
          loading={normal.isLoading}
          onRefresh={() => void normal.refetch()}
        />
      )}
    </div>
  );
}
