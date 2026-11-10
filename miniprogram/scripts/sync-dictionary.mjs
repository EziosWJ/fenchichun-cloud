/**
 * 从网页版接口生成小程序的本地演示字典快照。
 *
 * 用法（在 miniprogram 目录）：
 *   WEB_API_BASE_URL=http://<host>:8100/api/v1 \
 *   WEB_API_USERNAME=<user> \
 *   WEB_API_PASSWORD=<password> \
 *   node scripts/sync-dictionary.mjs
 *
 * 生成文件：src/features/grain/dictionary.ts
 * 只在开发期运行，不会把账号密码写入产物。
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

const base = process.env.WEB_API_BASE_URL
const username = process.env.WEB_API_USERNAME
const password = process.env.WEB_API_PASSWORD

if (!base || !username || !password) {
  console.error('缺少环境变量：WEB_API_BASE_URL、WEB_API_USERNAME、WEB_API_PASSWORD')
  process.exit(1)
}

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, options)
  if (!response.ok) {
    throw new Error(`${path} 请求失败：HTTP ${response.status}`)
  }
  const body = await response.json()
  if (body.code !== 200) {
    throw new Error(`${path} 业务失败：${body.message || body.code}`)
  }
  return body.data
}

async function main() {
  const login = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const headers = { Authorization: login.tokenValue }

  const [sites, materials, parties, granaries] = await Promise.all([
    request('/weighbridge/sites', { headers }),
    request('/weighbridge/master/materials', { headers }),
    request('/weighbridge/master/parties', { headers }),
    request('/granaries?enabled=true', { headers }),
  ])

  const data = {
    syncedAt: new Date().toISOString(),
    sites: sites
      .filter(item => item.enabled)
      .map(item => ({ code: item.code, name: item.name })),
    materials: materials
      .filter(item => item.enabled)
      .map(item => ({
        code: item.code,
        name: item.name,
        method: item.inspectionMethod === 'visual' ? 'visual' : 'lab',
      })),
    suppliers: parties
      .filter(item => item.isSupplier && item.enabled)
      .map(item => ({ code: item.code, name: item.name })),
    granaries: granaries.map(item => ({ id: item.id, name: item.name })),
  }

  const output = `// 由 scripts/sync-dictionary.mjs 从网页版接口生成，请勿手工编辑。
// syncedAt: ${data.syncedAt}
export interface DemoDictionaryMaterial {
  code: string
  name: string
  method: 'lab' | 'visual'
}

export interface DemoDictionaryParty {
  code: string
  name: string
}

export const demoDictionary = ${JSON.stringify(data, null, 2)} as const
`
  const target = resolve(import.meta.dirname, '../src/features/grain/dictionary.ts')
  writeFileSync(target, output, 'utf8')
  console.log(`已生成 ${target}`)
  console.log(`厂区 ${data.sites.length}，货品 ${data.materials.length}，供应商 ${data.suppliers.length}，粮仓 ${data.granaries.length}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
