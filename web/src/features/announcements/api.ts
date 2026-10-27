import { get, getPage, post, put } from '../../lib/api/client';
import type { PaginatedResult } from '../../types/api';
import type { Announcement, AnnouncementInput, AnnouncementScope } from '../../types/messages';

function scopeBase(scope: AnnouncementScope): string {
  return scope === 'PUBLIC' ? '/public/announcement' : '/system/announcement';
}

export function listAnnouncements(
  scope: AnnouncementScope,
  page: number,
  pageSize: number,
): Promise<PaginatedResult<Announcement>> {
  return getPage<Announcement>(`${scopeBase(scope)}/page`, { page, pageSize });
}

export function getAnnouncement(scope: AnnouncementScope, id: number): Promise<Announcement> {
  return get<Announcement>(`${scopeBase(scope)}/${id}`);
}

export function listAdminAnnouncements(page: number, pageSize: number): Promise<PaginatedResult<Announcement>> {
  return getPage<Announcement>('/system/announcement-admin/page', { page, pageSize });
}

export function saveAnnouncement(input: AnnouncementInput, id?: number): Promise<Announcement> {
  return id
    ? put<Announcement>(`/system/announcement/${id}`, input)
    : post<Announcement>('/system/announcement', input);
}

export function publishAnnouncement(id: number): Promise<void> {
  return put<void>(`/system/announcement/${id}/publish`);
}

export function withdrawAnnouncement(id: number): Promise<void> {
  return put<void>(`/system/announcement/${id}/withdraw`);
}
