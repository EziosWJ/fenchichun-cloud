# 汾池春微信小程序

基于 create-weapp-vite **3.4.0** 的 **tdesign** 模板对齐：原生小程序、TypeScript、TDesign 1.17.0、Tailwind 4.3.3、weapp-vite 7.8.0。小程序通过 Go 后端办理原粮入厂业务。库管在小程序登记、卸粮、关联磅单、开具与审批出门证，门卫在小程序确认出厂；网页端负责化验和生成过磅单。网页端对应功能暂时保留用于测试，正式上线前再移除。保留原脚手架 AGENTS.md，补充规则见 AGENTS.local.md。

## 全新安装

使用 Node **24.22.1**、npm **11.19.0**。Node 版本见 .nvmrc/.node-version，npm 通过 `npm install -g npm@11.19.0` 对齐。

```sh
cd miniprogram
npm ci
npm run check
npm run build:development
```

开发构建用于联调。启动微信开发者工具，导入包含 project.config.json 的 miniprogram 目录，工具会使用 dist/。需要持续监听源码时可运行 npm run dev。

WSL 中可先尝试让 Windows 微信开发者工具直接导入 WSL 项目路径。如果工具无法打开 WSL/UNC 路径，在 WSL 构建完成后，将 `project.config.json`、`package.json` 和整个 `dist/` 复制到一个 Windows 本地空目录，再从该目录导入；每次源码变化后需重新构建并复制。不要在同一个 `node_modules` 中混用 Windows 和 WSL 依赖。本机 IDE 需登录并使用有权限的 AppID；登录和业务操作需要可访问的 Go 后端。

依赖只使用 package-lock.json；CI 使用 npm ci。web 项目继续使用 pnpm，本项目不设 pnpm workspace。根 Taskfile 提供 miniprogram:install|lint|format:check|typecheck|test|build|check|accept 等价入口。

## 后端联调

通过 .env.development.local 设置可访问的 Go 后端地址，再使用员工账号登录。

```sh
# .env.development.local
APP_API_BASE_URL=http://127.0.0.1:8100/api/v1
```

- 小程序支持库管（`STORE`）、门卫（`GUARD`）和管理员（`ADMIN`）；化验员（`LAB`）请使用网页版。
- 库管：登记流转单、确认卸粮、关联磅单、查看进度、开具和审批出门证。
- 门卫：查看待出厂列表、核对依据并确认实际出厂。
- 网页端：负责化验和生成过磅单；卸粮、磅单关联、开证、审批等页面暂时保留用于测试，正式上线前再移除。
- 管理员：可在库管/门卫岗位之间切换。
- 所有业务请求带 Bearer Token；字典接口也需要登录，匿名访问返回 401。
- 生产环境必须使用 HTTPS BaseURL，并在微信后台配置 request 合法域名。

### 车牌录入与拍照识别

登记页车牌由三部分组成：左侧省份下拉、中间字母数字输入、右侧“拍照”按钮。

- 拍照使用项目内相机页（`<camera>`）并在取景层叠加绿色提示框，引导将车牌放入框内；识别基于微信 VisionKit 端侧 OCR，照片不上传、不保存。
- OCR 与号码提取代码改编自 [EziosWJ/wechat-plate-ocr](https://github.com/EziosWJ/wechat-plate-ocr)，位于 `src/features/plate-ocr/`。
- 识别结果会自动拆分省份和号码，并按车牌规则将发牌机关字母之后的 `O` 纠正为 `0`、`I` 纠正为 `1`；第二位发牌机关字母和其他易混字符仍需人工核对。
- 识别失败时可直接手动输入。
- VisionKit 能力和相机需要在真机验证，开发者工具模拟器可能不支持 OCR。
- 开发者工具当前使用基础库 `3.13.2`；参考项目建议 `3.17.6`，可按需切换。低版本微信不支持识别时会提示手动输入。

## 命令

| 命令 | 用途 |
| --- | --- |
| npm run dev | 开发监听 |
| npm run build | 生产构建 |
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

提交的 .env.development、.env.test、.env.production 仅含非敏感默认值。APP_API_BASE_URL 在提交文件中仍为 example.invalid 占位；本地开发用 `.env.development.local` 指向实际后端。可用对应 `.env.<mode>.local` 覆盖，进程环境变量优先级最高。

配置在构建时注入，不在小程序内读取 process.env。开发/测试模式允许 `localhost`、`127.0.0.1` 和 `192.168.x.x` 的 HTTP 地址；生产构建仍强制 HTTPS。正式对接前必须设置真实 HTTPS BaseURL 并配置微信 request 合法域名，真机不能使用电脑 localhost。编译进小程序的配置不是密钥存储。

原粮业务通过统一请求层调用 Go 后端的登录、字典和流转单接口。登录后获取的字典保存到微信本地缓存。请求失败时沿用上次成功获取的字典，首次获取成功后才能选择厂区、货品、供应商和卸货地点。

## 页面、组件与样式

路由注册在 src/app.json，路径常量在 src/config/routes.ts；一级页面底部导航固定为“工作台、我的”，登录及其余业务页面不显示底部导航。包含库管工作台、流转单查询、登记 / 更正、流转单详情、目测 / 卸粮、磅单候选、门卫工作台和出厂核验。默认系统导航栏；页面适配底部安全区。

公共组件：page-header、empty-state、loading-state、error-state、status-tag、section-card。全局 src/app.css 使用 TDesign 品牌 Token 和统一文字颜色、28rpx 正文、1.5 行高、24rpx 常用间距。Tailwind 使用主题和 utilities，不加载 preflight，避免重置 TDesign。间距建议 8/16/24/32/48rpx；交互优先 TDesign，禁止第二套图标或 UI 库。

脚本别名 @/ 指向 src；原生组件采用显式路径，并由 TDesignResolver 处理 t-* 标签。TypeScript 与构建均校验。页面不直接使用 wx.request，统一由 src/utils/api 提供；ApiError 区分 HTTP、业务、超时、网络与格式错误，HTTP 401 清理匹配版本的本地会话，防止并发重复通知和旧请求清除新会话。

## 微信开发者工具

project.config.json 使用用户确认的 AppID wx3fb7a0287d4cd3e2、基础库 3.13.2、glass-easel，构建输出 dist，并关闭了开发者工具的 request 域名校验（`urlCheck: false`）。实际基础库和 renderer 仍需 IDE/真机验收。真实 AppID、开发者权限、登录态、CLI 安装路径和服务端口必须本机配置。project.private.config.json 被忽略，不提交个人设置。真机访问字典接口时仍必须在微信后台配置 HTTPS request 合法域名。

Windows 上建议在 Windows Node 环境安装依赖；不要在同一 node_modules 混用 Windows 与 WSL 原生依赖。WSL 项目导入 Windows IDE 时要验证 UNC 路径、文件监视和自动化通道。缺少 IDE 权限不影响静态检查，但截图/真机验收不能视为通过。

详细 Agent、MCP、日志和截图流程见 [Agent 开发与验收](docs/agent-workflow.md)。
