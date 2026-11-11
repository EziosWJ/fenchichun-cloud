# 汾池春微信小程序

基于 create-weapp-vite **3.4.0** 的 **tdesign** 模板对齐：原生小程序、TypeScript、TDesign 1.17.0、Tailwind 4.3.3、weapp-vite 7.8.0。支持 Mock 离线演示，以及连接 Go 后端的真实流程：库管在小程序登记、卸粮、关联磅单、开具与审批出门证，门卫在小程序确认出厂；网页端负责化验和生成过磅单。网页端对应功能暂时保留用于测试，正式上线前再移除。保留原脚手架 AGENTS.md，补充规则见 AGENTS.local.md。

## 全新安装

使用 Node **24.22.1**、npm **11.19.0**。Node 版本见 .nvmrc/.node-version，npm 通过 `npm install -g npm@11.19.0` 对齐。

```sh
cd miniprogram
npm ci
npm run check
npm run build:development
```

最后一条命令生成本地演示构建。启动微信开发者工具，选择“导入项目”，项目目录选本 `miniprogram` 目录（包含 `project.config.json`）；配置已将小程序根目录指向 `dist/`，不要导入 `src/`。`npm run check` 最后会生成生产构建，因此体验演示前必须**再次执行** `npm run build:development`。需要持续监听源码时可运行 `npm run dev`。

WSL 中可先尝试让 Windows 微信开发者工具直接导入 WSL 项目路径。如果工具无法打开 WSL/UNC 路径，在 WSL 构建完成后，将 `project.config.json`、`package.json` 和整个 `dist/` 复制到一个 Windows 本地空目录，再从该目录导入；每次源码变化后需重新构建并复制。不要在同一个 `node_modules` 中混用 Windows 和 WSL 依赖。本机 IDE 需登录并使用有权限的 AppID；本演示无需配置业务服务器或 request 合法域名。

依赖只使用 package-lock.json；CI 使用 npm ci。web 项目继续使用 pnpm，本项目不设 pnpm workspace。根 Taskfile 提供 miniprogram:install|lint|format:check|typecheck|test|build|check|accept 等价入口。

## 演示账号与流程

以下账号和密码均为虚构的**本地演示凭据**，只在 `APP_MOCK=true` 的离线演示模式可用：

| 账号 | 密码 | 岗位 |
| --- | --- | --- |
| `warehouse` | `demo123` | 库管 |
| `guard` | `demo123` | 门卫 |
| `both` | `demo123` | 库管、门卫，可在工作台切换 |

使用 `both` 登录最方便：初始进入库管工作台，右上角“切换岗位”可进入门卫工作台；底部“我的”中展示账号、岗位、退出和演示控制台。退出登录不会删除数据。三个账号共享同一小程序本机的演示数据，重启后仍可继续；不同设备之间不会同步。

预置数据包括等待化验、化验接收待卸粮、目测接收待磅单、化验拒收、目测拒收、正常出门证已审批待出厂，以及同一车牌的已出厂历史。库管的“查看全部流转单”和门卫的“已出厂”可查询历史；每趟都有独立流转单号。

从登记体验正常出厂：

1. 以 `both` 的库管岗位登录，登记厂区、车牌和货品；货品与供应商选项来自网页版基础资料快照（当前为 1 个厂区、10 种货品、77 家启用供应商、2 个粮仓），也可先选“待核实”供应商，再从详情更正登记补充。检验方式同步网页版物料字典：木片为目测，其余货品为化验。
2. 化验货品：在“我的 → 演示控制台 → 模拟化验结果”找到本趟，选择“模拟化验接收”；返回详情。目测货品：在详情点击“确认目测”，选择接收并核对确认。
3. 到现场卸粮步骤填写地点并确认。在“我的 → 演示控制台 → 模拟磅单同步”找到该趟，生成模拟磅单；返回详情，进入磅单候选页，核对并关联。
4. 在详情先后开具、审批出门证。审批后车辆仍在库管进行中列表中等待门卫。切换到门卫岗位，在“待出厂”列表进入具体一趟，核对依据后确认实际出厂；可在“已出厂”查询。

体验拒收退厂：化验货品在演示控制台选择“模拟化验拒收”，目测货品在详情选择“拒收”并填写原因。切换门卫后从统一“待出厂”列表进入该趟，核验拒收结论和原因，再确认实际出厂；无需模拟磅单或开出门证。

演示控制台用于**本地重复模拟外部环节**：每张等待化验的单可生成一次接收或拒收结果；卸粮后可为该趟生成一张模拟磅单，再由库管手动选择关联。预设拒收原因与数字均为虚构内容，不能用于实际业务。模拟不会请求任何远程服务。

“我的 → 恢复初始演示数据”经确认后会删除本机新增及修改的演示记录并恢复预置场景，保留当前演示登录和岗位；也可在微信开发者工具中清除本小程序的本地存储后重新登录。清除本地存储会同时清除该小程序的其他本地数据，请按需选择。

### 真实后端闭环

设置 `APP_MOCK=false` 并用 `.env.development.local` 指向后端后，小程序使用真实账号和数据库：

```sh
# .env.development.local
APP_API_BASE_URL=http://<host>:8100/api/v1
APP_MOCK=false
```

- 小程序支持库管（`STORE`）、门卫（`GUARD`）和管理员（`ADMIN`）；化验员（`LAB`）请使用网页版。
- 演示库：`store01 / store123456`、`guard01 / guard123456`、`admin / admin123`。
- 库管：登记流转单、确认卸粮、关联磅单、查看进度、开具和审批出门证。
- 门卫：查看待出厂列表、核对依据并确认实际出厂。
- 网页端：负责化验和生成过磅单；卸粮、磅单关联、开证、审批等页面暂时保留用于测试，正式上线前再移除。
- 管理员：可在库管/门卫岗位之间切换。
- 所有业务请求带 Bearer Token；字典接口也需要登录，匿名访问返回 401。
- 生产环境必须使用 HTTPS BaseURL，并在微信后台配置 request 合法域名。

