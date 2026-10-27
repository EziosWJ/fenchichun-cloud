import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { App as AntApp, ConfigProvider, theme as antdTheme, type ThemeConfig } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { appConfig } from '../config/app.config';
import { queryClient as defaultQueryClient } from '../lib/queryClient';
import { AppErrorBoundary } from './AppErrorBoundary';

export type ThemeMode = 'light' | 'dark';

interface AppPreferences {
  themeMode: ThemeMode;
  toggleTheme: () => void;
}

const PreferencesContext = createContext<AppPreferences | null>(null);
const THEME_STORAGE_KEY = 'app-theme';

function getSystemTheme(): ThemeMode {
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  return media?.matches ? 'dark' : 'light';
}

function getStoredTheme(): ThemeMode | null {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    return null;
  }
}

function getInitialTheme(): ThemeMode {
  return getStoredTheme() ?? getSystemTheme();
}

interface AppProvidersProps {
  children: ReactNode;
  client?: QueryClient;
}

export function AppProviders({ children, client = defaultQueryClient }: AppProvidersProps) {
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialTheme);

  useEffect(() => {
    if (getStoredTheme() || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => {
      if (!getStoredTheme()) setThemeMode(event.matches ? 'dark' : 'light');
    };
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    document.documentElement.style.colorScheme = themeMode;
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

  const themeConfig: ThemeConfig = useMemo(() => {
    const dark = themeMode === 'dark';
    return {
      algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      cssVar: { prefix: 'ant' },
      token: {
        colorPrimary: appConfig.brandColor,
        colorInfo: appConfig.brandColor,
        colorLink: appConfig.brandColor,
        borderRadius: 10,
        borderRadiusLG: 16,
        borderRadiusSM: 8,
        controlHeight: 36,
        controlHeightSM: 30,
        controlHeightLG: 42,
        fontSize: 14,
        colorBgLayout: dark ? '#0a101c' : '#f5f7fb',
        colorBgContainer: dark ? '#0f172a' : '#ffffff',
        colorBorderSecondary: dark ? '#1e293b' : '#e9eef6',
        fontFamily:
          'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
      },
      components: {
        Layout: {
          headerBg: dark ? '#0f172a' : '#ffffff',
          siderBg: dark ? '#0b1424' : '#ffffff',
          bodyBg: dark ? '#0a101c' : '#f5f7fb',
          footerBg: 'transparent',
        },
        Menu: {
          itemHeight: 40,
          itemBorderRadius: 8,
          itemMarginInline: 6,
          itemSelectedBg: dark ? '#17263f' : '#eaf2ff',
          itemSelectedColor: appConfig.brandColor,
          groupTitleFontSize: 11,
          groupTitleColor: dark ? '#7c8aa5' : '#8a94a6',
        },
        Table: {
          headerBg: dark ? '#111c2d' : '#f8fafc',
          headerColor: dark ? '#9fb0c8' : '#64748b',
          rowHoverBg: dark ? '#142033' : '#f8fbff',
          borderColor: dark ? '#1e293b' : '#eef2f7',
          headerBorderRadius: 0,
          cellPaddingBlockMD: 12,
          cellPaddingInlineMD: 16,
        },
        Card: {
          borderRadiusLG: 16,
          bodyPadding: 20,
          headerPadding: 20,
          headerFontSize: 15,
        },
        Tabs: {
          cardGutter: 6,
          cardPadding: '4px 10px',
          cardPaddingSM: '3px 8px',
          cardBg: 'transparent',
          itemSelectedColor: appConfig.brandColor,
        },
        Button: {
          fontWeight: 500,
          borderRadius: 8,
        },
        Input: {
          activeBorderColor: appConfig.brandColor,
          hoverBorderColor: dark ? '#334155' : '#cbd5e1',
        },
        Select: {
          optionHeight: 34,
          optionSelectedBg: dark ? '#17263f' : '#eaf2ff',
        },
      },
    };
  }, [themeMode]);

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
