import { theme as antdTheme, type ThemeConfig } from 'antd';
import { appConfig } from './app.config';

export type ThemeMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'app-theme';

/** 应用壳层尺寸。TS 与 CSS（tokens.css）共用同一组 4px 基准值。 */
export const layoutTokens = Object.freeze({
  siderWidth: 260,
  siderCollapsedWidth: 76,
  headerHeight: 64,
  headerHeightMobile: 56,
  tabBarHeight: 44,
  tabBarHeightMobile: 38,
  contentMaxWidth: 1600,
  contentPaddingX: 28,
  contentPaddingY: 24,
  contentPaddingXMobile: 12,
  pageGap: 20,
});

export interface AppPalette {
  colorBgBase: string;
  colorBgLayout: string;
  colorBgContainer: string;
  colorBgElevated: string;
  colorBgSpotlight: string;
  colorText: string;
  colorTextSecondary: string;
  colorTextTertiary: string;
  colorTextQuaternary: string;
  colorBorder: string;
  colorBorderSecondary: string;
  colorSplit: string;
  colorFill: string;
  colorFillSecondary: string;
  colorFillTertiary: string;
  colorFillQuaternary: string;
  colorPrimaryBg: string;
  colorPrimaryBorder: string;
  brandText: string;
  brandTextHover: string;
  surfaceMuted: string;
  menuItemHoverBg: string;
  menuItemSelectedBg: string;
  tableHeaderBg: string;
  tableHeaderColor: string;
  tableRowHoverBg: string;
  tableRowSelectedBg: string;
  tableRowSelectedHoverBg: string;
  tableBorder: string;
  groupTitleColor: string;
  optionSelectedBg: string;
  inputHoverBorder: string;
  shadowSecondary: string;
  shadowTertiary: string;
}

/**
 * 唯一的浅色/深色语义调色板。
 * tokens.css 只额外声明根节点无法读取 AntD 作用域变量所需的 3 个颜色，
 * 其余颜色一律从 AntD Token 派生，避免业务 CSS 再维护第二套色板。
 */
export const appPalette: Record<ThemeMode, AppPalette> = Object.freeze({
  light: {
    colorBgBase: '#f4f7fb',
    colorBgLayout: '#f4f7fb',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBgSpotlight: '#1e293b',
    colorText: '#1e293b',
    colorTextSecondary: '#4f5e72',
    colorTextTertiary: '#5f6e82',
    colorTextQuaternary: '#94a3b8',
    colorBorder: '#d8e0eb',
    colorBorderSecondary: '#e9eef6',
    colorSplit: '#eef2f7',
    colorFill: 'rgba(15, 23, 42, 0.06)',
    colorFillSecondary: 'rgba(15, 23, 42, 0.04)',
    colorFillTertiary: 'rgba(15, 23, 42, 0.03)',
    colorFillQuaternary: '#f1f5f9',
    colorPrimaryBg: '#eaf2ff',
    colorPrimaryBorder: '#b7d4ff',
    brandText: '#0958d9',
    brandTextHover: '#0b4fc4',
    surfaceMuted: '#f8fafc',
    menuItemHoverBg: '#f3f7fd',
    menuItemSelectedBg: '#eaf2ff',
    tableHeaderBg: '#f8fafc',
    tableHeaderColor: '#4f5e72',
    tableRowHoverBg: '#f8fbff',
    tableRowSelectedBg: '#eef5ff',
    tableRowSelectedHoverBg: '#e4efff',
    tableBorder: '#eef2f7',
    groupTitleColor: '#5f6e82',
    optionSelectedBg: '#eaf2ff',
    inputHoverBorder: '#cbd5e1',
    shadowSecondary: '0 12px 32px rgba(15, 23, 42, 0.10)',
    shadowTertiary: '0 6px 20px rgba(15, 23, 42, 0.05)',
  },
  dark: {
    colorBgBase: '#0a101c',
    colorBgLayout: '#0a101c',
    colorBgContainer: '#0f172a',
    colorBgElevated: '#131f33',
    colorBgSpotlight: '#1e293b',
    colorText: '#e2e8f0',
    colorTextSecondary: '#a9b8cf',
    colorTextTertiary: '#8fa0b8',
    colorTextQuaternary: '#6b7c94',
    colorBorder: '#263449',
    colorBorderSecondary: '#1e293b',
    colorSplit: '#1a2638',
    colorFill: 'rgba(148, 163, 184, 0.14)',
    colorFillSecondary: 'rgba(148, 163, 184, 0.10)',
    colorFillTertiary: 'rgba(148, 163, 184, 0.07)',
    colorFillQuaternary: '#131f33',
    colorPrimaryBg: '#17263f',
    colorPrimaryBorder: '#2b4a78',
    brandText: '#69b1ff',
    brandTextHover: '#91caff',
    surfaceMuted: '#111c2d',
    menuItemHoverBg: '#131f33',
    menuItemSelectedBg: '#17263f',
    tableHeaderBg: '#111c2d',
    tableHeaderColor: '#a9b8cf',
    tableRowHoverBg: '#142033',
    tableRowSelectedBg: '#162741',
    tableRowSelectedHoverBg: '#1b2d4d',
    tableBorder: '#1e293b',
    groupTitleColor: '#8fa0b8',
    optionSelectedBg: '#17263f',
    inputHoverBorder: '#334155',
    shadowSecondary: '0 16px 40px rgba(0, 0, 0, 0.45)',
    shadowTertiary: '0 8px 24px rgba(0, 0, 0, 0.32)',
  },
});

