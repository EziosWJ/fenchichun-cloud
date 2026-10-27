import type { DeptOption, MenuRecord } from '../types/system';

export interface SelectTreeNode {
  value: number;
  title: string;
  disabled?: boolean;
  children?: SelectTreeNode[];
}

export function deptOptionsToTree(options: DeptOption[], disabledIds: number[] = []): SelectTreeNode[] {
  const disabled = new Set(disabledIds);
  return options.map((option) => ({
    value: option.id,
    title: option.deptName,
    disabled: option.disabled || disabled.has(option.id),
    children: option.children?.length ? deptOptionsToTree(option.children, disabledIds) : undefined,
  }));
}

export function menuTreeToOptions(
  menus: MenuRecord[],
  options: { includeRoot?: boolean } = {},
): SelectTreeNode[] {
  const nodes: SelectTreeNode[] = [{ value: 0, title: '顶级菜单' }];
  const walk = (items: MenuRecord[]): SelectTreeNode[] =>
    items.map((menu) => ({
      value: menu.id,
      title: menu.menuName,
      children: menu.children?.length ? walk(menu.children) : undefined,
    }));
  return options.includeRoot === false ? walk(menus) : [...nodes, ...walk(menus)];
}

export function flattenMenuTree(menus: MenuRecord[]): MenuRecord[] {
  const result: MenuRecord[] = [];
  const walk = (items: MenuRecord[]) => {
    items.forEach((menu) => {
      result.push(menu);
      if (menu.children?.length) walk(menu.children);
    });
  };
  walk(menus);
  return result;
}

export function flattenTree<T extends { children?: T[] }>(items: T[]): T[] {
  const result: T[] = [];
  const walk = (nodes: T[]) => {
    nodes.forEach((node) => {
      result.push(node);
      if (node.children?.length) walk(node.children);
    });
  };
  walk(items);
  return result;
}
