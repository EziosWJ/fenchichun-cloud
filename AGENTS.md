# AGENTS.md

请使用中文交流和思考！

## 项目结构

```
project/
├── web/   # 前端项目（React + Ant Design 侧边栏），直接在此开发
├── server/   # 后端项目（Go），直接在此开发
```

## 前端技术基线（template/sidebar）

- React 19、TypeScript、Vite 7、Ant Design 6、CSS Modules、React Router 7、TanStack Query、Axios、Zustand、pnpm 10。
- 前端通过 `/api/v1` 接入真实 Go 后端；响应包、业务码、401 和分页转换集中在 `web/src/lib/api/`。
- 侧边栏由后端 `/auth/menus` 驱动，后端 `component` 与 `web/src/config/routes.tsx` 的 `menuComponent` 一一映射；未注册菜单不展示，无菜单权限的直接访问显示 403。
- 不引入 Tailwind、shadcn 或第二套图标/样式/HTTP 体系；真实开发与生产默认不启用 MSW。
- 前端依赖统一使用 pnpm 与 `pnpm-lock.yaml`；任务入口为 `task frontend:install|lint|typecheck|test|build`。

## 上下文管理规则

**避免全量读取脚手架项目，按需读取：**

1. **不要递归列出** `web/` 或 `server/` 全部文件
2. 针对任务搜索并读取相关源码和文档，避免批量读取无关内容。

## 工作模式

- **直接在脚手架项目内开发**，不新建 `src/` 目录
- 参考脚手架结构时，按需读取具体文件，不要批量扫描

## Taskfile 开发与启动入口

根目录 `Taskfile.yml` 是项目日常开发、启动和验证的统一入口。Agent 优先使用这些任务，不要在已有等价任务时自行拼接目录切换、环境变量或启动命令。

- 后端本地配置使用 `server/configs/config.dev.yaml`；数据库和 JWT 配置放在该文件中，不另建根目录 `.env.local` 作为后端运行配置。
- `task db:migrate`：执行全部 Goose schema 和 seed migration；首次启动、数据库重建或修改 migration 后执行。
- `task api`：启动 Go API，默认监听 `:8100`。
- `task web`：启动 React 开发服务器，默认监听 `:5173`。
- `task dev`：先执行数据库 migration，再并行启动 API 和前端；适合全新环境或需要确保数据库已更新时使用。
- `task backend:test`：执行后端单元测试。
- `task backend:check`：执行后端测试和 `go vet`。
- `task backend:integration`：执行 PostgreSQL 集成测试，需要 Docker。
- `task frontend:lint`：执行前端 ESLint。
- `task frontend:build`：执行前端 TypeScript/Vite 构建。
- `task check`：执行后端检查、前端 lint 和前端构建。
- `task test`：执行默认后端测试集。

推荐的 Agent 验证顺序：后端改动执行 `task backend:check`，前端改动执行 `task frontend:lint` 和 `task frontend:build`，涉及数据库结构时先执行 `task db:migrate`，需要联调时再启动 `task api` 或 `task dev`。长时间运行的任务必须配合健康检查或明确的超时与清理；API 使用 `/health` 检查存活、`/ready` 检查数据库就绪。

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

## Agent skills

### Issue tracker

工作项存放在本仓库的 GitHub Issues，skills 通过 `gh` CLI 读写。详见 `docs/agents/issue-tracker.md`。

### Triage labels

triage 流转使用 5 个默认标签（needs-triage / needs-info / ready-for-agent / ready-for-human / wontfix）。详见 `docs/agents/triage-labels.md`。

### Domain docs

单上下文：根目录 `CONTEXT.md` + `docs/adr/`。详见 `docs/agents/domain.md`。

## web 开发规范

本目录是 `template/sidebar` 脚手架的前端实现：React + Ant Design 侧边栏管理后台，接入同仓库的 Go REST API，不再是纯前端模拟模板。

## 技术基线
- React 19、TypeScript、Vite 7、pnpm 10（以 `pnpm-lock.yaml` 为准）。
- Ant Design 6；样式使用 CSS Modules + Ant Design Design Token，不引入 Tailwind。
- React Router Data Router（`createBrowserRouter` + `RouterProvider`），页面使用 `React.lazy`。
- Axios 负责 HTTP；TanStack Query 管理服务端数据；Zustand 管理登录态、页面标签等客户端状态。
- MSW 仅保留测试能力，真实开发与生产默认不启动浏览器 mock。

## 与 Go 后端的契约
- 统一响应为 `{ code, message, data }`，成功 `code = 200`；HTTP 200 也可能携带业务失败，必须在数据访问层检查 `code`。
- 认证入口：`/api/v1/auth/login`、`/logout`、`/me`、`/menus`；请求头为 `Authorization: Bearer <tokenValue>`。
- 后端分页字段为 `records`，前端统一转换为 `items`，页面只使用 `PaginatedResult`。
- 所有 API 调用集中在 `src/features/<module>/api.ts` 与 `src/lib/api/`；页面不得直接使用 Axios 或拼接响应包。
- 请求失败统一规范化为 `ApiError`；401 清理登录态，页面负责展示错误，公共层不自动弹窗。

## 菜单、路由与权限
- 后端菜单的 `component` 标识与 `src/config/routes.tsx` 的 `menuComponent` 一一映射；未注册的组件不会出现在侧边栏，避免死链接。
- `menuPath` 表示访问该页面所需的后端菜单；直接访问、刷新、标签恢复都会经过同一守卫。缺少菜单时展示 403。
- 通知管理、公告管理仅允许 `ADMIN` 角色；这只是前端入口控制，后端接口仍按既有授权规则校验。
- 面包屑、页面标签、侧边栏选中项都从同一路由/菜单数据派生，不另行硬编码。

## 目录约定
- `src/app/`：Providers、Data Router 装配与错误兜底。
- `src/config/`：环境变量、品牌、路径、路由/菜单映射与静态选项。
- `src/components/`：通用 UI（DataTable、PageHeader、查询状态、状态标签等）。
- `src/features/<module>/api.ts`：模块数据访问层。
- `src/pages/`：登录、工作台、账号与系统管理页面。
- `src/lib/`：Axios 客户端、错误规范化、QueryClient、菜单与导航工具。
- `src/stores/`：Zustand 登录态与页面标签。
- `tests/`：Vitest + React Testing Library，按模块镜像组织。

## 质量要求
- 页面必须覆盖加载、错误、空数据状态；危险操作需要确认；业务失败使用后端 `message`。
- 修改后运行 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`；也可以在仓库根目录运行 `task frontend:lint`、`task frontend:typecheck`、`task frontend:test`、`task frontend:build`。
- 列表分页、关键词、筛选和排序通过 `useListUrlState` 同步到 URL。
- 新增系统页面时必须同时在后端种子菜单（或管理端菜单）中维护组件标识，并补上本地路由注册。
- 不新增第二套图标库、样式体系或 HTTP 客户端。
