import { del, get, post, put } from '../../lib/api/client';

export interface Granary {
  id: number;
  siteCode: string;
  name: string;
  enabled: boolean;
  remark: string;
  createdAt: string;
  updatedAt: string;
}

export interface GranaryInput {
  siteCode: string;
  name: string;
  enabled: boolean;
  remark: string;
}

export const granaries = (params?: Record<string, unknown>) => get<Granary[]>('/granaries', params);

export const saveGranary = (input: GranaryInput, id?: number) =>
  id ? put<Granary>(`/granaries/${id}`, input) : post<Granary>('/granaries', input);

export const deleteGranary = (id: number) => del<{ id: number }>(`/granaries/${id}`);
