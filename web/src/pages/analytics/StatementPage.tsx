import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  DatePicker,
  Dropdown,
  Input,
  Popover,
  Segmented,
  Select,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
} from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { useListUrlState } from '../../hooks/useListUrlState';
import { getApiErrorMessage } from '../../lib/api/errors';
import {
  exportStatementParties,
  statementParties,
  type StatementParty,
} from '../../features/analytics/api';
import { downloadBlob } from '../../features/analytics/download';
import {
  formatMilliTonne as tonnes,
  statementDirectionLabel,
} from '../../features/analytics/format';
import { materials, sites } from '../../features/weighbridge/api';
import { formatDateTime, formatNumber, formatPercent } from '../../utils/format';
import { StatementSheet } from './StatementSheet';
import styles from './StatementPage.module.css';

const { RangePicker } = DatePicker;

const config = {
  filters: {
    direction: ['inbound', 'outbound'],
    siteCode: 'text',
    from: 'text',
    to: 'text',
    materialCode: 'text',
  },
  sortKeys: [],
  pageSizeOptions: [10, 20, 50, 100],
  defaultPageSize: 10,
} as const;

type PrimaryPreset = 'thisMonth' | 'lastMonth' | 'last3Months' | 'thisQuarter' | 'thisYear';
type MorePreset = 'last7Days' | 'last30Days' | 'last90Days' | 'last12Months';
type PresetKey = PrimaryPreset | MorePreset | 'custom';

const PRIMARY_PRESETS: Array<{ key: PrimaryPreset; label: string }> = [
  { key: 'thisMonth', label: '本月' },
  { key: 'lastMonth', label: '上月' },
  { key: 'last3Months', label: '近3月' },
  { key: 'thisQuarter', label: '本季' },
  { key: 'thisYear', label: '本年' },
];

const MORE_PRESETS: Array<{ key: MorePreset; label: string }> = [
  { key: 'last7Days', label: '近7天' },
  { key: 'last30Days', label: '近30天' },
  { key: 'last90Days', label: '近90天' },
  { key: 'last12Months', label: '近12个月' },
];

function presetRange(key: Exclude<PresetKey, 'custom'>): [Dayjs, Dayjs] {
  const now = dayjs();
  switch (key) {
    case 'thisMonth':
      return [now.startOf('month'), now.endOf('month')];
    case 'lastMonth': {
      const month = now.subtract(1, 'month');
      return [month.startOf('month'), month.endOf('month')];
    }
    case 'last3Months':
      return [now.subtract(2, 'month').startOf('month'), now.endOf('month')];
    case 'thisQuarter': {
      const start = now.month(Math.floor(now.month() / 3) * 3).startOf('month');
      return [start, start.add(2, 'month').endOf('month')];
    }
    case 'thisYear':
      return [now.startOf('year'), now.endOf('year')];
    case 'last7Days':
      return [now.subtract(6, 'day').startOf('day'), now.endOf('day')];
    case 'last30Days':
      return [now.subtract(29, 'day').startOf('day'), now.endOf('day')];
    case 'last90Days':
      return [now.subtract(89, 'day').startOf('day'), now.endOf('day')];
    case 'last12Months':
      return [now.subtract(11, 'month').startOf('month'), now.endOf('month')];
    default:
      return [now.startOf('month'), now.endOf('month')];
  }
}

function compactDateTime(value: string): string {
  const date = dayjs(value);
  return date.isValid() ? date.format('MM-DD HH:mm') : '—';
}

