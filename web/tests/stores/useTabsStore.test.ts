import { beforeEach, describe, expect, it } from 'vitest';
import { HOME_TAB, useTabsStore } from '../../src/stores/useTabsStore';

describe('page tabs store', () => {
  beforeEach(() => {
    useTabsStore.setState({ tabs: [HOME_TAB] });
  });

  it('adds a tab when a route is opened and activates it by URL', () => {
    useTabsStore.getState().openTab({ key: '/system/user', label: '用户管理', href: '/system/user', closable: true });
    const tabs = useTabsStore.getState().tabs;

    expect(tabs).toHaveLength(2);
    expect(tabs[1]).toMatchObject({ key: '/system/user', label: '用户管理', closable: true });
  });

  it('updates an existing tab href instead of creating a duplicate', () => {
    const { openTab } = useTabsStore.getState();
    openTab({ key: '/system/user', label: '用户管理', href: '/system/user', closable: true });
    openTab({
      key: '/system/user',
      label: '用户管理',
      href: '/system/user?status=active',
      closable: true,
    });

    const tabs = useTabsStore.getState().tabs;
    expect(tabs).toHaveLength(2);
    expect(tabs[1].href).toBe('/system/user?status=active');
  });

  it('closes closable tabs but never removes the home tab', () => {
    const { openTab, closeTab } = useTabsStore.getState();
    openTab({ key: '/system/user', label: '用户管理', href: '/system/user', closable: true });
    openTab({ key: '/system/role', label: '角色管理', href: '/system/role', closable: true });

    closeTab('/system/user');
    expect(useTabsStore.getState().tabs.map((tab) => tab.key)).toEqual(['/dashboard', '/system/role']);

    closeTab('/dashboard');
    expect(useTabsStore.getState().tabs.map((tab) => tab.key)).toEqual(['/dashboard', '/system/role']);
  });

  it('resets all tabs but keeps home', () => {
    useTabsStore.getState().openTab({ key: '/system/user', label: '用户管理', href: '/system/user', closable: true });
    useTabsStore.getState().resetTabs();
    expect(useTabsStore.getState().tabs.map((tab) => tab.key)).toEqual(['/dashboard']);
  });

  it('persists tabs to sessionStorage for refresh recovery', () => {
    useTabsStore.getState().openTab({ key: '/system/dict', label: '字典管理', href: '/system/dict', closable: true });
    const stored = window.sessionStorage.getItem('admin-page-tabs');
    expect(stored).toBeTruthy();
    expect(stored).toContain('字典管理');
  });
});
