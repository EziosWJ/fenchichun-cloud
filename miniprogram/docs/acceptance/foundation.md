# 小程序基础工程交付记录

日期：2026-11-07。用户要求结束并收尾，停止后续运行调试。未提交 git commit，未发布小程序。

## 已完成代码

- 使用 create-weapp-vite 3.4.0 的 tdesign 模板比对对齐现有工程，保留生成 AGENTS.md。
- 按用户要求使用 npm，固定 Node 24.22.1、npm 11.19.0，提交 package-lock.json、版本文件及 npm ci 流程。
- 实现 TypeScript 严格检查、@ 别名、ESLint/Stylelint、运行时 API lint、三环境配置和生产 Mock 禁用保护。
- 实现 TDesign 主题、Tailwind utilities、安全区和六个公共组件，以及工作台、登录、个人中心、组件预览页；不设置最终 tabBar。
- 实现 wx.request 统一层、错误分类、Token 注入、本地会话、并发 401 去重与旧会话响应保护；不预设登录接口。
- 新增 Agent 规则、Claude 规则入口、本机 MCP 配置生成器、日志/截图命令、Taskfile 小程序任务及 GitHub Actions 基础工作流。

## 已通过验证

环境：WSL ext4，Node 24.22.1、npm 11.19.0，weapp-vite 7.8.0、TDesign 1.17.0、Tailwind 4.3.3。

| 验证 | 结果 |
| --- | --- |
| npm run lint | 通过 |
| npm run stylelint | 通过 |
| npm run typecheck | 通过 |
| npm test | 6 组测试通过，覆盖成功、业务/格式错误、HTTP 错误、并发/迟到 401、Token、网络/超时、会话恢复 |
| npm run build | 生产构建通过 |
| npm run build:development | 通过 |
| npm run build:test | 通过 |
| 隔离源码副本 npm ci + npm run check | 通过，无现有 node_modules、dist 或 .weapp-vite 参与 |
| 产物检查 | TDesign button 产物存在；WXSS 含 flex、gap、间距 utilities |
| weapp-vite MCP | stdio 握手、工具发现、workspace_catalog 实际调用通过 |
| Windows DevTools | 登录态确认，用户开启服务端口；指定 AppID 后 auto 成功，端口 9420 |

## 未完成的验收与限制

- Windows DevTools 拒绝直接打开 WSL UNC 工程路径（code 10）。已在获准 Windows 工作目录建立独立构建产物镜像，唯一源码仍是仓库 miniprogram。
- 用户确认 AppID 为 wx3fb7a0287d4cd3e2，已更新项目配置；不代表已发布或完成真机预览。
- CLI 截图/日志接口发生工具授权超时；用户完成授权后再次调用仍在等待，按用户收尾要求终止。未获得可交付实际截图、首页基准图或可靠运行日志，不宣称无运行时错误。
- WSL 原生 CLI 无法发现 Windows IDE，Windows Node 不能直接使用 Linux native 依赖；跨宿主自动化通道尚未打通。
- Codex / Claude 配置已提供，但两个正式客户端的新会话连接验收尚未分别完成。官方 DevTools MCP 初始化未完成；不能以 weapp-vite MCP 通过替代它。
- 真机尺寸、真机安全区验证未执行；未生成或伪造截图。
- GitHub Actions 文件已建立，尚未 push 触发远程 workflow。
- npm run accept 提供严格 doctor 与截图入口，当前宿主条件下不能通过；日志需单独通过 npm run ide:logs 验证。

## 下一步

优先在同一宿主完成依赖安装、IDE 连接与运行验收，重新构建开发模式；执行页面跳转/错误重试、实际截图、日志标记读取并保存基准图。随后验证真机和两个 Agent 客户端，触发 GitHub Actions。

本次用于连接的临时令牌文件已清理，不写入文档和版本管理；本机生成 MCP 配置、临时工具输出及运行镜像不属于提交物。
