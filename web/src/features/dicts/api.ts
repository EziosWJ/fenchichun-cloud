import { del, get, getPage, patch, post, put } from '../../lib/api/client';
import type { PaginatedResult } from '../../types/api';
import type {
  DictDataInput,
  DictDataListQuery,
  DictDataRecord,
  DictOption,
  DictTypeInput,
  DictTypeListQuery,
  DictTypeRecord,
} from '../../types/system';

const TYPE_BASE = '/system/dict-type';
const DATA_BASE = '/system/dict-data';

export function listDictTypes(query: DictTypeListQuery): Promise<PaginatedResult<DictTypeRecord>> {
  return getPage<DictTypeRecord>(`${TYPE_BASE}/page`, { ...query });
}

export function createDictType(input: DictTypeInput): Promise<void> {
  return post<void>(TYPE_BASE, input);
}

export function updateDictType(id: number, input: DictTypeInput): Promise<void> {
  return put<void>(`${TYPE_BASE}/${id}`, input);
}

export function deleteDictType(id: number): Promise<void> {
  return del<void>(`${TYPE_BASE}/${id}`);
}

export function setDictTypeStatus(id: number, status: 0 | 1): Promise<void> {
  return patch<void>(`${TYPE_BASE}/${id}/status`, { status });
}

export function listDictData(query: DictDataListQuery): Promise<PaginatedResult<DictDataRecord>> {
  return getPage<DictDataRecord>(`${DATA_BASE}/page`, { ...query });
}

export function createDictData(input: DictDataInput): Promise<void> {
  return post<void>(DATA_BASE, input);
}

export function updateDictData(id: number, input: DictDataInput): Promise<void> {
  return put<void>(`${DATA_BASE}/${id}`, input);
}

export function deleteDictData(id: number): Promise<void> {
  return del<void>(`${DATA_BASE}/${id}`);
}

export function getDictItems(dictCode: string): Promise<DictOption[]> {
  return get<DictOption[]>(`/system/dict/${encodeURIComponent(dictCode)}/items`);
}