const FONT_FAMILY =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';

export function readStoredTheme(): ThemeMode | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    return null;
  }
}

export function getSystemTheme(): ThemeMode {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** 首次访问：本地偏好 > appConfig.defaultTheme > 操作系统。 */
export function resolveInitialTheme(): ThemeMode {
  const stored = readStoredTheme();
  if (stored) return stored;
  if (appConfig.defaultTheme === 'light' || appConfig.defaultTheme === 'dark') {
    return appConfig.defaultTheme;
  }
  return getSystemTheme();
}

export function createAppTheme(mode: ThemeMode): ThemeConfig {
  const palette = appPalette[mode];
  const dark = mode === 'dark';

  return {
    algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    cssVar: { prefix: 'ant' },
    token: {
      colorPrimary: appConfig.brandColor,
      colorInfo: appConfig.brandColor,
      colorLink: palette.brandText,
      colorLinkHover: palette.brandTextHover,
      colorBgBase: palette.colorBgBase,
      colorBgLayout: palette.colorBgLayout,
      colorBgContainer: palette.colorBgContainer,
      colorBgElevated: palette.colorBgElevated,
      colorBgSpotlight: palette.colorBgSpotlight,
      colorText: palette.colorText,
      colorTextSecondary: palette.colorTextSecondary,
      colorTextTertiary: palette.colorTextTertiary,
      colorTextQuaternary: palette.colorTextQuaternary,
      colorBorder: palette.colorBorder,
      colorBorderSecondary: palette.colorBorderSecondary,
      colorSplit: palette.colorSplit,
      colorFill: palette.colorFill,
      colorFillSecondary: palette.colorFillSecondary,
      colorFillTertiary: palette.colorFillTertiary,
      colorFillQuaternary: palette.colorFillQuaternary,
      colorPrimaryBg: palette.colorPrimaryBg,
      colorPrimaryBorder: palette.colorPrimaryBorder,
      colorSuccess: dark ? '#49aa19' : '#52c41a',
      colorWarning: dark ? '#d89614' : '#faad14',
      colorError: dark ? '#dc4446' : '#ff4d4f',
      borderRadius: 10,
      borderRadiusLG: 16,
      borderRadiusSM: 8,
      borderRadiusXS: 6,
      controlHeight: 36,
      controlHeightSM: 30,
      controlHeightLG: 42,
      fontSize: 14,
      fontFamily: FONT_FAMILY,
      boxShadowSecondary: palette.shadowSecondary,
      boxShadowTertiary: palette.shadowTertiary,
      wireframe: false,
    },
    components: {
      Layout: {
        bodyBg: palette.colorBgLayout,
        headerBg: palette.colorBgContainer,
        siderBg: palette.colorBgContainer,
        footerBg: 'transparent',
        headerHeight: layoutTokens.headerHeight,
      },
      Menu: {
        itemHeight: 40,
        itemBorderRadius: 8,
        itemMarginInline: 6,
        itemMarginBlock: 2,
        itemPaddingInline: 10,
        iconSize: 17,
        iconMarginInlineEnd: 10,
        collapsedIconSize: 18,
        groupTitleFontSize: 11,
        groupTitleLineHeight: '20px',
        groupTitleColor: palette.groupTitleColor,
        itemBg: 'transparent',
        subMenuItemBg: 'transparent',
        itemColor: palette.colorTextSecondary,
        itemHoverColor: palette.colorText,
        itemHoverBg: palette.menuItemHoverBg,
        itemSelectedBg: palette.menuItemSelectedBg,
        itemSelectedColor: palette.brandText,
        itemActiveBg: palette.menuItemSelectedBg,
        popupBg: palette.colorBgElevated,
        darkItemBg: 'transparent',
        darkSubMenuItemBg: 'transparent',
        darkPopupBg: palette.colorBgElevated,
        darkItemColor: palette.colorTextSecondary,
        darkItemHoverColor: palette.colorText,
        darkItemHoverBg: palette.menuItemHoverBg,
        darkItemSelectedBg: palette.menuItemSelectedBg,
        darkItemSelectedColor: palette.brandText,
        darkGroupTitleColor: palette.groupTitleColor,
      },
      Table: {
        headerBg: palette.tableHeaderBg,
        headerColor: palette.tableHeaderColor,
        rowHoverBg: palette.tableRowHoverBg,
        rowSelectedBg: palette.tableRowSelectedBg,
        rowSelectedHoverBg: palette.tableRowSelectedHoverBg,
        borderColor: palette.tableBorder,
        headerSplitColor: palette.tableBorder,
        headerBorderRadius: 0,
        cellPaddingBlockMD: 12,
        cellPaddingInlineMD: 16,
        cellPaddingBlockSM: 8,
        cellPaddingInlineSM: 12,
      },
      Card: {
        borderRadiusLG: 16,
        bodyPadding: 20,
        headerPadding: 20,
        headerHeight: 56,
        headerFontSize: 15,
        headerBg: 'transparent',
        actionsBg: palette.surfaceMuted,
      },
      Tabs: {
        cardBg: 'transparent',
        cardGutter: 6,
        cardHeight: 32,
        cardHeightSM: 28,
        cardPadding: '4px 10px',
        cardPaddingSM: '3px 8px',
        titleFontSize: 13,
        titleFontSizeSM: 13,
        itemColor: palette.colorTextSecondary,
        itemActiveColor: palette.brandText,
        itemHoverColor: appConfig.brandColor,
        itemSelectedColor: palette.brandText,
      },
      Button: {
        fontWeight: 500,
        borderRadius: 8,
        primaryShadow: 'none',
        defaultShadow: 'none',
        dangerShadow: 'none',
        defaultBg: palette.colorBgContainer,
        defaultColor: palette.colorText,
        defaultBorderColor: palette.colorBorder,
        defaultHoverBg: palette.colorBgContainer,
        defaultHoverColor: palette.brandText,
        defaultHoverBorderColor: appConfig.brandColor,
        textTextColor: palette.colorTextSecondary,
        textTextHoverColor: palette.brandText,
        textTextActiveColor: palette.brandText,
      },
      Input: {
        activeBg: palette.colorBgContainer,
        hoverBg: palette.colorBgContainer,
        activeBorderColor: appConfig.brandColor,
        hoverBorderColor: palette.inputHoverBorder,
        inputFontSize: 14,
        paddingBlock: 6,
        paddingInline: 12,
      },
      Select: {
        selectorBg: palette.colorBgContainer,
        clearBg: palette.colorBgContainer,
        activeBorderColor: appConfig.brandColor,
        hoverBorderColor: palette.inputHoverBorder,
        optionHeight: 34,
        optionSelectedBg: palette.optionSelectedBg,
        optionSelectedColor: palette.brandText,
        optionSelectedFontWeight: 500,
        optionActiveBg: palette.menuItemHoverBg,
      },
      Modal: {
        headerBg: 'transparent',
        contentBg: palette.colorBgContainer,
        footerBg: 'transparent',
        titleColor: palette.colorText,
        titleFontSize: 16,
        titleLineHeight: 1.5,
      },
      Drawer: {
        footerPaddingBlock: 12,
        footerPaddingInline: 20,
      },
      Popover: {
        titleMinWidth: 160,
      },
      Descriptions: {
        labelBg: palette.surfaceMuted,
        labelColor: palette.colorTextSecondary,
        contentColor: palette.colorText,
        itemPaddingBottom: 12,
        itemPaddingEnd: 16,
        titleColor: palette.colorText,
        extraColor: palette.colorTextTertiary,
      },
      Form: {
        itemMarginBottom: 20,
        labelColor: palette.colorText,
        labelFontSize: 13,
        verticalLabelPadding: '0 0 6px',
      },
      Breadcrumb: {
        itemColor: palette.colorTextSecondary,
        lastItemColor: palette.colorText,
        linkColor: palette.colorTextSecondary,
        linkHoverColor: palette.brandText,
        separatorColor: palette.colorTextQuaternary,
        separatorMargin: 8,
      },
      Segmented: {
        trackBg: palette.colorFillQuaternary,
        trackPadding: 3,
        itemColor: palette.colorTextSecondary,
        itemHoverColor: palette.colorText,
        itemHoverBg: palette.colorBgContainer,
        itemSelectedBg: palette.colorBgContainer,
        itemSelectedColor: palette.colorText,
        itemActiveBg: palette.colorFillTertiary,
      },
      Pagination: {
        itemBg: 'transparent',
        itemActiveBg: palette.colorPrimaryBg,
        itemActiveColor: palette.brandText,
      },
      Progress: {
        defaultColor: appConfig.brandColor,
        remainingColor: palette.colorFillSecondary,
        lineBorderRadius: 999,
      },
      Tag: {
        defaultBg: palette.colorFillQuaternary,
        defaultColor: palette.colorTextSecondary,
      },
      Alert: {
        borderRadius: 12,
        defaultPadding: '10px 14px',
        withDescriptionPadding: '14px 16px',
      },
    },
  };
}
