import axios, { type AxiosError, type AxiosResponse } from 'axios';
import type { ApiErrorBody } from '../../types/api';

export type ApiErrorKind =
  | 'network'
  | 'timeout'
  | 'canceled'
  | 'business'
  | 'unauthorized'
  | 'forbidden'
  | 'notFound'
  | 'client'
  | 'server'
  | 'unknown';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly code?: number;
  readonly data?: unknown;
  readonly original: unknown;
  readonly response?: AxiosResponse;

  constructor(
    kind: ApiErrorKind,
    message: string,
    options: {
      status?: number;
      code?: number;
      data?: unknown;
      original?: unknown;
      response?: AxiosResponse;
    } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = options.status;
    this.code = options.code;
    this.data = options.data;
    this.original = options.original;
    this.response = options.response;
  }
}

export function classifyApiCode(code: number | undefined, status?: number): ApiErrorKind {
  const value = code ?? status;
  if (value === 401) return 'unauthorized';
  if (value === 403) return 'forbidden';
  if (value === 404) return 'notFound';
  if (value !== undefined && value >= 500) return 'server';
  if (value !== undefined && value >= 400) return 'client';
  return 'business';
}

function defaultMessage(kind: ApiErrorKind): string {
  switch (kind) {
    case 'network':
      return '网络连接失败，请检查网络后重试。';
    case 'timeout':
      return '请求超时，请稍后重试。';
    case 'canceled':
      return '请求已取消。';
    case 'unauthorized':
      return '登录状态已失效，请重新登录。';
    case 'forbidden':
      return '没有执行该操作的权限。';
    case 'notFound':
      return '数据不存在或已被删除。';
    case 'server':
      return '服务暂时不可用，请稍后重试。';
    case 'client':
      return '请求参数有误，请检查后重试。';
    case 'business':
      return '操作未能完成，请稍后重试。';
    default:
      return '发生未知错误，请稍后重试。';
  }
}

export function normalizeApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (axios.isCancel(error) || (axios.isAxiosError(error) && error.code === 'ERR_CANCELED')) {
    return new ApiError('canceled', defaultMessage('canceled'), { original: error });
  }

  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ApiErrorBody>;
    const status = axiosError.response?.status;
    const body = axiosError.response?.data;
    const isTimeout =
      axiosError.code === 'ECONNABORTED' ||
      axiosError.code === 'ETIMEDOUT' ||
      /timeout/i.test(axiosError.message);

    if (isTimeout) {
      return new ApiError('timeout', defaultMessage('timeout'), {
        status,
        original: error,
        response: axiosError.response,
      });
    }

    const code = typeof body?.code === 'number' ? body.code : status;
    const kind = status === undefined ? 'network' : classifyApiCode(code, status);
    const message = typeof body?.message === 'string' && body.message.trim() ? body.message : defaultMessage(kind);
    return new ApiError(kind, message, {
      status,
      code: typeof body?.code === 'number' ? body.code : undefined,
      data: body?.data,
      original: error,
      response: axiosError.response,
    });
  }

  if (error instanceof Error && error.message) {
    return new ApiError('unknown', error.message, { original: error });
  }

  return new ApiError('unknown', defaultMessage('unknown'), { original: error });
}

export function getApiErrorMessage(error: unknown): string {
  return normalizeApiError(error).message;
}

export function isRetryableApiError(error: unknown): boolean {
  const normalized = normalizeApiError(error);
  return normalized.kind === 'network' || normalized.kind === 'timeout' || normalized.kind === 'server';
}

export function isUnauthorizedError(error: unknown): boolean {
  return normalizeApiError(error).kind === 'unauthorized';
}
