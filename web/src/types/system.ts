import type { BaseListQuery, BuiltinFlag, StatusValue } from './api';

export type Gender = 'MALE' | 'FEMALE' | 'UNKNOWN';

export interface RoleBrief {
  id: number;
  roleName: string;
  roleCode: string;
  status?: StatusValue;
}

export interface UserRecord {
  id: number;
  username: string;
  nickname: string;
  phone?: string | null;
  email?: string | null;
  avatar?: string | null;
  gender?: Gender | null;
  deptId?: number | null;
  status: StatusValue;
  isBuiltin: BuiltinFlag;
  lastLoginTime?: string | null;
  lastLoginIp?: string | null;
  remark?: string | null;
  createTime?: string | null;
  updateTime?: string | null;
  deptName?: string | null;
  roles?: RoleBrief[];
}

export interface UserListQuery extends BaseListQuery {
  keyword?: string;
  username?: string;
  nickname?: string;
  phone?: string;
  email?: string;
  status?: StatusValue;
  deptId?: number;
}

export interface UserInput {
  username?: string;
  nickname: string;
  phone?: string;
  email?: string;
  avatar?: string;
  gender?: Gender;
  deptId?: number;
  status: StatusValue;
  remark?: string;
}

export interface RoleRecord {
  id: number;
  roleName: string;
  roleCode: string;
  status: StatusValue;
  sortOrder: number;
  isBuiltin: BuiltinFlag;
  remark?: string | null;
  createTime?: string | null;
  updateTime?: string | null;
}

export interface RoleDetail extends RoleRecord {
  menuIds: number[];
}

export interface RoleListQuery extends BaseListQuery {
  roleName?: string;
  roleCode?: string;
  status?: StatusValue;
}

export interface RoleInput {
  roleName: string;
  roleCode: string;
  status: StatusValue;
  sortOrder: number;
  remark?: string;
}

export interface MenuRecord {
  id: number;
  parentId: number;
  menuName: string;
  menuType: 'DIR' | 'MENU' | 'LINK';
  path: string | null;
  component: string | null;
  externalUrl?: string | null;
  icon: string | null;
  permissionCode: string | null;
  sortOrder: number;
  visible: StatusValue;
  status: StatusValue;
  isBuiltin?: BuiltinFlag;
  remark?: string | null;
  createTime?: string | null;
  updateTime?: string | null;
  children?: MenuRecord[];
}

export interface MenuListQuery extends BaseListQuery {
  menuName?: string;
  menuType?: MenuRecord['menuType'];
  status?: StatusValue;
  visible?: StatusValue;
}

export interface MenuInput {
  parentId: number;
  menuName: string;
  menuType: MenuRecord['menuType'];
  path?: string;
  component?: string;
  externalUrl?: string;
  icon?: string;
  permissionCode?: string;
  sortOrder: number;
  visible: StatusValue;
  status: StatusValue;
  remark?: string;
}

export interface DeptRecord {
  id: number;
  parentId: number;
  deptName: string;
  deptCode: string;
  leader?: string | null;
  phone?: string | null;
  email?: string | null;
  sortOrder: number;
  status: StatusValue;
  isBuiltin: BuiltinFlag;
  remark?: string | null;
  createTime?: string | null;
  updateTime?: string | null;
  children?: DeptRecord[];
}

export interface DeptOption {
  id: number;
  parentId: number;
  deptName: string;
  deptCode?: string;
  disabled?: boolean;
  children?: DeptOption[];
}

export interface DeptListQuery extends BaseListQuery {
  deptName?: string;
  deptCode?: string;
  status?: StatusValue;
}

export interface DeptInput {
  parentId: number;
  deptName: string;
  deptCode: string;
  leader?: string;
  phone?: string;
  email?: string;
  sortOrder: number;
  status: StatusValue;
  remark?: string;
}

export interface DictTypeRecord {
  id: number;
  dictName: string;
  dictCode: string;
  status: StatusValue;
  sortOrder: number;
  isBuiltin: BuiltinFlag;
  remark?: string | null;
  createTime?: string | null;
  updateTime?: string | null;
}

export interface DictTypeListQuery extends BaseListQuery {
  dictName?: string;
  dictCode?: string;
  status?: StatusValue;
}

export interface DictTypeInput {
  dictName: string;
  dictCode: string;
  status: StatusValue;
  sortOrder: number;
  remark?: string;
}

export interface DictDataRecord {
  id: number;
  dictTypeId: number;
  dictCode?: string;
  dictLabel: string;
  dictValue: string;
  sortOrder: number;
  remark?: string | null;
  createTime?: string | null;
  updateTime?: string | null;
}

export interface DictDataListQuery extends BaseListQuery {
  dictTypeId?: number;
  dictCode?: string;
  dictLabel?: string;
  dictValue?: string;
}

export interface DictDataInput {
  dictTypeId: number;
  dictLabel: string;
  dictValue: string;
  sortOrder: number;
  remark?: string;
}

export interface DictOption {
  label: string;
  value: string;
  sortOrder: number;
}

export interface ConfigRecord {
  id: number;
  configName: string;
  configKey: string;
  configValue?: string | null;
  configType: 'SYSTEM' | 'CUSTOM';
  valueType: 'TEXT' | 'NUMBER' | 'BOOLEAN';
  status: StatusValue;
  isBuiltin: BuiltinFlag;
  remark?: string | null;
  createTime?: string | null;
  updateTime?: string | null;
}

export interface ConfigListQuery extends BaseListQuery {
  configName?: string;
  configKey?: string;
  configType?: ConfigRecord['configType'];
  status?: StatusValue;
}

export interface ConfigInput {
  configName: string;
  configKey: string;
  configValue?: string;
  configType: ConfigRecord['configType'];
  valueType: ConfigRecord['valueType'];
  status: StatusValue;
  remark?: string;
}
