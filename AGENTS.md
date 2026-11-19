# AGENTS.md

请使用中文。先读 [README 的当前基线](README.md#当前基线) 和 [领域术语表](CONTEXT.md)，再按任务读取对应契约和源码。用搜索定位相关文件，避免递归遍历整个 `server/` 或 `web/`。开发入口为 `server/`、`web/` 和 `miniprogram/`，在各自目录内修改。

## 开发与验证

- 使用根目录 [Taskfile.yml](Taskfile.yml) 的已有任务。后端配置使用 `server/configs/config.dev.yaml`，数据库与 JWT 配置放在该文件。启动、端口、迁移与部署步骤见 [README](README.md#快速开始)。
- 后端改动执行 `task backend:check`。涉及 PostgreSQL 契约时，用隔离数据库执行 `task backend:integration`。Schema 与种子数据通过显式 Goose migration 管理。修改 REST API 时，更新 Handler/DTO 注释、生成的 Swagger 和对应契约。
- Web 改动执行 `task frontend:lint`、`task frontend:typecheck`、`task frontend:test`、`task frontend:build`。依赖使用 pnpm 和仓库锁文件。
- 小程序按 [miniprogram/AGENTS.md](miniprogram/AGENTS.md) 开发，静态验证用 `task miniprogram:check`。修改现场交互时，按小程序验收文档记录 IDE 或真机证据。
- 长时间运行的任务需要健康检查或超时和清理。API 用 `/health` 检查进程存活，用 `/ready` 检查数据库就绪。报告实际执行的验证与阻塞原因。
- 实现前明确有实质影响的假设。将改动限制在需求范围，沿用现有边界和模式。用可验证结果判断完成。

## 按任务查阅

- 后端分层、数据库、配置、审计及 API 前缀见 [ADR](docs/adr/)。Handler 处理 HTTP，Service 负责业务规则，Repository 负责持久化。
- 跨端字段、同步、重试、版本及联调场景见 [README 的文档入口](README.md#文档)。领域术语和 ADR 的维护方式见 [docs/agents/domain.md](docs/agents/domain.md)。
- 工作项使用本仓库 GitHub Issues，见 [Issue tracker](docs/agents/issue-tracker.md) 和 [分流标签](docs/agents/triage-labels.md)。

## Web 开发

- 使用 React、Ant Design、CSS Modules 与 Ant Design Design Token，复用现有图标库和 Axios 客户端。MSW 用于测试，真实开发和生产默认关闭。
- 将模块 API 放在 `web/src/features/<module>/api.ts`，在 `web/src/lib/api/` 统一解包 `{ code, message, data }`、检查业务码、转换 `records → items`、规范化 `ApiError` 并处理 401。页面展示业务失败信息，公共层统一返回错误。
- `/api/v1/auth/menus` 的 `component` 对应 `web/src/config/routes.tsx` 的 `menuComponent`。新增菜单页面同步维护服务端菜单和本地路由。直接访问、刷新和标签恢复统一使用 `menuPath` 守卫，缺少菜单展示 403。通知和公告管理入口仅向 `ADMIN` 开放，服务端按各接口授权。面包屑、标签和侧栏状态从路由与菜单派生。
- 页面覆盖加载、空数据和失败状态，危险操作需确认。列表分页、关键词、筛选和排序通过 `useListUrlState` 同步 URL。
- 排查 Ant Design 浮层时，在原路由复现，并与仓库中同类控件对照。检查数据、挂载位置、坐标、遮挡和横向溢出，通过组件 API 或共享配置修复。减少动效使用 `ConfigProvider` 的 `token.motion`，只对项目自身节点使用全局 CSS 动效覆盖。浏览器验证普通和减少动效模式下的展开、选中和溢出，搜索控件还需验证筛选和空结果。可参考 `node web/tests/weighbridge/select-popups.smoke.mjs`。
