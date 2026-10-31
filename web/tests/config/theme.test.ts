import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { appConfig } from '../../src/config/app.config';
import tokensCss from '../../src/styles/tokens.css?raw';
import {
  appPalette,
  createAppTheme,
  getSystemTheme,
  layoutTokens,
  readStoredTheme,
  resolveInitialTheme,
  THEME_STORAGE_KEY,
} from '../../src/config/theme';

describe('theme tokens', () => {
  it('applies the configured default before React, with stored preference taking priority', () => {
    const html = readFileSync('index.html', 'utf8');
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeDefined();
    for (const [configured, stored, systemDark, expected] of [
      ['light', null, true, 'light'],
      ['dark', null, false, 'dark'],
      ['system', null, true, 'dark'],
      ['light', 'dark', false, 'dark'],
    ] as const) {
      const root = { dataset: { theme: '' }, style: { colorScheme: '' } };
      runInNewContext(script!.replace('%APP_DEFAULT_THEME%', configured), {
        localStorage: { getItem: () => stored },
        window: { matchMedia: () => ({ matches: systemDark }) },
        document: { documentElement: root },
      });
      expect(root.dataset.theme).toBe(expected);
      expect(root.style.colorScheme).toBe(expected);
    }
  });

  it('derives both themes from the single brand configuration', () => {
    for (const mode of ['light', 'dark'] as const) {
      const config = createAppTheme(mode);
      expect(config.token?.colorPrimary).toBe(appConfig.brandColor);
      expect(config.token?.colorInfo).toBe(appConfig.brandColor);
      expect(config.token?.colorLink).toBe(appPalette[mode].brandText);
      expect(config.components?.Button?.defaultHoverColor).toBe(appPalette[mode].brandText);
    }
  });

  it('maps distinct page, surface, text and menu colors for each theme', () => {
    const light = createAppTheme('light');
    const dark = createAppTheme('dark');

    expect(light.token?.colorBgLayout).toBe(appPalette.light.colorBgLayout);
    expect(dark.token?.colorBgLayout).toBe(appPalette.dark.colorBgLayout);
    expect(light.token?.colorBgContainer).not.toBe(dark.token?.colorBgContainer);
    expect(light.token?.colorText).not.toBe(dark.token?.colorText);

    // Menu 使用 theme={themeMode}，深色下必须命中 dark* token。
    expect(dark.components?.Menu?.darkItemSelectedBg).toBe(appPalette.dark.menuItemSelectedBg);
    expect(dark.components?.Menu?.darkItemSelectedColor).toBe(appPalette.dark.brandText);
    expect(dark.components?.Layout?.siderBg).toBe(appPalette.dark.colorBgContainer);
  });

  it('uses a safe unit for the menu group title line height', () => {
    expect(createAppTheme('light').components?.Menu?.groupTitleLineHeight).toBe('20px');
  });

  it('uses a unitless multiplier for modal title line height', () => {
    // AntD 将 Modal.titleLineHeight 直接写入 CSS line-height；数字 24 会被当成 24 倍行高。
    expect(createAppTheme('light').components?.Modal?.titleLineHeight).toBe(1.5);
  });

  it('exposes the shared layout dimensions', () => {
    expect(layoutTokens.siderWidth).toBeGreaterThan(layoutTokens.siderCollapsedWidth);
    expect(layoutTokens.headerHeight % 4).toBe(0);
  });

  it('keeps root colors and shared header height aligned with CSS tokens', () => {
    const light = tokensCss.match(/:root\s*\{([^}]+)\}/)?.[1] ?? '';
    const dark = tokensCss.match(/html\[data-theme='dark'\]\s*\{([^}]+)\}/)?.[1] ?? '';
    expect(light).toContain(`--app-header-height: ${layoutTokens.headerHeight}px;`);
    for (const [css, mode] of [[light, 'light'], [dark, 'dark']] as const) {
      expect(css).toContain(`--app-color-page: ${appPalette[mode].colorBgLayout};`);
      expect(css).toContain(`--app-color-text: ${appPalette[mode].colorText};`);
    }
  });

  it('resolves the stored preference, configured default and system fallback in order', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(readStoredTheme()).toBe('dark');
    expect(resolveInitialTheme()).toBe('dark');

    window.localStorage.removeItem(THEME_STORAGE_KEY);
    expect(resolveInitialTheme()).toBe(
      appConfig.defaultTheme === 'light' || appConfig.defaultTheme === 'dark'
        ? appConfig.defaultTheme
        : getSystemTheme(),
    );
  });
});

function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((start) => parseInt(value.slice(start, start + 2), 16) / 255);
  const linear = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (left, right) => right - left,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

describe('theme contrast', () => {
  it('keeps semantic text and brand text at AA contrast in both themes', () => {
    for (const mode of ['light', 'dark'] as const) {
      const palette = appPalette[mode];
      for (const foreground of [
        palette.colorText,
        palette.colorTextSecondary,
        palette.colorTextTertiary,
      ]) {
        expect(contrastRatio(foreground, palette.colorBgContainer)).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrastRatio(palette.brandText, palette.colorPrimaryBg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(palette.tableHeaderColor, palette.tableHeaderBg)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
