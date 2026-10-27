# 系统管理前端（template/sidebar）

React + Ant Design 的侧边栏管理后台，作为 `base-project-golang` 的前端，通过 `/api/v1` 接入同仓库 Go REST API。登录、系统管理、日志、通知、公告、文件与服务器监控均使用真实接口。

## 功能概览

- **应用壳层**：可折叠侧边栏、窄屏 Drawer、后端菜单驱动导航、面包屑、可关闭页面标签（`sessionStorage` 恢复）、浅色/深色主题。
- **认证**：用户名密码登录、Bearer Token、刷新后恢复登录态、401 失效回登录页、退出时清理 Query 缓存与页面标签。
- **工作台**：当前账号、角色、部门、最近登录、未读通知、可访问模块、有效公告；监控菜单可用时展示主机 CPU/内存摘要。所有数字来自真实接口。
- **系统管理**：用户、角色（含菜单授权）、菜单、部门、字典、配置、文件、登录日志、操作日志。
- **消息**：我的通知（详情即已读、全部已读、登录后通过 SSE 实时刷新）、公告（公开/站内）、ADMIN 通知发布与公告管理。
- **监控**：服务器 CPU、内存、文件系统、磁盘、网络、GPU 与高占用进程，30 秒自动刷新。需要后端 `monitoring.enabled: true`，否则菜单不返回。

## 技术栈

React 19 · TypeScript · Vite 7 · Ant Design 6 · React Router 7 · TanStack Query 5 · Axios · Zustand · CSS Modules · Vitest · React Testing Library。

## 环境要求

- Node.js 22.12 或更新版本
- pnpm 10

## 快速开始

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local   # 按需修改；默认通过 Vite 代理访问本机 API
pnpm dev
```

开发服务器默认监听 `:5173`，并把 `/api` 代理到 `http://127.0.0.1:8100`（可用 `VITE_API_PROXY_TARGET` 覆盖）。也可以在 `.env.local` 中把 `VITE_API_BASE_URL` 设为 API 源地址（如 `http://127.0.0.1:8100`），此时浏览器直连后端，需后端 CORS 允许该来源。

生产构建与 API 同源部署；`VITE_API_BASE_URL` 留空即可。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动 Vite 开发服务器 |
| `pnpm build` | 类型检查并构建生产静态资源 |
| `pnpm preview` | 预览生产构建 |
| `pnpm lint` | 运行 ESLint（含 jsx-a11y） |
| `pnpm typecheck` | 执行 TypeScript 项目检查 |
| `pnpm test` | 运行 Vitest 测试 |
| `pnpm test:coverage` | 生成 V8 覆盖率报告 |

仓库根目录提供等价任务：`task frontend:install`、`task frontend:lint`、`task frontend:typecheck`、`task frontend:test`、`task frontend:build`。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `VITE_BASE_PATH` | `/` | 部署基路径 |
| `VITE_API_BASE_URL` | 空 | API 源地址，不含 `/api/v1`；留空表示同源 |
| `VITE_API_PROXY_TARGET` | `http://127.0.0.1:8100` | 仅开发服务器代理目标 |
| `VITE_ENABLE_MSW` | `false` | 仅测试/演示用途，真实系统不启用 |

环境变量集中解析于 `src/config/env.ts`，业务代码不得直接读取 `import.meta.env`。

## 主要路由

| 路径 | 页面 |
| --- | --- |
| `/login` | 登录 |
| `/dashboard` | 工作台 |
| `/notifications` | 我的通知 |
| `/announcements` | 公告 |
| `/system/user` | 用户管理 |
| `/system/role` | 角色管理 |
| `/system/menu` | 菜单管理 |
| `/system/dept` | 部门管理 |
| `/system/dict` | 字典管理 |
| `/system/config` | 配置管理 |
| `/system/file` | 文件管理 |
| `/system/login-log` | 登录日志 |
| `/system/oper-log` | 操作日志 |
| `/system/notification` | 通知管理（ADMIN） |
| `/system/announcement` | 公告管理（ADMIN） |
| `/monitor/server` | 服务器监控 |
| `/account/profile` | 个人中心 |
| `/account/change-password` | 修改密码 |

## 菜单与路由映射

后端 `/api/v1/auth/menus` 返回的菜单带有 `component`、`path`、`icon`、`permissionCode` 和 `children`。本地 `src/config/routes.tsx` 通过 `menuComponent` 映射页面，例如：

| 后端 component | 本地路由 |
| --- | --- |
| `system/user/index` | `/system/user` |
| `system/role/index` | `/system/role` |
| `monitor/server/index` | `/monitor/server` |

侧边栏只渲染能在本地找到页面的菜单；未注册的组件会被过滤。直接访问无菜单权限的页面显示 403，未知路径显示 404。种子数据中旧版 shadcn/ui 示例菜单已通过新 migration 退役。

## 数据访问约定

- `src/lib/api/client.ts` 负责 Bearer Token、响应包解包、业务码检查和 401 处理。
- 后端 HTTP 200 + 业务失败会抛出带 `kind`、`code` 的 `ApiError`；页面使用其 `message` 展示。
- 后端分页 `records` 在 `getPage` 中转换为 `items`。
- Query key 统一在 `src/lib/queryKeys.ts` 维护；写操作后按模块失效。
- 文件预览/下载使用带鉴权的 Blob 请求，不依赖公开 URL。

## 测试

```bash
pnpm test
pnpm test:coverage
```

重点覆盖响应包与分页转换、业务错误分类、登录态恢复与清理、菜单/路由映射和通用 DataTable 行为。

## 内嵌发布

```bash
task build   # 在仓库根目录执行；先生成前端，再以 embedweb 构建 Go API
```

发布产物 `bin/base-go-api` 同时提供管理页面与 REST API，无需 Node.js 或单独静态服务。
