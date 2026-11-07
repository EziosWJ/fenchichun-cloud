import {
  mkdirSync,
  writeFileSync,
} from 'node:fs'
import {
  resolve,
} from 'node:path'
import process from 'node:process'

const root = resolve(import.meta.dirname, '..')
const args = [resolve(root, 'scripts/mcp.mjs')]
mkdirSync(resolve(root, '.codex'), {
  recursive: true,
})
writeFileSync(resolve(root, '.codex/config.toml'), `[mcp_servers.fenchichun_miniprogram]\ncommand = ${JSON.stringify(process.execPath)}\nargs = ${JSON.stringify(args)}\n`)
writeFileSync(resolve(root, '.mcp.json'), `${JSON.stringify({
  mcpServers: {
    fenchichun_miniprogram: {
      command: process.execPath,
      args,
    },
  },
}, null, 2)}\n`)
console.log('已生成小程序本地 Codex 与 Claude MCP 配置；从 miniprogram 启动客户端并信任项目后重启会话。')
