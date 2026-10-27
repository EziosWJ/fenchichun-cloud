import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SortOrder } from '../types/api';
import {
  clearListSearchParams,
  parseListSearchParams,
  writeListSearchParams,
  type ListUrlConfig,
  type ParsedListState,
} from '../utils/listQuery';

export interface ListUrlActions {
  setPage: (page: number, pageSize?: number) => void;
  setKeyword: (keyword: string, replace?: boolean) => void;
  setFilter: (key: string, value: string | undefined) => void;
  setFilters: (values: Record<string, string | undefined>) => void;
  applyFilters: (keyword: string, filters: Record<string, string | undefined>) => void;
  setSort: (sortBy: string | undefined, sortOrder?: SortOrder) => void;
  reset: () => void;
}

export function useListUrlState(config: ListUrlConfig): {
  state: ParsedListState;
  actions: ListUrlActions;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const state = useMemo(() => parseListSearchParams(searchParams, config), [searchParams, config]);

  const update = useCallback(
    (
      mutate: (draft: ParsedListState) => void,
      options?: { replace?: boolean; resetPage?: boolean },
    ) => {
      setSearchParams(
        (current) => {
          const draft = parseListSearchParams(current, config);
          if (options?.resetPage) draft.page = 1;
          mutate(draft);
          return writeListSearchParams(current, draft, config);
        },
        { replace: options?.replace },
      );
    },
    [config, setSearchParams],
  );

  const actions = useMemo<ListUrlActions>(
    () => ({
      setPage: (page, pageSize) =>
        update((draft) => {
          draft.page = Math.max(1, page);
          if (pageSize) draft.pageSize = pageSize;
        }),
      setKeyword: (keyword, replace = false) =>
        update((draft) => {
          draft.keyword = keyword.trim().slice(0, 100);
        }, { replace, resetPage: true }),
      setFilter: (key, value) =>
        update((draft) => {
          if (value) draft.filters[key] = value;
          else delete draft.filters[key];
        }, { resetPage: true }),
      setFilters: (values) =>
        update((draft) => {
          Object.entries(values).forEach(([key, value]) => {
            if (value) draft.filters[key] = value;
            else delete draft.filters[key];
          });
        }, { resetPage: true }),
      applyFilters: (keyword, filters) =>
        update((draft) => {
          draft.keyword = keyword.trim().slice(0, 100);
          draft.filters = {};
          Object.entries(filters).forEach(([key, value]) => {
            if (value) draft.filters[key] = value;
          });
        }, { resetPage: true }),
      setSort: (sortBy, sortOrder) =>
        update((draft) => {
          draft.sortBy = sortBy;
          draft.sortOrder = sortBy ? sortOrder ?? 'asc' : undefined;
        }, { resetPage: true }),
      reset: () => setSearchParams((current) => clearListSearchParams(current, config)),
    }),
    [config, setSearchParams, update],
  );

  return { state, actions };
}
