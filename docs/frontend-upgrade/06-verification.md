# 前端升级 6/6：集成验收与交接

日期：2026-10-31

## 1. 结论

- 四项前端检查全部通过：`lint`、`typecheck`、`test`、`build` 退出码均为 0。
- 单测：15 个测试文件、64 个用例全部通过（升级前为 10 个文件、42 个用例）。
- 真实后端 + 浏览器验证：25/25 项通过，覆盖桌面/窄屏、深浅主题、登录/退出、后端菜单、标签、过磅筛选与危险操作确认。
- 验收过程中发现并修复 1 个由主题迁移引入的回归：`Modal.titleLineHeight` 被设置为无单位 `24`，导致确认框标题行高变成 384px；已改为 `1.5` 并补单测。
- 按工单约束，未提交、未推送、未部署；原有未提交的过磅/后端修改保持完整。

## 2. 环境

| 项目 | 值 |
| --- | --- |
| 操作系统 | Linux (WSL2) |
| Node.js | v24.16.0（满足 `>=22.12.0`） |
| Playwright | 1.64.1（Chromium 1243/1248 已安装） |
| 后端 | `task api`，`http://127.0.0.1:8100` |
| 前端 | `task web`，Vite 实际监听 `http://127.0.0.1:5174`（5173 被本机其他项目占用） |
| 数据库 | 本机 Docker PostgreSQL，`task db:migrate` 成功（含未提交的 `00010_weighbridge_master_data.sql`） |
| 浏览器语言 | `zh-CN` |

## 3. 四项检查（最终）

| 命令 | 结果 | 说明 |
| --- | --- | --- |
| `task frontend:lint` | 通过 | `eslint .` 退出码 0 |
| `task frontend:typecheck` | 通过 | `tsc -b --pretty` 退出码 0 |
| `task frontend:test` | 通过 | 15 files / 64 tests |
| `task frontend:build` | 通过 | `tsc -b && vite build` 退出码 0 |

保留的既有提示（非本次引入）：生产主包 > 500 kB 的 Vite chunk 警告；jsdom 的 `getComputedStyle` pseudo-element 未实现提示。

## 4. 服务健康检查

| 端点 | 结果 |
| --- | --- |
| `GET http://127.0.0.1:8100/health` | `{"code":200,"message":"success","data":{"status":"ok"}}` |
| `GET http://127.0.0.1:8100/ready` | `{"code":200,"message":"success","data":{"status":"ok"}}` |

验证结束后已停止 API 与 Vite 进程；8100/5174 端口已释放。

## 5. 浏览器验收（25/25）

脚本结果原始数据：`docs/frontend-upgrade/06-browser-results.json`。

| 场景 | 视口 | 结果 |
| --- | --- | --- |
| 登录页浅色渲染 | 1440×900 | 通过 |
| 登录页切换深色 | 1440×900 | 通过 |
| 刷新后恢复深色偏好 | 1440×900 | 通过（`data-theme=dark`） |
| 登录进入工作台 | 1440×900 | 通过 |
| 工作台 h1 与通知入口 | 1440×900 | 通过 |
| 深色页面背景 | 1440×900 | 通过（`rgb(10, 16, 28)`） |
| 后端菜单驱动进入用户管理 | 1440×900 | 通过 |
| 用户筛选持久标签、表格渲染 | 1440×900 | 通过 |
| 桌面无页面级横向滚动 | 1440×900 | 通过（1440/1440） |
| 登录后切换浅色 | 1440×900 | 通过 |
| 危险操作确认框 / 取消关闭 | 1440×900 | 通过（未执行删除） |
| 过磅筛选标签 | 1440×900 | 通过 |
| 过磅厂区编码筛选 | 1440×900 | 通过，真实请求包含 `siteCode=F001` |
| 页面标签存在且可关闭 | 1440×900 | 通过 |
| 退出登录 | 1440×900 | 通过 |
| 未登录直接访问受保护页 | 1440×900 | 通过（跳转 `/login?redirect=...`） |
| 窄屏登录页无横向滚动 | 390×844 | 通过（390/390） |
| 窄屏 Drawer 导航 | 390×844 | 通过 |
| Drawer 菜单跳转过磅单据 | 390×844 | 通过 |
| 窄屏宽表容器内滚动 | 390×844 | 通过（920/364） |
| 窄屏页面无横向滚动 | 390×844 | 通过（390/390） |

