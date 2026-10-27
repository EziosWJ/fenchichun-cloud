import type { StatusValue } from '../types/api';

export interface StatusOption<T extends string | number = string> {
  value: T;
  label: string;
  color: string;
}

export const ENABLED_STATUS_OPTIONS: StatusOption<StatusValue>[] = [
  { value: 1, label: '启用', color: 'green' },
  { value: 0, label: '停用', color: 'default' },
];

export const VISIBLE_OPTIONS: StatusOption<StatusValue>[] = [
  { value: 1, label: '显示', color: 'blue' },
  { value: 0, label: '隐藏', color: 'default' },
];

export const GENDER_OPTIONS = [
  { value: 'MALE', label: '男' },
  { value: 'FEMALE', label: '女' },
  { value: 'UNKNOWN', label: '未设置' },
] as const;

export const MENU_TYPE_OPTIONS = [
  { value: 'DIR', label: '目录' },
  { value: 'MENU', label: '菜单' },
  { value: 'LINK', label: '外链' },
] as const;

export const CONFIG_TYPE_OPTIONS = [
  { value: 'SYSTEM', label: '系统配置' },
  { value: 'CUSTOM', label: '自定义' },
] as const;

export const VALUE_TYPE_OPTIONS = [
  { value: 'TEXT', label: '文本' },
  { value: 'NUMBER', label: '数字' },
  { value: 'BOOLEAN', label: '布尔值' },
] as const;

export function statusLabel(status: StatusValue | undefined): string {
  return status === 1 ? '启用' : '停用';
}
