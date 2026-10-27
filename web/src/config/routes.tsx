import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import {
  Bell,
  Building2,
  ClipboardList,
  File,
  FileText,
  LayoutDashboard,
  ListTree,
  LogIn,
  Menu,
  MonitorCog,
  Settings2,
  ShieldHalf,
  UserRoundCog,
  type LucideIcon,
} from 'lucide-react';
import { paths } from './paths';

export interface AppRouteDefinition {
  path: string;
  label: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** 后端菜单 component 标识；与本地页面注册的明确映射。 */
  menuComponent?: string;
  /** 访问该页面所需的后端菜单路径；缺省表示登录后即可访问。 */
  menuPath?: string;
  hideInMenu?: boolean;
  parentPath?: string;
  adminOnly?: boolean;
  component: LazyExoticComponent<ComponentType>;
}

export const routeDefinitions: AppRouteDefinition[] = [
  {
    path: paths.dashboard,
    label: '工作台',
    title: '工作台',
    description: '账号信息、可用模块与最新消息。',
    icon: LayoutDashboard,
    component: lazy(() => import('../pages/DashboardPage')),
  },
  {
    path: paths.notifications,
    label: '我的通知',
    title: '我的通知',
    description: '查看发送给你的站内通知。',
    icon: Bell,
    component: lazy(() => import('../pages/notifications/NotificationsPage')),
  },
  {
    path: `${paths.notifications}/:id`,
    label: '通知详情',
    title: '通知详情',
    hideInMenu: true,
    parentPath: paths.notifications,
    component: lazy(() => import('../pages/notifications/NotificationsPage')),
  },
  {
    path: paths.announcements,
    label: '公告',
    title: '公告',
    description: '查看公开公告与站内公告。',
    icon: FileText,
    component: lazy(() => import('../pages/messages/AnnouncementsPage')),
  },
  {
    path: paths.users,
    label: '用户管理',
    title: '用户管理',
    description: '系统账号、部门归属、角色与登录状态。',
    icon: UserRoundCog,
    menuComponent: 'system/user/index',
    menuPath: paths.users,
    component: lazy(() => import('../pages/system/UsersPage')),
  },
  {
    path: paths.roles,
    label: '角色管理',
    title: '角色管理',
    description: '角色定义、菜单权限与启用状态。',
    icon: ShieldHalf,
    menuComponent: 'system/role/index',
    menuPath: paths.roles,
    component: lazy(() => import('../pages/system/RolesPage')),
  },
  {
    path: paths.menus,
    label: '菜单管理',
    title: '菜单管理',
    description: '目录、页面与外链的导航结构。',
    icon: Menu,
    menuComponent: 'system/menu/index',
    menuPath: paths.menus,
    component: lazy(() => import('../pages/system/MenusPage')),
  },
  {
    path: paths.depts,
    label: '部门管理',
    title: '部门管理',
    description: '组织部门树与负责人信息。',
    icon: Building2,
    menuComponent: 'system/dept/index',
    menuPath: paths.depts,
    component: lazy(() => import('../pages/system/DeptsPage')),
  },
  {
    path: paths.dicts,
    label: '字典管理',
    title: '字典管理',
    description: '字典类型与字典数据。',
    icon: ListTree,
    menuComponent: 'system/dict/index',
    menuPath: paths.dicts,
    component: lazy(() => import('../pages/system/DictsPage')),
  },
  {
    path: paths.configs,
    label: '配置管理',
    title: '配置管理',
    description: '系统运行参数与自定义配置。',
    icon: Settings2,
    menuComponent: 'system/config/index',
    menuPath: paths.configs,
    component: lazy(() => import('../pages/system/ConfigsPage')),
  },
  {
    path: paths.files,
    label: '文件管理',
    title: '文件管理',
    description: '上传文件元数据、预览、下载与状态。',
    icon: File,
    menuComponent: 'system/file/index',
    menuPath: paths.files,
    component: lazy(() => import('../pages/system/FilesPage')),
  },
  {
    path: paths.loginLogs,
    label: '登录日志',
    title: '登录日志',
    description: '账号登录结果与来源信息。',
    icon: LogIn,
    menuComponent: 'system/login-log/index',
    menuPath: paths.loginLogs,
    component: lazy(() => import('../pages/system/LoginLogsPage')),
  },
  {
    path: paths.operLogs,
    label: '操作日志',
    title: '操作日志',
    description: '管理模块成功写操作审计记录。',
    icon: ClipboardList,
    menuComponent: 'system/oper-log/index',
    menuPath: paths.operLogs,
    component: lazy(() => import('../pages/system/OperLogsPage')),
  },
  {
    path: paths.monitorServer,
    label: '服务器监控',
    title: '服务器监控',
    description: 'API 所在宿主机的 CPU、内存、磁盘与网络指标。',
    icon: MonitorCog,
    menuComponent: 'monitor/server/index',
    menuPath: paths.monitorServer,
    component: lazy(() => import('../pages/monitor/ServerMonitorPage')),
  },
  {
    path: paths.notificationAdmin,
    label: '通知管理',
    title: '通知管理',
    description: '向启用用户发布站内通知并查看投递情况。',
    icon: Bell,
    hideInMenu: true,
    adminOnly: true,
    component: lazy(() => import('../pages/system/NotificationAdminPage')),
  },
  {
    path: paths.announcementAdmin,
    label: '公告管理',
    title: '公告管理',
    description: '创建草稿、发布与撤下公开/站内公告。',
    icon: FileText,
    hideInMenu: true,
    adminOnly: true,
    component: lazy(() => import('../pages/system/AnnouncementAdminPage')),
  },
  {
    path: paths.accountProfile,
    label: '个人中心',
    title: '个人中心',
    hideInMenu: true,
    component: lazy(() => import('../pages/account/ProfilePage')),
  },
  {
    path: paths.changePassword,
    label: '修改密码',
    title: '修改密码',
    hideInMenu: true,
    component: lazy(() => import('../pages/account/ChangePasswordPage')),
  },
];

export const sidebarStaticRoutes: AppRouteDefinition[] = routeDefinitions.filter((route) =>
  (['/dashboard', '/notifications', '/announcements'] as string[]).includes(route.path),
);

export const adminMenuRoutes: AppRouteDefinition[] = routeDefinitions.filter((route) => route.adminOnly);
