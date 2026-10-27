import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { API_PREFIX, env } from '../../config/env';
import type { ApiEnvelope, BackendPage, PaginatedResult } from '../../types/api';
import { ApiError, classifyApiCode, normalizeApiError } from './errors';

type TokenProvider = () => string | null | undefined;
type UnauthorizedHandler = () => void;

let tokenProvider: TokenProvider | null = null;
let unauthorizedHandler: UnauthorizedHandler | null = null;
let handlingUnauthorized = false;

export const apiClient = axios.create({
  baseURL: `${env.apiOrigin}${API_PREFIX}`,
  timeout: 15_000,
  headers: { Accept: 'application/json' },
});

export function setAuthTokenProvider(provider: TokenProvider | null): void {
  tokenProvider = provider;
}

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

function notifyUnauthorized(): void {
  if (handlingUnauthorized) return;
  handlingUnauthorized = true;
  try {
    unauthorizedHandler?.();
  } finally {
    handlingUnauthorized = false;
  }
}

apiClient.interceptors.request.use((config) => {
  const token = tokenProvider?.();
  if (token) {
    const value = /^Bearer\s/i.test(token) ? token : `Bearer ${token}`;
    config.headers.set('Authorization', value);
  }
  return config;
});

/** 兼容 HTTP 错误以及 HTTP 200 + 业务码失败。 */
function unwrap<T>(response: AxiosResponse<ApiEnvelope<T>>): T {
  const body = response.data;
  if (!body || typeof body !== 'object' || typeof body.code !== 'number') {
    return body as unknown as T;
  }
  if (body.code !== 200) {
    const kind = classifyApiCode(body.code, response.status);
    const error = new ApiError(kind, body.message || '请求失败', {
      status: response.status,
      code: body.code,
      data: body.data,
      response,
    });
    throw error;
  }
  return body.data;
}

export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  try {
    const response = await apiClient.request<ApiEnvelope<T>>(config);
    return unwrap(response);
  } catch (error) {
    const normalized = normalizeApiError(error);
    if (normalized.kind === 'unauthorized') notifyUnauthorized();
    throw normalized;
  }
}

export function toPaginated<T>(page: BackendPage<T>): PaginatedResult<T> {
  return {
    items: Array.isArray(page.records) ? page.records : [],
    total: page.total ?? 0,
    page: page.page ?? 1,
    pageSize: page.pageSize ?? 10,
  };
}

export async function get<T>(
  url: string,
  params?: Record<string, unknown>,
  config?: AxiosRequestConfig,
): Promise<T> {
  return request<T>({ ...config, url, method: 'GET', params });
}

export async function getPage<T>(url: string, params?: Record<string, unknown>): Promise<PaginatedResult<T>> {
  const page = await request<BackendPage<T>>({ url, method: 'GET', params });
  return toPaginated(page);
}

export async function post<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  return request<T>({ ...config, url, method: 'POST', data: body });
}

export async function put<T>(url: string, body?: unknown): Promise<T> {
  return request<T>({ url, method: 'PUT', data: body });
}

export async function patch<T>(url: string, body?: unknown): Promise<T> {
  return request<T>({ url, method: 'PATCH', data: body });
}

export async function del<T>(url: string, body?: unknown): Promise<T> {
  return request<T>({ url, method: 'DELETE', data: body });
}

/** 下载二进制内容；JSON 业务失败由 unwrap 统一处理。 */
export async function getBlob(url: string, params?: Record<string, unknown>): Promise<Blob> {
  try {
    const response = await apiClient.request<Blob>({
      url,
      method: 'GET',
      params,
      responseType: 'blob',
    });
    const contentType = String(response.headers['content-type'] ?? '');
    if (contentType.includes('application/json')) {
      const text = await response.data.text();
      let body: ApiEnvelope<unknown> | null = null;
      try {
        body = JSON.parse(text) as ApiEnvelope<unknown>;
      } catch {
        body = null;
      }
      if (body && body.code !== 200) {
        const kind = classifyApiCode(body.code, response.status);
        const error = new ApiError(kind, body.message || '请求失败', {
          status: response.status,
          code: body.code,
          data: body.data,
          response,
        });
        if (kind === 'unauthorized') notifyUnauthorized();
        throw error;
      }
      throw new ApiError('server', '服务端返回了 JSON 而非文件流。', {
        status: response.status,
        response,
      });
    }
    return response.data;
  } catch (blobError) {
    const normalized = normalizeApiError(blobError);
    if (normalized.kind === 'unauthorized') notifyUnauthorized();
    throw normalized;
  }
}

/** 读取带鉴权的文件资源；accessUrl 已包含 /api/v1 前缀。 */
export async function getAssetBlob(accessUrl: string): Promise<Blob> {
  const url = env.apiOrigin && accessUrl.startsWith('/') ? `${env.apiOrigin}${accessUrl}` : accessUrl;
  try {
    const response = await apiClient.request<Blob>({
      url,
      baseURL: '',
      method: 'GET',
      responseType: 'blob',
    });
    const contentType = String(response.headers['content-type'] ?? '');
    if (contentType.includes('application/json')) {
      const text = await response.data.text();
      const body = JSON.parse(text) as ApiEnvelope<unknown>;
      const kind = classifyApiCode(body.code, response.status);
      const error = new ApiError(kind, body.message || '文件读取失败', {
        status: response.status,
        code: body.code,
        data: body.data,
        response,
      });
      if (kind === 'unauthorized') notifyUnauthorized();
      throw error;
    }
    return response.data;
  } catch (assetError) {
    const normalized = normalizeApiError(assetError);
    if (normalized.kind === 'unauthorized') notifyUnauthorized();
    throw normalized;
  }
}

export function buildApiUrl(path: string): string {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${env.apiOrigin}${API_PREFIX}${suffix}`;
}
