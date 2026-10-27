import { get, getPage, post, put } from '../../lib/api/client';
import type { PaginatedResult } from '../../types/api';
import type {
  NotificationListQuery,
  NotificationPublishInput,
  NotificationRecord,
} from '../../types/messages';

const BASE = '/system/notification';

export function listNotifications(query: NotificationListQuery): Promise<PaginatedResult<NotificationRecord>> {
  return getPage<NotificationRecord>(`${BASE}/page`, { ...query });
}

export function getNotification(id: number): Promise<NotificationRecord> {
  return get<NotificationRecord>(`${BASE}/${id}`);
}

export function getUnreadCount(): Promise<number> {
  return get<number>(`${BASE}/unread-count`);
}

export function markNotificationRead(id: number): Promise<void> {
  return put<void>(`${BASE}/${id}/read`);
}

export function markAllNotificationsRead(): Promise<void> {
  return put<void>(`${BASE}/read-all`);
}

export function listAdminNotifications(query: NotificationListQuery): Promise<PaginatedResult<NotificationRecord>> {
  return getPage<NotificationRecord>('/system/notification-admin/page', { ...query });
}

export function publishNotification(input: NotificationPublishInput): Promise<void> {
  return post<void>(BASE, input);
}
