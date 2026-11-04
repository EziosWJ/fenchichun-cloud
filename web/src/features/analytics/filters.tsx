import { useEffect, useRef, type ReactNode } from 'react';
import { Button, DatePicker, Input, Select, Space } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type { ListUrlActions } from '../../hooks/useListUrlState';
import type { ParsedListState } from '../../utils/listQuery';
import type { Category, Material, Party, Site } from '../weighbridge/api';
import styles from './AnalyticsFilters.module.css';

const { RangePicker } = DatePicker;

export const analyticsFilterConfig = {
  filters: {
    from: 'date',
    to: 'date',
    siteCode: 'text',
    direction: ['inbound', 'outbound'],
    materialCode: 'text',
    categoryCode: 'text',
    partyCode: 'text',
    compare: ['none', 'previous', 'year'],
    granularity: ['auto', 'day', 'week', 'month', 'quarter', 'year'],
  },
  sortKeys: ['net', 'tickets', 'avg', 'adjustment', 'void', 'lastIssuedAt'],
  pageSizeOptions: [10, 20, 50, 100],
  defaultPageSize: 20,
} as const;

function dateValue(value?: string): Dayjs | null {
  return value && dayjs(value).isValid() ? dayjs(value) : null;
}

export function useAnalyticsDefaults(
  state: ParsedListState,
  actions: ListUrlActions,
  defaultDirection?: 'inbound' | 'outbound',
) {
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const next: Record<string, string> = {};
    if (!state.filters.from) next.from = dayjs().startOf('month').format('YYYY-MM-DD');
    if (!state.filters.to) next.to = dayjs().endOf('month').format('YYYY-MM-DD');
    if (!state.filters.compare) next.compare = 'previous';
    if (defaultDirection && !state.filters.direction) next.direction = defaultDirection;
    if (Object.keys(next).length) actions.setFilters(next);
  }, [actions, defaultDirection, state.filters.compare, state.filters.direction, state.filters.from, state.filters.to]);
}

interface AnalyticsFilterBarProps {
  state: ParsedListState;
  actions: ListUrlActions;
  sites: Site[];
  materials: Material[];
  categories: Category[];
  parties?: Party[];
  showDirection?: boolean;
  directionRequired?: boolean;
  showKeyword?: boolean;
  keywordPlaceholder?: string;
  showCompare?: boolean;
  showGranularity?: boolean;
  extra?: ReactNode;
}

