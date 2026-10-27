import { create } from 'zustand';
import { getCurrentUser, getCurrentUserMenus, login as loginRequest, logout as logoutRequest } from '../features/auth/api';
import { setAuthTokenProvider, setUnauthorizedHandler } from '../lib/api/client';
import { queryClient } from '../lib/queryClient';
import { useTabsStore } from './useTabsStore';
import type { AuthStatus, CurrentUser, CurrentUserMenu } from '../types/auth';

const AUTH_STORAGE_KEY = 'base-admin-auth';

interface AuthState {
  token: string | null;
  user: CurrentUser | null;
  menus: CurrentUserMenu[];
  status: AuthStatus;
  login: (username: string, password: string) => Promise<CurrentUser>;
  bootstrap: () => Promise<void>;
  refreshUser: () => Promise<CurrentUser>;
  reloadMenus: () => Promise<CurrentUserMenu[]>;
  logout: () => Promise<void>;
  clearSession: () => void;
}

let bootstrapPromise: Promise<void> | null = null;

function readToken(): string | null {
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: unknown };
    return typeof parsed.token === 'string' && parsed.token ? parsed.token : null;
  } catch {
    return null;
  }
}

function writeToken(token: string | null): void {
  try {
    if (token) {
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token }));
    } else {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  } catch {
    // 存储不可用时仍允许本次会话使用内存中的登录状态。
  }
}

function clearClientCaches(): void {
  queryClient.clear();
  useTabsStore.getState().resetTabs();
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: readToken(),
  user: null,
  menus: [],
  status: 'idle',

  login: async (username, password) => {
    const result = await loginRequest({ username, password });
    const token = result.tokenValue;
    writeToken(token);
    set({ token, status: 'loading', user: null, menus: [] });
    try {
      const [user, menus] = await Promise.all([getCurrentUser(), getCurrentUserMenus()]);
      set({ user, menus, status: 'authenticated' });
      return user;
    } catch (error) {
      get().clearSession();
      throw error;
    }
  },

  bootstrap: async () => {
    const { token, status } = get();
    if (!token) {
      set({ status: 'anonymous', user: null, menus: [] });
      return;
    }
    if (status === 'authenticated') return;
    if (bootstrapPromise) return bootstrapPromise;

    set({ status: 'loading' });
    bootstrapPromise = (async () => {
      try {
        const [user, menus] = await Promise.all([getCurrentUser(), getCurrentUserMenus()]);
        set({ user, menus, status: 'authenticated' });
      } catch {
        get().clearSession();
      } finally {
        bootstrapPromise = null;
      }
    })();
    return bootstrapPromise;
  },

  refreshUser: async () => {
    const user = await getCurrentUser();
    set({ user, status: 'authenticated' });
    return user;
  },

  reloadMenus: async () => {
    const menus = await getCurrentUserMenus();
    set({ menus });
    return menus;
  },

  logout: async () => {
    try {
      if (get().token) await logoutRequest();
    } catch {
      // 退出以本地清理为准，接口失败不阻塞用户离开当前会话。
    } finally {
      get().clearSession();
    }
  },

  clearSession: () => {
    writeToken(null);
    clearClientCaches();
    set({ token: null, user: null, menus: [], status: 'anonymous' });
  },
}));

setAuthTokenProvider(() => useAuthStore.getState().token);
setUnauthorizedHandler(() => {
  const { status } = useAuthStore.getState();
  if (status === 'anonymous') return;
  useAuthStore.getState().clearSession();
});
