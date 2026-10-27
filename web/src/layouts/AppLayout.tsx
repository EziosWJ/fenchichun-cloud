import { useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  Drawer,
  Dropdown,
  Grid,
  Layout,
  Menu,
  Space,
  Tabs,
  Tooltip,
  type MenuProps,
} from 'antd';
import { Bell, KeyRound, LogOut, Menu as MenuIcon, Moon, PanelLeftClose, PanelLeftOpen, Sun, UserRound } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { appConfig } from '../config/app.config';
import { findRouteDefinition, getActiveMenuPath, getPageTitle, getTabKey } from '../config/routeUtils';
import { useAppPreferences } from '../app/AppProviders';
import { useAuthStore } from '../stores/useAuthStore';
import { HOME_TAB, useTabsStore } from '../stores/useTabsStore';
import { buildBreadcrumbs, canAccessRoute, isAdmin, menuTitleForPath } from '../lib/menus';
import { buildSidebarNavigation } from '../lib/navigation';
import { getUnreadCount } from '../features/notifications/api';
import { queryKeys } from '../lib/queryKeys';
import { connectMessages, useMessageEvents } from '../stores/useMessageEvents';
import styles from './AppLayout.module.css';

const { Sider } = Layout;
const COLLAPSE_STORAGE_KEY = 'admin-sidebar-collapsed';

