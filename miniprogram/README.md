# 汾池春微信小程序

基于 create-weapp-vite **3.4.0** 的 **tdesign** 模板对齐：原生小程序、TypeScript、TDesign 1.17.0、Tailwind 4.3.3、weapp-vite 7.8.0。保留原脚手架 AGENTS.md，补充规则见 AGENTS.local.md。模板使用 MIT 许可；原脚手架示例保留但不在正式页面路由中。

## 全新安装

使用 Node **24.22.1**、npm **11.19.0**。Node 版本见 .nvmrc/.node-version，npm 通过 `npm install -g npm@11.19.0` 对齐。

```sh
cd miniprogram
npm ci
npm run check
npm run build:development
npm run open
```

依赖只使用 package-lock.json；CI 使用 npm ci。web 项目继续使用 pnpm，本项目不设 pnpm workspace。构建产物在 dist，微信开发者工具导入本目录 project.config.json，不导入 src。根 Taskfile 提供 miniprogram:install|lint|format:check|typecheck|test|build|check|accept 等价入口。

## 命令

| 命令 | 用途 |
| --- | --- |
| npm run dev | 开发监听（Mock） |
| npm run build | 生产构建（禁用 Mock） |
| npm run build:development / build:test | 开发 / 测试构建 |
| npm run lint / lint:fix | ESLint 校验 / 格式修复 |
| npm run format:check | 格式校验（复用 ESLint，不叠加格式化器） |
| npm run typecheck | TypeScript 严格检查 |
| npm test | Node 原生测试，请求与会话边界 |
| npm run stylelint | 样式检查 |
| npm run check | lint、类型、测试、生产构建 |
| npm run mcp:setup | 为本机生成 Codex / Claude MCP 配置 |
| npm run ide:doctor / ide:logs / screenshot / accept | IDE 诊断、日志、截图与验收 |

## 环境

提交的 .env.development、.env.test、.env.production 仅含非敏感默认值。APP_API_BASE_URL 暂为 example.invalid 占位，未接入真实服务；APP_MOCK 开发/测试为 true，生产为 false。可用对应 `.env.<mode>.local` 覆盖，进程环境变量优先级最高。

配置在构建时注入，不在小程序内读取 process.env。生产强制禁止 Mock；不会回退到开发地址。正式对接前必须设置真实 HTTPS BaseURL 并配置微信 request 合法域名，真机不能使用电脑 localhost。编译进小程序的配置不是密钥存储。

Mock 由 src/features/demo.ts 的请求适配器提供。生产显示待接入状态，不发出虚构业务请求。登录页只提供明确标记的 Mock 本地会话，无微信登录、手机号登录、刷新 Token 或服务端登录接口假设。

## 页面、组件与样式

路由注册在 src/app.json，路径常量在 src/config/routes.ts；工作台、登录、个人中心、基础组件预览不配置 tabBar。默认系统导航栏；src/layouts/default 为容器布局入口，页面 .page-container 统一内容留白和底部安全区。

公共组件：page-header、empty-state、loading-state、error-state、status-tag、section-card。全局 src/app.css 使用 TDesign 品牌 Token 和统一文字颜色、28rpx 正文、1.5 行高、24rpx 常用间距。Tailwind 使用主题和 utilities，不加载 preflight，避免重置 TDesign。间距建议 8/16/24/32/48rpx；交互优先 TDesign，禁止第二套图标或 UI 库。

脚本别名 @/ 指向 src；原生组件采用显式路径，并由 TDesignResolver 处理 t-* 标签。TypeScript 与构建均校验。页面不直接使用 wx.request，统一由 src/utils/api 提供；ApiError 区分 HTTP、业务、超时、网络与格式错误，HTTP 401 清理匹配版本的本地会话，防止并发重复通知和旧请求清除新会话。

## 微信开发者工具

project.config.json 使用用户确认的 AppID wx3fb7a0287d4cd3e2、基础库 3.13.2、glass-easel，构建输出 dist。实际基础库和 renderer 仍需 IDE/真机验收。真实 AppID、开发者权限、登录态、CLI 安装路径和服务端口必须本机配置。project.private.config.json 被忽略，不提交个人设置。

Windows 上建议在 Windows Node 环境安装依赖；不要在同一 node_modules 混用 Windows 与 WSL 原生依赖。WSL 项目导入 Windows IDE 时要验证 UNC 路径、文件监视和自动化通道。缺少 IDE 权限不影响静态检查，但截图/真机验收不能视为通过。

详细 Agent、MCP、日志和截图流程见 docs/agent-workflow.md，验收记录见 docs/acceptance/。
