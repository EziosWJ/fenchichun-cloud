import { useState } from 'react';
import { Alert, Button, Descriptions, Input, Modal, Space, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { trips, type Trip } from '../../features/grain-intake/api';
import { inspection as fetchInspection } from '../../features/laboratory/api';
import { getApiErrorMessage } from '../../lib/api/errors';
import { formatDateTime } from '../../utils/format';
import InspectionFormModal from './InspectionFormModal';

const pageSize = 10;

/**
 * 化验工作台：列出流转单（未化验的排在前面），在对应行直接录入化验结果。
 * 一张流转单只能录入一次，已化验的行按钮置灰，可查看结果。
 */
export default function InspectionsPage() {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Trip>();
  const [viewId, setViewId] = useState<number>();
  const params = { page, pageSize, keyword: search || undefined, order: 'inspection_first', method: 'lab' };
  const list = useQuery({ queryKey: ['laboratory', 'trips', params], queryFn: () => trips(params) });
  const detail = useQuery({
    queryKey: ['laboratory', 'inspection', viewId],
    queryFn: () => fetchInspection(viewId!),
    enabled: viewId !== undefined,
  });
  const columns: ColumnsType<Trip> = [
    { title: '流转单号', dataIndex: 'number' },
    { title: '车牌', dataIndex: 'plate' },
    { title: '粮种', dataIndex: 'materialName' },
    { title: '供应商', dataIndex: 'partyName', render: (value: string) => value || '—' },
    { title: '司机', key: 'driver', render: (_, row) => `${row.driver || '—'} ${row.driverPhone}` },
    { title: '登记时间', dataIndex: 'createdAt', render: (value: string) => formatDateTime(value) },
    {
      title: '化验结果', key: 'inspection', render: (_, row) => row.inspectionId
        ? <Tag color={row.inspectionConclusion === 'accept' ? 'green' : 'red'}>{row.inspectionConclusion === 'accept' ? '接收' : '拒收'}</Tag>
        : <Tag>未化验</Tag>,
    },
    {
      title: '操作', key: 'actions', render: (_, row) => row.inspectionId
        ? <Space>
          <Tooltip title="该流转单已化验"><Button disabled>化验</Button></Tooltip>
          <Button onClick={() => setViewId(row.inspectionId!)}>查看</Button>
        </Space>
        : <Button type="primary" onClick={() => setSelected(row)}>化验</Button>,
    },
  ];
  const value = detail.data;
  return <>
    <PageHeader title="化验" description="选择待化验的流转单，录入水分、杂质和容重，提交即生效。" />
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Input.Search
        aria-label="单号、车牌或供应商"
        placeholder="单号、车牌或供应商"
        value={keyword}
        allowClear
        onChange={(e) => setKeyword(e.target.value)}
        onSearch={(value) => { setSearch(value); setPage(1); }}
        style={{ maxWidth: 360 }}
      />
      {list.isError && <Alert type="error" title={getApiErrorMessage(list.error)} action={<Button onClick={() => void list.refetch()}>重试</Button>} />}
      <DataTable
        tableKey="laboratory-trips"
        rowKey="id"
        columns={columns}
        dataSource={list.data?.items ?? []}
        total={list.data?.total ?? 0}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        loading={list.isLoading}
        onRefresh={() => void list.refetch()}
      />
    </Space>
    {selected && <InspectionFormModal
      trip={selected}
      open
      onClose={() => setSelected(undefined)}
      onSaved={() => {
        setSelected(undefined);
        void client.invalidateQueries({ queryKey: ['laboratory'] });
        void client.invalidateQueries({ queryKey: ['grain-intake'] });
      }}
    />}
    <Modal
      title="化验单详情"
      open={viewId !== undefined}
      onCancel={() => setViewId(undefined)}
      footer={<Button onClick={() => setViewId(undefined)}>关闭</Button>}
      width={720}
      destroyOnHidden
    >
      {detail.isLoading && <p>正在加载…</p>}
      {detail.isError && <Alert type="error" title={getApiErrorMessage(detail.error)} action={<Button onClick={() => void detail.refetch()}>重试</Button>} />}
      {value && <Descriptions bordered column={2} items={[
        { key: 'number', label: '化验单号', children: value.number },
        { key: 'conclusion', label: '结论', children: value.conclusion === 'accept' ? <Tag color="green">接收</Tag> : <Tag color="red">拒收</Tag> },
        { key: 'plate', label: '车牌', children: value.plate },
        { key: 'material', label: '粮种', children: value.materialName || '—' },
        { key: 'party', label: '供应商', children: value.partyName || '—' },
        { key: 'driver', label: '司机', children: `${value.driver || '—'} ${value.driverPhone}` },
        { key: 'moisture', label: '水分（%）', children: value.moisture },
        { key: 'impurity', label: '杂质（%）', children: value.impurity },
        { key: 'density', label: '容重（g/L）', children: value.bulkDensity },
        { key: 'contract', label: '合同编号', children: value.contractNo || '—' },
        { key: 'reason', label: '拒收原因', children: value.reason || '—' },
        { key: 'remark', label: '备注', children: value.remark || '—' },
        { key: 'created', label: '录入时间', children: formatDateTime(value.confirmedAt ?? value.createdAt) },
      ]} />}
    </Modal>
  </>;
}
