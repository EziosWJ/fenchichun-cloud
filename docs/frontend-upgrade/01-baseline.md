# 前端升级 1/6：基线与迁移清单

日期：2026-10-31

## 1. 基线

| 项目 | 值 |
| --- | --- |
| 项目仓库 HEAD | `3e9f00ffe7beb43eff9e4df619b1d2824c32586f`（修复云端项目和本地客户机无法同步单据的问题） |
| 脚手架基准 | `EziosWJ/react-admin-template@0047345790062e8e1668fd2e7ad445eef021eefa`（feat: complete UI refresh for shell, components and business pages） |
| 对照父提交 | `89dc60407836ee37a7eaa27794d90fba46ec095e`（docs: establish formal spec and adr baseline） |
| 模板读取方式 | 本地只读检出 `/home/wangjian/project/html/template/react-admin-template`，目标提交存在，可离线读取；未使用远端 |
| 前端目录 | `web/`（React 19 + Ant Design 6 + Vite 7 + pnpm 10） |

### 工作区原有未提交修改（必须保留）

```text
 M docs/requirements/weighbridge-sync-api-design.md
 M server/integration/monitoring_integration_test.go
 M server/integration/weighbridge_integration_test.go
 M web/src/pages/weighbridge/MasterPage.tsx
 M web/src/pages/weighbridge/TicketsPage.tsx
 M web/tests/weighbridge/TicketsPage.test.tsx
?? .agents/
?? server/migrations/seed/00010_weighbridge_master_data.sql
?? web/src/pages/weighbridge/TicketsPage.module.css
```

本次升级全程未执行 `git reset`、`git checkout`、`git clean`，未覆盖上述文件；`web/src/pages/weighbridge/TicketsPage.tsx` 与 `MasterPage.tsx` 的既有改动在页面适配时继续保留。

## 2. 基线检查（升级前）

在仓库根目录执行，Node 22 / pnpm 10：

| 命令 | 结果 | 摘要 |
| --- | --- | --- |
| `task frontend:lint` | 通过 | `eslint .` 退出码 0 |
| `task frontend:typecheck` | 通过 | `tsc -b --pretty` 退出码 0 |
| `task frontend:test` | 通过 | 10 个测试文件、42 个用例全部通过（jsdom 输出 `getComputedStyle` pseudo-element 未实现提示，不影响结果） |
| `task frontend:build` | 通过 | `tsc -b && vite build` 退出码 0；有既有 chunk > 500 kB 警告，非本次引入 |

结论：升级前无既有失败。后续任务不得掩盖本次引入的回归。

## 3. 差异清单与任务归属

### 3.1 主题与全局样式（#2）

| 模板内容 | 当前项目 | 处理 |
| --- | --- | --- |
| `src/config/theme.ts`（调色板、布局 Token、`createAppTheme`、主题解析） | 无独立文件，逻辑内联在 `AppProviders.tsx` | 迁移，保留品牌 `#1677ff` 与现有 localStorage key `app-theme` |
| `src/styles/tokens.css`（根节点布局/颜色变量） | 无 | 新增并在 `main.tsx` 中先于 `global.css` 引入 |
| `AppProviders.tsx` 使用统一 theme 工厂 + `theme-color` 同步 | 内联 ThemeConfig，未同步 `theme-color` | 改造为调用 `theme.ts` |
| `index.html` 内联主题初始化脚本，避免首屏闪烁 | 无；`theme-color` 固定 `#1677ff` | 迁移脚本，保留项目标题/描述 |
| `app.config.ts` 的 `defaultTheme: 'system'` | 无 | 增加，默认 `system`，首次访问仍跟随系统 |
| `global.css` 的焦点环、`.srOnly`、链接、减少动效 | 部分存在 | 补齐，颜色改为 `--ant-*`，删除硬编码色值 |

保留：真实 Go API、认证、401、菜单/路由权限、通知 SSE、列表 URL 状态；不引入 MSW。

### 3.2 应用壳层（#3）