### 截图

目录：`docs/frontend-upgrade/screenshots/`

- `login-light-1440.png`、`login-dark-1440.png`、`login-light-390.png`、`login-dark-390.png`
- `dashboard-dark-1440.png`
- `users-light-1440.png`、`users-dark-1440.png`
- `menus-delete-confirm-light-1440.png`
- `tickets-light-1440.png`、`tickets-dark-390.png`
- `mobile-navigation-dark-390.png`

## 6. 本次修复的回归

| 问题 | 原因 | 修复 |
| --- | --- | --- |
| 危险操作确认框标题与正文之间出现约 380px 空白 | `createAppTheme` 的 `Modal.titleLineHeight` 设为数值 `24`，AntD 直接输出 CSS `line-height`，按 24 倍字体计算 | 改为无单位倍数 `1.5`，并新增 `tests/config/theme.test.ts` 断言 |

## 7. 未验证 / 残留风险

1. **非 ADMIN 角色的 403 与菜单过滤**：本地种子仅有 `admin`，未创建测试账号；菜单/路由守卫的单测存在，但未做真实非管理员浏览器验证。补验步骤：创建仅含部分菜单的角色，用该账号直接访问未授权路径，确认展示 403。
2. **通知 SSE 实时推送**：验证了通知入口、未读数接口与 SSE 连接建立（后端日志 200），未主动触发一条新通知验证实时角标/列表刷新。补验步骤：管理员发布通知，观察接收端未读数与列表是否即时更新。
3. **浏览器覆盖面**：仅 Chromium；未验证 Firefox/Safari、触屏手势与系统级高对比度模式。
4. **既有 AntD 6 弃用警告**：控制台存在 `Space direction` 应改 `orientation`、`Alert message` 应改 `title` 的警告，属于升级前页面用法，本次未扩大修改范围。
5. **构建体积**：主包约 1.07 MB（gzip 约 353 kB），为升级前既有结构，未调整分包策略。

## 8. 工作区与改动范围

### 保留的原有未提交修改

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

以上文件未被 reset/覆盖；过磅页面仅在其上追加主题化与筛选标签的增量修改。

### 新增文件

```text
docs/frontend-upgrade/01-baseline.md
docs/frontend-upgrade/05-pages.md
docs/frontend-upgrade/06-verification.md
docs/frontend-upgrade/06-browser-results.json
docs/frontend-upgrade/screenshots/*.png
web/src/config/theme.ts
web/src/styles/tokens.css
web/tests/app/AppLayout.test.tsx
web/tests/app/AppProviders.test.tsx
web/tests/components/ConfirmDelete.test.tsx
web/tests/components/SearchFilterBar.test.tsx
web/tests/config/theme.test.ts
```

### 修改文件（升级相关）

`web/index.html`、`web/src/main.tsx`、`web/src/app/AppProviders.tsx`、`web/src/config/app.config.ts`、`web/src/styles/global.css`、`web/src/layouts/AppLayout.tsx` 与 CSS、公共组件 7 个及其 CSS、系统管理 9 个页面、过磅 2 个页面、`LoginPage.tsx`、`DataTable.test.tsx`。

## 9. 复现命令

```bash
# 静态检查
task frontend:lint
task frontend:typecheck
task frontend:test
task frontend:build

# 真实联调（三个终端）
task db:migrate
task api          # http://127.0.0.1:8100
task web          # 若 5173 被占用会使用 5174

curl http://127.0.0.1:8100/health
curl http://127.0.0.1:8100/ready
```

浏览器手工验收路径：登录 `admin / admin123` → 工作台 → 右上角主题切换 → 系统管理/用户管理 → 菜单管理点“删除”后取消 → 过磅管理/过磅单查询输入厂区编码 → 刷新页面确认主题与标签恢复 → 退出登录。
