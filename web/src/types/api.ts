export type SortOrder = 'asc' | 'desc';

/** 后端统一响应包。业务失败也可能是 HTTP 200，因此必须检查 code。 */
export interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

/** 后端分页响应；数据访问层会转换为 items。 */
export interface BackendPage<T> {
  records: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BaseListQuery {
  page: number;
  pageSize: number;
}

export type StatusValue = 0 | 1;
export type BuiltinFlag = 0 | 1;

export interface ApiErrorBody {
  code?: number;
  message?: string;
  data?: unknown;
}
