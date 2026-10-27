# 项目上下文

> 本文件记录本项目的领域语言与术语。它是 `improve-codebase-architecture` / `diagnose` / `tdd` / `grill-with-docs` 等 skills 读取的"词汇表"——当输出里需要命名一个领域概念时，从这里取词，避免各自生造近义词。
>
> **不要在这里编造术语。** 只写已经真实存在于代码或对话里的词。如果项目结构暗示存在某个概念（例如脚手架里预留了 `src/modules/user/`），先不要假设它的业务含义——等业务含义在对话里浮现、并经 `/grill-with-docs` 确认后再补进来。

## 项目概览

- **项目代号**: base-project-java 仓库
- **仓库类型**: monorepo
- **交流 / 输出语言**: 中文
- **项目定位**: React 管理后台 + Go REST API 后端（monorepo 单仓库），Java 参考后端已删除，接口统一在 `server/` 开发。
- **当前后端事实**: `server/` 是可运行的 Go 后端（Gin、配置、PostgreSQL 连接池、Goose、统一响应、CORS、可观测性与 Swagger），仅支持 PostgreSQL。已迁移认证、角色、菜单、部门、用户、字典、系统配置、本地文件管理、日志管理和站内通知接口。文件内容存于配置的本地根目录（开发 Compose 使用持久化 Volume），数据库仅保存元数据和相对路径；删除保持元数据软删，不删除物理内容。所有管理模块的成功写操作写入操作审计日志；登录日志与操作日志的查询、详情与清空接口已迁移，清空受 `system.log-clear-enabled` 配置门控，操作日志查询通过 LEFT JOIN sys_user 回填 operator_name。站内通知支持 ADMIN 发布、用户分页查询和已读状态，用户角色集合实际变化时在同一事务写入角色变更通知。既有迁移接口和站内通知均有 PostgreSQL 集成契约覆盖，Swagger 随实现同步生成。Java 参考后端 `base-api/` 已删除（可从 git 历史恢复）。
- **脚手架占位内容**: 脚手架里已出现大量"占位"示例（如 HelloWorld、UserTable、示例组件等），这些**不是真正的业务概念**，只是脚手架产物。真正的业务领域术语应来自后续的业务对话，而不是反向推导脚手架示例。

## 目录结构

```
/
├── web/      # 前端（管理后台 SPA）
├── server/      # Go REST API（后端接口在此开发）
├── record/           # 项目过程记录
├── docs/
│   ├── adr/          # 架构决策记录（ADR）
│   └── agents/       # Agent skills 的仓库级配置
└── task/             # 任务上下文（读取范围边界时参考）
```

## 技术栈与演进状态

### 前端 web
- 框架: React 19 + TypeScript + Vite 7 + Ant Design 6
- 路由: react-router-dom v7 Data Router；页面按本地路由注册懒加载
- 服务端数据: TanStack Query；HTTP: Axios
- 状态管理: Zustand（登录态、页面标签）
- 样式: CSS Modules + Ant Design Design Token；不使用 Tailwind/shadcn
- 图标: lucide-react
- 包管理: pnpm 10（冻结锁文件）
- 认证: 通过 `/api/v1/auth/*` 接入真实 Go 后端，Bearer Token 保存在本地，刷新后恢复
- 菜单: 后端 `/auth/menus` 驱动侧边栏，`component` 与本地 `menuComponent` 映射；未注册组件不展示
- MSW: 仅保留测试能力，真实系统默认关闭

### 当前后端 server（Go，唯一后端）

