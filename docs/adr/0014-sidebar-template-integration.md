# ADR-0014：侧边栏模板接入真实 Go 后端

Status: accepted（已实施于 `template/sidebar`）

## 背景

仓库原有 `web/` 是 shadcn/ui + Tailwind 的演示前端，使用前端 mock 的认证与业务数据。新的侧边栏模板以 React 19、Ant Design 6、CSS Modules、TanStack Query、Axios、Zustand 和 pnpm 为基础，设计目标是可复用的企业管理后台壳层，但来源版本明确不接真实后端、不含登录权限。

本次目标是在同一仓库内把该壳层接入既有 Go REST API，形成一个可独立开发、验证和发布的系统管理脚手架，同时保留未来 `template/topnav` 分支复用相同后端契约与构建约定的可能。

## 决策

1. **单前端目录**：新模板直接替换 `web/`，不保留第二套 UI 体系、Tailwind/shadcn 依赖或旧页面。
2. **真实认证**：登录使用 `/api/v1/auth/login`，保存后端返回的 `tokenValue`（已包含 `Bearer `），通过 `Authorization` 请求头访问受保护接口；刷新后调用 `/auth/me` 与 `/auth/menus` 恢复会话。401 清理登录态并回到登录页，不假设存在刷新令牌能力。
3. **集中数据访问层**：Axios 客户端统一处理响应包 `{ code, message, data }`、HTTP 200 下的业务失败、错误分类与后端分页 `records → items` 转换；页面不感知原始响应包。
4. **本地页面注册 + 后端菜单映射**：`src/config/routes.tsx` 为每个系统页面声明 `menuComponent` 与 `menuPath`。侧边栏由 `/auth/menus` 生成，只渲染能映射到本地页面的菜单；直接访问、刷新和标签恢复共用同一守卫。未注册组件不展示，缺少菜单显示 403，未知路径显示 404。
5. **保持后端授权现状**：角色菜单关系与登录校验继续使用既有实现；前端按钮与页面入口控制不扩展为服务端 RBAC，也不宣称服务端按 `permissionCode` 拦截。通知管理、公告管理沿用后端已有的 ADMIN 校验。
6. **消息能力保留**：工作台、通知、公告、文件、日志和服务器监控使用真实接口；不编造统计。客户、项目、订单等纯演示业务不进入首版导航。
7. **示例菜单退役**：旧 shadcn/ui 页面删除后，新增 Goose seed migration（PostgreSQL 与 SQLite 锁步）把内置示例菜单置为隐藏/停用，避免菜单可见但页面不存在。历史 migration 不改写。
8. **构建与包管理**：前端统一使用 pnpm 与冻结锁文件；Taskfile、初始化/doctor、Dockerfile、CI 和缓存全部切换为 pnpm。生产构建仍先产出前端资源，再通过 `embedweb` 内嵌到 Go 二进制，保留 SPA 刷新回退与 JSON 404 行为。
9. **模板独立**：不抽公共包、不引入 workspace 或跨模板运行依赖。`template/topnav` 未来复用相同 API 契约、响应解析和构建约定，而不是共享源码。

## 后果

- `web/` 与后端形成单一事实来源：认证、菜单、分页和错误处理集中在固定层，后续页面接入成本低。
- 后端菜单新增了未注册组件时不会显示在侧边栏；新增页面必须同时维护本地路由注册与菜单数据。
- 旧示例页面、Tailwind/shadcn 依赖及其浏览器验证脚本被移除；示例菜单通过新 migration 退役。
- 前端开发默认通过 Vite 代理访问本机 API，生产同源部署；`VITE_API_BASE_URL` 仅表示 API 源地址，不包含 `/api/v1`。
- 登录后通过带 Bearer 头的 fetch 订阅 `/api/v1/system/notification/events`，用于实时刷新未读与通知列表；未登录的公开公告 SSE 流未在首版接入。
