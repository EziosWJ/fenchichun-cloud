import { del, get, getPage } from '../../lib/api/client';
import type { PaginatedResult } from '../../types/api';
import type {
  LoginLogListQuery,
  LoginLogRecord,
  OperLogDetail,
  OperLogListQuery,
  OperLogRecord,
} from '../../types/logs';

export function listLoginLogs(query: LoginLogListQuery): Promise<PaginatedResult<LoginLogRecord>> {
  return getPage<LoginLogRecord>('/system/login-log/page', { ...query });
}

export function getLoginLog(id: number): Promise<LoginLogRecord> {
  return get<LoginLogRecord>(`/system/login-log/${id}`);
}

export function clearLoginLogs(): Promise<void> {
  return del<void>('/system/login-log/clear');
}

export function listOperLogs(query: OperLogListQuery): Promise<PaginatedResult<OperLogRecord>> {
  return getPage<OperLogRecord>('/system/oper-log/page', { ...query });
}

export function getOperLog(id: number): Promise<OperLogDetail> {
  return get<OperLogDetail>(`/system/oper-log/${id}`);
}

export function clearOperLogs(): Promise<void> {
  return del<void>('/system/oper-log/clear');
}
