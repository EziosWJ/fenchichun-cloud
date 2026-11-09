import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Alert, Button, DatePicker, Empty, Segmented, Select, Skeleton, Tooltip, theme } from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { ArrowDownToLine, ArrowUpFromLine, RefreshCw } from 'lucide-react';
import { EChart } from '../../components/charts/EChart';
import { useListUrlState } from '../../hooks/useListUrlState';
import { getApiErrorMessage } from '../../lib/api/errors';
import { analyticsOverview, type StructureRow, type TopRow } from '../../features/analytics/api';
import { analyticsFilterConfig } from '../../features/analytics/filters';
import { formatBp, formatMilliTonne } from '../../features/analytics/format';
import {
  overviewStructureChartOption,
  overviewTrendChartOption,
  type OverviewChartPalette,
} from '../../features/analytics/charts';
import { sites as fetchSites } from '../../features/weighbridge/api';
import styles from './OverviewPage.module.css';

const { RangePicker } = DatePicker;

const OUTBOUND_COLOR = '#13c2c2';
const CATEGORY_ACCENTS = ['#13c2c2', '#fa8c16', '#722ed1', '#52c41a', '#eb2f96'];

interface PeriodPreset {
  key: string;
  label: string;
  range: [Dayjs, Dayjs];
}

function periodPresets(): PeriodPreset[] {
  const now = dayjs();
  const lastMonth = now.subtract(1, 'month');
  return [
    { key: '7d', label: '近7天', range: [now.subtract(6, 'day').startOf('day'), now.endOf('day')] },
    { key: 'month', label: '本月', range: [now.startOf('month'), now.endOf('month')] },
    { key: 'lastMonth', label: '上月', range: [lastMonth.startOf('month'), lastMonth.endOf('month')] },
    { key: 'year', label: '本年', range: [now.startOf('year'), now.endOf('year')] },
  ];
}

function activePresetKey(from: string, to: string, presets: PeriodPreset[]): string | undefined {
  const start = dayjs(from);
  const end = dayjs(to);
  if (!start.isValid() || !end.isValid()) return undefined;
  return presets.find((preset) => start.isSame(preset.range[0], 'day') && end.isSame(preset.range[1], 'day'))?.key;
}

function prepareStructure(rows: StructureRow[]): StructureRow[] {
  const sorted = rows.filter((row) => row.netMilliTonne > 0).sort((a, b) => b.netMilliTonne - a.netMilliTonne);
  if (sorted.length <= 6) return sorted;
  const head = sorted.slice(0, 5);
  const rest = sorted.slice(5);
  const total = sorted.reduce((sum, row) => sum + row.netMilliTonne, 0);
  const otherNet = rest.reduce((sum, row) => sum + row.netMilliTonne, 0);
  return [
    ...head,
    {
      key: '__other__',
      label: '其他',
      netMilliTonne: otherNet,
      shareBp: total > 0 ? (otherNet / total) * 10000 : null,
    },
  ];
}

function Panel({
  title,
  meta,
  extra,
  className,
  children,
}: {
  title: string;
  meta?: string;
  extra?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`${styles.panel} ${className ?? ''}`.trim()}>
      <header className={styles.panelHead}>
        <div className={styles.panelHeading}>
          <h2 className={styles.panelTitle}>{title}</h2>
          {meta && <span className={styles.panelMeta}>{meta}</span>}
        </div>
        {extra}
      </header>
      <div className={styles.panelBody}>{children}</div>
    </section>
  );
}

function EmptyState({ description }: { description: string }) {
  return (
    <div className={styles.empty}>
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={description} />
    </div>
  );
}

