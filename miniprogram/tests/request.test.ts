import type {
  Transport,
} from '../src/utils/api/request.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ApiError,
  createClient,
} from '../src/utils/api/request.ts'
import {
  createSession,
} from '../src/utils/api/session.ts'

function fixture(transport: Transport) {
  let stored: unknown = ''
  let expirations = 0
  const session = createSession({
    get: () => stored,
    set: (token) => {
      stored = token
    },
    remove: () => {
      stored = ''
    },
  })
  session.save('old')
  const request = createClient('https://example.invalid/api/v1/', session, transport, () => {
    expirations++
  })
  return {
    request,
    session,
    expirations: () => expirations,
  }
}
test('成功、URL、Token 和免认证', async () => {
  const f = fixture(async (options) => {
    assert.equal(options.url, 'https://example.invalid/api/v1/sample')
    assert.equal(options.timeout, 15000)
    assert.equal(options.header.Authorization, 'Bearer old')
    return {
      statusCode: 200,
      data: {
        code: 200,
        message: 'ok',
        data: [1],
      },
    }
  })
  assert.deepEqual(await f.request({
    path: '/sample',
  }), [1])
  const g = fixture(async (options) => {
    assert.equal(options.header.Authorization, undefined)
    return {
      statusCode: 200,
      data: {
        code: 200,
        message: '',
        data: null,
      },
    }
  })
  await g.request({
    path: '/public',
    anonymous: true,
  })
  g.session.clear()
  await g.request({
    path: '/public',
  })
})
test('业务失败与响应格式', async () => {
  for (const [data, kind] of [[{
    code: 400,
    message: '业务失败',
    data: null,
  }, 'business'], ['bad json', 'format'], [{
    code: 200,
    message: 'ok',
  }, 'format']] as const) {
    const f = fixture(async () => ({
      statusCode: 200,
      data,
    }))
    await assert.rejects(f.request({
      path: '/',
    }), error => error instanceof ApiError && error.kind === kind)
  }
})
test('HTTP 错误保留会话，401 并发只通知一次', async () => {
  for (const statusCode of [400, 403, 404, 500]) {
    const f = fixture(async () => ({
      statusCode,
      data: null,
    }))
    await assert.rejects(f.request({
      path: '/',
    }), error => error instanceof ApiError && error.kind === 'http')
    assert.equal(f.session.snapshot().token, 'old')
  }
  const f = fixture(async () => ({
    statusCode: 401,
    data: null,
  }))
  await Promise.allSettled([f.request({
    path: '/',
  }), f.request({
    path: '/',
  })])
  assert.equal(f.expirations(), 1)
  assert.equal(f.session.snapshot().token, '')
})
test('迟到的 401 不影响新会话；免认证 401 不清会话', async () => {
  let finish!: (value: {
    statusCode: number
    data: unknown
  }) => void
  const f = fixture(() => new Promise((resolve) => {
    finish = resolve
  }))
  const pending = f.request({
    path: '/',
  })
  f.session.save('new')
  finish({
    statusCode: 401,
    data: null,
  })
  await assert.rejects(pending)
  assert.equal(f.session.snapshot().token, 'new')
  const g = fixture(async () => ({
    statusCode: 401,
    data: null,
  }))
  await assert.rejects(g.request({
    path: '/',
    anonymous: true,
  }))
  assert.equal(g.session.snapshot().token, 'old')
})
test('超时与网络异常', async () => {
  for (const [message, kind] of [['request:fail timeout', 'timeout'], ['network down', 'network']]) {
    const f = fixture(async () => {
      throw new Error(message)
    })
    await assert.rejects(f.request({
      path: '/',
    }), error => error instanceof ApiError && error.kind === kind)
  }
})
test('会话恢复和退出', () => {
  let stored: unknown = 'saved'
  const s = createSession({
    get: () => stored,
    set: (token) => {
      stored = token
    },
    remove: () => {
      stored = ''
    },
  })
  s.restore()
  assert.equal(s.snapshot().token, 'saved')
  s.clear()
  s.restore()
  assert.equal(s.snapshot().token, '')
})
