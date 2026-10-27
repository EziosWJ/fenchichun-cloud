import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AxiosResponse } from 'axios';
import {
  apiClient,
  getPage,
  request,
  setAuthTokenProvider,
  setUnauthorizedHandler,
  toPaginated,
} from '../../../src/lib/api/client';
import { ApiError, classifyApiCode } from '../../../src/lib/api/errors';

const originalAdapter = apiClient.defaults.adapter;

function respond(body: unknown, status = 200): void {
  apiClient.defaults.adapter = async (config) =>
    ({
      data: body,
      status,
      statusText: 'OK',
      headers: {},
      config,
    }) as AxiosResponse;
}

afterEach(() => {
  apiClient.defaults.adapter = originalAdapter;
  setAuthTokenProvider(null);
  setUnauthorizedHandler(null);
});

describe('API envelope handling', () => {
  it('returns data for business success and converts backend records to items', async () => {
    respond({ code: 200, message: 'success', data: { records: [{ id: 1 }], total: 1, page: 1, pageSize: 10 } });
    const page = await getPage<{ id: number }>('/system/user/page', { page: 1, pageSize: 10 });
    expect(page.items).toEqual([{ id: 1 }]);
    expect(page.total).toBe(1);

    expect(toPaginated({ records: [], total: 0, page: 2, pageSize: 20 })).toEqual({
      items: [],
      total: 0,
      page: 2,
      pageSize: 20,
    });
  });

  it('throws for business failures returned with HTTP 200', async () => {
    respond({ code: 400, message: '参数错误', data: { username: '必填' } }, 200);
    await expect(request({ url: '/system/user', method: 'POST', data: {} })).rejects.toMatchObject({
      name: 'ApiError',
      kind: 'client',
      message: '参数错误',
      code: 400,
    });
  });

  it('classifies HTTP 200 + code 403 as forbidden and invokes the unauthorized handler only for 401', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);

    respond({ code: 403, message: '无权限', data: null }, 200);
    await expect(request({ url: '/system/log/clear', method: 'DELETE' })).rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();

    respond({ code: 401, message: '未登录', data: null }, 401);
    await expect(request({ url: '/auth/me', method: 'GET' })).rejects.toMatchObject({ kind: 'unauthorized' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('sends the stored tokenValue as the Authorization header', async () => {
    setAuthTokenProvider(() => 'Bearer signed-jwt');
    let header: unknown;
    apiClient.defaults.adapter = async (config) => {
      header = config.headers.get('Authorization');
      return {
        data: { code: 200, message: 'success', data: null },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      } as AxiosResponse;
    };
    await request({ url: '/auth/me', method: 'GET' });
    expect(header).toBe('Bearer signed-jwt');
  });

  it('classifies response codes consistently', () => {
    expect(classifyApiCode(401)).toBe('unauthorized');
    expect(classifyApiCode(403)).toBe('forbidden');
    expect(classifyApiCode(404)).toBe('notFound');
    expect(classifyApiCode(500)).toBe('server');
    expect(classifyApiCode(400)).toBe('client');
    expect(classifyApiCode(199)).toBe('business');
  });
});