### 车牌录入与拍照识别

登记页车牌由三部分组成：左侧省份下拉、中间字母数字输入、右侧“拍照”按钮。

- 拍照使用 `wx.chooseMedia` 调用系统相机，识别基于微信 VisionKit 端侧 OCR，照片不上传、不保存。
- OCR 与号码提取代码改编自 [EziosWJ/wechat-plate-ocr](https://github.com/EziosWJ/wechat-plate-ocr)，位于 `src/features/plate-ocr/`。
- 识别结果会自动拆分省份和号码，但仍需人工核对；识别失败时可直接手动输入。
- VisionKit 能力和相机需要在真机验证，开发者工具模拟器可能不支持 OCR。
- 开发者工具当前使用基础库 `3.13.2`；参考项目建议 `3.17.6`，可按需切换。低版本微信不支持识别时会提示手动输入。

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
| node scripts/sync-dictionary.mjs | 从网页版接口生成下拉字典快照 |
| npm run ide:doctor / ide:logs / screenshot / accept | IDE 诊断、日志、截图与验收 |

## 环境

提交的 .env.development、.env.test、.env.production 仅含非敏感默认值。APP_API_BASE_URL 在提交文件中仍为 example.invalid 占位；本地开发用 `.env.development.local` 指向实际后端。APP_MOCK 开发/测试为 true，生产为 false。可用对应 `.env.<mode>.local` 覆盖，进程环境变量优先级最高。

配置在构建时注入，不在小程序内读取 process.env。开发/测试模式允许 `localhost`、`127.0.0.1` 和 `192.168.x.x` 的 HTTP 地址；生产构建仍强制 HTTPS。正式对接前必须设置真实 HTTPS BaseURL 并配置微信 request 合法域名，真机不能使用电脑 localhost。编译进小程序的配置不是密钥存储。

原粮业务通过 `src/features/grain/` 实现：Mock 模式使用本地状态和微信本地存储；`APP_MOCK=false` 时改用真实 HTTP 服务，登录后读取流转单并提交业务操作。运行时请求包括登录、字典和流转单接口，全部走统一 `src/utils/api` 请求层。生产构建会排除 Mock 演示服务、演示账号和真实字典快照。

### 字典同步

小程序启动并登录后匿名以外的字典请求会携带 Bearer Token，成功后写入 `grain.dictionary.v1` 本地缓存并更新下拉选项；请求失败时依次使用上次缓存和构建时快照。离线演示模式不请求字典接口。

`src/features/grain/dictionary.ts` 是离线兜底快照。网页版基础资料变化后，可重新生成它（接口不可用或首次离线启动时使用）：

```sh
WEB_API_BASE_URL=http://<host>:8100/api/v1 \
WEB_API_USERNAME=<user> \
WEB_API_PASSWORD=<password> \
node scripts/sync-dictionary.mjs
npm run lint:fix
npm run build:development
```

生成文件不要手工编辑；命令不会把账号密码写入产物。运行时字典不需要重新生成快照，但需要网络可访问后端。生产构建会用空快照替换 `dictionary.ts`，避免把基础资料和演示数据打进小程序包。

## 页面、组件与样式

路由注册在 src/app.json，路径常量在 src/config/routes.ts；一级页面底部导航固定为“工作台、我的”，登录及其余业务页面不显示底部导航。包含库管工作台、流转单查询、登记 / 更正、流转单详情、目测 / 卸粮、磅单候选、门卫工作台和出厂核验。默认系统导航栏；页面适配底部安全区。

公共组件：page-header、empty-state、loading-state、error-state、status-tag、section-card。全局 src/app.css 使用 TDesign 品牌 Token 和统一文字颜色、28rpx 正文、1.5 行高、24rpx 常用间距。Tailwind 使用主题和 utilities，不加载 preflight，避免重置 TDesign。间距建议 8/16/24/32/48rpx；交互优先 TDesign，禁止第二套图标或 UI 库。

脚本别名 @/ 指向 src；原生组件采用显式路径，并由 TDesignResolver 处理 t-* 标签。TypeScript 与构建均校验。页面不直接使用 wx.request，统一由 src/utils/api 提供；ApiError 区分 HTTP、业务、超时、网络与格式错误，HTTP 401 清理匹配版本的本地会话，防止并发重复通知和旧请求清除新会话。

## 微信开发者工具

project.config.json 使用用户确认的 AppID wx3fb7a0287d4cd3e2、基础库 3.13.2、glass-easel，构建输出 dist，并关闭了开发者工具的 request 域名校验（`urlCheck: false`）。实际基础库和 renderer 仍需 IDE/真机验收。真实 AppID、开发者权限、登录态、CLI 安装路径和服务端口必须本机配置。project.private.config.json 被忽略，不提交个人设置。真机访问字典接口时仍必须在微信后台配置 HTTPS request 合法域名。

Windows 上建议在 Windows Node 环境安装依赖；不要在同一 node_modules 混用 Windows 与 WSL 原生依赖。WSL 项目导入 Windows IDE 时要验证 UNC 路径、文件监视和自动化通道。缺少 IDE 权限不影响静态检查，但截图/真机验收不能视为通过。

详细 Agent、MCP、日志和截图流程见 docs/agent-workflow.md；本次演示的验证与真实截图待验收情况见 [原粮入厂演示验收记录](docs/acceptance/grain-intake-demo.md)。
