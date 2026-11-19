import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AppLayout from '../../src/layouts/AppLayout';
import { AppProviders } from '../../src/app/AppProviders';
import { HOME_TAB, useTabsStore } from '../../src/stores/useTabsStore';
import { useAuthStore } from '../../src/stores/useAuthStore';
import type { CurrentUser } from '../../src/types/auth';
import { createTestQueryClient } from '../utils/renderWithProviders';

vi.mock('../../src/features/notifications/api', () => ({
  getUnreadCount: vi.fn().mockResolvedValue(3),
}));

vi.mock('../../src/stores/useMessageEvents', () => ({
  connectMessages: vi.fn(() => () => undefined),
  useMessageEvents: <T,>(selector: (state: { notificationVersion: number }) => T): T =>
    selector({ notificationVersion: 0 }),
}));

const user: CurrentUser = {
  id: 1,
  username: 'admin',
  nickname: '管理员',
  roles: [{ id: 1, roleName: '管理员', roleCode: 'ADMIN' }],
  dept: { id: 1, deptName: '信息部' },
};

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
  Object.defineProperty(window, 'outerWidth', { writable: true, configurable: true, value: width });
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => {
    const min = /min-width:\s*(\d+(?:\.\d+)?)px/.exec(query);
    const max = /max-width:\s*(\d+(?:\.\d+)?)px/.exec(query);
    const matches = min ? width >= Number(min[1]) : max ? width <= Number(max[1]) : false;
    return {
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList;
  });
}

function renderLayout(route = '/dashboard') {
  return render(
    <AppProviders client={createTestQueryClient()}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<div>工作台内容</div>} />
            <Route path="dashboard" element={<div>工作台内容</div>} />
            <Route path="notifications" element={<div>通知内容</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AppProviders>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  useTabsStore.setState({ tabs: [HOME_TAB] });
  useAuthStore.setState({ user, menus: [], status: 'authenticated', token: 'test-token' });
});

afterEach(() => {
  vi.restoreAllMocks();
  useAuthStore.setState({ user: null, menus: [], status: 'idle', token: null });
});

