import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/features/auth/api', () => ({
  login: vi.fn(async () => ({ tokenName: 'Authorization', tokenValue: 'Bearer token', expiresIn: 7200 })),
  getCurrentUser: vi.fn(async () => ({
    id: 1,
    username: 'admin',
    nickname: '管理员',
    roles: [{ id: 1, roleName: '超级管理员', roleCode: 'ADMIN' }],
  })),
  getCurrentUserMenus: vi.fn(async () => []),
  logout: vi.fn(async () => undefined),
}));

import { useAuthStore } from '../../src/stores/useAuthStore';

describe('auth store', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useAuthStore.setState({ token: null, user: null, menus: [], status: 'idle' });
  });

  it('stores the token and loads the current user and menus after login', async () => {
    const user = await useAuthStore.getState().login('admin', 'admin123');
    expect(user.username).toBe('admin');
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().token).toBe('Bearer token');
    expect(window.localStorage.getItem('base-admin-auth')).toContain('Bearer token');
  });

  it('restores an existing token through bootstrap', async () => {
    window.localStorage.setItem('base-admin-auth', JSON.stringify({ token: 'Bearer token' }));
    useAuthStore.setState({ token: 'Bearer token', status: 'idle' });
    await useAuthStore.getState().bootstrap();
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().user?.username).toBe('admin');
  });

  it('clears token, user and menus on logout', async () => {
    await useAuthStore.getState().login('admin', 'admin123');
    await useAuthStore.getState().logout();
    expect(useAuthStore.getState().status).toBe('anonymous');
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().menus).toEqual([]);
    expect(window.localStorage.getItem('base-admin-auth')).toBeNull();
  });
});
