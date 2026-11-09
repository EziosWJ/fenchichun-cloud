import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  DatePicker,
  Descriptions,
  Dropdown,
  Empty,
  Input,
  Select,
  Skeleton,
  Table,
  Tag,
  Tooltip,
  type TableColumnsType,
} from 'antd';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { ChevronDown, Download, Printer, X } from 'lucide-react';
import type { EChartsOption } from 'echarts';
import { EChart } from '../../components/charts/EChart';
import { getApiErrorMessage } from '../../lib/api/errors';
import { downloadBlob } from '../../features/analytics/download';
import { exportStatementDetail, statementDetail } from '../../features/analytics/api';
import {
  formatMilliTonneCompact,
  formatTonneCompact,
  statementDirectionLabel,
} from '../../features/analytics/format';
import {
  aggregateStatementDaily,
  statementChartGranularity,
  type StatementChartPoint,
} from '../../features/analytics/statementChart';
import { tickets, type Ticket, type TicketRecord } from '../../features/weighbridge/api';
import { formatDateTime, formatPercent } from '../../utils/format';
import styles from './StatementSheet.module.css';

const { RangePicker } = DatePicker;

interface StatementSheetProps {
  siteCode: string;
  partyCode: string;
  direction: 'inbound' | 'outbound';
  from: string;
  to: string;
  materialCode?: string;
  partyName?: string;
  siteName?: string;
  onClose?: () => void;
}

function weightText(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  return Number.isFinite(number) ? formatTonneCompact(number) : '—';
}

function finalNet(ticket: Ticket): string {
  const value = ticket.finalNet
    ? Number(ticket.finalNet)
    : Number(ticket.finalGross) - Number(ticket.finalTare) - Number(ticket.netAdjustment ?? 0);
  return Number.isFinite(value) ? formatTonneCompact(value) : '—';
}

function sourceLabel(value: string | null | undefined): string {
  if (value === 'collected') return '采集';
  if (value === 'manual') return '手工';
  return value || '—';
}

function adjustmentModeLabel(value: string | null | undefined): string {
  if (value === 'amount') return '按金额';
  if (value === 'rate') return '按比例';
  return value || '—';
}

function TicketDetails({ record }: { record: TicketRecord }) {
  const ticket = record.ticket;
  const material = [ticket.materialName, ticket.materialSpec].filter(Boolean).join(' / ');
  return (
    <Descriptions
      className={styles.ticketDetail}
      size="small"
      column={{ xs: 1, sm: 2, lg: 3 }}
      items={[
        { key: 'ticketNo', label: '单号', children: ticket.ticketNo },
        { key: 'plate', label: '车牌', children: ticket.plate || '—' },
        { key: 'direction', label: '方向', children: statementDirectionLabel(ticket.direction) },
        { key: 'issuedAt', label: '出单时间', children: formatDateTime(ticket.issuedAt) },
        { key: 'issuer', label: '司磅员', children: ticket.issuerName || '—' },
        { key: 'material', label: '物料', children: material || '—' },
        { key: 'gross', label: '毛重（吨）', children: weightText(ticket.finalGross) },
        { key: 'tare', label: '皮重（吨）', children: weightText(ticket.finalTare) },
        {
          key: 'adjustment',
          label: '净重调整（吨）',
          children: weightText(ticket.netAdjustment ?? 0),
        },
        { key: 'net', label: '最终净重（吨）', children: finalNet(ticket) },
        {
          key: 'firstConfirmed',
          label: '第一次确认',
          children: formatDateTime(ticket.firstConfirmedAt),
        },
        {
          key: 'secondConfirmed',
          label: '第二次确认',
          children: formatDateTime(ticket.secondConfirmedAt),
        },
        { key: 'grossSource', label: '毛重来源', children: sourceLabel(ticket.grossSource) },
        { key: 'tareSource', label: '皮重来源', children: sourceLabel(ticket.tareSource) },
        {
          key: 'adjustmentMode',
          label: '调整方式',
          children: adjustmentModeLabel(ticket.netAdjustmentMode),
        },
        {
          key: 'adjustmentCategory',
          label: '调整分类',
          children: ticket.netAdjustmentCategoryName || '—',
        },
        { key: 'adjustmentRemark', label: '调整原因', children: ticket.adjustmentRemark || '—' },
        { key: 'adjustedBy', label: '调整经办人', children: ticket.adjustedBy || '—' },
        { key: 'adjustedAt', label: '调整时间', children: formatDateTime(ticket.adjustedAt) },
        { key: 'driver', label: '司机', children: ticket.driver || '—' },
        { key: 'driverPhone', label: '司机电话', children: ticket.driverPhone || '—' },
        { key: 'contact', label: '联系人', children: ticket.contactName || '—' },
        { key: 'contactPhone', label: '联系电话', children: ticket.contactPhone || '—' },
        { key: 'previousTicketNo', label: '原单号', children: ticket.previousTicketNo || '—' },
        {
          key: 'status',
          label: '状态',
          children:
            record.status === 'void' ? (
              <Tag color="red">已作废</Tag>
            ) : (
              <Tag color="green">有效</Tag>
            ),
        },
      ]}
    />
  );
}

