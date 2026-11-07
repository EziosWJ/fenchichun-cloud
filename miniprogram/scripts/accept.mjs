import {
  spawnSync,
} from 'node:child_process'
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import {
  resolve,
} from 'node:path'
import process from 'node:process'

mkdirSync('.tmp', {
  recursive: true,
})
const pkg = JSON.parse(readFileSync('node_modules/weapp-vite/package.json', 'utf8'))
const entry = resolve('node_modules/weapp-vite', typeof pkg.bin === 'string' ? pkg.bin : pkg.bin.wv)
const steps = [
  ['build'],
  ['ide', 'doctor', '--json', '--strict'],
  ['screenshot', '--page', 'pages/index/index', '--output', '.tmp/home.png', '--timeout', '30000', '--json'],
]
for (const [index, args] of steps.entries()) {
  const result = spawnSync(process.execPath, [entry, ...args], {
    encoding: 'utf8',
    timeout: 90000,
  })
  writeFileSync(`.tmp/accept-${index}.log`, `${result.stdout ?? ''}\n${result.stderr ?? ''}`)
  process.stdout.write(result.stdout ?? '')
  process.stderr.write(result.stderr ?? '')
  if (result.error || result.status !== 0) {
    console.error(result.error ?? `验收步骤失败: ${args.join(' ')}`)
    process.exit(1)
  }
}
console.log('截图已保存；仍需按照 docs/agent-workflow.md 验证日志及 MCP 截图。')
