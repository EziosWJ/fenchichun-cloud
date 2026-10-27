import { put } from '../../lib/api/client';

export function changeCurrentPassword(input: { oldPassword: string; newPassword: string }): Promise<void> {
  return put<void>('/system/user/me/password', input);
}

export function updateCurrentAvatar(input: { avatar: string }): Promise<void> {
  return put<void>('/system/user/me/avatar', input);
}
