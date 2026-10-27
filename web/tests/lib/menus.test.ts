import { describe, expect, it } from 'vitest';
import { buildSidebarNavigation } from '../../src/lib/navigation';
import type { CurrentUserMenu } from '../../src/types/auth';

function node(overrides: Partial<CurrentUserMenu>): CurrentUserMenu {
  return {
    id: 1,
    parentId: 0,
    menuName: '节点',
    menuType: 'MENU',
    path: '/',
    component: null,
    externalUrl: null,
    icon: 'User',
    permissionCode: null,
    sortOrder: 1,
    visible: 1,
    children: [],
    ...overrides,
  };
}

describe('sidebar navigation', () => {
  it('builds static workbench and message entries plus backend menus', () => {
    const navigation = buildSidebarNavigation(
      [node({ id: 10, menuName: '用户管理', path: '/system/user', component: 'system/user/index' })],
      false,
    );
    const keys = JSON.stringify(navigation.items);
    expect(keys).toContain('/dashboard');
    expect(keys).toContain('/notifications');
    expect(keys).toContain('/system/user');
    expect(keys).not.toContain('/system/notification');
  });

  it('adds admin-only message entries for ADMIN accounts', () => {
    const navigation = buildSidebarNavigation([], true);
    const serialized = JSON.stringify(navigation.items);
    expect(serialized).toContain('/system/notification');
    expect(serialized).toContain('/system/announcement');
  });

  it('filters unregistered components, empty directories and hidden menus, and keeps external links', () => {
    const menus: CurrentUserMenu[] = [
      node({ id: 1, menuName: '未注册页面', path: '/missing', component: 'missing/page' }),
      node({
        id: 2,
        menuName: '空目录',
        menuType: 'DIR',
        path: '/empty',
        component: null,
      }),
      node({ id: 3, menuName: '隐藏页面', path: '/system/user', component: 'system/user/index', visible: 0 }),
      node({
        id: 4,
        menuName: '外部文档',
        menuType: 'LINK',
        path: '',
        externalUrl: 'https://example.com/docs',
      }),
    ];
    const navigation = buildSidebarNavigation(menus, false);
    const serialized = JSON.stringify(navigation.items);
    expect(serialized).not.toContain('/missing');
    expect(serialized).not.toContain('/empty');
    expect(serialized).not.toContain('/system/user');
    expect(navigation.externalUrls.get('external:4')).toBe('https://example.com/docs');
  });
});
