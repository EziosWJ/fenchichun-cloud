import { describe, expect, it } from 'vitest';
import { routeDefinitions } from '../../src/config/routes';
import {
  findRouteDefinition,
  getActiveMenuPath,
  getBreadcrumbs,
} from '../../src/config/routeUtils';
import { canAccessRoute, collectMenuPaths } from '../../src/lib/menus';
import type { CurrentUser, CurrentUserMenu } from '../../src/types/auth';

const BACKEND_MENU_COMPONENTS = [
  'system/user/index',
  'system/role/index',
  'system/menu/index',
  'system/dept/index',
  'system/dict/index',
  'system/config/index',
  'system/file/index',
  'system/login-log/index',
  'system/oper-log/index',
  'monitor/server/index',
  'weighbridge/analytics/statement/index',
];

function menu(path: string, component: string | null = null): CurrentUserMenu {
  return {
    id: 1,
    parentId: 0,
    menuName: path,
    menuType: 'MENU',
    path,
    component,
    icon: null,
    permissionCode: null,
    sortOrder: 1,
    visible: 1,
    children: [],
  };
}

const admin: CurrentUser = {
  id: 1,
  username: 'admin',
  nickname: '管理员',
  roles: [{ id: 1, roleName: '超级管理员', roleCode: 'ADMIN' }],
};

const viewer: CurrentUser = {
  id: 2,
  username: 'viewer',
  nickname: '访客',
  roles: [{ id: 2, roleName: '只读', roleCode: 'VIEWER' }],
};

describe('local route and backend menu mapping', () => {
  it('registers a local page for every backend system menu component', () => {
    BACKEND_MENU_COMPONENTS.forEach((component) => {
      expect(
        routeDefinitions.some((route) => route.menuComponent === component),
        `missing local page for ${component}`,
      ).toBe(true);
    });
  });

  it('keeps menu path and local route path consistent', () => {
    routeDefinitions
      .filter((route) => route.menuPath)
      .forEach((route) => {
        expect(findRouteDefinition(route.menuPath!)?.route.path).toBe(route.parentPath ?? route.path);
      });
  });

  it('resolves details and tabs to their parent menu entry', () => {
    expect(findRouteDefinition('/notifications/12')?.route.path).toBe('/notifications/:id');
    expect(getActiveMenuPath('/notifications/12')).toBe('/notifications');
    expect(getActiveMenuPath('/system/user')).toBe('/system/user');
  });

  it('guards grain detail URLs with their parent menu permissions', () => {
    for (const path of ['/grain-intake/trips', '/grain-intake/permits']) {
      const detail = findRouteDefinition(`${path}/1`)!.route;
      expect(canAccessRoute(detail, [], viewer)).toBe(false);
      expect(canAccessRoute(detail, [menu(path)], viewer)).toBe(true);
      expect(getActiveMenuPath(`${path}/1`)).toBe(path);
    }
  });

  it('builds breadcrumbs from the backend menu hierarchy', () => {
    const menus: CurrentUserMenu[] = [
      {
        ...menu('/system'),
        id: 1,
        menuName: '系统管理',
        menuType: 'DIR',
        children: [{ ...menu('/system/user', 'system/user/index'), id: 2, parentId: 1, menuName: '用户管理' }],
      },
    ];
    expect(getBreadcrumbs('/system/user')).toEqual([{ label: '工作台', href: '/dashboard' }, { label: '用户管理' }]);
    expect(collectMenuPaths(menus).has('/system/user')).toBe(true);
  });

  it('requires menu access and ADMIN for guarded pages', () => {
    const menus = [menu('/system/user', 'system/user/index')];
    const userRoute = routeDefinitions.find((route) => route.path === '/system/user')!;
    const roleRoute = routeDefinitions.find((route) => route.path === '/system/role')!;
    const adminRoute = routeDefinitions.find((route) => route.path === '/system/notification')!;

    expect(canAccessRoute(userRoute, menus, viewer)).toBe(true);
    expect(canAccessRoute(roleRoute, menus, viewer)).toBe(false);
    expect(canAccessRoute(adminRoute, menus, viewer)).toBe(false);
    expect(canAccessRoute(adminRoute, menus, admin)).toBe(true);
  });

  it('registers the admin-only cloud sync page for the backend menu component', () => {
    const route = routeDefinitions.find((item) => item.menuComponent === 'weighbridge/sync/index');
    expect(route?.path).toBe('/weighbridge/sync');
    expect(route?.menuPath).toBe('/weighbridge/sync');
    expect(route?.adminOnly).toBe(true);
  });
});
