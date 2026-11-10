import type {
  Session,
} from './session.ts'

export type ErrorKind = 'http' | 'business' | 'timeout' | 'network' | 'format'
export class ApiError extends Error {
  kind: ErrorKind
  code?: number
  constructor(kind: ErrorKind, message: string, code?: number) {
    super(message)
    this.kind = kind
    this.code = code
  }
}
export interface RequestOptions {
  path: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  data?: Record<string, unknown>
  headers?: Record<string, string>
  anonymous?: boolean
  timeout?: number
}
export interface TransportOptions {
  url: string
  method: NonNullable<RequestOptions['method']>
  data?: Record<string, unknown>
  header: Record<string, string>
  timeout: number
}
export type Transport = (options: TransportOptions) => Promise<{
  statusCode: number
  data: unknown
}>
export function createClient(baseURL: string, session: Session, transport: Transport, expired: () => void) {
  return async function request<T>(options: RequestOptions): Promise<T> {
    const snapshot = session.snapshot()
    const header: Record<string, string> = {
      'content-type': 'application/json',
      ...options.headers,
    }
    if (!options.anonymous && snapshot.token) {
      header.Authorization = /^Bearer\s/i.test(snapshot.token)
        ? snapshot.token
        : `Bearer ${snapshot.token}`
    }
    let response
    try {
      response = await transport({
        url: `${baseURL.replace(/\/$/, '')}/${options.path.replace(/^\//, '')}`,
        method: options.method ?? 'GET',
        data: options.data,
        header,
        timeout: options.timeout ?? 15000,
      })
    }
    catch (error) {
      if (error instanceof ApiError) {
        throw error
      }
      const message = error instanceof Error ? error.message : String(error)
      throw new ApiError(/timeout/i.test(message) ? 'timeout' : 'network', /timeout/i.test(message) ? '请求超时，请重试' : '网络异常，请检查连接')
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      if (response.statusCode === 401 && !options.anonymous && snapshot.token && snapshot.revision === session.snapshot().revision) {
        session.clear()
        expired()
      }
      const body = response.data
      const serverMessage = body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
        ? body.message
        : ''
      throw new ApiError(
        'http',
        response.statusCode === 401 ? '登录已过期' : serverMessage || `请求失败（${response.statusCode}）`,
        response.statusCode,
      )
    }
    const body = response.data
    if (!body || typeof body !== 'object' || !('code' in body) || typeof body.code !== 'number' || !('message' in body) || typeof body.message !== 'string' || !('data' in body)) {
      throw new ApiError('format', '服务响应格式错误')
    }
    if (body.code !== 200) {
      throw new ApiError('business', body.message || '操作失败', body.code)
    }
    return body.data as T
  }
}
