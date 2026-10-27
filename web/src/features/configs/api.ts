import { del, get, getPage, patch, post, put } from '../../lib/api/client';
import type { PaginatedResult } from '../../types/api';
import type { ConfigInput, ConfigListQuery, ConfigRecord } from '../../types/system';

const BASE = '/system/config';

export function listConfigs(query: ConfigListQuery): Promise<PaginatedResult<ConfigRecord>> {
  return getPage<ConfigRecord>(`${BASE}/page`, { ...query });
}

export function getConfig(id: number): Promise<ConfigRecord> {
  return get<ConfigRecord>(`${BASE}/${id}`);
}

export function createConfig(input: ConfigInput): Promise<void> {
  return post<void>(BASE, input);
}

export function updateConfig(id: number, input: ConfigInput): Promise<void> {
  return put<void>(`${BASE}/${id}`, input);
}

export function deleteConfig(id: number): Promise<void> {
  return del<void>(`${BASE}/${id}`);
}

export function deleteConfigs(ids: number[]): Promise<void> {
  return post<void>(`${BASE}/batch-delete`, { ids });
}

export function setConfigStatus(id: number, status: 0 | 1): Promise<void> {
  return patch<void>(`${BASE}/${id}/status`, { status });
}
