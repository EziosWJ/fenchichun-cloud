import type { MenuProps } from 'antd';
import { Bell } from 'lucide-react';
import { getMenuIcon } from './menu-icons';
import { resolveMenuRoute } from './menus';
import { adminMenuRoutes, sidebarStaticRoutes, type AppRouteDefinition } from '../config/routes';
import type { CurrentUserMenu } from '../types/auth';

export type MenuItem = NonNullable<MenuProps['items']>[number];

export interface SidebarNavigation {
  items: MenuItem[];
  externalUrls: Map<string, string>;
}

function routeMenuItem(route: AppRouteDefinition, label?: string): MenuItem {
  const Icon = route.icon;
  return {
    key: route.path,
    icon: Icon ? <Icon size={17} strokeWidth={1.8} aria-hidden="true" /> : undefined,
    label: label ?? route.label,
  };
}

function backendMenuItem(menu: CurrentUserMenu, externalUrls: Map<string, string>): MenuItem | null {
  if (menu.visible !== 1) return null;
  const Icon = getMenuIcon(menu.icon);

  if (menu.menuType === 'LINK') {
    if (!menu.externalUrl) return null;
    const key = `external:${menu.id}`;
    externalUrls.set(key, menu.externalUrl);
    return {
      key,
      icon: <Icon size={17} strokeWidth={1.8} aria-hidden="true" />,
      label: menu.menuName,
    };
  }

  if (menu.menuType === 'DIR') {
    const children = (menu.children ?? [])
      .map((child) => backendMenuItem(child, externalUrls))
      .filter((item): item is MenuItem => Boolean(item));
    if (children.length === 0) return null;
    return {
      key: `dir:${menu.id}`,
      icon: <Icon size={17} strokeWidth={1.8} aria-hidden="true" />,
      label: menu.menuName,
      children,
    };
  }

  const route = resolveMenuRoute(menu);
  if (!route) return null;
  return {
    key: route.path,
    icon: <Icon size={17} strokeWidth={1.8} aria-hidden="true" />,
    label: menu.menuName,
  };
}

export function buildSidebarNavigation(
  menus: CurrentUserMenu[],
  isAdminUser: boolean,
): SidebarNavigation {
  const externalUrls = new Map<string, string>();
  const items: MenuItem[] = [];

  const dashboard = sidebarStaticRoutes.find((route) => route.path === '/dashboard');
  if (dashboard) items.push(routeMenuItem(dashboard));

  const messageChildren: MenuItem[] = sidebarStaticRoutes
    .filter((route) => route.path !== '/dashboard')
    .map((route) => routeMenuItem(route));
  if (isAdminUser) {
    adminMenuRoutes.forEach((route) => messageChildren.push(routeMenuItem(route)));
  }
  const systemMenus: MenuItem[] = [];
  menus.forEach((menu) => {
    const item = backendMenuItem(menu, externalUrls);
    if (!item) return;
    if (menu.path === '/system' || menu.path === '/log' || menu.path === '/system/file' || menu.path === '/monitor') {
      systemMenus.push(item);
    } else {
      items.push(item);
    }
  });

  items.push({
    key: 'messages',
    icon: <Bell size={17} strokeWidth={1.8} aria-hidden="true" />,
    label: '消息中心',
    children: messageChildren,
  }, ...systemMenus);

  return { items, externalUrls };
}

/** 返回当前菜单项的所有父级，供直接访问和页面刷新时展开。 */
export function findMenuParentKeys(items: MenuItem[], target: string): string[] {
  for (const item of items) {
    if (!item || !('key' in item) || item.key == null) continue;
    if (String(item.key) === target) return [];
    if ('children' in item && item.children) {
      const children = item.children as MenuItem[];
      if (children.some((child) => child && 'key' in child && String(child.key) === target)) {
        return [String(item.key)];
      }
      const parents = findMenuParentKeys(children, target);
      if (parents.length) return [String(item.key), ...parents];
    }
  }
  return [];
}
