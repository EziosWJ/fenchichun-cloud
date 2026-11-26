import { useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Alert, App, Button, DatePicker, Modal, Segmented, Select, Skeleton } from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { ChevronRight, PackageOpen } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { paths } from '../../config/paths';
import {
  distillerGrainsStats,
  exportDistillerGrains,
  type DistillerGrainsDay,
  type DistillerGrainsRecord,
  type DistillerGrainsStats,
} from '../../features/distiller-grains/api';
import { downloadBlob } from '../../features/analytics/download';
import { getApiErrorMessage } from '../../lib/api/errors';
import styles from './DistillerGrainsPage.module.css';

type Mode = 'today' | 'yesterday' | 'week' | 'last-week' | 'month' | 'last-month' | 'detail';
type Unit = 'day' | 'week' | 'month';

interface DetailRange {
  from: string;
  to: string;
  label: string;
}

interface RecordGroup {
  date: string;
  records: DistillerGrainsRecord[];
}

interface WeekRow {
  key: string;
  start: string;
  end: string;
  ticketCount: number;
  netMilliTonne: number;
}

const modeOrder: Mode[] = ['today', 'yesterday', 'week', 'last-week', 'month', 'last-month', 'detail'];
const modeTitles: Record<Mode, string> = {
  today: '本日出库',
  yesterday: '昨日出库',
  week: '本周出库',
  'last-week': '上周出库',
  month: '本月出库',
  'last-month': '上月出库',
  detail: '详细查询',
};
const modePaths: Record<Mode, string> = {
  today: paths.distillerGrainsToday,
  yesterday: paths.distillerGrainsYesterday,
  week: paths.distillerGrainsWeek,
  'last-week': paths.distillerGrainsLastWeek,
  month: paths.distillerGrainsMonth,
  'last-month': paths.distillerGrainsLastMonth,
  detail: paths.distillerGrainsDetail,
};
const modeUnits: Record<Mode, Unit> = {
  today: 'day',
  yesterday: 'day',
  week: 'week',
  'last-week': 'week',
  month: 'month',
  'last-month': 'month',
  detail: 'day',
};
const emptyTitles: Record<Mode, string> = {
  today: '今天还没有酒糟出厂',
  yesterday: '昨天没有酒糟出厂',
  week: '本周还没有酒糟出厂',
  'last-week': '上周没有酒糟出厂',
  month: '本月还没有酒糟出厂',
  'last-month': '上月没有酒糟出厂',
  detail: '这段时间没有酒糟出厂',
};
const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function modeFromPath(pathname: string): Mode {
  return modeOrder.find((mode) => pathname.startsWith(modePaths[mode])) ?? 'today';
}