export default function StatementPage() {
  const { message } = App.useApp();
  const { state, actions } = useListUrlState(config);
  const initialized = useRef(false);
  const [keyword, setKeyword] = useState(state.keyword);
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<StatementParty | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [monthOpen, setMonthOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(dayjs().year());
  const detailRef = useRef<HTMLDivElement>(null);

  const defaultFrom = dayjs().startOf('month').format('YYYY-MM-DD');
  const defaultTo = dayjs().endOf('month').format('YYYY-MM-DD');
  const direction = state.filters.direction === 'outbound' ? 'outbound' : 'inbound';
  const from = state.filters.from || defaultFrom;
  const to = state.filters.to || defaultTo;

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const next: Record<string, string> = {};
    if (!state.filters.direction) next.direction = 'inbound';
    if (!state.filters.from) next.from = defaultFrom;
    if (!state.filters.to) next.to = defaultTo;
    if (Object.keys(next).length) actions.setFilters(next);
  }, [actions, state.filters.direction, state.filters.from, state.filters.to, defaultFrom, defaultTo]);

  useEffect(() => {
    setKeyword(state.keyword);
  }, [state.keyword]);

  useEffect(() => {
    if (!selected) return;
    const frame = window.requestAnimationFrame(() => {
      detailRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selected]);

  const params = useMemo(
    () => ({
      direction,
      siteCode: state.filters.siteCode || undefined,
      keyword: state.keyword || undefined,
      materialCode: state.filters.materialCode || undefined,
      from,
      to,
      page: state.page,
      pageSize: state.pageSize,
    }),
    [
      direction,
      state.filters.siteCode,
      state.filters.materialCode,
      state.keyword,
      from,
      to,
      state.page,
      state.pageSize,
    ],
  );

  const list = useQuery({
    queryKey: ['weighbridge', 'statements', params],
    queryFn: () => statementParties(params),
  });
  const sitesQuery = useQuery({ queryKey: ['weighbridge', 'sites'], queryFn: sites });
  const materialsQuery = useQuery({ queryKey: ['weighbridge', 'materials'], queryFn: materials });

  const summary = list.data?.summary;
  const gross = summary?.grossMilliTonne ?? 0;
  const tare = summary?.tareMilliTonne ?? 0;
  const adjustment = summary?.netAdjustmentMilliTonne ?? 0;
  const net = summary?.netMilliTonne ?? 0;

  const netValue = summary ? tonnes(net) : '—';
  const grossValue = summary ? tonnes(gross) : '—';
  const tareValue = summary ? tonnes(tare) : '—';
  const adjustmentValue = summary ? tonnes(adjustment) : '—';
  const averageValue = summary && summary.ticketCount ? tonnes(net / summary.ticketCount) : '—';
  const partyCount = summary ? formatNumber(summary.partyCount) : '—';
  const ticketCount = summary ? formatNumber(summary.ticketCount) : '—';

  const tarePercent = gross > 0 ? (tare / gross) * 100 : 0;
  const adjustmentPercent = gross > 0 ? (adjustment / gross) * 100 : 0;
  const netPercent = gross > 0 ? (net / gross) * 100 : 0;
  const percentTotal = tarePercent + adjustmentPercent + netPercent;
  const percentScale = percentTotal > 0 ? 100 / percentTotal : 0;

  const activePreset = useMemo<PresetKey>(() => {
    const keys: Array<Exclude<PresetKey, 'custom'>> = [
      ...PRIMARY_PRESETS.map((preset) => preset.key),
      ...MORE_PRESETS.map((preset) => preset.key),
    ];
    for (const key of keys) {
      const [start, end] = presetRange(key);
      if (start.format('YYYY-MM-DD') === from && end.format('YYYY-MM-DD') === to) return key;
    }
    return 'custom';
  }, [from, to]);

  const moreActive = MORE_PRESETS.some((preset) => preset.key === activePreset);
  const isFullMonth = useMemo(() => {
    const start = dayjs(from);
    const end = dayjs(to);
    return (
      start.isValid() &&
      end.isValid() &&
      start.isSame(start.startOf('month'), 'day') &&
      end.isSame(end.endOf('month'), 'day') &&
      start.isSame(end, 'month')
    );
  }, [from, to]);
  const periodDays = useMemo(() => {
    const start = dayjs(from);
    const end = dayjs(to);
    if (!start.isValid() || !end.isValid()) return 0;
    return Math.max(0, end.diff(start, 'day') + 1);
  }, [from, to]);
  const periodLabel = useMemo(() => {
    if (isFullMonth) return dayjs(from).format('YYYY年M月');
    const preset = [...PRIMARY_PRESETS, ...MORE_PRESETS].find((item) => item.key === activePreset);
    return preset?.label ?? '自定义';
  }, [activePreset, from, isFullMonth]);
  const moreLabel = MORE_PRESETS.find((preset) => preset.key === activePreset)?.label ?? '更多';

  const hasFilters = Boolean(state.keyword || state.filters.siteCode || state.filters.materialCode);

  const applyPeriod = (start: Dayjs, end: Dayjs) => {
    setSelected(null);
    actions.setFilters({ from: start.format('YYYY-MM-DD'), to: end.format('YYYY-MM-DD') });
  };

  const applyPreset = (key: Exclude<PresetKey, 'custom'>) => {
    const [start, end] = presetRange(key);
    applyPeriod(start, end);
  };

  const stepMonth = (delta: number) => {
    const month = dayjs(from).add(delta, 'month').startOf('month');
    applyPeriod(month, month.endOf('month'));
  };

  const setDirection = (value: string | number) => {
    setSelected(null);
    actions.setFilter('direction', String(value));
  };

  const setSite = (value?: string) => {
    setSelected(null);
    actions.setFilter('siteCode', value);
  };

  const setMaterial = (value?: string) => {
    setSelected(null);
    actions.setFilter('materialCode', value);
  };

  const applyKeyword = (value: string) => {
    setSelected(null);
    actions.setKeyword(value);
  };

  const clearFilters = () => {
    setSelected(null);
    setKeyword('');
    actions.applyFilters('', { direction, from, to });
  };

  const handlePageChange = (nextPage: number, nextPageSize: number) => {
    setSelected(null);
    actions.setPage(nextPage, nextPageSize);
  };

  const isSelected = (row: StatementParty) =>
    selected?.siteCode === row.siteCode && selected?.partyCode === row.partyCode;

  const toggleSelected = (row: StatementParty) => {
    setSelected((current) =>
      current && current.siteCode === row.siteCode && current.partyCode === row.partyCode
        ? null
        : row,
    );
  };

  const exportSummary = async () => {
    setExporting(true);
    try {
      const blob = await exportStatementParties(params);
      downloadBlob(blob, `客户对账-${statementDirectionLabel(direction)}-${from}至${to}.csv`);
      message.success('汇总 CSV 已导出');
    } catch (error) {
      message.error(getApiErrorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  const columns: ColumnsType<StatementParty> = [
    {
      title: '往来方',
      key: 'party',
      width: 240,
      render: (_, row) => (
        <div className={styles.partyCell} title={`${row.partyName}（${row.partyCode}）`}>
          <div className={styles.partyName}>{row.partyName}</div>
          <div className={styles.partyMeta}>
            {row.siteName || row.siteCode}
            {row.siteName ? ` ${row.siteCode}` : ''} · {row.partyCode}
          </div>
        </div>
      ),
    },
    {
      title: '有效车次',
      dataIndex: 'ticketCount',
      key: 'ticketCount',
      align: 'right',
      width: 76,
      className: styles.numeric,
    },
    {
      title: '毛重',
      key: 'gross',
      align: 'right',
      width: 90,
      className: styles.numeric,
      render: (_, row) => tonnes(row.grossMilliTonne),
    },
    {
      title: '皮重',
      key: 'tare',
      align: 'right',
      width: 90,
      className: styles.numeric,
      render: (_, row) => tonnes(row.tareMilliTonne),
    },
    {
      title: '净重调整',
      key: 'adjustment',
      align: 'right',
      width: 90,
      className: styles.numeric,
      render: (_, row) => (
        <span className={row.netAdjustmentMilliTonne ? undefined : styles.zeroValue}>
          {tonnes(row.netAdjustmentMilliTonne)}
        </span>
      ),
    },
    {
      title: '最终净重',
      key: 'net',
      align: 'right',
      width: 110,
      className: styles.numeric,
      render: (_, row) => (
        <div className={styles.netCell}>
          <strong>{tonnes(row.netMilliTonne)}</strong>
          <small>{row.ticketCount ? `单车 ${tonnes(row.netMilliTonne / row.ticketCount)}` : '—'}</small>
        </div>
      ),
    },
    {
      title: '占比',
      key: 'share',
      align: 'right',
      width: 80,
      render: (_, row) => {
        const share = summary?.netMilliTonne
          ? (row.netMilliTonne / summary.netMilliTonne) * 100
          : null;
        const width = share === null ? 0 : Math.min(100, Math.max(0, share));
        return (
          <div className={styles.shareCell}>
            <span className={styles.shareValue}>
              {share === null ? '—' : formatPercent(share, 2)}
            </span>
            <span className={styles.shareTrack} aria-hidden="true">
              <span className={styles.shareFill} style={{ width: `${width}%` }} />
            </span>
          </div>
        );
      },
    },
    {
      title: '出单区间',
      key: 'issued',
      width: 140,
      render: (_, row) => {
        const first = compactDateTime(row.firstIssuedAt);
        const last = compactDateTime(row.lastIssuedAt);
        const title = `${formatDateTime(row.firstIssuedAt)} → ${formatDateTime(row.lastIssuedAt)}`;
        if (first === last) {
          return (
            <div className={styles.dateRange} title={title}>
              {first}
            </div>
          );
        }
        return (
          <div className={styles.dateRange} title={title}>
            <div>{first}</div>
            <div className={styles.dateRangeEnd}>→ {last}</div>
          </div>
        );
      },
    },
    {
      title: '',
      key: 'actions',
      width: 40,
      align: 'center',
      render: (_, row) => {
        const open = isSelected(row);
        return (
          <Button
            type="text"
            size="small"
            className={styles.expandButton}
            aria-label={open ? '收起对账单' : '查看对账单'}
            aria-expanded={open}
            onClick={(event) => {
              event.stopPropagation();
              toggleSelected(row);
            }}
            icon={open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          />
        );
      },
    },
  ];

  const moreItems = MORE_PRESETS.map((preset) => ({ key: preset.key, label: preset.label }));

  return (
    <>
      <PageHeader
        title="客户对账"
        meta={
          <Segmented
            className={styles.directionSwitch}
            aria-label="对账方向"
            value={direction}
            onChange={setDirection}
            options={[
              { label: '销售客户', value: 'outbound' },
              { label: '采购供应商', value: 'inbound' },
            ]}
          />
        }
      />
      <div className={styles.page}>
        {list.isError && (
          <Alert
            type="error"
            showIcon
            message={`客户对账加载失败：${getApiErrorMessage(list.error)}`}
            action={<Button onClick={() => void list.refetch()}>重试</Button>}
          />
        )}

        <section className={styles.ledger}>
          <div className={styles.periodSection}>
            <div className={styles.periodRow}>
              <div className={styles.periodStepper} role="group" aria-label="账期选择">
                <Button
                  type="text"
                  size="small"
                  aria-label="上一账期"
                  disabled={!isFullMonth}
                  icon={<ChevronLeft size={18} />}
                  onClick={() => stepMonth(-1)}
                />
                <Popover
                  trigger="click"
                  open={monthOpen}
                  onOpenChange={(open) => {
                    setMonthOpen(open);
                    if (open) setPickerYear(dayjs(from).year());
                  }}
                  content={
                    <div className={styles.monthPanel}>
                      <div className={styles.monthPanelHeader}>
                        <Button
                          type="text"
                          size="small"
                          aria-label="上一年"
                          icon={<ChevronLeft size={16} />}
                          onClick={() => setPickerYear((year) => year - 1)}
                        />
                        <span>{pickerYear} 年</span>
                        <Button
                          type="text"
                          size="small"
                          aria-label="下一年"
                          icon={<ChevronRight size={16} />}
                          onClick={() => setPickerYear((year) => year + 1)}
                        />
                      </div>
                      <div className={styles.monthGrid}>
                        {Array.from({ length: 12 }, (_, index) => {
                          const month = index + 1;
                          const selected =
                            isFullMonth &&
                            dayjs(from).year() === pickerYear &&
                            dayjs(from).month() === index;
                          return (
                            <Button
                              key={month}
                              type={selected ? 'primary' : 'text'}
                              size="small"
                              className={styles.monthGridButton}
                              onClick={() => {
                                const start = dayjs()
                                  .year(pickerYear)
                                  .month(index)
                                  .startOf('month');
                                applyPeriod(start, start.endOf('month'));
                                setMonthOpen(false);
                              }}
                            >
                              {month}月
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  }
                >
                  <Button type="text" className={styles.periodLabelButton}>
                    {periodLabel}
                    <CalendarDays size={15} aria-hidden="true" />
                  </Button>
                </Popover>
                <Button
                  type="text"
                  size="small"
                  aria-label="下一账期"
                  disabled={!isFullMonth}
                  icon={<ChevronRight size={18} />}
                  onClick={() => stepMonth(1)}
                />
              </div>

              <div className={styles.periodPresets}>
                {PRIMARY_PRESETS.map((preset) => (
                  <Button
                    key={preset.key}
                    type="text"
                    size="small"
                    className={activePreset === preset.key ? styles.presetActive : styles.preset}
                    onClick={() => applyPreset(preset.key)}
                  >
                    {preset.label}
                  </Button>
                ))}
                <Dropdown
                  trigger={['click']}
                  menu={{
                    items: moreItems,
                    selectable: true,
                    selectedKeys: [activePreset],
                    onClick: ({ key }) => applyPreset(key as MorePreset),
                  }}
                >
                  <Button
                    type="text"
                    size="small"
                    className={moreActive ? styles.presetActive : styles.preset}
                  >
                    {moreLabel} <ChevronDown size={13} />
                  </Button>
                </Dropdown>
                <Popover
                  trigger="click"
                  open={customOpen}
                  onOpenChange={setCustomOpen}
                  content={
                    <div className={styles.customRange}>
                      <span className={styles.customHint}>选择开始和结束日期</span>
                      <RangePicker
                        className={styles.customPicker}
                        value={[dayjs(from), dayjs(to)]}
                        allowClear={false}
                        onChange={(values) => {
                          if (!values?.[0] || !values[1]) return;
                          applyPeriod(values[0], values[1]);
                          setCustomOpen(false);
                        }}
                      />
                    </div>
                  }
                >
                  <Button
                    type="text"
                    size="small"
                    className={activePreset === 'custom' ? styles.presetActive : styles.preset}
                  >
                    自定义
                  </Button>
                </Popover>
              </div>

              <div className={styles.periodRange}>
                {from} 至 {to}
                {periodDays ? ` · ${periodDays} 天` : ''}
              </div>
            </div>

            <div className={styles.summaryRow}>
              <div className={styles.summaryLeft}>
                <div className={styles.summaryPrimary}>
                  <span className={styles.summaryLabel}>最终净重</span>
                  <span className={styles.summaryValue}>{netValue}</span>
                  <span className={styles.summaryUnit}>吨</span>
                </div>
                <div className={styles.summaryFacts}>
                  <span>
                    <b>{partyCount}</b> 家往来方
                  </span>
                  <span>
                    <b>{ticketCount}</b> 车有效车次
                  </span>
                  <span>
                    <b>{averageValue}</b> 吨/车
                  </span>
                </div>
              </div>

              <div className={styles.weightComposition}>
                <div className={styles.compositionHeader}>
                  <span>重量构成</span>
                  <span>毛重 {grossValue} 吨</span>
                </div>
                <div
                  className={styles.compositionBar}
                  role="img"
                  aria-label={`毛重 ${grossValue} 吨，皮重 ${tareValue} 吨，净重调整 ${adjustmentValue} 吨，最终净重 ${netValue} 吨`}
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
                    皮重 {tareValue}
                  </span>
                  <span>
                    <i className={`${styles.legendDot} ${styles.adjustDot}`} aria-hidden="true" />
                    调整 {adjustmentValue}
                  </span>
                  <span>
                    <i className={`${styles.legendDot} ${styles.netDot}`} aria-hidden="true" />
                    净重 {netValue}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.filterRow}>
            <Input.Search
              className={styles.keyword}
              aria-label="往来方名称或编码"
              placeholder="往来方名称 / 编码"
              value={keyword}
              onChange={(event) => {
                setKeyword(event.target.value);
                if (!event.target.value) applyKeyword('');
              }}
              onSearch={(value) => applyKeyword(value)}
              allowClear
            />
            <Select
              className={styles.select}
              aria-label="厂区"
              placeholder="全部厂区"
              allowClear
              value={state.filters.siteCode || undefined}
              onChange={setSite}
              options={(sitesQuery.data ?? []).map((site) => ({
                value: site.code,
                label: `${site.name}（${site.code}）${site.enabled ? '' : ' · 停用'}`,
              }))}
              loading={sitesQuery.isLoading}
              showSearch
              optionFilterProp="label"
            />
            <Select
              className={styles.select}
              aria-label="物料"
              placeholder="全部物料"
              allowClear
              value={state.filters.materialCode || undefined}
              onChange={setMaterial}
              options={(materialsQuery.data ?? []).map((material) => ({
                value: material.code,
                label: [material.name, material.spec, material.code].filter(Boolean).join(' / '),
              }))}
              loading={materialsQuery.isLoading}
              showSearch
              optionFilterProp="label"
            />
            <Button type="link" size="small" onClick={clearFilters} disabled={!hasFilters}>
              清空筛选
            </Button>
          </div>

          <DataTable
            flush
            tableKey="weighbridge-statement-parties"
            rowKey={(row) => `${row.siteCode}:${row.partyCode}`}
            columns={columns}
            dataSource={list.data?.records ?? []}
            total={list.data?.total ?? 0}
            page={state.page}
            pageSize={state.pageSize}
            onPageChange={handlePageChange}
            loading={list.isLoading}
            refreshing={list.isFetching}
            onRefresh={() => void list.refetch()}
            title={
              <span>
                往来方台账 <span className={styles.unitNote}>单位：吨</span>
              </span>
            }
            toolbarActions={
              <Button onClick={() => void exportSummary()} loading={exporting}>
                导出汇总 CSV
              </Button>
            }
            emptyDescription="当前期间没有符合条件的有效过磅单"
            scrollX={956}
            onRow={(row) => ({
              onClick: () => toggleSelected(row),
              style: { cursor: 'pointer' },
            })}
            rowClassName={(row) => (isSelected(row) ? styles.selectedRow : '')}
          />
        </section>

        {selected && (
          <section ref={detailRef} className={styles.detailSection} aria-label="对账单详情">
            <StatementSheet
              siteCode={selected.siteCode}
              siteName={selected.siteName}
              partyCode={selected.partyCode}
              partyName={selected.partyName}
              direction={direction}
              from={from}
              to={to}
              materialCode={state.filters.materialCode || undefined}
              onClose={() => setSelected(null)}
            />
          </section>
        )}
      </div>
    </>
  );
}