- 形态: 模块化单体（Modular Monolith），提供 REST API，发布版本可同时提供内嵌管理页面；不提前拆微服务。
- Web: Gin；数据访问: GORM + Go 标准 `database/sql`；Schema: Goose migration。
- 数据库：仅支持 PostgreSQL。
- 配置: 使用 Koanf v2，覆盖顺序为默认值 → `config.yaml` → `config.{APP_ENV}.yaml` → `APP_` 环境变量；PostgreSQL URL、用户名和密码分开配置。
- API: 所有业务接口统一使用 `/api/v1/...` 前缀：认证为 `/api/v1/auth`、系统管理为 `/api/v1/system`、公开公告为 `/api/v1/public`、服务器监控为 `/api/v1/monitoring`，并使用统一响应/错误码/分页。旧未版本化的 `/api/auth`、`/api/system`、`/api/public` 路由以及兼容别名已移除，详见 ADR-0013。Gin Handler 与 DTO 注释是文档来源，使用 `swaggo/swag` 生成并提交 Swagger 2.0 文档；Swagger UI 仅在开发环境开放。`/health`、`/ready`、`/metrics` 与开发环境 Swagger 入口保持既有职责和路径。
- CORS: 默认允许跨域 Bearer Token 请求且不启用 Cookie 凭据；可通过精确 `allowed_origins` 配置收紧来源范围，不使用允许凭据的通配来源。
- 认证: 目标为 JWT 加数据库管理的动态角色和菜单关系；`ADMIN` 是内置角色，`admin`、`user` 只是角色示例。JWT 使用 HS256，密钥由运行配置提供，包含 `sub`、`jti`、`iat`、`exp` 并校验 `issuer`、`audience`，不包含角色或菜单。Gin middleware 首版只校验登录态，不按 `permissionCode` 拦截接口；会话持久化在所选数据库的 `auth_session` 表中，JWT `jti` 用于校验和登出即时撤销；不引入 Redis、Casbin、ABAC、多租户权限或组织树数据权限。
- 可观测性: 使用 `log/slog` 记录 request_id、请求方法与路径、状态、耗时、user_id 和错误；`/health` 只检查进程存活，`/ready` 检查所选数据库并在不可用时返回 503，`/metrics` 不要求 JWT、仅通过内部网络或反向代理白名单供 Prometheus 抓取且不应用默认 CORS。业务审计日志须落库，不能由应用日志替代：middleware 将 request_id、IP、User-Agent 写入标准 `context.Context`，Service 显式记录审计，Repository 持久化；认证记录成功与失败登录，其他操作仅在业务成功后记录。
- 其他目标组件: 本地文件系统加 Docker Volume（文件服务与存储实现解耦）、Excelize、Docker 与 Docker Compose；不提前引入 Kubernetes、OpenTelemetry tracing、Redis 分布式锁或微服务治理基础设施。

通用架构取舍见 [ADR-0004](docs/adr/0004-backend-architecture-and-database-strategy.md)；SQLite 相关历史决策已不适用于本项目。

## Go 后端架构约定（目标实现必须遵守）

### 初始目录布局

```text
server/
├── cmd/api/                 # HTTP 服务入口
├── cmd/migrate/             # 显式 Goose migrate 命令
├── configs/                 # 基础配置与环境模板；实际环境 YAML 不提交
├── migrations/              # Schema 与 seed migration
├── docs/                    # 提交的 Swagger 生成文件
├── internal/app/            # 依赖组装与路由注册
├── internal/config/         # Koanf 配置加载
├── internal/platform/
│   ├── database/            # GORM、连接池、方言隔离
│   └── http/                # 统一响应、错误和通用 middleware
└── internal/auth/           # 首个业务模块
```

测试与被测模块同目录放置为 `*_test.go`；不创建全局 controller/service/repository 目录。

### 模块与依赖

- 代码优先按业务模块组织，而不是把 controller/service/repository/entity/dto 分散为全局技术目录。模块按需包含 `handler.go`、`service.go`、`repository.go`、`dto.go`、`model.go`；不为形式补齐空文件。
- 推荐边界为 `Handler → Service → Repository → GORM → database/sql → 数据库`。依赖在 `internal/app` 或实际 composition root 手工组装：Config → Database → Repository → Service → Handler → Router。
- Handler 只处理 HTTP 参数、DTO、参数校验、状态码和 API response；不写业务逻辑、不直接访问数据库。
- Service 使用 `context.Context`，负责规则、校验、状态流转和编排；不依赖 Gin Context、GORM 或具体数据库。简单审批以 `Approve()`、`Reject()` 等明确方法表达，不使用万能 `UpdateStatus()`。
- Repository 负责查询、持久化和事务中的数据库操作。普通模块可直接使用含 `db *gorm.DB` 的具体 Repository；仅在确有多实现或跨模块能力边界时定义 interface。禁止 Java 式空壳 `RepositoryImpl`、Factory。
- 不使用 Fx、Dig、Wire、Service Locator、业务 Singleton 或全局 Service。基础设施在启动时创建一次并通过依赖传递共享。

### 数据库与 Migration