function formatTonnes(milliTonne: number) {
  return (milliTonne / 1000).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function dayText(date: string) {
  const value = dayjs(date);
  return `${value.month() + 1}月${value.date()}日 ${weekdays[value.day()] ?? ''}`;
}

function shortDate(date: string) {
  const value = dayjs(date);
  return `${value.month() + 1}月${value.date()}日`;
}

function rangeText(from: string, to: string) {
  return from === to ? shortDate(from) : `${shortDate(from)}—${shortDate(to)}`;
}

function periodText(mode: Mode, from: string, to: string) {
  if (!from) return '';
  return mode === 'today' || mode === 'yesterday' ? shortDate(from) : rangeText(from, to);
}

function groupRecords(records: DistillerGrainsRecord[]): RecordGroup[] {
  const map = new Map<string, DistillerGrainsRecord[]>();
  records.forEach((record) => {
    const key = dayjs(record.issuedAt).format('YYYY-MM-DD');
    const list = map.get(key);
    if (list) list.push(record);
    else map.set(key, [record]);
  });
  return [...map.entries()]
    .sort(([left], [right]) => (left < right ? 1 : -1))
    .map(([date, list]) => ({ date, records: list }));
}

function groupTotal(records: DistillerGrainsRecord[]) {
  return records.reduce((sum, record) => sum + record.netMilliTonne, 0);
}

function buildWeekRows(days: DistillerGrainsDay[], from: string, to: string): WeekRow[] {
  const fromDate = dayjs(from);
  const toDate = dayjs(to);
  const rows = new Map<string, WeekRow>();
  days.forEach((day) => {
    const date = dayjs(day.date);
    const weekday = date.day() === 0 ? 7 : date.day();
    let start = date.subtract(weekday - 1, 'day');
    let end = start.add(6, 'day');
    if (start.isBefore(fromDate)) start = fromDate;
    if (end.isAfter(toDate)) end = toDate;
    const key = start.format('YYYY-MM-DD');
    const row = rows.get(key) ?? {
      key,
      start: key,
      end: end.format('YYYY-MM-DD'),
      ticketCount: 0,
      netMilliTonne: 0,
    };
    row.ticketCount += day.ticketCount;
    row.netMilliTonne += day.netMilliTonne;
    rows.set(key, row);
  });
  return [...rows.values()].sort((left, right) => left.start.localeCompare(right.start));
}

function RecordRows({ records, showCustomer }: { records: DistillerGrainsRecord[]; showCustomer: boolean }) {
  return (
    <>
      {records.map((record) => (
        <div key={record.ticketNo} className={`${styles.recordRow} ${showCustomer ? '' : styles.recordRowNoCustomer}`}>
          <span className={styles.recordTime}>{dayjs(record.issuedAt).format('HH:mm')}</span>
          <span className={styles.recordPlate}>{record.plate}</span>
          {showCustomer && <span className={styles.recordCustomer}>{record.partyName || '—'}</span>}
          <span className={styles.recordWeight}>
            {formatTonnes(record.netMilliTonne)}<small>吨</small>
          </span>
        </div>
      ))}
    </>
  );
}

function DetailContent({ data, showCustomer }: { data: DistillerGrainsStats; showCustomer: boolean }) {
  const groups = groupRecords(data.records);
  const multiDay = data.from !== data.to;
  return (
    <div className={styles.modalBody}>
      <div className={styles.modalSummary}>
        <strong>{formatTonnes(data.totalNetMilliTonne)} 吨</strong>
        <span>共 {data.ticketCount} 车</span>
      </div>
      <div className={styles.modalList}>
        {groups.map((group) => (
          <section key={group.date}>
            {multiDay && (
              <div className={styles.groupHead}>
                <span>{dayText(group.date)}</span>
                <span>{formatTonnes(groupTotal(group.records))} 吨</span>
              </div>
            )}
            <RecordRows records={group.records} showCustomer={showCustomer} />
          </section>
        ))}
      </div>
    </div>
  );
}

export default function DistillerGrainsPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const mode = modeFromPath(pathname);
  const unit = modeUnits[mode];
  const [customer, setCustomer] = useState('');
  const [range, setRange] = useState<[Dayjs, Dayjs]>(() => [dayjs().startOf('month'), dayjs()]);
  const [detail, setDetail] = useState<DetailRange | null>(null);
  const [exporting, setExporting] = useState(false);

  const params: Record<string, unknown> = { period: mode === 'detail' ? 'range' : mode };
  if (customer) params.customerCode = customer;
  if (mode === 'detail') {
    params.from = range[0].format('YYYY-MM-DD');
    params.to = range[1].format('YYYY-MM-DD');
  }

  const query = useQuery({
    queryKey: ['distiller-grains', params],
    queryFn: () => distillerGrainsStats(params),
    refetchInterval: 60_000,
  });
  const detailQuery = useQuery({
    queryKey: ['distiller-grains', 'detail', detail?.from, detail?.to, customer],
    queryFn: () => distillerGrainsStats({
      period: 'range',
      from: detail?.from,
      to: detail?.to,
      ...(customer ? { customerCode: customer } : {}),
    }),
    enabled: detail !== null,
  });

  const data = query.data;
  const groups = useMemo(() => groupRecords(data?.records ?? []), [data?.records]);
  const weekRows = useMemo(
    () => (unit === 'month' && data ? buildWeekRows(data.days, data.from, data.to) : []),
    [unit, data],
  );
  const customerName = data?.customers.find((item) => item.code === customer)?.name;
  const title = modeTitles[mode];
  const dateText = data ? periodText(mode, data.from, data.to) : '';
  const showCustomer = !customer;

  const openRange = (from: string, to: string, label: string) => setDetail({ from, to, label });

  const exportExcel = async () => {
    setExporting(true);
    try {
      const blob = await exportDistillerGrains(params);
      const name = customerName ? `酒糟统计-${customerName}` : '酒糟统计';
      const from = data?.from ?? dayjs().format('YYYY-MM-DD');
      const to = data?.to ?? dayjs().format('YYYY-MM-DD');
      downloadBlob(blob, `${name}-${from}至${to}.csv`);
      message.success('已导出，可用 Excel 打开');
    }
    catch (error) {
      message.error(getApiErrorMessage(error));
    }
    finally {
      setExporting(false);
    }
  };

  const changeStart = (value: Dayjs | null) => {
    if (!value) return;
    setRange([value, value.isAfter(range[1]) ? value : range[1]]);
  };
  const changeEnd = (value: Dayjs | null) => {
    if (!value) return;
    setRange([value.isBefore(range[0]) ? value : range[0], value]);
  };

  let content: ReactNode = null;
  if (query.isLoading) {
    content = <Skeleton active paragraph={{ rows: 6 }} />;
  } else if (query.isError) {
    content = (
      <Alert
        type="error"
        showIcon
        title={`数据加载失败：${getApiErrorMessage(query.error)}`}
        action={<Button onClick={() => void query.refetch()}>重试</Button>}
      />
    );
  } else if ((data?.ticketCount ?? 0) === 0) {
    content = (
      <div className={styles.empty}>
        <PackageOpen size={60} strokeWidth={1.2} aria-hidden />
        <div className={styles.emptyTitle}>{emptyTitles[mode]}</div>
        <div className={styles.emptyHint}>有新的出场过磅单后会自动显示</div>
      </div>
    );
  } else if (unit === 'week') {
    content = (
      <ul className={styles.list}>
        {(data?.days ?? []).map((day) => (
          <li key={day.date}>
            <button
              type="button"
              className={styles.dayRow}
              onClick={() => openRange(day.date, day.date, shortDate(day.date))}
            >
              <span className={styles.dayName}>{dayText(day.date)}</span>
              <span className={styles.dayCount}>{day.ticketCount} 车</span>
              <span className={styles.dayWeight}>{formatTonnes(day.netMilliTonne)}<small>吨</small></span>
              <ChevronRight size={22} className={styles.rowArrow} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    );
  } else if (unit === 'month') {
    content = (
      <ul className={styles.list}>
        {weekRows.map((row) => (
          <li key={row.key}>
            <button
              type="button"
              className={styles.dayRow}
              onClick={() => openRange(row.start, row.end, rangeText(row.start, row.end))}
            >
              <span className={styles.dayName}>{rangeText(row.start, row.end)}</span>
              <span className={styles.dayCount}>{row.ticketCount} 车</span>
              <span className={styles.dayWeight}>{formatTonnes(row.netMilliTonne)}<small>吨</small></span>
              <ChevronRight size={22} className={styles.rowArrow} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    );
  } else {
    content = (
      <div className={styles.list}>
        {groups.map((group) => (
          <section key={group.date}>
            {mode === 'detail' && (
              <div className={styles.groupHead}>
                <span>{dayText(group.date)}</span>
                <span>{formatTonnes(groupTotal(group.records))} 吨</span>
              </div>
            )}
            <RecordRows records={group.records} showCustomer={showCustomer} />
          </section>
        ))}
      </div>
    );
  }

  const clickHint = unit === 'week' ? '点某一天，查看每车明细' : unit === 'month' ? '点某一周，查看每车明细' : '';

  return (
    <>
      <PageHeader
        title="酒糟统计"
        extra={<Button size="large" onClick={() => void exportExcel()} loading={exporting} disabled={!data}>导出 Excel</Button>}
      />
      <div className={styles.page}>
        <Segmented
          block
          size="large"
          className={styles.tabs}
          value={mode}
          options={modeOrder.map((item) => ({ value: item, label: modeTitles[item] }))}
          onChange={(value) => navigate(modePaths[value as Mode])}
        />
        <div className={styles.filters}>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>客户</span>
            <Select
              aria-label="客户"
              size="large"
              className={styles.customer}
              value={customer}
              options={[
                { value: '', label: '全部客户' },
                ...(data?.customers ?? []).map((item) => ({ value: item.code, label: item.name })),
              ]}
              onChange={setCustomer}
            />
          </div>
          {mode === 'detail' && (
            <>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>开始日期</span>
                <DatePicker
                  aria-label="开始日期"
                  size="large"
                  className={styles.datePicker}
                  value={range[0]}
                  allowClear={false}
                  format="YYYY年M月D日"
                  onChange={changeStart}
                />
              </div>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>结束日期</span>
                <DatePicker
                  aria-label="结束日期"
                  size="large"
                  className={styles.datePicker}
                  value={range[1]}
                  allowClear={false}
                  format="YYYY年M月D日"
                  onChange={changeEnd}
                />
              </div>
            </>
          )}
        </div>
        <section className={styles.summary}>
          <div className={styles.summaryLabel}>{mode === 'detail' ? '所选时段合计' : `${title}合计`}</div>
          {dateText && (
            <div className={styles.summaryDate}>
              {dateText}{customerName ? ` · ${customerName}` : ''}
            </div>
          )}
          <div className={styles.summaryValue}>
            {formatTonnes(data?.totalNetMilliTonne ?? 0)}
            <span className={styles.summaryUnit}>吨</span>
          </div>
          <div className={styles.summaryMeta}>共 {data?.ticketCount ?? 0} 车</div>
        </section>
        {clickHint && (data?.ticketCount ?? 0) > 0 && <div className={styles.clickHint}>{clickHint}</div>}
        {content}
      </div>
      <Modal
        open={detail !== null}
        onCancel={() => setDetail(null)}
        width={760}
        destroyOnHidden
        title={detail ? `${detail.label}出库明细` : '出库明细'}
        footer={<Button size="large" block onClick={() => setDetail(null)}>关闭</Button>}
      >
        {detailQuery.isLoading ? (
          <Skeleton active paragraph={{ rows: 5 }} />
        ) : detailQuery.isError ? (
          <Alert
            type="error"
            showIcon
            title={`明细加载失败：${getApiErrorMessage(detailQuery.error)}`}
            action={<Button onClick={() => void detailQuery.refetch()}>重试</Button>}
          />
        ) : detailQuery.data ? (
          <DetailContent data={detailQuery.data} showCustomer={showCustomer} />
        ) : null}
      </Modal>
    </>
  );
}
