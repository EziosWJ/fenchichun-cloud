import {
  spawn,
} from 'node:child_process'
import {
  resolve,
} from 'node:path'
import process from 'node:process'

const root = resolve(import.meta.dirname, '..')
const child = spawn(process.execPath, [resolve(root, 'node_modules/weapp-vite/bin/weapp-vite.js'), 'mcp', '--workspace-root', root], {
  cwd: root,
  stdio: 'inherit',
})
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}
child.on('error', (error) => {
  console.error(error)
  process.exitCode = 1
})
child.on('exit', (code) => {
  process.exitCode = code ?? 1
})