- 业务查询使用 PostgreSQL，优先采用清晰、可维护的 SQL。
- 不要让 JSONB、ARRAY、ILIKE、RETURNING、DISTINCT ON、扩展、专属 UUID、MySQL ENUM/函数/UPSERT、专属全文搜索或存储过程扩散到业务层。确有需要时，隔离在 infrastructure/database 或 Repository 层，并记录原因、提供针对性测试；驱动判断不得进入 Handler 或 Service。
- 启动时只创建一个 GORM DB；通过 `gormDB.DB()` 获取并配置同一个 `*sql.DB` 的连接池（MaxOpenConns、MaxIdleConns、ConnMaxLifetime、ConnMaxIdleTime）。Repository/Service 持有的是池化 DB 句柄，不是固定 TCP 连接；不另引入连接池框架。
- Schema 变更必须随代码提交版本化 Goose migration。生产环境和 API 进程均不自动执行 migration 或 `AutoMigrate()`；部署前由独立的 `migrate up` 步骤执行，Docker Compose 使用一次性 migrate 服务并在成功后启动 API。本地开发也执行相同的显式命令。表、索引和约束与管理员、根部门、`ADMIN`、菜单、字典、系统配置等内置数据分属独立 migration；种子数据只执行一次，不由 API 自动补种。PostgreSQL 使用独立的 schema 和 seed migration。
- 实体主键延续现有接口的数据形态，使用数据库生成的 `int64` 数值 ID；PostgreSQL 通过 identity/sequence 生成，业务层不得依赖具体方言语法，也不在迁移中切换为 UUID。
- PostgreSQL 集成测试覆盖 CRUD、事务、分页、权限、通知和审计。
- 单元测试不连接数据库；PostgreSQL 集成测试使用 Docker 临时隔离实例，不得连接实际部署数据。

### 部署数据库拓扑

- 开发 Docker Compose 启动独立的 PostgreSQL 命名 volume，再依次运行 migrate 与 API；该数据库只绑定本机端口。
- 实际部署通过外部 PostgreSQL 运行配置执行 migrate 与 API，不依赖 Compose 数据库容器。

### 运行时约定

- 少量定时任务优先 `time.Timer`/`time.Ticker`，只有需要 cron 表达式才引入轻量库。多实例互斥不能把 PostgreSQL advisory lock 当通用方案；需要时另行设计 lock table、lease 或唯一任务键加事务/超时。
- 新依赖必须说明解决的真实问题；不得为“以后可能需要”预先引入服务注册、RPC、配置中心、分布式事务、MQ、Redis、Gateway 或 Kubernetes。未来拆分时，由业务模块自然演变为 REST 服务，Gateway 再保持外部 URL 兼容。

## Agent 开发规则

1. 先理解现有模块边界，优先在既有模块内完成改动；不要随意新增抽象层或修改 generated code。
2. Handler 不直接操作数据库，Service 不依赖 Gin Context、GORM 或具体数据库，Repository 负责数据访问。
3. 数据库专属能力必须局部化；修改 Schema 必须增加 migration；修改 REST API 必须同步 Swagger/OpenAPI 或契约文档。
4. 不创建业务 Singleton、全局 Service，或未被需求证明的复杂架构。
5. Go 服务落地后，完成改动至少依次执行 `go fmt ./...`、`go test ./...`、`go vet ./...`、`golangci-lint run`；若环境或项目尚不具备某命令，必须说明原因和未执行项。

## 现状与目标差异

- Go 服务已具备 Gin、GORM、Goose、Prometheus、`log/slog`、Koanf、Docker Compose、Swagger、JWT 会话认证与站内通知能力，并可执行格式化、测试与静态检查；Excelize 及其余业务模块仍按 Issue 顺序实施。
- ADR-0002 规定的响应结构、分页格式和 Bearer Token 认证契约已实现；其中“迁移期间保留既有 `/api/**` 路径”的条款已由 ADR-0013 替代，所有业务接口统一为 `/api/v1/...`。

## 已知领域术语

**公开公告**：面向所有访问者、无需登录即可查看的公告，内容适合公开；在有效期内持续可见。

**站内公告**：面向已登录用户的公告，在有效期内持续可见，包括发布后新建的用户。

**公告撤下**：管理员主动结束已发布公告对访问者的可见性；公告内容仍作为管理历史保留。

**站内通知**：在本系统内发送给指定用户或发布时全体用户的消息，来源包括管理员手动发布和业务自动触发；每个接收人有独立的已读状态。

**全体用户通知**：接收范围为发布时已有且启用的用户的站内通知，发布后新建的用户不补收该通知。

**角色变更通知**：用户角色分配操作中，角色集合实际改变并保存成功后，自动发送给受影响用户的站内通知，包含变更前后的角色；重复保存相同角色不产生通知，修改角色定义或角色菜单权限暂不产生通知。