| 模板改进 | 当前项目 | 处理 |
| --- | --- | --- |
| 跳到主内容 skip link | 无 | 迁移 |
| 路由切换后主内容聚焦（`tabIndex={-1}`） | 无 | 迁移 |
| 面包屑 `aria-label`、标签栏 `nav` 与关闭按钮中文名 | 部分无 | 迁移 |
| 主题按钮 `aria-pressed` | 无 | 迁移 |
| 折叠偏好仅在用户操作后写入 | 当前 `useEffect` 每次写入 | 迁移为显式持久化 |
| 移动 Drawer 品牌头、`destroyOnHidden`、按 route 条件渲染 | 当前始终渲染 | 迁移 |
| `layoutTokens` 尺寸与 CSS 变量 | 硬编码 260/76/64 等 | 统一到 `layoutTokens` / `--app-*` |
| 模板静态菜单驱动 | 项目为后端菜单驱动 + 外部链接 + 通知未读数 + 用户菜单 + SSE | **不迁移**静态菜单，保留项目导航逻辑 |

### 3.3 公共组件（#4）

| 组件 | 模板改进 | 处理 |
| --- | --- | --- |
| `DataTable` | 分页大小变化清空“本页”选择；响应式列按断点过滤且列设置保留其他断点偏好；列设置 Escape 关闭并归还焦点；总数为 0 不渲染分页；语义 region/toolbar | 全部迁移；**保留项目扩展 `defaultExpandAllRows`** |
| `SearchFilterBar` | 新增 `FilterField` 持久标签；`aria-describedby` 关联 dirty 提示；响应式 1/2 列 | 迁移，保持现有 props |
| `PageHeader` | 标题改为 h1；`meta` 包裹容器 | 迁移 |
| `StatusTag` | filled 背景 + 中性文字 + 圆点 | 迁移；**保留现有支持 `string | number` 的调用接口** |
| `QueryState` | 加载/错误/空状态文本等价物与 `role="alert"` | 迁移 |
| `DetailFields` | 去除重复配色，长文本可换行 | 迁移 |
| `ConfirmDelete` | `centered`，默认焦点在取消 | 迁移 |
| `FormDrawer`/`ImportDrawer`/`RowActions`/`ExportMenu` 等 | 模板组件 | **不迁入**：当前项目无此调用方，迁入即新增未使用抽象 |

### 3.4 业务页面（#5）

| 页面 | 检查重点 | 归属 |
| --- | --- | --- |
| `pages/system/*`（用户/角色/菜单/部门/字典/配置/文件/日志） | 筛选标签、宽表滚动、分页/排序、危险操作确认 | #5 |
| `pages/weighbridge/*`（单据/基础数据/厂区） | 保留未提交修改；筛选标签、宽表滚动、详情弹层 | #5 |
| `pages/DashboardPage.tsx` | 主题 Token、深浅色可读 | #5 |
| `pages/messages/*`、`pages/notifications/*` | 列表/详情状态、窄屏 | #5 |
| `pages/monitor/ServerMonitorPage.tsx` | 卡片/进度/表格深浅色 | #5 |
| `pages/account/*` | 表单与说明文字 | #5 |
| `pages/LoginPage.tsx` | 深浅色切换、窄屏布局 | #5 |

### 3.5 集成验收（#6）

四项检查 + 可执行的浏览器/服务验证；无法执行的真实后端场景记录阻塞与补验步骤。

## 4. 风险

1. 模板 `AppLayout` 使用静态路由菜单，直接覆盖会丢失后端菜单、外部链接、通知与用户菜单，必须手工合并。
2. 模板 `DataTable` 删除了 `defaultExpandAllRows`，本项目菜单/部门页依赖该能力，必须保留。
3. 本项目的 `StatusTag` 支持数字状态值，模板改为仅字符串泛型，直接覆盖会导致系统管理页面类型错误。
4. `web/src/pages/weighbridge/*` 存在未提交修改，页面适配只能做增量修改，不能整文件替换。
5. 模板主题测试依赖 `appConfig.defaultTheme`，需在保留现有品牌配置的前提下补字段。

## 5. 后续任务映射

- #2：`theme.ts`、`tokens.css`、`AppProviders`、`index.html`、`main.tsx`、`global.css`、`app.config`、主题测试。
- #3：`AppLayout.tsx/.module.css`、壳层测试。
- #4：公共组件与组件测试。
- #5：业务页面逐页适配与页面文档。
- #6：全量检查、可执行浏览器验证、最终报告。
