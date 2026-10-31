# 前端升级 5/6：业务页面适配清单

日期：2026-10-31

## 适配原则

- 只修改迁移所需的布局、筛选标签、窄屏表格与视觉状态；不改变真实接口、权限、分页、筛选、保存、危险操作确认与错误提示行为。
- 主题颜色统一消费 `--ant-*` / `--app-*`；页面不再新增硬编码颜色。
- 宽表继续通过 `DataTable` 的 `scrollX`（默认 `max-content`）在容器内横向滚动。
- `web/src/pages/weighbridge/TicketsPage.tsx`、`MasterPage.tsx` 的既有未提交修改均保留，页面适配为增量修改。

## 页面清单

| 页面 | 状态 | 检查/改动 |
| --- | --- | --- |
| `pages/LoginPage.tsx` | 已适配 | 深浅色切换按钮补 `aria-pressed`；主题按钮在窄屏仍固定于表单区右上角；品牌面板使用固定品牌渐变（不随主题反转），表单区背景/文字走主题变量 |
| `pages/DashboardPage.tsx` | 无需修改 | 使用 `PageHeader`、AntD Card/Statistic，颜色全部来自主题 Token；`pageStack` 间距由全局样式统一 |
| `pages/system/UsersPage.tsx` | 已适配 | 用户名/昵称/状态/部门/关键词改用 `FilterField` 持久标签；分页、选择、角色分配与危险操作未变 |
| `pages/system/RolesPage.tsx` | 已适配 | 角色名称/编码/状态/关键词改用 `FilterField` |
| `pages/system/MenusPage.tsx` | 已适配 | 本地筛选（名称/路径/组件/权限标识、类型、状态）改用 `FilterField`；保留 `defaultExpandAllRows` 树表 |
| `pages/system/DeptsPage.tsx` | 已适配 | 部门搜索与状态筛选改用 `FilterField`；保留树表与删除确认 |
| `pages/system/DictsPage.tsx` | 已适配 | 字典名称/编码/状态/关键词改用 `FilterField`；字典数据子表行为未变 |
| `pages/system/ConfigsPage.tsx` | 已适配 | 配置名称/键/类型/状态/关键词改用 `FilterField` |
| `pages/system/FilesPage.tsx` | 已适配 | 文件名/业务模块/MIME/状态/关键词改用 `FilterField`；上传、预览、下载逻辑未变 |
| `pages/system/LoginLogsPage.tsx` | 已适配 | 用户名/结果/IP/关键词改用 `FilterField`；清空日志确认未变 |
| `pages/system/OperLogsPage.tsx` | 已适配 | 模块/操作类型/操作人/结果/关键词改用 `FilterField`；详情长文本保留 `pre-wrap`/`break-all` |
| `pages/system/AnnouncementAdminPage.tsx` | 无需修改 | 使用 `PageHeader` + `DataTable`，无筛选栏；危险操作仍走 Modal 确认 |
| `pages/system/NotificationAdminPage.tsx` | 无需修改 | 发布表单与历史列表结构不变，颜色来自主题 Token |
| `pages/weighbridge/TicketsPage.tsx` | 已适配 | 9 个筛选控件改用 `FilterField`（关键词 wide、日期 date），保留即时写入 URL 的既有筛选行为；详情弹层宽表可滚动；`TicketsPage.module.css` 改为主题变量，深色可读 |
| `pages/weighbridge/MasterPage.tsx` | 已适配 | 名称/编码搜索与身份筛选改用 `FilterField`；编辑弹层与联系人表单行为未变 |
| `pages/weighbridge/SitesPage.tsx` | 已适配 | 无筛选栏；`DataTable` 窄屏横向滚动；登记/编辑弹层行为未变 |
| `pages/notifications/NotificationsPage.tsx` | 无需修改 | 列表/详情均使用公共组件，颜色来自主题 Token |
| `pages/messages/AnnouncementsPage.tsx` | 无需修改 | 范围切换使用 `Segmented`，位于 `PageHeader.extra`，窄屏自动换行 |
| `pages/monitor/ServerMonitorPage.tsx` | 无需修改 | 无硬编码颜色；Card/Progress/Table 由主题 Token 驱动，宽表容器内滚动 |
| `pages/account/ProfilePage.tsx`、`ChangePasswordPage.tsx` | 无需修改 | 表单标签、校验、错误提示沿用 AntD 主题 |
| `pages/ForbiddenPage.tsx`、`NotFoundPage.tsx`、`RouteErrorPage.tsx` | 无需修改 | 纯展示/错误兜底，使用主题文字色 |

## 说明

- 页面筛选仍沿用各自既有语义：`SearchFilterBar` 页面为“显式查询后写 URL”；过磅单据、基础数据、部门、菜单为即时筛选。本次只补持久可见标签，不改变提交时机。
- 未新增第二套图标/样式/HTTP 体系；未启用 MSW；未改动后端契约。