function AnimatedNumber({ value }: { value: number | null | undefined }) {
  const [display, setDisplay] = useState(0);
  const displayRef = useRef(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (value == null) {
      displayRef.current = 0;
      setDisplay(0);
      return;
    }
    const to = value;
    // 首次展示只从最终值的 95% 轻轻滚动到最终值，避免数字长时间快速跳变。
    const from = displayRef.current > 0 ? displayRef.current : to * 0.95;
    if (from === to) {
      setDisplay(to);
      return;
    }
    const reduceMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      displayRef.current = to;
      setDisplay(to);
      return;
    }

    const duration = 700;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = Math.max(0, Math.min((now - start) / duration, 1));
      const eased = 1 - Math.pow(1 - elapsed, 3);
      const next = from + (to - from) * eased;
      displayRef.current = next;
      setDisplay(next);
      if (elapsed < 1) {
        frameRef.current = window.requestAnimationFrame(tick);
      } else {
        displayRef.current = to;
        setDisplay(to);
        frameRef.current = null;
      }
    };

    if (frameRef.current != null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (frameRef.current != null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [value]);

  if (value == null) return <span className={styles.metricValue}>—</span>;
  return <span className={styles.metricValue}>{formatMilliTonne(display)}</span>;
}

function RankingList({
  rows,
  loading,
  emptyText,
  showShare = false,
  accent = '#1677ff',
}: {
  rows: TopRow[];
  loading: boolean;
  emptyText: string;
  showShare?: boolean;
  accent?: string;
}) {
  const signature = rows.map((row) => `${row.code}:${row.netMilliTonne}`).join('|');

  if (loading && !rows.length) return <Skeleton active title={false} paragraph={{ rows: 6 }} />;
  if (!rows.length) return <EmptyState description={emptyText} />;
  const max = Math.max(...rows.map((row) => row.netMilliTonne), 1);
  const accentStyle = { '--rank-accent': accent } as CSSProperties;
  return (
    <ol key={signature} className={styles.rankList} style={accentStyle}>
      {rows.map((row, index) => {
        const width = row.netMilliTonne > 0 ? Math.max((row.netMilliTonne / max) * 100, 2) : 0;
        const barStyle = {
          '--rank-width': `${width}%`,
          animationDelay: `${index * 45}ms`,
        } as CSSProperties;
        return (
          <li key={`${row.direction ?? 'all'}-${row.code}-${index}`} className={styles.rankItem}>
            <span className={styles.rankNo}>{String(index + 1).padStart(2, '0')}</span>
            <div className={styles.rankMain}>
              <div className={styles.rankTop}>
                <span className={styles.rankName} title={row.name || row.code}>{row.name || row.code}</span>
                <span className={styles.rankValue}>
                  {formatMilliTonne(row.netMilliTonne)}
                  <span className={styles.rankUnit}> 吨</span>
                </span>
              </div>
              <div className={styles.rankTrack}>
                <span className={styles.rankBar} style={barStyle} />
              </div>
              {showShare && <span className={styles.rankShare}>占比 {formatBp(row.shareBp)}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function TrendLegend() {
  return (
    <div className={styles.chartLegend} aria-hidden="true">
      <span className={styles.chartLegendItem}><i className={styles.legendLineInbound} />入厂净重</span>
      <span className={styles.chartLegendItem}><i className={styles.legendLineOutbound} />出厂净重</span>
    </div>
  );
}

export default function OverviewPage() {
  const { token } = theme.useToken();
  const { state, actions } = useListUrlState(analyticsFilterConfig);
  const [partyDirection, setPartyDirection] = useState<'inbound' | 'outbound'>('inbound');

  const defaults = useMemo(
    () => ({
      from: dayjs().startOf('month').format('YYYY-MM-DD'),
      to: dayjs().endOf('month').format('YYYY-MM-DD'),
    }),
    [],
  );

  useEffect(() => {
    const next: Record<string, string | undefined> = {};
    if (!state.filters.from) next.from = defaults.from;
    if (!state.filters.to) next.to = defaults.to;
    if (state.filters.compare) next.compare = undefined;
    if (state.filters.granularity) next.granularity = undefined;
    if (Object.keys(next).length) actions.setFilters(next);
  }, [actions, defaults, state.filters.compare, state.filters.from, state.filters.granularity, state.filters.to]);

  const from = state.filters.from || defaults.from;
  const to = state.filters.to || defaults.to;
  const range: [Dayjs, Dayjs] = [dayjs(from), dayjs(to)];
  const presets = useMemo(() => periodPresets(), []);
  const activePreset = activePresetKey(from, to, presets);

  const sites = useQuery({ queryKey: ['weighbridge', 'sites'], queryFn: fetchSites });
  const siteOptions = useMemo(
    () => (sites.data ?? []).map((site) => ({ value: site.code, label: `${site.name}（${site.code}）` })),
    [sites.data],
  );
  const siteName = (sites.data ?? []).find((site) => site.code === state.filters.siteCode)?.name ?? '全部厂区';

  const params = useMemo(
    () => ({
      from,
      to,
      siteCode: state.filters.siteCode || undefined,
      compare: 'none',
    }),
    [from, state.filters.siteCode, to],
  );

  const overview = useQuery({
    queryKey: ['analytics', 'overview', params],
    queryFn: () => analyticsOverview(params),
    staleTime: 60_000,
    refetchInterval: 300_000,
    refetchIntervalInBackground: false,
  });

  const data = overview.data;
  const summary = data?.summary;
  const trend = data?.trend;
  const structure = useMemo(() => prepareStructure(data?.materialStructure ?? []), [data?.materialStructure]);
  const structureTotal = structure.reduce((sum, row) => sum + row.netMilliTonne, 0);

  const structureColors = useMemo(
    () => [token.colorPrimary, ...CATEGORY_ACCENTS],
    [token.colorPrimary],
  );

  const structureOption = useMemo(
    () =>
      overviewStructureChartOption(structure, structureColors, {
        background: token.colorBgContainer,
        border: token.colorBorderSecondary,
        text: token.colorText,
      }),
    [structure, structureColors, token.colorBgContainer, token.colorBorderSecondary, token.colorText],
  );

  const materialRows = useMemo(() => (data?.topMaterials ?? []).slice(0, 7), [data?.topMaterials]);
  const partyRows = useMemo(
    () => (data?.topParties ?? []).filter((row) => row.direction === partyDirection).slice(0, 7),
    [data?.topParties, partyDirection],
  );

  const chartPalette = useMemo<OverviewChartPalette>(
    () => ({
      primary: token.colorPrimary,
      outbound: OUTBOUND_COLOR,
      text: token.colorText,
      tertiary: token.colorTextTertiary,
      border: token.colorBorderSecondary,
      background: token.colorBgContainer,
    }),
    [token.colorBgContainer, token.colorBorderSecondary, token.colorPrimary, token.colorText, token.colorTextTertiary],
  );
  const trendOption = useMemo(() => overviewTrendChartOption(trend, chartPalette), [chartPalette, trend]);

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="overview-title">
        <div className={styles.heroHead}>
          <div className={styles.heading}>
            <h1 id="overview-title" className={styles.title}>经营总览</h1>
            <div className={styles.period}>
              {dayjs(from).format('YYYY.MM.DD')} — {dayjs(to).format('YYYY.MM.DD')} · {siteName}
            </div>
          </div>
          <div className={styles.controls}>
            <div className={styles.presets} role="group" aria-label="时间范围">
              {presets.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  className={activePreset === preset.key ? styles.presetActive : styles.preset}
                  aria-pressed={activePreset === preset.key}
                  onClick={() =>
                    actions.setFilters({
                      from: preset.range[0].format('YYYY-MM-DD'),
                      to: preset.range[1].format('YYYY-MM-DD'),
                    })
                  }
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <RangePicker
              className={styles.range}
              variant="filled"
              value={range}
              allowClear={false}
              format="YYYY-MM-DD"
              onChange={(values) => {
                if (!values?.[0] || !values?.[1]) return;
                actions.setFilters({
                  from: values[0].format('YYYY-MM-DD'),
                  to: values[1].format('YYYY-MM-DD'),
                });
              }}
            />
            <Select
              className={styles.siteSelect}
              variant="filled"
              placeholder="全部厂区"
              allowClear
              showSearch
              optionFilterProp="label"
              value={state.filters.siteCode || undefined}
              onChange={(value) => actions.setFilter('siteCode', value)}
              options={siteOptions}
            />
            <Tooltip title="刷新数据">
              <Button
                type="text"
                className={styles.refresh}
                icon={<RefreshCw size={16} aria-hidden="true" />}
                loading={overview.isFetching}
                onClick={() => void overview.refetch()}
                aria-label="刷新数据"
              />
            </Tooltip>
          </div>
        </div>

        <div className={styles.metrics}>
          <div className={styles.metric}>
            <div className={styles.metricLabel}>
              <span className={styles.metricIcon} style={{ color: token.colorPrimary }}>
                <ArrowDownToLine size={14} aria-hidden="true" />
              </span>
              入厂净重
            </div>
            <div className={styles.metricValueRow}>
              <AnimatedNumber value={summary?.inboundNetMilliTonne} />
              <span className={styles.metricUnit}>吨</span>
            </div>
          </div>
          <span className={styles.metricDivider} aria-hidden="true" />
          <div className={styles.metric}>
            <div className={styles.metricLabel}>
              <span className={styles.metricIcon} style={{ color: OUTBOUND_COLOR }}>
                <ArrowUpFromLine size={14} aria-hidden="true" />
              </span>
              出厂净重
            </div>
            <div className={styles.metricValueRow}>
              <AnimatedNumber value={summary?.outboundNetMilliTonne} />
              <span className={styles.metricUnit}>吨</span>
            </div>
          </div>
        </div>
      </section>

      {overview.isError && (
        <Alert
          type="error"
          showIcon
          message={`经营总览加载失败：${getApiErrorMessage(overview.error)}`}
          action={<Button size="small" onClick={() => void overview.refetch()}>重试</Button>}
        />
      )}

      <div className={styles.grid}>
        <Panel title="进出厂净重趋势" className={styles.trendPanel} extra={<TrendLegend />}>
          <EChart
            option={trendOption}
            loading={overview.isLoading}
            empty={!trend?.points.length}
            height={368}
            ariaLabel="进出厂净重趋势图"
          />
        </Panel>

        <Panel title="物料分类结构" meta="按净重占比" className={styles.structurePanel}>
          {overview.isLoading && !data ? (
            <Skeleton active title={false} paragraph={{ rows: 6 }} />
          ) : structure.length && structureTotal > 0 ? (
            <div className={styles.structureBody}>
              <div className={styles.donutChartWrap}>
                <EChart
                  option={structureOption}
                  loading={overview.isLoading}
                  height={190}
                  ariaLabel="物料分类净重占比"
                />
                <div className={styles.donutHole}>
                  <span className={styles.donutValue}>{formatBp(structure[0]?.shareBp)}</span>
                  <span className={styles.donutLabel} title={structure[0]?.label}>{structure[0]?.label}</span>
                </div>
              </div>
              <ul className={styles.legendList}>
                {structure.map((row, index) => (
                  <li key={row.key} className={styles.legendItem}>
                    <span
                      className={styles.legendDot}
                      style={{ background: structureColors[index % structureColors.length] }}
                    />
                    <div className={styles.legendBody}>
                      <div className={styles.legendTop}>
                        <span className={styles.legendName} title={row.label}>{row.label}</span>
                        <span className={styles.legendShare}>{formatBp(row.shareBp)}</span>
                      </div>
                      <span className={styles.legendValue}>{formatMilliTonne(row.netMilliTonne)} 吨</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <EmptyState description="暂无物料数据" />
          )}
        </Panel>

        <Panel title="Top 物料" meta="按净重" className={styles.materialsPanel}>
          <RankingList
            rows={materialRows}
            loading={overview.isLoading}
            emptyText="暂无物料数据"
            showShare
            accent={token.colorPrimary}
          />
        </Panel>

        <Panel
          title="Top 供收方"
          className={styles.partiesPanel}
          extra={
            <Segmented
              size="small"
              value={partyDirection}
              onChange={(value) => setPartyDirection(value as 'inbound' | 'outbound')}
              options={[
                { label: '供货方', value: 'inbound' },
                { label: '收货方', value: 'outbound' },
              ]}
            />
          }
        >
          <RankingList
            rows={partyRows}
            loading={overview.isLoading}
            emptyText="暂无供收方数据"
            accent={partyDirection === 'inbound' ? token.colorPrimary : OUTBOUND_COLOR}
          />
        </Panel>
      </div>
    </div>
  );
}
