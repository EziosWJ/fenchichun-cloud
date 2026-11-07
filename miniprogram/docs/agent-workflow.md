# Agent 开发与验收

先读 README、AGENTS.md 与 AGENTS.local.md。代码入口 src；构建配置 weapp-vite.config.ts。仅用 npm，不使用 pnpm。

## MCP

安装后阅读 node_modules/weapp-vite/dist/docs/index.md、README.md、mcp.md。
运行 `npm run mcp:setup` 为当前 Node 和平台生成本地 `.codex/config.toml`、`.mcp.json`（已忽略）。从 miniprogram 目录启动 Codex / Claude Code 并信任项目，重启会话验证服务器列表与工具发现。脚本不会覆盖用户全局配置；重新运行只覆盖本项目生成的两个文件。

本地服务以 `npm run mcp`（stdio）运行；底层固定调用安装在本项目的 weapp-vite，无 npx 在线下载。Claude 通过 CLAUDE.md 引用同一规则。

同一 IDE 自动化会话串行执行。Windows IDE 与 WSL Node 属于不同宿主：WSL doctor 无法发现 Windows IDE 时，应在 Windows 安装依赖并生成本机 MCP 配置，或明确配置受支持的 CLI/远程运行服务，不能把 Linux 路径直接交给 Windows CLI。

## 代码验收

1. `npm ci`，`npm run check`；构建默认生产，演示 Mock 用 `npm run build:development`。
2. 微信开发者工具导入 miniprogram/project.config.json，指向 dist；登录并开启设置中的服务端口，配置真实 AppID 后才能真机预览。
3. `npm run ide:doctor -- --strict` 检查环境。`npm run open` 打开工程。
4. `npm run ide:logs` 桥接日志；触发页面操作并确认日志来自当前项目。日志桥接持续运行，任务完成后 Ctrl+C；不把无连接时的空输出记为无错误。
5. `npm run screenshot -- --page pages/index/index --output .tmp/home.png --timeout 30000 --json`；使用 take_weapp_screenshot MCP 工具再执行一次截图。页面分别验证正常、空、加载、失败和重试。
6. `npm run accept` 限时执行构建、严格 doctor、截图；日志通过 ide:logs 独立验证，输出 .tmp/accept-*.log。失败返回非零；不会上传或发布。
7. UI 检查 320、375、430 CSS px；真机至少一台检查安全区、滚动和文字，不用 Web 截图替代。

基准截图在首次实际验收通过后存入 docs/acceptance/baseline-home.png，记录 Mock 数据、基础库、renderer、视口、工具版本。后续 `npm exec -- wv compare --help` 核对比较参数，更新基准必须说明 UI 变化。

## 日志约定

生命周期、页面和请求诊断只允许在开发环境输出不含敏感数据的标记。验收时临时加入唯一标记，通过 DevTools 控制台与桥接输出交叉核对，随后移除探针并再次构建。不要输出 Authorization、Token、响应正文或用户个人资料。

证据包含源码版本、环境、命令、退出码、截图路径、日志时间范围、问题和结果。截图或日志缺失记为阻塞/未执行，不能记通过。
