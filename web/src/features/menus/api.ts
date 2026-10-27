import { del, get, getPage, patch, post, put } from '../../lib/api/client';
import type { PaginatedResult } from '../../types/api';
import type { MenuInput, MenuListQuery, MenuRecord } from '../../types/system';

const BASE = '/system/menu';

export function listMenus(query: MenuListQuery): Promise<PaginatedResult<MenuRecord>> {
  return getPage<MenuRecord>(`${BASE}/page`, { ...query });
}

export function getMenuTree(): Promise<MenuRecord[]> {
  return get<MenuRecord[]>(`${BASE}/tree`);
}

export function getMenu(id: number): Promise<MenuRecord> {
  return get<MenuRecord>(`${BASE}/${id}`);
}

export function createMenu(input: MenuInput): Promise<void> {
  return post<void>(BASE, input);
}

export function updateMenu(id: number, input: MenuInput): Promise<void> {
  return put<void>(`${BASE}/${id}`, input);
}

export function deleteMenu(id: number): Promise<void> {
  return del<void>(`${BASE}/${id}`);
}

export function deleteMenus(ids: number[]): Promise<void> {
  return post<void>(`${BASE}/batch-delete`, { ids });
}

export function setMenuStatus(id: number, status: 0 | 1): Promise<void> {
  return patch<void>(`${BASE}/${id}/status`, { status });
}