export default function AppLayout() {
  const screens = Grid.useBreakpoint();
  const isMobile = screens.md === false;
  const location = useLocation();
  const navigate = useNavigate();
  const { themeMode, toggleTheme } = useAppPreferences();
  const user = useAuthStore((state) => state.user);
  const menus = useAuthStore((state) => state.menus);
  const status = useAuthStore((state) => state.status);
  const logout = useAuthStore((state) => state.logout);
  const admin = isAdmin(user);
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  const notificationVersion = useMessageEvents((state) => state.notificationVersion);

  const [collapsed, setCollapsed] = useState(() => {
    try {
      const stored = window.localStorage.getItem(COLLAPSE_STORAGE_KEY);
      return stored !== null ? stored === 'true' : window.innerWidth < 1200;
    } catch {
      return window.innerWidth < 1200;
    }
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const tabs = useTabsStore((state) => state.tabs);
  const openTab = useTabsStore((state) => state.openTab);
  const closeTab = useTabsStore((state) => state.closeTab);

  const matched = findRouteDefinition(location.pathname);
  const accessible = matched ? canAccessRoute(matched.route, menus, user) : false;
  const hasKnownRoute = Boolean(matched) && accessible;
  const activeMenuPath = getActiveMenuPath(location.pathname);
  const tabKey = getTabKey(location.pathname);
  const tabLabel = matched
    ? menuTitleForPath(location.pathname, menus, matched.route.label)
    : '页面未找到';
  const pageTitle = getPageTitle(location.pathname);
  const breadcrumbs = buildBreadcrumbs(location.pathname, menus);
  const navigation = useMemo(() => buildSidebarNavigation(menus, admin), [admin, menus]);
  const displayTabs =
    !hasKnownRoute || tabs.some((tab) => tab.key === tabKey)
      ? tabs
      : [
          ...tabs,
          {
            key: tabKey,
            label: tabLabel,
            href: `${location.pathname}${location.search}`,
            closable: tabKey !== HOME_TAB.key,
          },
        ];

  const unreadQuery = useQuery({
    queryKey: queryKeys.notifications.unread,
    queryFn: getUnreadCount,
    enabled: status === 'authenticated',
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (status !== 'authenticated' || !token) return;
    return connectMessages(token);
  }, [status, token]);

  useEffect(() => {
    if (notificationVersion > 0) {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  }, [notificationVersion, queryClient]);

  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSE_STORAGE_KEY, String(collapsed));
    } catch {
      // 忽略存储异常，折叠状态仍在本会话内生效。
    }
  }, [collapsed]);

  useEffect(() => {
    if (!hasKnownRoute) return;
    openTab({
      key: tabKey,
      label: tabLabel,
      href: `${location.pathname}${location.search}`,
      closable: tabKey !== HOME_TAB.key,
    });
  }, [hasKnownRoute, location.pathname, location.search, openTab, tabKey, tabLabel]);

  useEffect(() => {
    document.title = `${pageTitle} · ${appConfig.brandName}`;
  }, [pageTitle]);

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    const external = navigation.externalUrls.get(String(key));
    if (external) {
      window.open(external, '_blank', 'noopener,noreferrer');
      return;
    }
    navigate(String(key));
    setMobileMenuOpen(false);
  };

  const handleCloseTab = (targetKey: string) => {
    const index = displayTabs.findIndex((tab) => tab.key === targetKey);
    const closingActive = targetKey === tabKey;
    if (closingActive) {
      const fallback = displayTabs[index - 1] ?? displayTabs[index + 1] ?? HOME_TAB;
      closeTab(targetKey);
      navigate(fallback.href);
    } else {
      closeTab(targetKey);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const menu = (
    <Menu
      mode="inline"
      theme={themeMode}
      selectedKeys={[activeMenuPath]}
      items={navigation.items}
      onClick={handleMenuClick}
      className={styles.sideMenu}
      aria-label="主导航"
    />
  );

  const collapseButton = (
    <Tooltip title={collapsed ? '展开侧边栏' : '折叠侧边栏'}>
      <Button
        type="text"
        size="small"
        aria-label={collapsed ? '展开侧边栏' : '折叠侧边栏'}
        aria-expanded={!collapsed}
        aria-controls="app-sider"
        icon={collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        onClick={() => setCollapsed((value) => !value)}
      />
    </Tooltip>
  );

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserRound size={15} aria-hidden="true" />,
      label: '个人中心',
    },
    {
      key: 'password',
      icon: <KeyRound size={15} aria-hidden="true" />,
      label: '修改密码',
    },
    { type: 'divider' },
    {
      key: 'logout',
      danger: true,
      icon: <LogOut size={15} aria-hidden="true" />,
      label: '退出登录',
    },
  ];

  const handleUserMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'profile') void navigate('/account/profile');
    if (key === 'password') void navigate('/account/change-password');
    if (key === 'logout') void handleLogout();
  };

  return (
    <Layout className={styles.shell}>
      {!isMobile && (
        <Sider
          id="app-sider"
          width={260}
          collapsedWidth={76}
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          theme={themeMode}
          className={styles.sider}
          trigger={null}
        >
          <div className={`${styles.brand} ${collapsed ? styles.brandCollapsed : ''}`}>
            <span className={styles.brandMark}>{appConfig.logoText}</span>
            {!collapsed && (
              <div className={styles.brandText}>
                <span className={styles.brandName} title={appConfig.brandName}>
                  {appConfig.brandName}
                </span>
                <span className={styles.brandSubtitle}>{appConfig.brandSubtitle}</span>
              </div>
            )}
            {!collapsed && collapseButton}
          </div>
          {collapsed && <div className={styles.collapsedToggle}>{collapseButton}</div>}
          {menu}
          {!collapsed && <div className={styles.sidebarFoot}>{appConfig.sidebarCaption}</div>}
        </Sider>
      )}

      <Layout className={styles.main}>
        <div className={styles.stickyTop}>
          <header className={styles.header}>
            <div className={styles.heading}>
              {isMobile && (
                <Tooltip title="打开导航菜单">
                  <Button
                    type="text"
                    className={styles.headerIconButton}
                    aria-label="打开导航菜单"
                    aria-expanded={mobileMenuOpen}
                    icon={<MenuIcon size={20} />}
                    onClick={() => setMobileMenuOpen(true)}
                  />
                </Tooltip>
              )}
              <Breadcrumb
                className={styles.breadcrumb}
                items={(isMobile ? breadcrumbs.slice(-1) : breadcrumbs).map((item, index, list) => ({
                  title:
                    item.href && index < list.length - 1 ? (
                      <Link to={item.href}>{item.label}</Link>
                    ) : (
                      item.label
                    ),
                }))}
              />
            </div>
            <Space size="small">
              <Tooltip title="我的通知">
                <Badge count={unreadQuery.data ?? 0} size="small" overflowCount={99}>
                  <Button
                    type="text"
                    className={styles.headerIconButton}
                    aria-label="我的通知"
                    onClick={() => navigate('/notifications')}
                    icon={<Bell size={18} />}
                  />
                </Badge>
              </Tooltip>
              <Tooltip title={themeMode === 'dark' ? '切换浅色主题' : '切换深色主题'}>
                <Button
                  type="text"
                  className={styles.headerIconButton}
                  aria-label={themeMode === 'dark' ? '切换浅色主题' : '切换深色主题'}
                  icon={themeMode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                  onClick={toggleTheme}
                />
              </Tooltip>
              <Dropdown menu={{ items: userMenuItems, onClick: handleUserMenuClick }} trigger={['click']} placement="bottomRight">
                <Button type="text" className={styles.headerIconButton} aria-label="账号菜单" style={{ width: 'auto', paddingInline: 8 }}>
                  <Space size={8}>
                    <Avatar size={28} style={{ background: appConfig.brandColor }}>
                      {(user?.nickname || user?.username || 'U').slice(0, 1)}
                    </Avatar>
                    <span style={{ maxWidth: 96, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {user?.nickname || user?.username}
                    </span>
                  </Space>
                </Button>
              </Dropdown>
            </Space>
          </header>

          <div className={styles.tabBar}>
            <Tabs
              type="editable-card"
              hideAdd
              size="small"
              tabBarGutter={8}
              activeKey={tabKey}
              onChange={(key) => {
                const tab = displayTabs.find((item) => item.key === key);
                if (tab) navigate(tab.href);
              }}
              onEdit={(targetKey, action) => {
                if (action === 'remove') handleCloseTab(String(targetKey));
              }}
              items={displayTabs.map((tab) => ({
                key: tab.key,
                label: tab.label,
                closable: tab.closable,
              }))}
              className={styles.tabs}
              aria-label="已打开的页面"
            />
          </div>
        </div>

        <main className={styles.content}>
          <Outlet />
        </main>
        <footer className={styles.footer}>{appConfig.footerText}</footer>
      </Layout>

      <Drawer
        title={appConfig.name}
        placement="left"
        open={isMobile && mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        size={280}
        styles={{ body: { padding: 8 } }}
      >
        {menu}
      </Drawer>
    </Layout>
  );
}
