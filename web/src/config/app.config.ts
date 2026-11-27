export type DefaultThemePreference = 'system' | 'light' | 'dark';

export const appConfig = Object.freeze({
  name: '汾池春酒业',
  brandName: '汾池春酒业',
  brandSubtitle: '厂云管理平台',
  shortName: '汾池春',
  description: '汾池春酒业综合管理大平台',
  logoText: '汾',
  brandColor: '#9e3b2c',
  footerText: '© 2026 汾池春酒业 · 厂云综合管理平台',
  sidebarCaption: '汾池春酒业 · 厂云协同',
  loginTitle: '酿造匠心，厂云协同',
  loginSubtitle: '覆盖原粮入厂流转、化验质检、智能过磅对账与多厂区经营分析的一体化管理平台。',
  defaultTheme: 'system' as DefaultThemePreference,
});
