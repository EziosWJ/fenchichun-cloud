import { del, get, getPage, patch, post, put } from '../../lib/api/client';
import type { PaginatedResult } from '../../types/api';
import type { MenuRecord, RoleDetail, RoleInput, RoleListQuery, RoleRecord } from '../../types/system';

const BASE = '/system/role';

export function listRoles(query: RoleListQuery): Promise<PaginatedResult<RoleRecord>> {
  return getPage<RoleRecord>(`${BASE}/page`, { ...query });
}

export function getRole(id: number): Promise<RoleDetail> {
  return get<RoleDetail>(`${BASE}/${id}`);
}

export function createRole(input: RoleInput): Promise<void> {
  return post<void>(BASE, input);
}

export function updateRole(id: number, input: RoleInput): Promise<void> {
  return put<void>(`${BASE}/${id}`, input);
}

export function deleteRole(id: number): Promise<void> {
  return del<void>(`${BASE}/${id}`);
}

export function deleteRoles(ids: number[]): Promise<void> {
  return post<void>(`${BASE}/batch-delete`, { ids });
}

export function setRoleStatus(id: number, status: 0 | 1): Promise<void> {
  return patch<void>(`${BASE}/${id}/status`, { status });
}

export function assignRoleMenus(id: number, menuIds: number[]): Promise<void> {
  return put<void>(`${BASE}/${id}/menus`, { menuIds });
}

export function getMenuTree(): Promise<MenuRecord[]> {
  return get<MenuRecord[]>('/system/menu/tree');
}
