# 小程序补充规则

先读根 AGENTS.md、CONTEXT.md、相关 ADR，再读本目录 README、生成 AGENTS.md、本文件和任务文档。保留生成 AGENTS.md。

- 直接在本目录开发，使用 npm、package-lock.json 和 npm ci；本规则不改变 web 的 pnpm 规范。
- 优先 TDesign，Tailwind 仅负责布局与间距；不得引入第二套 UI/图标体系。
- 新增依赖必须说明现有能力不足的原因、用途和包体影响，不随意增加依赖。
- 使用 wx.request 统一请求层，不猜测服务端登录接口；Mock 不进入生产。
- 每次代码任务必须 npm run build，并按改动执行 lint、typecheck 和 test。
- UI 任务必须提供当前代码实际小程序截图；Web、headless 或历史图片不能替代。工具不可用时标为待验收，记录原因。
- 阅读锁定版本 node_modules/weapp-vite/dist/docs/ 后使用工具。IDE 自动化串行执行，设置超时并清理本次进程。
- DevTools 日志和截图不得暴露 Token 或个人资料。
