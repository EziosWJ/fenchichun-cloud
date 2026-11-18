export type DefaultThemePreference = 'system' | 'light' | 'dark';

export const appConfig = Object.freeze({
  name: '汾池春酒业',
  brandName: '汾池春酒业',
  brandSubtitle: '云端平台',
  shortName: '汾池春',
  description: '汾池春酒业云端平台管理后台',
  logoText: '汾',
  brandColor: '#1677ff',
  footerText: '© 2026 汾池春酒业 · 云端平台',
  sidebarCaption: '汾池春酒业 · 云端平台',
  loginTitle: '统一账号，安全进入系统',
  loginSubtitle: '登录后可访问按角色分配的菜单、系统数据与审计记录。',
  defaultTheme: 'system' as DefaultThemePreference,
});