export function StatementSheet({
  siteCode,
  partyCode,
  direction,
  from,
  to,
  materialCode,
  partyName,
  siteName,
  onClose,
}: StatementSheetProps) {
  const { message } = App.useApp();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [exporting, setExporting] = useState(false);
  const [ticketKeyword, setTicketKeyword] = useState('');
  const [ticketKeywordInput, setTicketKeywordInput] = useState('');
  const [ticketMaterial, setTicketMaterial] = useState(materialCode ?? '');
  const [ticketAdjusted, setTicketAdjusted] = useState<'all' | 'true' | 'false'>('all');
  const [ticketFrom, setTicketFrom] = useState(from);
  const [ticketTo, setTicketTo] = useState(to);
  const ticketSectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setPage(1);
    setTicketKeyword('');
    setTicketKeywordInput('');
    setTicketMaterial(materialCode ?? '');
    setTicketAdjusted('all');
    setTicketFrom(from);
    setTicketTo(to);
  }, [siteCode, partyCode, direction, from, to, materialCode]);

  useEffect(() => {
    const beforePrint = () => document.body.classList.add('statement-printing');
    const afterPrint = () => document.body.classList.remove('statement-printing');
    window.addEventListener('beforeprint', beforePrint);
    window.addEventListener('afterprint', afterPrint);
    return () => {
      window.removeEventListener('beforeprint', beforePrint);
      window.removeEventListener('afterprint', afterPrint);
      document.body.classList.remove('statement-printing');
    };
  }, []);

  const detail = useQuery({
    queryKey: ['weighbridge', 'statement-detail', siteCode, partyCode, direction, from, to, materialCode],
    queryFn: () => statementDetail({ siteCode, partyCode, direction, from, to, materialCode }),
    enabled: Boolean(siteCode && partyCode && direction),
  });

  const ticketParams = useMemo(
    () => ({
      siteCode,
      partyCode,
      direction,
      from: ticketFrom || from,
      to: ticketTo || to,
      materialCode: ticketMaterial || materialCode || undefined,
      keyword: ticketKeyword || undefined,
      adjusted: ticketAdjusted === 'all' ? undefined : ticketAdjusted,
      status: 'valid',
      page,
      pageSize,
    }),
    [
      siteCode,
      partyCode,
      direction,
      ticketFrom,
      ticketTo,
      ticketMaterial,
      materialCode,
      ticketKeyword,
      ticketAdjusted,
      from,
      to,
      page,
      pageSize,
    ],
  );
  const ticketList = useQuery({
    queryKey: ['weighbridge', 'statement-tickets', ticketParams],
    queryFn: () => tickets(ticketParams),
    enabled: Boolean(siteCode && partyCode && direction),
    placeholderData: keepPreviousData,
  });

  const data = detail.data;
  const resolvedPartyCode = data?.partyCode ?? partyCode;
  const resolvedPartyName = data?.partyName ?? partyName ?? resolvedPartyCode;
  const resolvedSiteCode = data?.siteCode ?? siteCode;
  const resolvedSiteName = data?.siteName ?? siteName ?? resolvedSiteCode;
  const resolvedFrom = data?.from || from;
  const resolvedTo = data?.to || to;

  const gross = data?.grossMilliTonne ?? 0;
  const tare = data?.tareMilliTonne ?? 0;
  const adjustment = data?.netAdjustmentMilliTonne ?? 0;
  const net = data?.netMilliTonne ?? 0;

  const grossText = data ? formatMilliTonneCompact(gross) : '—';
  const tareText = data ? formatMilliTonneCompact(tare) : '—';
  const adjustmentText = data ? formatMilliTonneCompact(adjustment) : '—';
  const netText = data ? formatMilliTonneCompact(net) : '—';

  const tarePercent = gross > 0 ? (tare / gross) * 100 : 0;
  const adjustmentPercent = gross > 0 ? (adjustment / gross) * 100 : 0;
  const netPercent = gross > 0 ? (net / gross) * 100 : 0;
  const percentTotal = tarePercent + adjustmentPercent + netPercent;
  const percentScale = percentTotal > 0 ? 100 / percentTotal : 0;

  const materialRows = useMemo(() => data?.materials ?? [], [data]);
  const daily = useMemo(() => data?.daily ?? [], [data]);
  const chartGranularity = useMemo(
    () => statementChartGranularity(resolvedFrom, resolvedTo, daily[0]?.date),
    [resolvedFrom, resolvedTo, daily],
  );
  const chartPoints = useMemo(
    () =>
      aggregateStatementDaily(
        daily,
        chartGranularity,
        resolvedFrom || daily[0]?.date || '',
        resolvedTo || daily[daily.length - 1]?.date || '',
      ),
    [daily, chartGranularity, resolvedFrom, resolvedTo],
  );
  const chartTitle = chartGranularity === 'day' ? '每日净重' : '净重趋势';
  const granularityLabel =
    chartGranularity === 'day'
      ? '按日'
      : chartGranularity === 'week'
        ? '按周汇总（每 7 天）'
        : '按月汇总';
  const dailyOption = useMemo<EChartsOption>(
    () => ({
      tooltip: {
        trigger: 'axis',
        formatter: (params) => {
          const item = (Array.isArray(params) ? params[0] : params) as {
            dataIndex?: number;
            name?: string;
            value?: unknown;
          };
          const point = typeof item?.dataIndex === 'number' ? chartPoints[item.dataIndex] : undefined;
          const value = Number(point?.netMilliTonne ?? item?.value ?? 0);
          return `${point?.range ?? item?.name ?? ''}<br/>${formatMilliTonneCompact(value)} 吨`;
        },
      },
      grid: { left: 42, right: 10, top: 16, bottom: 34 },
      xAxis: {
        type: 'category',
        data: chartPoints.map((point) => point.label),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.35)' } },
        axisLabel: {
          color: '#94a3b8',
          fontSize: 10,
          lineHeight: 13,
          interval: chartPoints.length <= 16 ? 0 : 'auto',
          hideOverlap: true,
          formatter: (value: string, index: number) => {
            const point = chartPoints[index];
            return point?.secondaryLabel ? `${value}\n${point.secondaryLabel}` : value;
          },
        },
      },
      yAxis: {
        type: 'value',
        name: '吨',
        nameGap: 8,
        nameTextStyle: { color: '#94a3b8', fontSize: 10 },
        splitNumber: 3,
        axisLabel: {
          color: '#94a3b8',
          fontSize: 11,
          formatter: (value: number) => (value / 1000).toFixed(0),
        },
        splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.18)', type: 'dashed' } },
      },
      series: [
        {
          type: 'bar',
          data: chartPoints.map((point) => point.netMilliTonne),
          barMaxWidth: chartPoints.length <= 12 ? 24 : 18,
          itemStyle: { color: '#1677ff', borderRadius: [4, 4, 0, 0] },
        },
      ],
    }),
    [chartPoints],
  );

  const hasTicketFilters =
    Boolean(ticketKeyword) ||
    ticketAdjusted !== 'all' ||
    ticketFrom !== from ||
    ticketTo !== to ||
    Boolean(ticketMaterial && ticketMaterial !== (materialCode ?? ''));

  const scrollTicketSection = () => {
    window.requestAnimationFrame(() => {
      ticketSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const filterByMaterial = (code: string) => {
    setTicketMaterial(code);
    setPage(1);
    scrollTicketSection();
  };

  const filterByChartPoint = (params: { dataIndex?: number }) => {
    if (typeof params.dataIndex !== 'number') return;
    const point: StatementChartPoint | undefined = chartPoints[params.dataIndex];
    if (!point) return;
    setTicketFrom(point.startDate);
    setTicketTo(point.endDate);
    setPage(1);
    scrollTicketSection();
  };

  const resetTicketFilters = () => {
    setTicketKeyword('');
    setTicketKeywordInput('');
    setTicketMaterial(materialCode ?? '');
    setTicketAdjusted('all');
    setTicketFrom(from);
    setTicketTo(to);
    setPage(1);
  };

  const exportFullDetail = async () => {
    setExporting(true);
    try {
      const blob = await exportStatementDetail({
        siteCode,
        partyCode,
        direction,
        from,
        to,
        materialCode,
      });
      downloadBlob(blob, `对账单-${siteCode}-${partyCode}-${resolvedFrom}至${resolvedTo}.csv`);
      message.success('对账单明细 CSV 已导出');
    } catch (error) {
      message.error(getApiErrorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  const exportFilteredDetail = async () => {
    setExporting(true);
    try {
      const filteredFrom = ticketFrom || from;
      const filteredTo = ticketTo || to;
      const blob = await exportStatementDetail({
        siteCode,
        partyCode,
        direction,
        from: filteredFrom,
        to: filteredTo,
        materialCode: ticketMaterial || materialCode,
        ticketKeyword: ticketKeyword || undefined,
        adjusted: ticketAdjusted === 'all' ? undefined : ticketAdjusted,
      });
      downloadBlob(
        blob,
        `对账单筛选明细-${siteCode}-${partyCode}-${filteredFrom}至${filteredTo}.csv`,
      );
      message.success('筛选明细 CSV 已导出');
    } catch (error) {
      message.error(getApiErrorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  const ticketColumns: TableColumnsType<TicketRecord> = [
    {
      title: '出单时间',
      key: 'issuedAt',
      width: 140,
      render: (_, row) => formatDateTime(row.ticket.issuedAt),
    },
    {
      title: '单号',
      key: 'ticketNo',
      width: 180,
      render: (_, row) => <span className={styles.ticketNo}>{row.ticket.ticketNo}</span>,
    },
    {
      title: '车牌',
      key: 'plate',
      width: 90,
      render: (_, row) => <span className={styles.plate}>{row.ticket.plate}</span>,
    },
    {
      title: '物料 / 规格',
      key: 'material',
      width: 160,
      render: (_, row) => {
        const label = [row.ticket.materialName, row.ticket.materialSpec].filter(Boolean).join(' / ');
        return (
          <span className={styles.ellipsis} title={label}>
            {label || '—'}
          </span>
        );
      },
    },
    {
      title: '毛重（吨）',
      key: 'gross',
      width: 80,
      align: 'right',
      render: (_, row) => weightText(row.ticket.finalGross),
    },
    {
      title: '皮重（吨）',
      key: 'tare',
      width: 80,
      align: 'right',
      render: (_, row) => weightText(row.ticket.finalTare),
    },
    {
      title: '调整（吨）',
      key: 'adjustment',
      width: 80,
      align: 'right',
      render: (_, row) => weightText(row.ticket.netAdjustment ?? 0),
    },
    {
      title: '净重（吨）',
      key: 'net',
      width: 90,
      align: 'right',
      render: (_, row) => <strong>{finalNet(row.ticket)}</strong>,
    },
    { title: '状态', key: 'status', width: 60, render: () => <Tag color="green">有效</Tag> },
  ];

  return (
    <article className={`${styles.sheet} ${styles.printArea}`} aria-label="对账单详情">
      <header className={styles.header}>
        <div className={styles.identity}>
          <div className={styles.eyebrow}>
            {statementDirectionLabel(direction)} · 对账单
          </div>
          <h2 className={styles.partyName}>
            {resolvedPartyName}
            <span className={styles.partyCode}>（{resolvedPartyCode}）</span>
          </h2>
          <div className={styles.meta}>
            <span>
              {resolvedSiteName}
              {resolvedSiteName !== resolvedSiteCode ? `（${resolvedSiteCode}）` : ''}
            </span>
            <span className={styles.metaDivider} aria-hidden="true" />
            <span>
              {resolvedFrom} 至 {resolvedTo}
            </span>
            {materialCode && (
              <>
                <span className={styles.metaDivider} aria-hidden="true" />
                <span>物料 {materialCode}</span>
              </>
            )}
          </div>
        </div>
        <div className={`${styles.actions} ${styles.noPrint}`}>
          <Tooltip title="打印当前对账单">
            <Button icon={<Printer size={15} aria-hidden="true" />} onClick={() => window.print()}>
              打印
            </Button>
          </Tooltip>
          <Dropdown
            menu={{
              items: [
                { key: 'full', label: '导出全量对账单' },
                {
                  key: 'filtered',
                  label: '导出当前筛选明细',
                  disabled: !hasTicketFilters,
                },
              ],
              onClick: ({ key }) => {
                if (key === 'full') void exportFullDetail();
                if (key === 'filtered') void exportFilteredDetail();
              },
            }}
            trigger={['click']}
          >
            <Button
              type="primary"
              icon={<Download size={15} aria-hidden="true" />}
              loading={exporting}
            >
              导出 CSV <ChevronDown size={13} aria-hidden="true" />
            </Button>
          </Dropdown>
          {onClose && (
            <Tooltip title="关闭对账单">
              <Button
                type="text"
                aria-label="关闭对账单"
                icon={<X size={18} aria-hidden="true" />}
                onClick={onClose}
              />
            </Tooltip>
          )}
        </div>
      </header>

      <div className={styles.body}>
        {detail.isError && (
          <Alert
            type="error"
            showIcon
            message={`对账单加载失败：${getApiErrorMessage(detail.error)}`}
            action={<Button onClick={() => void detail.refetch()}>重试</Button>}
          />
        )}
        {detail.isLoading ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : (
          <>
            <section className={styles.overview}>
              <dl className={styles.equation}>
                <div className={styles.equationRow}>
                  <dt>毛重</dt>
                  <dd>
                    {grossText}
                    <em className={styles.equationUnit}>吨</em>
                  </dd>
                </div>
                <div className={styles.equationRow}>
                  <dt>皮重</dt>
                  <dd>
                    −{tareText}
                    <em className={styles.equationUnit}>吨</em>
                  </dd>
                </div>
                <div className={styles.equationRow}>
                  <dt>净重调整</dt>
                  <dd>
                    −{adjustmentText}
                    <em className={styles.equationUnit}>吨</em>
                  </dd>
                </div>
                <div className={`${styles.equationRow} ${styles.equationNet}`}>
                  <dt>最终净重</dt>
                  <dd>
                    {netText}
                    <em className={styles.equationUnit}>吨</em>
                  </dd>
                </div>
              </dl>

              <div className={styles.composition}>
                <div className={styles.compositionHeader}>
                  <span>重量构成</span>
                  <span>毛重 {grossText} 吨</span>
                </div>
                <div
                  className={styles.compositionBar}
                  role="img"
                  aria-label={`毛重 ${grossText} 吨，皮重 ${tareText} 吨，净重调整 ${adjustmentText} 吨，最终净重 ${netText} 吨`}
                >
                  <span
                    className={styles.tareBar}
                    style={{ width: `${Math.max(0, tarePercent * percentScale)}%` }}
                  />
                  <span
                    className={styles.adjustBar}
                    style={{ width: `${Math.max(0, adjustmentPercent * percentScale)}%` }}
                  />
                  <span
                    className={styles.netBar}
                    style={{ width: `${Math.max(0, netPercent * percentScale)}%` }}
                  />
                </div>
                <div className={styles.compositionLegend}>
                  <span>
                    <i className={`${styles.legendDot} ${styles.tareDot}`} aria-hidden="true" />
                    皮重 {tareText} 吨
                  </span>
                  <span>
                    <i className={`${styles.legendDot} ${styles.adjustDot}`} aria-hidden="true" />
                    调整 {adjustmentText} 吨
                  </span>
                  <span>
                    <i className={`${styles.legendDot} ${styles.netDot}`} aria-hidden="true" />
                    净重 {netText} 吨
                  </span>
                </div>
              </div>
            </section>

            <div className={styles.breakdownGrid}>
              <section className={styles.breakdownSection}>
                <div className={styles.sectionHead}>
                  <h3>物料构成</h3>
                  <span>{materialRows.length} 种物料</span>
                </div>
                {materialRows.length ? (
                  <div className={styles.materialList}>
                    {materialRows.map((material) => {
                      const share = net > 0 ? (material.netMilliTonne / net) * 100 : 0;
                      const label = [material.materialName, material.materialSpec]
                        .filter(Boolean)
                        .join(' / ');
                      return (
                        <div
                          className={[
                            styles.materialRow,
                            styles.materialRowClickable,
                            ticketMaterial === material.materialCode ? styles.materialRowActive : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          key={`${material.materialCode}:${material.materialName}:${material.materialSpec}`}
                          role="button"
                          tabIndex={0}
                          title="点击筛选该物料明细"
                          aria-label={`筛选物料 ${label || material.materialCode} 的明细`}
                          onClick={() => filterByMaterial(material.materialCode)}
                          onKeyDown={(event) => {
                            if (event.key !== 'Enter' && event.key !== ' ') return;
                            event.preventDefault();
                            filterByMaterial(material.materialCode);
                          }}
                        >
                          <div className={styles.materialName} title={label}>
                            <span>{label || material.materialCode}</span>
                            <small>{material.materialCode}</small>
                          </div>
                          <div className={styles.materialTrack}>
                            <span
                              className={styles.materialFill}
                              style={{ width: `${Math.min(100, Math.max(0, share))}%` }}
                            />
                          </div>
                          <div className={styles.materialValue}>
                            {formatMilliTonneCompact(material.netMilliTonne)} 吨
                            <small>{formatPercent(share, 1)}</small>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无物料汇总" />
                )}
              </section>

              <section className={styles.breakdownSection}>
                <div className={styles.sectionHead}>
                  <h3>{chartTitle}</h3>
                  <span>
                    {daily.length} 天有数据 · {granularityLabel}
                  </span>
                </div>
                <EChart
                  option={dailyOption}
                  height={200}
                  loading={detail.isLoading}
                  empty={!chartPoints.length}
                  emptyDescription="暂无净重汇总"
                  ariaLabel="净重趋势图"
                  onClick={filterByChartPoint}
                />
              </section>
            </div>

            <p className={styles.filterHint}>点击物料条或净重柱，筛选下方过磅单明细</p>

            <section ref={ticketSectionRef} className={styles.ticketsSection}>
              <div className={styles.sectionHead}>
                <h3>过磅单明细</h3>
                <span>
                  {hasTicketFilters
                    ? `筛选后 ${ticketList.data?.total ?? 0} 条 / 全期间 ${data?.ticketCount ?? 0} 条`
                    : `共 ${ticketList.data?.total ?? 0} 条有效单据`}
                </span>
              </div>

              <div className={styles.ticketFilters} role="group" aria-label="过磅单明细筛选">
                <Input.Search
                  className={styles.ticketSearch}
                  allowClear
                  placeholder="单号 / 车牌"
                  value={ticketKeywordInput}
                  onChange={(event) => {
                    setTicketKeywordInput(event.target.value);
                    if (!event.target.value) {
                      setTicketKeyword('');
                      setPage(1);
                    }
                  }}
                  onSearch={(value) => {
                    setTicketKeyword(value.trim());
                    setPage(1);
                  }}
                />
                <Select
                  className={styles.ticketSelect}
                  allowClear={!materialCode}
                  placeholder="全部物料"
                  value={ticketMaterial || undefined}
                  onChange={(value) => {
                    setTicketMaterial(value ?? (materialCode ?? ''));
                    setPage(1);
                  }}
                  options={materialRows.map((material) => ({
                    value: material.materialCode,
                    label: [material.materialName, material.materialSpec]
                      .filter(Boolean)
                      .join(' / '),
                  }))}
                />
                <Select
                  className={styles.ticketSelectSmall}
                  value={ticketAdjusted}
                  onChange={(value) => {
                    setTicketAdjusted(value as 'all' | 'true' | 'false');
                    setPage(1);
                  }}
                  options={[
                    { value: 'all', label: '全部调整' },
                    { value: 'true', label: '有调整' },
                    { value: 'false', label: '无调整' },
                  ]}
                />
                <RangePicker
                  className={styles.ticketRange}
                  value={ticketFrom && ticketTo ? [dayjs(ticketFrom), dayjs(ticketTo)] : null}
                  allowClear={false}
                  format="MM-DD"
                  placeholder={['开始', '结束']}
                  disabledDate={(current) =>
                    Boolean(from && current.isBefore(dayjs(from), 'day')) ||
                    Boolean(to && current.isAfter(dayjs(to), 'day'))
                  }
                  onChange={(values) => {
                    if (!values?.[0] || !values[1]) return;
                    setTicketFrom(values[0].format('YYYY-MM-DD'));
                    setTicketTo(values[1].format('YYYY-MM-DD'));
                    setPage(1);
                  }}
                />
                <Button
                  type="link"
                  size="small"
                  onClick={resetTicketFilters}
                  disabled={!hasTicketFilters}
                >
                  重置
                </Button>
              </div>

              {ticketList.isError && (
                <Alert
                  type="error"
                  showIcon
                  message={`过磅单明细加载失败：${getApiErrorMessage(ticketList.error)}`}
                  action={<Button onClick={() => void ticketList.refetch()}>重试</Button>}
                />
              )}
              <Table<TicketRecord>
                className={styles.ticketTable}
                rowKey={(row) => `${row.siteCode}:${row.ticket.ticketNo}`}
                columns={ticketColumns}
                dataSource={ticketList.data?.items ?? []}
                loading={ticketList.isFetching}
                size="small"
                scroll={{ x: 1000 }}
                expandable={{
                  columnWidth: 40,
                  expandRowByClick: true,
                  expandedRowRender: (row) => <TicketDetails record={row} />,
                }}
                pagination={{
                  current: page,
                  pageSize,
                  total: ticketList.data?.total ?? 0,
                  showSizeChanger: true,
                  pageSizeOptions: ['10', '20', '50'],
                  size: 'small',
                  showTotal: (total, range) => `${range[0]}-${range[1]} / 共 ${total} 条`,
                  onChange: (nextPage, nextPageSize) => {
                    setPage(nextPage);
                    setPageSize(nextPageSize);
                  },
                }}
                locale={{
                  emptyText: (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="当前期间没有有效过磅单"
                    />
                  ),
                }}
              />
            </section>
          </>
        )}
      </div>
    </article>
  );
}
