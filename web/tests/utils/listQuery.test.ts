import { describe, expect, it } from 'vitest';
import {
  areListStatesEqual,
  clearListSearchParams,
  parseListSearchParams,
  writeListSearchParams,
  type ListUrlConfig,
} from '../../src/utils/listQuery';

const config: ListUrlConfig = {
  filters: {
    status: ['active', 'inactive'],
    dateFrom: 'date',
    customerId: 'text',
  },
  sortKeys: ['name', 'createdAt'],
  pageSizeOptions: [10, 20],
  defaultPageSize: 10,
};

describe('list query URL state', () => {
  it('parses valid values and defaults missing ones', () => {
    const state = parseListSearchParams(
      new URLSearchParams(
        'page=2&pageSize=20&q=%20星云%20&sortBy=name&sortOrder=desc&status=active&dateFrom=2026-01-01&customerId=c-001',
      ),
      config,
    );

    expect(state).toEqual({
      page: 2,
      pageSize: 20,
      keyword: '星云',
      sortBy: 'name',
      sortOrder: 'desc',
      filters: { status: 'active', dateFrom: '2026-01-01', customerId: 'c-001' },
    });
  });

  it('drops invalid page, page size, sort, enum, date and oversized text values', () => {
    const state = parseListSearchParams(
      new URLSearchParams(
        `page=0&pageSize=999&sortBy=password&sortOrder=sideways&status=unknown&dateFrom=2026-02-30&customerId=${'x'.repeat(101)}`,
      ),
      config,
    );

    expect(state).toEqual({
      page: 1,
      pageSize: 10,
      keyword: '',
      sortBy: undefined,
      sortOrder: undefined,
      filters: {},
    });
  });

  it('uses a valid sort order only when a valid sort field exists', () => {
    const state = parseListSearchParams(new URLSearchParams('sortOrder=asc'), config);
    expect(state.sortBy).toBeUndefined();
    expect(state.sortOrder).toBeUndefined();
  });

  it('writes only non-default list parameters and preserves unrelated params', () => {
    const current = new URLSearchParams('utm=abc&page=3&status=active');
    const next = writeListSearchParams(
      current,
      {
        page: 2,
        pageSize: 20,
        keyword: '客户',
        sortBy: 'createdAt',
        sortOrder: 'asc',
        filters: { status: 'inactive' },
      },
      config,
    );

    expect(next.get('utm')).toBe('abc');
    expect(next.get('page')).toBe('2');
    expect(next.get('pageSize')).toBe('20');
    expect(next.get('q')).toBe('客户');
    expect(next.get('sortBy')).toBe('createdAt');
    expect(next.get('sortOrder')).toBe('asc');
    expect(next.get('status')).toBe('inactive');
  });

  it('omits default pagination and clears stale filter params', () => {
    const next = writeListSearchParams(
      new URLSearchParams('page=5&pageSize=20&status=active&customerId=c-1&keep=1'),
      { page: 1, pageSize: 10, keyword: '', filters: {} },
      config,
    );

    expect(next.get('page')).toBeNull();
    expect(next.get('pageSize')).toBeNull();
    expect(next.get('status')).toBeNull();
    expect(next.get('customerId')).toBeNull();
    expect(next.get('keep')).toBe('1');
  });

  it('clears list parameters while preserving unrelated params', () => {
    const cleared = clearListSearchParams(new URLSearchParams('page=2&q=x&utm=1'), config);
    expect(cleared.get('page')).toBeNull();
    expect(cleared.get('q')).toBeNull();
    expect(cleared.get('utm')).toBe('1');
  });

  it('compares normalized list states structurally', () => {
    const left = parseListSearchParams(new URLSearchParams('page=1&q=x'), config);
    const right = parseListSearchParams(new URLSearchParams('q=x'), config);
    const different = parseListSearchParams(new URLSearchParams('q=y'), config);

    expect(areListStatesEqual(left, right)).toBe(true);
    expect(areListStatesEqual(left, different)).toBe(false);
  });
});
