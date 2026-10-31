import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { App as AntApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { appConfig } from '../config/app.config';
import {
  appPalette,
  createAppTheme,
  readStoredTheme,
  resolveInitialTheme,
  THEME_STORAGE_KEY,
  type ThemeMode,
} from '../config/theme';
import { queryClient as defaultQueryClient } from '../lib/queryClient';
import { AppErrorBoundary } from './AppErrorBoundary';

export type { ThemeMode } from '../config/theme';

interface AppPreferences {
  themeMode: ThemeMode;
  toggleTheme: () => void;
}

const PreferencesContext = createContext<AppPreferences | null>(null);

interface AppProvidersProps {
  children: ReactNode;
  client?: QueryClient;
}

export function AppProviders({ children, client = defaultQueryClient }: AppProvidersProps) {
  const [themeMode, setThemeMode] = useState<ThemeMode>(resolveInitialTheme);

  useEffect(() => {
    if (readStoredTheme() || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => {
      if (!readStoredTheme()) setThemeMode(event.matches ? 'dark' : 'light');
    };
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = themeMode;
    root.style.colorScheme = themeMode;
    // 浏览器地址栏/状态栏跟随主题；其余颜色由 AntD CSS 变量提供。
    const themeColor = document.querySelector('meta[name="theme-color"]');
    themeColor?.setAttribute(
      'content',
      themeMode === 'dark' ? appPalette.dark.colorBgLayout : appConfig.brandColor,
    );
  }, [themeMode]);

  const toggleTheme = useCallback(() => {
    setThemeMode((current) => {
      const next: ThemeMode = current === 'dark' ? 'light' : 'dark';
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // 存储不可用时仍允许本次会话切换主题。
      }
      return next;
    });
  }, []);

  const preferences = useMemo(() => ({ themeMode, toggleTheme }), [themeMode, toggleTheme]);
  const themeConfig = useMemo(() => createAppTheme(themeMode), [themeMode]);

  return (
    <PreferencesContext.Provider value={preferences}>
      <QueryClientProvider client={client}>
        <ConfigProvider locale={zhCN} theme={themeConfig} button={{ autoInsertSpace: false }}>
          <AntApp>
            <AppErrorBoundary>{children}</AppErrorBoundary>
          </AntApp>
        </ConfigProvider>
      </QueryClientProvider>
    </PreferencesContext.Provider>
  );
}

export function useAppPreferences(): AppPreferences {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('useAppPreferences must be used within AppProviders');
  return value;
}
