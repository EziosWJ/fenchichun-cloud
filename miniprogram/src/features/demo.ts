import { env } from '@/config/env'
import { session } from '@/utils/api'
import { createClient } from '@/utils/api/request'

export async function loadDemo(state = 'success') {
  if (!env.mock) {
    return { items: [] as string[], label: '业务功能待接入' }
  }
  const client = createClient('mock://local', session, async () => {
    if (state === 'error') {
      return { statusCode: 503, data: null }
    }
    return { statusCode: 200, data: { code: 200, message: 'ok', data: { items: state === 'empty' ? [] : ['工程基础已就绪', '业务模块待确认'], label: 'Mock 演示数据' } } }
  }, () => { })
  return client<{
    items: string[]
    label: string
  }>({ path: '/workbench', anonymous: true })
}
