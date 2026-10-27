import type { CurrentUser, CurrentUserMenu } from '../types/auth';
import {
  findRouteDefinition,
  findRouteDefinitionByComponent,
} from '../config/routeUtils';
import type { AppRouteDefinition } from '../config/routes';
import type { BreadcrumbItem } from '../config/routeUtils';

export function isAdmin(user: CurrentUser | null | undefined): boolean {
  return Boolean(user?.roles?.some((role) => role.roleCode === 'ADMIN'));
}

export function walkMenus(menus: CurrentUserMenu[], visit: (menu: CurrentUserMenu, chain: CurrentUserMenu[]) => void): void {
  const walk = (items: CurrentUserMenu[], chain: CurrentUserMenu[]) => {
    items.forEach((menu) => {
      const nextChain = [...chain, menu];
      visit(menu, nextChain);
      if (menu.children?.length) walk(menu.children, nextChain);
    });
  };
  walk(menus, []);
}

export function collectMenuPaths(menus: CurrentUserMenu[]): Set<string> {
  const paths = new Set<string>();
  walkMenus(menus, (menu) => {
    if (menu.visible === 1 && menu.path) paths.add(menu.path);
  });
  return paths;
}

export function findMenuChain(menus: CurrentUserMenu[], path: string): CurrentUserMenu[] {
  let found: CurrentUserMenu[] = [];
  walkMenus(menus, (menu, chain) => {
    if (!found.length && menu.path === path) found = chain;
  });
  return found;
}

export function findMenuByComponent(
  menus: CurrentUserMenu[],
  component?: string | null,
): CurrentUserMenu | undefined {
  if (!component) return undefined;
  let found: CurrentUserMenu | undefined;
  walkMenus(menus, (menu) => {
    if (!found && menu.component === component) found = menu;
  });
  return found;
}

export function resolveMenuRoute(menu: CurrentUserMenu): AppRouteDefinition | undefined {
  if (menu.component) {
    const byComponent = findRouteDefinitionByComponent(menu.component);
    if (byComponent) return byComponent;
  }
  if (menu.path) {
    return findRouteDefinition(menu.path)?.route;
  }
  return undefined;
}

export function buildBreadcrumbs(pathname: string, menus: CurrentUserMenu[]): BreadcrumbItem[] {
  const chain = findMenuChain(menus, pathname);
  if (chain.length > 0) {
    return [
      { label: '工作台', href: '/dashboard' },
      ...chain.map((menu, index) => ({
        label: menu.menuName,
        href: index < chain.length - 1 && menu.menuType === 'MENU' ? menu.path : undefined,
      })),
    ];
  }
  const matched = findRouteDefinition(pathname);
  if (!matched) return [{ label: '工作台', href: '/dashboard' }, { label: '页面未找到' }];
  return [{ label: '工作台', href: '/dashboard' }, { label: matched.route.label }];
}

export function menuTitleForPath(pathname: string, menus: CurrentUserMenu[], fallback: string): string {
  const chain = findMenuChain(menus, pathname);
  return chain.length > 0 ? chain[chain.length - 1].menuName : fallback;
}

export function canAccessRoute(
  route: { menuPath?: string; adminOnly?: boolean },
  menus: CurrentUserMenu[],
  user: CurrentUser | null | undefined,
): boolean {
  if (route.adminOnly) return isAdmin(user);
  if (!route.menuPath) return true;
  return collectMenuPaths(menus).has(route.menuPath);
}
