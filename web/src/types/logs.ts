import type { BaseListQuery } from './api';

export interface LoginLogRecord {
  id: number;
  username: string;
  loginStatus: string;
  loginIp: string;
  loginLocation?: string | null;
  browser: string;
  os: string;
  userAgent?: string | null;
  message: string;
  loginTime: string;
  createTime?: string | null;
}

export interface LoginLogListQuery extends BaseListQuery {
  username?: string;
  loginStatus?: string;
  loginIp?: string;
}

export interface OperLogRecord {
  id: number;
  moduleName: string;
  operationType: string;
  requestMethod: string;
  requestUrl: string;
  operatorName: string;
  operatorIp: string;
  operationStatus: string;
  costTime: number;
  operationTime: string;
}

export interface OperLogDetail extends OperLogRecord {
  requestParams?: string | null;
  responseResult?: string | null;
  errorMessage?: string | null;
}

export interface OperLogListQuery extends BaseListQuery {
  moduleName?: string;
  operationType?: string;
  operatorName?: string;
  operationStatus?: string;
}
