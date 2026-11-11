import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, App, Button, Descriptions, Input, Modal, Space, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { trips, type Trip } from '../../features/grain-intake/api';
import { inspection as fetchInspection, voidInspection, type Inspection } from '../../features/laboratory/api';
import { getApiErrorMessage } from '../../lib/api/errors';
import { formatDateTime } from '../../utils/format';
import { usePermissions } from '../../hooks/usePermissions';
import InspectionFormModal from './InspectionFormModal';
import styles from './InspectionModal.module.css';

const pageSize = 10;

/**
 * 化验工作台：列出流转单（未化验的排在前面），在对应行直接录入化验结果。
 * 一张流转单只能录入一次，已化验的行按钮置灰，可查看结果。
 */
export default function InspectionsPage() {
  const client = useQueryClient();
  const { message } = App.useApp();
  const [page, setPage] = useState(1);
  const [urlParams] = useSearchParams();
  const initialKeyword = urlParams.get('keyword') ?? '';
  const [keyword, setKeyword] = useState(initialKeyword);
  const [search, setSearch] = useState(initialKeyword);
  const [selected, setSelected] = useState<Trip>();
  const [viewingTrip, setViewingTrip] = useState<Trip>();
  const [viewId, setViewId] = useState<number>();
  const [voiding, setVoiding] = useState<Inspection>();
  const [voidReason, setVoidReason] = useState('');
  const [voidSubmitting, setVoidSubmitting] = useState(false);
  const { has } = usePermissions();
  const canInspect = has('laboratory:inspect');
  const params = { page, pageSize, keyword: search || undefined, order: 'inspection_first', method: 'lab' };
  const list = useQuery({ queryKey: ['laboratory', 'trips', params], queryFn: () => trips(params) });
  const detail = useQuery({
    queryKey: ['laboratory', 'inspection', viewId],
    queryFn: () => fetchInspection(viewId!),
    enabled: viewId !== undefined,
  });
  const columns: ColumnsType<Trip> = [
    { title: '流转单号', dataIndex: 'number' },
    { title: '厂区', dataIndex: 'siteCode' },
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
          <Button onClick={() => { setViewingTrip(row); setViewId(row.inspectionId!); }}>查看</Button>
        </Space>
        : canInspect
          ? <Button type="primary" onClick={() => setSelected(row)}>化验</Button>
          : <Tooltip title="无化验权限"><Button disabled>化验</Button></Tooltip>,
    },
  ];
  const value = detail.data;
  const submitVoid = async () => {
    if (!voiding || !voidReason.trim()) return;
    setVoidSubmitting(true);
    try {
      await voidInspection(voiding, voidReason.trim());
      message.success('化验单已作废，可以重新录入');
      void client.invalidateQueries({ queryKey: ['laboratory'] });
      void client.invalidateQueries({ queryKey: ['grain-intake'] });
      setVoiding(undefined);
      setVoidReason('');
      setViewId(undefined);
      setViewingTrip(undefined);
    } catch (error) {
      message.error(getApiErrorMessage(error));
    } finally {
      setVoidSubmitting(false);
    }
  };
  return <>
    <PageHeader title="化验单" />
    <Space orientation="vertical" size="middle" style={{ width: '100%', marginTop: 20 }}>
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
      onCancel={() => { setViewId(undefined); setViewingTrip(undefined); }}
      footer={<Space>
        <Button onClick={() => { setViewId(undefined); setViewingTrip(undefined); }}>关闭</Button>
        {canInspect && value?.status === 'confirmed' && viewingTrip && !viewingTrip.ticketId && !viewingTrip.exitedAt && <Button danger onClick={() => { setVoiding(value); setVoidReason(''); }}>作废并重录</Button>}
      </Space>}
      width={760}
      destroyOnHidden
    >
      {detail.isLoading && <p>正在加载…</p>}
      {detail.isError && <Alert type="error" title={getApiErrorMessage(detail.error)} action={<Button onClick={() => void detail.refetch()}>重试</Button>} />}
      {value && <div className={styles.detail}>
        <div className={styles.overview}>
          <Space size={8} wrap>
            <Typography.Text strong copyable={{ text: value.number }}>{value.number}</Typography.Text>
            {value.conclusion === 'accept' ? <Tag color="green">接收</Tag> : <Tag color="red">拒收</Tag>}
          </Space>
          <div className={styles.overviewMeta}>
            {[value.plate, value.siteCode, value.materialName, value.partyName].filter(Boolean).join(' · ')}
          </div>
        </div>
        <section className={styles.section}>
          <h3>检测结果</h3>
          <Descriptions size="small" layout="vertical" column={{ xs: 1, sm: 2 }} items={[
            { key: 'moisture', label: '水分（%）', children: value.moisture || '—' },
            ...(value.impurity ? [{ key: 'impurity', label: '杂质（%）', children: value.impurity }] : []),
            { key: 'density', label: '容重（g/L）', children: value.bulkDensity || '—' },
            { key: 'reason', label: '拒收原因', children: value.reason || '—' },
          ]} />
        </section>
        <section className={styles.section}>
          <h3>单据信息</h3>
          <Descriptions size="small" layout="vertical" column={{ xs: 1, sm: 2 }} items={[
            { key: 'site', label: '厂区', children: value.siteCode || '—' },
            { key: 'plate', label: '车牌', children: value.plate },
            { key: 'material', label: '粮种', children: value.materialName || '—' },
            { key: 'party', label: '供应商', children: value.partyName || '—' },
            { key: 'driver', label: '司机', children: `${value.driver || '—'} ${value.driverPhone}` },
            { key: 'contract', label: '合同编号', children: value.contractNo || '—' },
          ]} />
        </section>
        <section className={styles.section}>
          <h3>记录信息</h3>
          <Descriptions size="small" layout="vertical" column={{ xs: 1, sm: 2 }} items={[
            { key: 'created', label: '录入时间', children: formatDateTime(value.confirmedAt ?? value.createdAt) },
            { key: 'remark', label: '备注', children: value.remark || '—' },
          ]} />
        </section>
      </div>}
    </Modal>
    <Modal
      title="作废并重录化验单"
      open={voiding !== undefined}
      onCancel={() => { setVoiding(undefined); setVoidReason(''); }}
      onOk={() => void submitVoid()}
      okText="作废并重录"
      okButtonProps={{ danger: true, disabled: !voidReason.trim() }}
      confirmLoading={voidSubmitting}
      destroyOnHidden
    >
      <Alert type="warning" title="作废后原检测值会保留为历史，流转单回到待化验，可重新录入。" description="过磅单生成后不能作废化验单，请先确认过磅端尚未生成磅单。" />
      <Input.TextArea aria-label="作废原因" placeholder="请填写作废原因" maxLength={2000} rows={3} style={{ marginTop: 16 }} value={voidReason} onChange={(event) => setVoidReason(event.target.value)} />
    </Modal>
  </>;
}
