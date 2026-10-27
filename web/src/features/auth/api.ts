import { get, post } from '../../lib/api/client';
import type { CurrentUser, CurrentUserMenu, LoginRequest, LoginResponse } from '../../types/auth';

export function login(request: LoginRequest): Promise<LoginResponse> {
  return post<LoginResponse>('/auth/login', request);
}

export function getCurrentUser(): Promise<CurrentUser> {
  return get<CurrentUser>('/auth/me');
}

export function getCurrentUserMenus(): Promise<CurrentUserMenu[]> {
  return get<CurrentUserMenu[]>('/auth/menus');
}

export function logout(): Promise<void> {
  return post<void>('/auth/logout');
}
