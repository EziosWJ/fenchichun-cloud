import type { ParsedListState } from '../../utils/listQuery';

export function analyticsFilterParams(
  state: ParsedListState,
  defaults: { from: string; to: string },
): Record<string, unknown> {
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
