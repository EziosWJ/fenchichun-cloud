import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Empty,
  Skeleton,
  Table,
  Tag,
  Tooltip,
  type TableColumnsType,
} from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { Download, Printer, X } from 'lucide-react';
import type { EChartsOption } from 'echarts';
import { EChart } from '../../components/charts/EChart';
import { getApiErrorMessage } from '../../lib/api/errors';
import { downloadBlob } from '../../features/analytics/download';
import { exportStatementDetail, statementDetail } from '../../features/analytics/api';
import { formatMilliTonne, statementDirectionLabel } from '../../features/analytics/format';
import { tickets, type Ticket, type TicketRecord } from '../../features/weighbridge/api';
import { formatDateTime, formatPercent } from '../../utils/format';
import styles from './StatementSheet.module.css';

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
  return Number.isFinite(number) ? number.toFixed(3) : '—';
}

function finalNet(ticket: Ticket): string {
  const value = ticket.finalNet
    ? Number(ticket.finalNet)
    : Number(ticket.finalGross) - Number(ticket.finalTare) - Number(ticket.netAdjustment ?? 0);
  return Number.isFinite(value) ? value.toFixed(3) : '—';
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

  useEffect(() => {
    setPage(1);
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
    () => ({ siteCode, partyCode, direction, from, to, materialCode, status: 'valid', page, pageSize }),
    [siteCode, partyCode, direction, from, to, materialCode, page, pageSize],
  );
  const ticketList = useQuery({
    queryKey: ['weighbridge', 'statement-tickets', ticketParams],
    queryFn: () => tickets(ticketParams),
    enabled: Boolean(siteCode && partyCode && direction),
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

  const grossText = data ? formatMilliTonne(gross) : '—';
  const tareText = data ? formatMilliTonne(tare) : '—';
  const adjustmentText = data ? formatMilliTonne(adjustment) : '—';
  const netText = data ? formatMilliTonne(net) : '—';

  const tarePercent = gross > 0 ? (tare / gross) * 100 : 0;
  const adjustmentPercent = gross > 0 ? (adjustment / gross) * 100 : 0;
  const netPercent = gross > 0 ? (net / gross) * 100 : 0;
  const percentTotal = tarePercent + adjustmentPercent + netPercent;
  const percentScale = percentTotal > 0 ? 100 / percentTotal : 0;

  const materialRows = useMemo(() => data?.materials ?? [], [data]);
  const daily = useMemo(() => data?.daily ?? [], [data]);
  const dailyOption = useMemo<EChartsOption>(
    () => ({
      tooltip: {
        trigger: 'axis',
        valueFormatter: (value) => `${(Number(value) / 1000).toFixed(3)} 吨`,
      },
      grid: { left: 42, right: 10, top: 16, bottom: 26 },
      xAxis: {
        type: 'category',
        data: daily.map((point) => dayjs(point.date).format('MM-DD')),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.35)' } },
        axisLabel: { color: '#94a3b8', fontSize: 11, hideOverlap: true },
      },
      yAxis: {
        type: 'value',
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
          data: daily.map((point) => point.netMilliTonne),
          barMaxWidth: 18,
          itemStyle: { color: '#1677ff', borderRadius: [4, 4, 0, 0] },
        },
      ],
    }),
    [daily],
  );

  const exportDetail = async () => {
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
          <Button
            type="primary"
            icon={<Download size={15} aria-hidden="true" />}
            loading={exporting}
            onClick={() => void exportDetail()}
          >
            导出 CSV
          </Button>
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
                  <dd>{grossText}</dd>
                </div>
                <div className={styles.equationRow}>
                  <dt>皮重</dt>
                  <dd>−{tareText}</dd>
                </div>
                <div className={styles.equationRow}>
                  <dt>净重调整</dt>
                  <dd>−{adjustmentText}</dd>
                </div>
                <div className={`${styles.equationRow} ${styles.equationNet}`}>
                  <dt>最终净重</dt>
                  <dd>
                    {netText}
                    <em>吨</em>
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
                    皮重 {tareText}
                  </span>
                  <span>
                    <i className={`${styles.legendDot} ${styles.adjustDot}`} aria-hidden="true" />
                    调整 {adjustmentText}
                  </span>
                  <span>
                    <i className={`${styles.legendDot} ${styles.netDot}`} aria-hidden="true" />
                    净重 {netText}
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
                          className={styles.materialRow}
                          key={`${material.materialCode}:${material.materialName}:${material.materialSpec}`}
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
                            {formatMilliTonne(material.netMilliTonne)}
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
                  <h3>每日净重</h3>
                  <span>{daily.length} 天有数据</span>
                </div>
                <EChart
                  option={dailyOption}
                  height={200}
                  loading={detail.isLoading}
                  empty={!daily.length}
                  emptyDescription="暂无每日汇总"
                  ariaLabel="每日净重趋势图"
                />
              </section>
            </div>

            <section className={styles.ticketsSection}>
              <div className={styles.sectionHead}>
                <h3>过磅单明细</h3>
                <span>共 {ticketList.data?.total ?? 0} 条有效单据</span>
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
                loading={ticketList.isLoading}
                size="small"
                scroll={{ x: 960 }}
                pagination={{
                  current: page,
                  pageSize,
                  total: ticketList.data?.total ?? 0,
                  showSizeChanger: true,
                  pageSizeOptions: ['10', '20', '50'],
                  size: 'small',
                  showTotal: (total) => `共 ${total} 条`,
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
