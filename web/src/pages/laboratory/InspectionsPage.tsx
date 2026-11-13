import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, App, Button, DatePicker, Input, Modal, Select, Space, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { Building2, CalendarClock, Droplets, FileText, Gauge, Info, StickyNote, Truck, Users, Wheat } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { trips, type Trip } from '../../features/grain-intake/api';
import { sites } from '../../features/weighbridge/api';
import { inspection as fetchInspection, voidInspection, type Inspection } from '../../features/laboratory/api';
import { getApiErrorMessage } from '../../lib/api/errors';
import { formatDateTime } from '../../utils/format';
import { usePermissions } from '../../hooks/usePermissions';
import InspectionFormModal from './InspectionFormModal';
import styles from './InspectionModal.module.css';

const pageSize = 10;

function formatMetric(value: string): string {
  if (!value) return '—';
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('zh-CN', { maximumFractionDigits: 6 }) : value;
}

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
  const [siteCode, setSiteCode] = useState<string>();
  const [result, setResult] = useState<string>();
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);
  const [selected, setSelected] = useState<Trip>();
  const [viewingTrip, setViewingTrip] = useState<Trip>();
  const [viewId, setViewId] = useState<number>();
  const [voiding, setVoiding] = useState<Inspection>();
  const [voidReason, setVoidReason] = useState('');
  const [voidSubmitting, setVoidSubmitting] = useState(false);
  const { has } = usePermissions();
  const canInspect = has('laboratory:inspect');
  const params = {
    page, pageSize, keyword: search || undefined, order: 'inspection_first', method: 'lab',
    siteCode: siteCode || undefined, result: result || undefined,
    dateFrom: dateRange?.[0], dateTo: dateRange?.[1],
  };
  const list = useQuery({ queryKey: ['laboratory', 'trips', params], queryFn: () => trips(params) });
  const siteList = useQuery({ queryKey: ['weighbridge-sites'], queryFn: sites });
  const siteOptions = (siteList.data ?? []).map((item) => ({ value: item.code, label: `${item.name}（${item.code}）` }));
  const hasFilters = !!(siteCode || result || dateRange || search);
  const resetFilters = () => {
    setKeyword(''); setSearch(''); setSiteCode(undefined); setResult(undefined); setDateRange(null); setPage(1);
  };
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
      <Space wrap align="center" style={{ width: '100%' }}>
        <Input.Search
          aria-label="单号、车牌或供应商"
          placeholder="单号、车牌或供应商"
          value={keyword}
          allowClear
          onChange={(e) => { setKeyword(e.target.value); if (!e.target.value) { setSearch(''); setPage(1); } }}
          onSearch={(value) => { setSearch(value); setPage(1); }}
          style={{ width: 300 }}
        />
        <Select
          allowClear
          placeholder="全部厂区"
          style={{ width: 190 }}
          loading={siteList.isLoading}
          options={siteOptions}
          value={siteCode}
          onChange={(value) => { setSiteCode(value); setPage(1); }}
        />
        <Select
          allowClear
          placeholder="全部化验结果"
          style={{ width: 150 }}
          options={[
            { value: 'pending', label: '待化验' },
            { value: 'accept', label: '接收' },
            { value: 'reject', label: '拒收' },
          ]}
          value={result}
          onChange={(value) => { setResult(value); setPage(1); }}
        />
        <DatePicker.RangePicker
          allowClear
          placeholder={['登记开始', '登记结束']}
          value={dateRange ? [dayjs(dateRange[0]), dayjs(dateRange[1])] : null}
          onChange={(dates) => {
            setDateRange(dates?.[0] && dates[1] ? [dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD')] : null);
            setPage(1);
          }}
        />
        {hasFilters && <Button onClick={resetFilters}>重置筛选</Button>}
      </Space>
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
        <div className={styles.identity}>
          <div className={styles.identityItem} title="化验单号">
            <span className={styles.identityIcon} aria-hidden><FileText size={15} /></span>
            <div className={styles.identityValue}><Typography.Text copyable={{ text: value.number }}>{value.number}</Typography.Text></div>
          </div>
          <div className={styles.identityItem} title="粮种">
            <span className={styles.identityIcon} aria-hidden><Wheat size={15} /></span>
            <strong className={`${styles.identityValue} ${styles.identityMaterial}`}>{value.materialName || '—'}</strong>
          </div>
          <div className={styles.identityItem} title="车牌">
            <span className={styles.identityIcon} aria-hidden><Truck size={15} /></span>
            <strong className={`${styles.identityValue} ${styles.identityPlate}`}>{value.plate}</strong>
          </div>
          <div className={`${styles.identityItem} ${styles.identitySupplier}`} title="供应商">
            <span className={styles.identityIcon} aria-hidden><Users size={15} /></span>
            <strong className={styles.identityValue} title={value.partyName}>{value.partyName || '—'}</strong>
          </div>
          <div className={styles.identityItem} title="厂区">
            <span className={styles.identityIcon} aria-hidden><Building2 size={15} /></span>
            <strong className={styles.identityValue}>{value.siteCode || '—'}</strong>
          </div>
        </div>
        <section className={`${styles.resultCard} ${value.conclusion === 'reject' ? styles.resultCardReject : styles.resultCardAccept}`}>
          <div className={styles.resultHead}>
            <div className={styles.resultHeading}>
              <h3>检测结果</h3>
              <Tooltip title="水分用于匹配扣减规则，容量仅作化验记录">
                <button type="button" className={styles.resultHelp} aria-label="检测结果说明"><Info size={14} aria-hidden /></button>
              </Tooltip>
            </div>
            <Tag color={value.conclusion === 'accept' ? 'green' : 'red'} className={styles.conclusionTag}>
              {value.conclusion === 'accept' ? '接收' : '拒收'}
            </Tag>
          </div>
          <div className={styles.metricGrid}>
            <div className={styles.metric}>
              <span className={styles.metricLabel}><Droplets size={14} aria-hidden />水分</span>
              <strong className={styles.metricValue}>{formatMetric(value.moisture)}<small>%</small></strong>
            </div>
            <div className={styles.metric}>
              <span className={styles.metricLabel}><Gauge size={14} aria-hidden />容量</span>
              <strong className={styles.metricValue}>{formatMetric(value.bulkDensity)}<small>g/L</small></strong>
            </div>
          </div>
          {value.conclusion === 'reject' && value.reason && <div className={styles.reasonBox}>
            <span>拒收原因</span>
            <p>{value.reason}</p>
          </div>}
        </section>
        <section className={styles.infoCard}>
          <div className={styles.sectionTitle}>单据信息</div>
          <div className={styles.infoGrid}>
            <div className={styles.infoItem}><span className={styles.infoLabel}>司机</span><strong className={styles.infoValue}>{value.driver || '—'}</strong></div>
            <div className={styles.infoItem}><span className={styles.infoLabel}>联系电话</span><strong className={styles.infoValue}>{value.driverPhone || '—'}</strong></div>
            <div className={styles.infoItem}><span className={styles.infoLabel}>合同编号</span><strong className={styles.infoValue}>{value.contractNo || '—'}</strong></div>
            <div className={styles.infoItem}><span className={styles.infoLabel}><CalendarClock size={13} aria-hidden />录入时间</span><strong className={styles.infoValue}>{formatDateTime(value.confirmedAt ?? value.createdAt)}</strong></div>
          </div>
        </section>
        {value.remark && <section className={styles.remarkCard}>
          <div className={styles.remarkHeader}>
            <span className={styles.remarkIcon} aria-hidden><StickyNote size={16} /></span>
            <div className={styles.remarkHeading}>
              <div className={styles.remarkTitleRow}>
                <div className={styles.remarkTitle}>备注</div>
                <Tooltip title="现场或化验补充说明">
                  <button type="button" className={styles.resultHelp} aria-label="备注说明"><Info size={13} aria-hidden /></button>
                </Tooltip>
              </div>
            </div>
          </div>
          <p className={styles.remarkContent}>{value.remark}</p>
        </section>}
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
