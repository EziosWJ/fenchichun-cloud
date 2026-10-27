import type { SortOrder } from '../types/api';
import { isDateString } from './format';

export type FilterRule = 'text' | 'date' | readonly string[];

export interface ListUrlConfig {
  filters: Record<string, FilterRule>;
  sortKeys: readonly string[];
  pageSizeOptions: readonly number[];
  defaultPageSize: number;
}

export interface ParsedListState {
  page: number;
  pageSize: number;
  keyword: string;
  sortBy?: string;
  sortOrder?: SortOrder;
  filters: Record<string, string>;
}

const KEYWORD_PARAM = 'q';
const SORT_BY_PARAM = 'sortBy';
const SORT_ORDER_PARAM = 'sortOrder';
const PAGE_PARAM = 'page';
const PAGE_SIZE_PARAM = 'pageSize';

export const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

function parsePositiveInteger(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
}

function parseFilter(rule: FilterRule, value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (rule === 'date') return isDateString(trimmed) ? trimmed : undefined;
  if (rule === 'text') return trimmed.length <= 100 ? trimmed : undefined;
  return rule.includes(trimmed) ? trimmed : undefined;
}

export function parseListSearchParams(params: URLSearchParams, config: ListUrlConfig): ParsedListState {
  const page = parsePositiveInteger(params.get(PAGE_PARAM), 1);
  const rawPageSize = parsePositiveInteger(params.get(PAGE_SIZE_PARAM), config.defaultPageSize);
  const pageSize = config.pageSizeOptions.includes(rawPageSize) ? rawPageSize : config.defaultPageSize;
  const keyword = (params.get(KEYWORD_PARAM) ?? '').trim().slice(0, 100);

  const rawSortBy = params.get(SORT_BY_PARAM);
  const sortBy = rawSortBy && config.sortKeys.includes(rawSortBy) ? rawSortBy : undefined;
  const rawSortOrder = params.get(SORT_ORDER_PARAM);
  const sortOrder: SortOrder | undefined =
    sortBy && (rawSortOrder === 'asc' || rawSortOrder === 'desc') ? rawSortOrder : undefined;

  const filters: Record<string, string> = {};
  Object.entries(config.filters).forEach(([key, rule]) => {
    const parsed = parseFilter(rule, params.get(key) ?? '');
    if (parsed) filters[key] = parsed;
  });

  return { page, pageSize, keyword, sortBy, sortOrder, filters };
}

export function writeListSearchParams(
  current: URLSearchParams,
  state: ParsedListState,
  config: ListUrlConfig,
): URLSearchParams {
  const next = new URLSearchParams(current);
  [
    PAGE_PARAM,
    PAGE_SIZE_PARAM,
    KEYWORD_PARAM,
    SORT_BY_PARAM,
    SORT_ORDER_PARAM,
    ...Object.keys(config.filters),
  ].forEach((key) => next.delete(key));

  if (state.page > 1) next.set(PAGE_PARAM, String(state.page));
  if (state.pageSize !== config.defaultPageSize) next.set(PAGE_SIZE_PARAM, String(state.pageSize));
  if (state.keyword) next.set(KEYWORD_PARAM, state.keyword);
  if (state.sortBy) next.set(SORT_BY_PARAM, state.sortBy);
  if (state.sortBy && state.sortOrder) next.set(SORT_ORDER_PARAM, state.sortOrder);
  Object.entries(state.filters).forEach(([key, value]) => {
    if (value) next.set(key, value);
  });
  return next;
}

export function clearListSearchParams(current: URLSearchParams, config: ListUrlConfig): URLSearchParams {
  const next = new URLSearchParams(current);
  [
    PAGE_PARAM,
    PAGE_SIZE_PARAM,
    KEYWORD_PARAM,
    SORT_BY_PARAM,
    SORT_ORDER_PARAM,
    ...Object.keys(config.filters),
  ].forEach((key) => next.delete(key));
  return next;
}

export function areListStatesEqual(left: ParsedListState, right: ParsedListState): boolean {
  return (
    left.page === right.page &&
    left.pageSize === right.pageSize &&
    left.keyword === right.keyword &&
    left.sortBy === right.sortBy &&
    left.sortOrder === right.sortOrder &&
    JSON.stringify(left.filters) === JSON.stringify(right.filters)
  );
}