describe('AppLayout', () => {
  it('renders backend-driven navigation, breadcrumbs, tabs and header actions', async () => {
    setViewport(1280);
    renderLayout();

    expect(await screen.findByText('工作台内容')).toBeInTheDocument();
    expect(screen.getByRole('menu', { name: '主导航' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '工作台' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '工作台' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '面包屑' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '已打开的页面' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '我的通知' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '账号菜单' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '跳到主要内容' })).toHaveAttribute('href', '#main-content');
  });

  it('persists sidebar collapse only after the user toggles it', async () => {
    setViewport(1440);
    const userEventApi = userEvent.setup({ delay: null });
    renderLayout();
    await screen.findByText('工作台内容');

    expect(window.localStorage.getItem('admin-sidebar-collapsed')).toBeNull();

    await userEventApi.click(screen.getByRole('button', { name: '折叠侧边栏' }));
    expect(window.localStorage.getItem('admin-sidebar-collapsed')).toBe('true');
    expect(screen.getByRole('button', { name: '展开侧边栏' })).toBeInTheDocument();

    await userEventApi.click(screen.getByRole('button', { name: '展开侧边栏' }));
    expect(window.localStorage.getItem('admin-sidebar-collapsed')).toBe('false');
  });

  it('opens tabs and closes the active tab to a neighbor', async () => {
    setViewport(1280);
    const userEventApi = userEvent.setup({ delay: null });
    renderLayout();
    await screen.findByText('工作台内容');

    await userEventApi.click(screen.getByRole('menuitem', { name: '消息中心' }));
    await userEventApi.click(screen.getByRole('menuitem', { name: '我的通知' }));
    expect(await screen.findByText('通知内容')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '我的通知' })).toBeInTheDocument();

    const tabContainer = screen.getByRole('tab', { name: '我的通知' }).closest('.ant-tabs-tab');
    const removeButton = tabContainer?.querySelector('.ant-tabs-tab-remove');
    expect(removeButton).toBeTruthy();
    await act(async () => {
      removeButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(await screen.findByText('工作台内容')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('tab', { name: '我的通知' })).not.toBeInTheDocument();
    });
  });

  it('right-clicking a tab closes tabs to the right or all tabs', async () => {
    setViewport(1280);
    const userEventApi = userEvent.setup({ delay: null });
    useTabsStore.setState({
      tabs: [
        HOME_TAB,
        { key: '/notifications', label: '我的通知', href: '/notifications', closable: true },
        { key: '/system/user', label: '用户管理', href: '/system/user', closable: true },
      ],
    });
    renderLayout('/notifications');
    await screen.findByText('通知内容');

    const openTabMenu = async () => {
      const tab = screen.getByRole('tab', { name: '我的通知' }).closest('.ant-tabs-tab');
      await act(async () => {
        tab!.dispatchEvent(
          new MouseEvent('contextmenu', { bubbles: true, clientX: 120, clientY: 80 }),
        );
      });
      return screen.findByRole('menu', { name: '标签页操作' });
    };

    let menu = await openTabMenu();
    expect(within(menu).getByRole('menuitem', { name: '关闭左侧' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(within(menu).getByRole('menuitem', { name: '关闭右侧' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await userEventApi.click(within(menu).getByRole('menuitem', { name: '关闭右侧' }));
    await waitFor(() => {
      expect(screen.queryByRole('tab', { name: '用户管理' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('tab', { name: '我的通知' })).toBeInTheDocument();

    menu = await openTabMenu();
    await userEventApi.click(within(menu).getByRole('menuitem', { name: '关闭所有' }));
    expect(await screen.findByText('工作台内容')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('tab', { name: '我的通知' })).not.toBeInTheDocument();
    });
  });

  it('right-clicking a tab closes tabs to the left or others', async () => {
    setViewport(1280);
    const userEventApi = userEvent.setup({ delay: null });
    useTabsStore.setState({
      tabs: [
        HOME_TAB,
        { key: '/system/user', label: '用户管理', href: '/system/user', closable: true },
        { key: '/notifications', label: '我的通知', href: '/notifications', closable: true },
      ],
    });
    renderLayout('/notifications');
    await screen.findByText('通知内容');

    const dispatchContextMenu = async (label: string) => {
      const tab = screen.getByRole('tab', { name: label }).closest('.ant-tabs-tab');
      await act(async () => {
        tab!.dispatchEvent(
          new MouseEvent('contextmenu', { bubbles: true, clientX: 120, clientY: 80 }),
        );
      });
      return screen.findByRole('menu', { name: '标签页操作' });
    };

    let menu = await dispatchContextMenu('我的通知');
    await userEventApi.click(within(menu).getByRole('menuitem', { name: '关闭左侧' }));
    await waitFor(() => {
      expect(screen.queryByRole('tab', { name: '用户管理' })).not.toBeInTheDocument();
    });

    menu = await dispatchContextMenu('工作台');
    await userEventApi.click(within(menu).getByRole('menuitem', { name: '关闭其他' }));
    expect(await screen.findByText('工作台内容')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('tab', { name: '我的通知' })).not.toBeInTheDocument();
    });
  });

  it('moves focus to the main content after a route change', async () => {
    setViewport(1280);
    const userEventApi = userEvent.setup({ delay: null });
    renderLayout();
    await screen.findByText('工作台内容');

    await userEventApi.click(screen.getByRole('menuitem', { name: '消息中心' }));
    await userEventApi.click(screen.getByRole('menuitem', { name: '我的通知' }));
    await screen.findByText('通知内容');

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('main', { name: '我的通知' }));
    });
  });

  it('uses drawer navigation on narrow screens', async () => {
    setViewport(375);
    const userEventApi = userEvent.setup({ delay: null });
    renderLayout();
    await screen.findByText('工作台内容');

    await userEventApi.click(screen.getByRole('button', { name: '打开导航菜单' }));
    const dialog = await screen.findByRole('dialog');
    await userEventApi.click(within(dialog).getByRole('menuitem', { name: '消息中心' }));
    await userEventApi.click(within(dialog).getByRole('menuitem', { name: '我的通知' }));

    expect(await screen.findByText('通知内容')).toBeInTheDocument();
  });
});
