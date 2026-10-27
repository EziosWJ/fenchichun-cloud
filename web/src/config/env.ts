/** 业务 API 统一版本前缀；环境变量只表示 API 源地址。 */
export const API_PREFIX = '/api/v1';

function normalizeBasePath(value: string | undefined): string {
  const segment = (value ?? '/').trim().replace(/^\/+|\/+$/g, '');
  return segment ? '/' + segment : '/';
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function normalizeApiOrigin(value: string | undefined): string {
  const normalized = (value ?? '').trim().replace(/\/+$/, '');
  return normalized;
}

export const env = Object.freeze({
  basePath: normalizeBasePath(import.meta.env.VITE_BASE_PATH),
  apiOrigin: normalizeApiOrigin(import.meta.env.VITE_API_BASE_URL),
  enableMsw: parseBoolean(import.meta.env.VITE_ENABLE_MSW, false),
  isTest: import.meta.env.MODE === 'test',
  isDev: import.meta.env.DEV,
});
