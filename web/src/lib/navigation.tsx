import type { MenuProps } from 'antd';
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
  items.push({
    key: 'group-messages',
    type: 'group',
    label: '消息中心',
    children: messageChildren,
  });

  menus.forEach((menu) => {
    const item = backendMenuItem(menu, externalUrls);
    if (item) items.push(item);
  });

  return { items, externalUrls };
}