export function AnalyticsFilterBar({
  state,
  actions,
  sites,
  materials,
  categories,
  parties = [],
  showDirection = true,
  directionRequired = false,
  showKeyword = false,
  keywordPlaceholder = '名称 / 编码',
  showCompare = true,
  showGranularity = true,
  extra,
}: AnalyticsFilterBarProps) {
  const defaultFrom = dayjs().startOf('month').format('YYYY-MM-DD');
  const defaultTo = dayjs().endOf('month').format('YYYY-MM-DD');
  const from = state.filters.from || defaultFrom;
  const to = state.filters.to || defaultTo;
  const range: [Dayjs, Dayjs] = [dateValue(from) ?? dayjs(from), dateValue(to) ?? dayjs(to)];

  const setPeriod = (start: Dayjs, end: Dayjs) => {
    actions.setFilters({ from: start.format('YYYY-MM-DD'), to: end.format('YYYY-MM-DD') });
  };

  const reset = () => {
    actions.setFilters({
      from: defaultFrom,
      to: defaultTo,
      compare: 'previous',
      siteCode: '',
      direction: directionRequired ? state.filters.direction || 'inbound' : '',
      materialCode: '',
      categoryCode: '',
      partyCode: '',
      granularity: '',
    });
    actions.setKeyword('');
  };

  return (
    <div className={styles.filters} role="group" aria-label="统计筛选">
      <RangePicker
        className={styles.range}
        aria-label="统计日期范围"
        value={range}
        allowClear={false}
        format="YYYY-MM-DD"
        onChange={(values) => {
          if (!values || !values[0] || !values[1]) return;
          actions.setFilters({ from: values[0].format('YYYY-MM-DD'), to: values[1].format('YYYY-MM-DD') });
        }}
      />
      <Space size={4} wrap>
        <Button size="small" onClick={() => setPeriod(dayjs().startOf('month'), dayjs().endOf('month'))}>本月</Button>
        <Button size="small" onClick={() => setPeriod(dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month'))}>上月</Button>
        <Button size="small" onClick={() => setPeriod(dayjs().subtract(2, 'month').startOf('month'), dayjs().endOf('month'))}>近3个月</Button>
        <Button size="small" onClick={() => setPeriod(dayjs().startOf('year'), dayjs().endOf('year'))}>本年</Button>
      </Space>
      <Select
        className={styles.select}
        aria-label="厂区"
        placeholder="全部厂区"
        allowClear
        value={state.filters.siteCode || undefined}
        onChange={(value) => actions.setFilter('siteCode', value)}
        options={sites.map((site) => ({ value: site.code, label: `${site.name}（${site.code}）` }))}
        showSearch
        optionFilterProp="label"
      />
      {showDirection && (
        <Select
          className={styles.select}
          aria-label="方向"
          placeholder={directionRequired ? '请选择方向' : '全部方向'}
          allowClear={!directionRequired}
          value={state.filters.direction || undefined}
          onChange={(value) => actions.setFilter('direction', value)}
          options={[
            { value: 'inbound', label: '入厂（采购）' },
            { value: 'outbound', label: '出厂（销售）' },
          ]}
        />
      )}
      <Select
        className={styles.select}
        aria-label="物料"
        placeholder="全部物料"
        allowClear
        value={state.filters.materialCode || undefined}
        onChange={(value) => actions.setFilter('materialCode', value)}
        options={materials.map((material) => ({
          value: material.code,
          label: [material.name, material.spec, material.code].filter(Boolean).join(' / '),
        }))}
        showSearch
        optionFilterProp="label"
      />
      <Select
        className={styles.select}
        aria-label="物料分类"
        placeholder="全部分类"
        allowClear
        value={state.filters.categoryCode || undefined}
        onChange={(value) => actions.setFilter('categoryCode', value)}
        options={categories.map((category) => ({ value: category.code, label: category.name }))}
        showSearch
        optionFilterProp="label"
      />
      {parties.length > 0 && (
        <Select
          className={styles.select}
          aria-label="供收方"
          placeholder="全部供收方"
          allowClear
          value={state.filters.partyCode || undefined}
          onChange={(value) => actions.setFilter('partyCode', value)}
          options={parties.map((party) => ({ value: party.code, label: `${party.name}（${party.code}）` }))}
          showSearch
          optionFilterProp="label"
        />
      )}
      {showKeyword && (
        <Input.Search
          key={state.keyword}
          className={styles.keyword}
          aria-label={keywordPlaceholder}
          placeholder={keywordPlaceholder}
          defaultValue={state.keyword}
          onSearch={(value) => actions.setKeyword(value)}
          allowClear
        />
      )}
      {showCompare && (
        <Select
          className={styles.smallSelect}
          aria-label="对比"
          value={state.filters.compare || 'previous'}
          onChange={(value) => actions.setFilter('compare', value)}
          options={[
            { value: 'previous', label: '环比' },
            { value: 'year', label: '同比' },
            { value: 'none', label: '不对比' },
          ]}
        />
      )}
      {showGranularity && (
        <Select
          className={styles.smallSelect}
          aria-label="时间粒度"
          value={state.filters.granularity || 'auto'}
          onChange={(value) => actions.setFilter('granularity', value === 'auto' ? '' : value)}
          options={[
            { value: 'auto', label: '自动粒度' },
            { value: 'day', label: '按日' },
            { value: 'week', label: '按周' },
            { value: 'month', label: '按月' },
            { value: 'quarter', label: '按季' },
            { value: 'year', label: '按年' },
          ]}
        />
      )}
      <Button className={styles.reset} onClick={reset}>重置</Button>
      {extra}
    </div>
  );
}
