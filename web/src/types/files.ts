import type { BaseListQuery, StatusValue } from './api';

export interface FileRecord {
  id: number;
  originalName: string;
  storageName: string;
  extension: string;
  mimeType: string;
  fileSize: number;
  fileMd5?: string;
  storagePath?: string;
  accessUrl: string;
  businessModule?: string | null;
  status: StatusValue;
  remark?: string | null;
  createTime: string;
  updateTime?: string | null;
}

export interface FileListQuery extends BaseListQuery {
  originalName?: string;
  businessModule?: string;
  mimeType?: string;
  status?: StatusValue;
}

export interface FileUploadOptions {
  businessModule?: string;
  remark?: string;
}

export interface FileUploadFailedItem {
  fileName: string;
  message: string;
  index: number;
}

export interface FileUploadBatchResult {
  succeeded: FileRecord[];
  failed: FileUploadFailedItem[];
}
