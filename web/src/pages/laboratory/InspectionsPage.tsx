import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, App, Button, DatePicker, Descriptions, Input, Modal, Select, Space, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { Building2, CalendarClock, Droplets, FileText, Gauge, Info, RotateCcw, StickyNote, Truck, Users, Wheat } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { FilterField } from '../../components/SearchFilterBar';
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
 * 每趟只允许一张未作废的化验单，已化验的行可查看结果。
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
  const [voidError, setVoidError] = useState('');
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
    { title: '流转单号', dataIndex: 'number', render: (value: string) => <span className="monoCode">{value}</span> },
    { title: '厂区', dataIndex: 'siteCode', render: (value: string) => <span className="monoCode">{value || '—'}</span> },
    { title: '车牌', dataIndex: 'plate', render: (value: string) => <span className="plateBadge">{value}</span> },
    { title: '粮种', dataIndex: 'materialName' },
    { title: '供应商', dataIndex: 'partyName', render: (value: string) => value || <Tag color="warning">待核实</Tag> },
    { title: '司机', key: 'driver', render: (_, row) => [row.driver || '—', row.driverPhone].filter(Boolean).join(' ') },
    { title: '登记时间', dataIndex: 'createdAt', render: (value: string) => formatDateTime(value) },
    {
      title: '化验结果', key: 'inspection', render: (_, row) => row.inspectionId
        ? <Tag color={row.inspectionConclusion === 'accept' ? 'success' : 'error'}>{row.inspectionConclusion === 'accept' ? '接收' : '拒收'}</Tag>
        : <Tag>未化验</Tag>,
    },
    {
      title: '操作', key: 'actions', render: (_, row) => row.inspectionId
        ? <Space size={4}>
          <Tooltip title="该流转单已化验"><Button size="small" type="text" disabled>化验</Button></Tooltip>
          <Button size="small" type="link" onClick={() => { setViewingTrip(row); setViewId(row.inspectionId!); }}>查看</Button>
        </Space>
        : canInspect
          ? <Button size="small" type="primary" onClick={() => setSelected(row)}>化验</Button>
          : <Tooltip title="无化验权限"><Button size="small" type="text" disabled>化验</Button></Tooltip>,
    },
  ];
  const value = detail.data;
  const submitVoid = async () => {
    if (!voiding || !voidReason.trim() || voidSubmitting) return;
    setVoidSubmitting(true);
    setVoidError('');
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
      setVoidError(getApiErrorMessage(error));
    } finally {
      setVoidSubmitting(false);
    }
  };
  return <div className="pageStack">
    <PageHeader title="化验单" description="未化验车辆默认排在前列，录入后自动生效并匹配扣减规则。" />
    <div className="filterCard" role="search" aria-label="化验单筛选">
      <Space wrap align="end" size={[14, 12]} style={{ width: '100%' }}>
        <FilterField label="关键词" wide>
          <Input.Search
            aria-label="单号、车牌或供应商"
            placeholder="单号、车牌或供应商"
            value={keyword}
            allowClear
            onChange={(e) => { setKeyword(e.target.value); if (!e.target.value) { setSearch(''); setPage(1); } }}
            onSearch={(value) => { setSearch(value); setPage(1); }}
          />
        </FilterField>
        <FilterField label="厂区">
          <Select
            allowClear
            placeholder="全部厂区"
            loading={siteList.isLoading}
            options={siteOptions}
            value={siteCode}
            onChange={(value) => { setSiteCode(value); setPage(1); }}
          />
        </FilterField>
        <FilterField label="化验结果">
          <Select
            allowClear
            placeholder="全部化验结果"
            options={[
              { value: 'pending', label: '待化验' },
              { value: 'accept', label: '接收' },
              { value: 'reject', label: '拒收' },
            ]}
            value={result}
            onChange={(value) => { setResult(value); setPage(1); }}
          />
        </FilterField>
        <FilterField label="登记日期" date>
          <DatePicker.RangePicker
            allowClear
            placeholder={['登记开始', '登记结束']}
            value={dateRange ? [dayjs(dateRange[0]), dayjs(dateRange[1])] : null}
            onChange={(dates) => {
              setDateRange(dates?.[0] && dates[1] ? [dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD')] : null);
              setPage(1);
            }}
          />
        </FilterField>
        {hasFilters && <Button icon={<RotateCcw size={14} aria-hidden="true" />} onClick={resetFilters}>重置筛选</Button>}
      </Space>
    </div>
    {list.isError && <Alert type="error" title={getApiErrorMessage(list.error)} action={<Button onClick={() => void list.refetch()}>重试</Button>} />}
    <DataTable
      tableKey="laboratory-trips"
      title="待化验与历史流转单"
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
        {canInspect && value?.status === 'confirmed' && viewingTrip && !viewingTrip.ticketId && !viewingTrip.exitedAt && <Button danger onClick={() => { setVoiding(value); setVoidReason(''); setVoidError(''); }}>作废并重录</Button>}
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
            <div className={styles.infoItem}><span className={styles.infoLabel}>流转单号</span><strong className={styles.infoValue}>{viewingTrip?.number || '—'}</strong></div>
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
      title="核对并作废化验单"
      open={voiding !== undefined}
      mask={{ closable: false }}
      keyboard={false}
      onCancel={() => { if (!voidSubmitting) setVoiding(undefined); }}
      onOk={() => void submitVoid()}
      okText="确认作废"
      okButtonProps={{ danger: true, disabled: !voidReason.trim() }}
      cancelButtonProps={{ disabled: voidSubmitting }}
      confirmLoading={voidSubmitting}
      destroyOnHidden
    >
      {voiding && <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        <Descriptions size="small" column={1} items={[
          { key: 'inspection', label: '化验单号', children: voiding.number },
          { key: 'trip', label: '流转单号', children: viewingTrip?.number },
          { key: 'plate', label: '车牌', children: voiding.plate },
          { key: 'material', label: '粮种', children: voiding.materialName },
          { key: 'moisture', label: '原水分', children: `${formatMetric(voiding.moisture)} %` },
          { key: 'density', label: '原容量', children: `${formatMetric(voiding.bulkDensity)} g/L` },
          { key: 'conclusion', label: '原结论', children: voiding.conclusion === 'accept' ? '接收' : '拒收' },
          ...(voiding.conclusion === 'reject' ? [{ key: 'reason', label: '原拒收原因', children: voiding.reason }] : []),
        ]} />
        <Alert type="warning" showIcon title="请确认过磅端尚未生成磅单" description="作废后，原检测值保留为历史，本趟回到待化验。请重新录入并确认结果。" />
        {voidError && <Alert type="error" showIcon title={voidError} />}
        <label htmlFor="inspection-void-reason">作废原因（必填）</label>
        <Input.TextArea id="inspection-void-reason" placeholder="请填写作废原因" maxLength={2000} rows={3} disabled={voidSubmitting} value={voidReason} onChange={(event) => setVoidReason(event.target.value)} />
      </Space>}
    </Modal>
  </div>;
}
