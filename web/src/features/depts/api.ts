import { del, get, getPage, patch, post, put } from '../../lib/api/client';
import type { PaginatedResult } from '../../types/api';
import type { DeptInput, DeptListQuery, DeptOption, DeptRecord } from '../../types/system';

const BASE = '/system/dept';

export function listDepts(query: DeptListQuery): Promise<PaginatedResult<DeptRecord>> {
  return getPage<DeptRecord>(`${BASE}/page`, { ...query });
}

export function getDeptTree(): Promise<DeptRecord[]> {
  return get<DeptRecord[]>(`${BASE}/tree`);
}

export function getDeptOptions(): Promise<DeptOption[]> {
  return get<DeptOption[]>(`${BASE}/options`);
}

export function getDept(id: number): Promise<DeptRecord> {
  return get<DeptRecord>(`${BASE}/${id}`);
}

export function createDept(input: DeptInput): Promise<void> {
  return post<void>(BASE, input);
}

export function updateDept(id: number, input: DeptInput): Promise<void> {
  return put<void>(`${BASE}/${id}`, input);
}

export function deleteDept(id: number): Promise<void> {
  return del<void>(`${BASE}/${id}`);
}

export function deleteDepts(ids: number[]): Promise<void> {
  return post<void>(`${BASE}/batch-delete`, { ids });
}

export function setDeptStatus(id: number, status: 0 | 1): Promise<void> {
  return patch<void>(`${BASE}/${id}/status`, { status });
}
