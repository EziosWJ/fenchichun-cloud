import { paths } from '../../config/paths';
import type { TrendPoint } from './api';
import type { ParsedListState } from '../../utils/listQuery';

export function analyticsFilterParams(
  state: ParsedListState,
  defaults: { from: string; to: string },
) {
  return {
    from: state.filters.from || defaults.from,
    to: state.filters.to || defaults.to,
    siteCode: state.filters.siteCode || undefined,
    direction: state.filters.direction || undefined,
    materialCode: state.filters.materialCode || undefined,
    categoryCode: state.filters.categoryCode || undefined,
    partyCode: state.filters.partyCode || undefined,
    keyword: state.keyword || undefined,
    compare: state.filters.compare || 'previous',
    granularity: state.filters.granularity || undefined,
    page: state.page,
    pageSize: state.pageSize,
    sortBy: state.sortBy || undefined,
    sortOrder: state.sortOrder || undefined,
  };
}

const reportFilters = ['from', 'to', 'siteCode', 'direction', 'materialCode', 'categoryCode', 'partyCode', 'keyword', 'compare', 'granularity'];
const ticketFilters = ['from', 'to', 'siteCode', 'direction', 'materialCode', 'partyCode', 'status', 'keyword'];

function filteredHref(path: string, keys: string[], filters: Record<string, unknown>): string {
  const query = new URLSearchParams();
  for (const key of keys) {
    const value = filters[key];
    if (typeof value === 'string' && value) query.set(key, value);
  }
  return `${path}?${query}`;
}

export function analyticsHref(path: string, filters: Record<string, unknown>): string {
  return filteredHref(path, reportFilters, filters);
}

export function analyticsTicketsHref(filters: Record<string, unknown>): string {
  return filteredHref(paths.weighbridgeTickets, ticketFilters, { status: 'valid', ...filters });
}

export function analyticsPeriodFilters(filters: Record<string, unknown>, point: TrendPoint) {
  const { from, to } = filters;
  return {
    ...filters,
    from: typeof from === 'string' && from > point.periodStart ? from : point.periodStart,
    to: typeof to === 'string' && to < point.periodEnd ? to : point.periodEnd,
  };
}
