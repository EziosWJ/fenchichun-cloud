import { del, get, getPage, patch, post, put } from '../../lib/api/client';
import type { PaginatedResult } from '../../types/api';
import type {
  UserInput,
  UserListQuery,
  UserRecord,
  RoleBrief,
} from '../../types/system';

const BASE = '/system/user';

export function listUsers(query: UserListQuery): Promise<PaginatedResult<UserRecord>> {
  return getPage<UserRecord>(`${BASE}/page`, { ...query });
}

export function getUser(id: number): Promise<UserRecord> {
  return get<UserRecord>(`${BASE}/${id}`);
}

export function createUser(input: UserInput): Promise<void> {
  return post<void>(BASE, input);
}

export function updateUser(id: number, input: Omit<UserInput, 'username'>): Promise<void> {
  return put<void>(`${BASE}/${id}`, input);
}

export function deleteUser(id: number): Promise<void> {
  return del<void>(`${BASE}/${id}`);
}

export function deleteUsers(ids: number[]): Promise<void> {
  return post<void>(`${BASE}/batch-delete`, { ids });
}

export function setUserStatus(id: number, status: 0 | 1): Promise<void> {
  return patch<void>(`${BASE}/${id}/status`, { status });
}

export function assignUserRoles(id: number, roleIds: number[]): Promise<void> {
  return put<void>(`${BASE}/${id}/roles`, { roleIds });
}

export function resetUserPassword(id: number): Promise<{ password: string }> {
  return put<{ password: string }>(`${BASE}/${id}/reset-password`);
}

export function getRoleOptions(): Promise<RoleBrief[]> {
  return get<RoleBrief[]>('/system/role/options');
}