**通知已读**：用户打开通知详情或执行全部已读后，该用户对应通知的阅读状态；只展示列表或预览不算已读。

### 认证与登录防护

**凭据校验失败**：登录请求已经进入身份凭据核验，但提交的用户名与密码未形成有效认证结果。

**登录防护拦截**：登录请求在身份凭据核验前，因请求频率或连续失败达到防护边界而被暂缓或拒绝的结果。

**登录尝试准入**：登录请求在身份凭据核验前获得继续执行的资格；准入受来源地址和用户名维度的频率边界共同约束。

**菜单搜索**：供当前用户查找其侧栏导航中可跳转页面入口的功能，包含站内页面与外链；目录用于区分页面所属层级，检索对象不包含用户、文件等业务数据。
_Avoid_：全局搜索（容易被理解为包含业务数据的检索）

**菜单组件标识**：后端菜单 `component` 字段与前端本地页面注册（`menuComponent`）之间的稳定标识；只有两者匹配的菜单才会出现在侧边栏并可被直接访问。

**页面访问守卫**：前端根据当前账号的后端菜单集合判断页面是否可打开，用于直接访问、刷新和标签恢复的 403 展示；它不替代服务端授权。

**单文件上限**：单次上传中，一个文件内容允许占用的最大字节数；当前上限为 50 MiB（52,428,800 字节），现有 API 文案中的“50 MB”指该二进制阈值。该限制属于文件业务边界，不替代 HTTP 请求体限制。

**批次文件数上限**：一次批量上传允许包含的最大文件数量；当前上限为 20 个文件。

**批次总大小上限**：一次批量上传中所有文件内容字节数之和允许达到的最大值；当前上限为 200 MiB（209,715,200 字节）。不包含 multipart 边界和其他表单字段开销。

**HTTP 请求体上限**：请求进入 multipart 解析前允许读取的原始 HTTP body 最大字节数；单文件接口当前为 55 MiB（57,671,680 字节），批量接口当前为 210 MiB（220,200,960 字节）。所有 `multipart/form-data` 请求都必须有策略，未登记的接口直接拒绝。

**批量上传**：一次 multipart 请求提交多个文件；批次超过 HTTP 请求体、文件数或批次总大小上限时整批拒绝，批次合法但其中单个文件超过单文件上限时保留逐文件成功/失败结果。业务字段 `businessModule` 最多 50 个 Unicode 字符且最多 200 字节，`remark` 最多 500 个 Unicode 字符且最多 2,000 字节，文件名最多 255 字节。

| 术语 | 同义词 / 禁用词 | 定义 |
| --- | --- | --- |
| 操作审计日志 | 操作日志（查询功能名称）、技术日志 | 对管理模块一次成功写操作的业务记录，标识执行者、请求及被操作资源。 |

### 服务器监控

**资源监控**：查看本项目 API 所在宿主机的 CPU、内存、磁盘、GPU 和各网卡资源指标，帮助排查资源瓶颈；API 在容器内运行时，监控范围仍为承载容器的宿主机。
_Avoid_：可用性探测（主动检查目标是否可达或服务是否正常，含义不同）

**可用性探测**：通过 Ping、端口连接或 HTTP 请求等主动检查，判断目标是否可达或服务是否正常。

**宿主机采集进程**：API 容器部署时，在同一台宿主机上运行、向 API 提供主机资源指标的本地进程。

## 边界与职责约定（已确认）

- **前端改动范围**: `web/src/**`，不要新建顶层 `src/`。
- **后端改动范围**: `server/**`，不要在仓库根目录新建散落的 Go `src/`。
- **脚手架结构参考**: 只看单个子模块，不要批量扫目录。
- **架构参考**: 只在 `docs/` 或 `experience/` 下找摘要。

## 何时本文件需要更新

以下信号之一出现时，应触发本文件（和/或 `docs/adr/`）的更新，通常由 `/grill-with-docs` 完成：

- 业务对话里**首次出现**一个项目通用名词（例如"训问""任务单"）。
- 两个模块对同一个概念使用不同名字——应在这里趋向统一。
- 某次架构决策被沉淀下来（例如"为什么选 Zustand 而非 Redux"）——应写进 `docs/adr/`。

---

_本文件最初由 `/setup-matt-pocock-skills` 与 `/grill-with-docs` 协作初始化。后续每一条术语都应该有可追溯的业务来源。_
