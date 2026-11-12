import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'

type Data = Record<string, unknown>
interface Request { method: string, url: string, header: Record<string, string>, data?: Data }
type MiniPage = { data: Data, setData: (values: Data) => void } & Record<
  string,
  unknown
>

// Execute the real page controllers with a small host stub; this is not an IDE renderer.
function runtime() {
  const source = fileURLToPath(new URL('../src/', import.meta.url))
  const modules = new Map<string, { exports: unknown }>()
  const storage = new Map<string, unknown>()
  let registered: Data | undefined
  let navigation = ''
  let actionIndex = 0
  const responses = new Map<string, { data: unknown, statusCode: number }>()
  const requests: Request[] = []
  const unexpectedRequests: string[] = []
  const wx = {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: unknown) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
    request: ({ success, ...request }: Request & {
      success: (result: { statusCode: number, data: unknown }) => void
    }) => {
      const path = new URL(request.url).pathname
      const key = `${request.method} ${path}`
      requests.push(JSON.parse(JSON.stringify(request)) as Request)
      const result = responses.get(key)
      if (!result) {
        unexpectedRequests.push(key)
        success({ statusCode: 404, data: { message: '未设置响应' } })
        return
      }
      success({
        statusCode: result.statusCode,
        data: { code: 200, message: 'ok', data: result.data },
      })
    },
    reLaunch: ({ url }: { url: string }) => {
      navigation = url
    },
    navigateTo: ({ url }: { url: string }) => {
      navigation = url
    },
    redirectTo: ({ url }: { url: string }) => {
      navigation = url
    },
    switchTab: ({ url }: { url: string }) => {
      navigation = url
    },
    navigateBack: () => {
      navigation = 'back'
    },
    setNavigationBarTitle: () => {},
    showToast: () => {},
    showModal: (options: {
      success?: (result: { confirm: boolean }) => void
      complete?: () => void
    }) => {
      options.success?.({ confirm: true })
      options.complete?.()
    },
    showActionSheet: (options: {
      success: (result: { tapIndex: number }) => void
    }) => options.success({ tapIndex: actionIndex }),
  }
  const context = vm.createContext({
    wx,
    __APP_CONFIG__: { mode: 'test', baseURL: 'https://api.example.invalid/api/v1' },
    Page: (options: Data) => {
      registered = options
    },
  })
  function load(path: string, cache = true): unknown {
    const candidate = path.endsWith('.ts') ? path : `${path}.ts`
    const file = existsSync(candidate) ? candidate : resolve(path, 'index.ts')
    if (cache && modules.has(file)) {
      return modules.get(file)!.exports
    }
    const module = { exports: {} as unknown }
    if (cache) {
      modules.set(file, module)
    }
    const code = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText
    const localRequire = (name: string) => {
      const dependency = name.startsWith('@/')
        ? resolve(source, name.slice(2))
        : resolve(dirname(file), name)
      return load(dependency)
    }
    const execute = vm.runInContext(
      `(function(require, module, exports) { ${code}\n})`,
      context,
    ) as (
      require: (name: string) => unknown,
      module: { exports: unknown },
      exports: unknown,
    ) => void
    execute(localRequire, module, module.exports)
    return module.exports
  }
  function page(path: string): MiniPage {
    registered = undefined
    load(resolve(source, `pages/${path}/index`), false)
    assert.ok(registered, `page ${path} was not registered`)
    const instance = {
      ...registered,
      data: JSON.parse(JSON.stringify(registered.data)) as Data,
    } as MiniPage
    instance.setData = (values: Data) => {
      for (const [path, value] of Object.entries(values)) {
        const keys = path.split('.')
        let target = instance.data
        for (const key of keys.slice(0, -1)) {
          target = target[key] as Data
        }
        target[keys[keys.length - 1]] = value
      }
    }
    return instance
  }
  return {
    page,
    navigation: () => navigation,
    select: (index: number) => {
      actionIndex = index
    },
    respond(method: string, path: string, data: unknown, statusCode = 200) {
      responses.set(`${method} /api/v1${path}`, { data, statusCode })
    },
    request(method: string, path: string) {
      const url = `https://api.example.invalid/api/v1${path}`
      return requests.findLast(item => item.method === method && item.url === url)
    },
    unexpectedRequests,
  }
}

async function call(page: MiniPage, method: string, ...args: unknown[]) {
  const fn = page[method] as (...values: unknown[]) => void
  assert.equal(typeof fn, 'function', `missing ${method}`)
  fn.apply(page, args)
  await setImmediate()
}

function input(value: string, field = '') {
  return {
    detail: { value },
    currentTarget: { dataset: { field } },
  }
}
const tap = (id: string) => ({ currentTarget: { dataset: { id } } })

const tripPath = '/grain-intake/trips/41'
const tripNumber = 'LZD20261112001'
const time = '2026-11-12T08:00:00+08:00'
const baseTrip = {
  id: 41,
  number: tripNumber,
  version: 1,
  siteCode: 'TEST',
  plate: '晋A90909',
  materialCode: 'GRAIN',
  materialName: '高粱',
  partyCode: 'SUPPLIER',
  partyName: '测试供应商',
  inspectionMethod: 'lab',
  createdAt: time,
  updatedAt: time,
  stage: 'pending_inspection',
}

async function loginAsAdmin(app: ReturnType<typeof runtime>) {
  app.respond('POST', '/auth/login', { tokenValue: 'test-token' })
  app.respond('GET', '/auth/me', {
    username: 'test-admin',
    nickname: '测试管理员',
    roles: [{ roleCode: 'ADMIN' }],
  })
  app.respond('GET', '/miniprogram/dictionaries', {
    version: '1',
    sites: [{ code: 'TEST', name: '测试厂区' }],
    materials: [{ code: 'GRAIN', name: '高粱', inspectionMethod: 'lab' }],
    suppliers: [{ code: 'SUPPLIER', name: '测试供应商' }],
    granaries: [{ id: 1, name: '一号仓' }],
  })

  const login = app.page('login')
  await call(login, 'onShow')
  await call(login, 'accountInput', input('test-admin'))
  await call(login, 'passwordInput', input('test-password'))
  await call(login, 'login')
  assert.equal(app.navigation(), '/pages/index/index')
  assert.equal(app.request('POST', '/auth/login')?.header.Authorization, undefined)
  assert.equal(app.request('GET', '/miniprogram/dictionaries')?.header.Authorization, 'Bearer test-token')
}

test('页面控制器通过后端接口登记、关联磅单并跨岗位确认实际出厂', async () => {
  const app = runtime()
  await loginAsAdmin(app)
  let trip = baseTrip
  const evidence = {
    inspections: [] as Data[],
    permit: null as Data | null,
    ticket: null as Data | null,
    events: [],
  }
  function publish(next: Partial<typeof baseTrip> & Data, action?: string) {
    trip = { ...trip, ...next }
    const detail = { trip, ...evidence }
    app.respond('GET', tripPath, detail)
    app.respond('GET', '/grain-intake/trips', { records: [trip], total: 1 })
    if (action) {
      app.respond('POST', `${tripPath}/${action}`, detail)
    }
  }

  app.respond('POST', '/grain-intake/trips', { trip, ...evidence })
  const register = app.page('registration')
  await call(register, 'onLoad', {})
  await call(register, 'chooseSite', { detail: { value: '1' } })
  await call(register, 'chooseMaterial', { detail: { value: '1' } })
  await call(register, 'chooseProvince', { detail: { value: '19' } })
  await call(register, 'inputPlateBody', { detail: { value: 'A90909' } })
  await call(register, 'save')
  assert.equal(register.data.formError, '请选择供应商')
  assert.equal(app.request('POST', '/grain-intake/trips'), undefined)
  await call(register, 'chooseSupplier', { detail: { value: '1' } })
  await call(register, 'save')
  assert.equal(app.navigation(), '/pages/trip/index?id=41')
  const registration = app.request('POST', '/grain-intake/trips')
  assert.equal(registration?.data?.partyCode, 'SUPPLIER')
  assert.ok(registration?.data?.clientRequestId)

  publish({})
  const detail = app.page('trip')
  await call(detail, 'onLoad', { id: '41' })
  await call(detail, 'onShow')
  assert.equal(detail.data.status, '待化验')
  assert.equal(detail.data.waiting, true)
  assert.equal((detail.data.expanded as Data).inspection, true)
  await call(detail, 'toggleSection', { currentTarget: { dataset: { section: 'inspection' } } })
  assert.equal((detail.data.expanded as Data).inspection, false)
  await call(detail, 'toggleSection', { currentTarget: { dataset: { section: 'inspection' } } })
  assert.equal((detail.data.expanded as Data).inspection, true)

  evidence.inspections = [{ id: 5, status: 'confirmed', conclusion: 'accept', moisture: '12', impurity: '1' }]
  publish({ stage: 'pending_unload', version: 2, effectiveInspectionId: 5 })
  await call(detail, 'onShow')
  assert.equal(detail.data.status, '待卸货')
  const action = app.page('action')
  await call(action, 'onLoad', { id: '41', action: 'unload' })
  await call(action, 'chooseGranary', { detail: { value: '1' } })
  publish({ stage: 'pending_ticket', version: 3, unloadedAt: time, unloadingLocation: '一号仓' }, 'confirm-unloading')
  await call(action, 'submit')
  assert.deepEqual(app.request('POST', `${tripPath}/confirm-unloading`)?.data, { version: 2, location: '一号仓' })
  await call(detail, 'onShow')
  assert.equal(detail.data.status, '待磅单')
  await call(detail, 'act')
  assert.equal(app.navigation(), '/pages/tickets/index?id=41')

  const candidate = { siteCode: 'TEST', ticketNo: 'BD001', linkable: true, finalGross: '35', finalTare: '15', finalNet: '19' }
  app.respond('GET', `${tripPath}/ticket-candidates`, [candidate])
  const tickets = app.page('tickets')
  await call(tickets, 'onLoad', { id: '41' })
  await call(tickets, 'onShow')
  assert.equal((tickets.data.tickets as Array<{ id: string }>)[0]?.id, candidate.ticketNo)
  evidence.ticket = { siteCode: 'TEST', ticket: candidate }
  publish({ stage: 'ready', version: 4, ticketConfirmedAt: time }, 'link-ticket')
  await call(tickets, 'link', tap(candidate.ticketNo))
  assert.deepEqual(app.request('POST', `${tripPath}/link-ticket`)?.data, { version: 3, ticketSiteCode: 'TEST', ticketNo: 'BD001' })
  await call(detail, 'onShow')
  assert.equal(detail.data.status, '待开证')

  evidence.permit = { id: 8, number: 'CZ001', createdAt: time }
  publish({ stage: 'permit_pending', version: 5 }, 'issue-permit')
  await call(detail, 'act')
  assert.deepEqual(app.request('POST', `${tripPath}/issue-permit`)?.data, { version: 4 })
  assert.equal(detail.data.status, '待审批')

  evidence.permit = { ...evidence.permit, approvedAt: time }
  publish({ stage: 'permit_approved', version: 6 }, 'approve-permit')
  await call(detail, 'act')
  assert.deepEqual(app.request('POST', `${tripPath}/approve-permit`)?.data, { version: 5, permitId: 8 })
  assert.equal(detail.data.status, '等待出厂')

  const workbench = app.page('index')
  await call(workbench, 'onShow')
  app.select(1)
  await call(workbench, 'switchRole')
  assert.equal(workbench.data.role, 'guard')
  assert.equal((workbench.data.trips as TripCard[])[0]?.id, tripNumber)
  const exit = app.page('exit')
  await call(exit, 'onLoad', { id: '41' })
  await call(exit, 'onShow')
  assert.equal(exit.data.eligible, true)
  assert.equal(exit.data.evidenceExpanded, false)
  await call(exit, 'toggleEvidence')
  assert.equal(exit.data.evidenceExpanded, true)
  await call(exit, 'toggleEvidence')
  assert.equal(exit.data.evidenceExpanded, false)
  app.respond('POST', `${tripPath}/confirm-exit`, { trip: { ...trip, stage: 'exited', exitedAt: time }, ...evidence })
  await call(exit, 'confirmExit')
  assert.deepEqual(app.request('POST', `${tripPath}/confirm-exit`)?.data, { version: 6, basis: 'permit', permitId: 8 })
  publish({ stage: 'exited', version: 7, exitedAt: time })
  await call(exit, 'onShow')
  assert.equal(exit.data.eligible, false)
  await call(workbench, 'onShow')
  assert.equal((workbench.data.trips as TripCard[]).length, 0)
  await call(workbench, 'showHistory')
  assert.equal((workbench.data.trips as TripCard[])[0]?.id, tripNumber)
  await call(workbench, 'search', input('不存在的单号'))
  assert.equal((workbench.data.trips as TripCard[]).length, 0)
  assert.equal(workbench.data.error, '')
  app.respond('GET', '/grain-intake/trips', null, 503)
  await call(workbench, 'load')
  assert.ok(workbench.data.error)
  publish({})
  await call(workbench, 'load')
  assert.equal(workbench.data.error, '')
  assert.deepEqual(app.unexpectedRequests, [])
})

interface TripCard { id: string }

test('目测拒收退厂显示依据并由门卫通过后端接口确认出厂', async () => {
  const app = runtime()
  await loginAsAdmin(app)
  const trip = {
    ...baseTrip,
    inspectionMethod: 'visual',
    visualConclusion: 'reject',
    visualReason: '含有明显异物',
    stage: 'rejected',
  }
  const response = { trip, inspections: [], permit: null, ticket: null, events: [] }
  app.respond('GET', tripPath, response)
  app.respond('GET', '/grain-intake/trips', { records: [trip], total: 1 })
  const detail = app.page('trip')
  await call(detail, 'onLoad', { id: '41' })
  await call(detail, 'onShow')
  assert.equal(detail.data.status, '等待退厂')
  assert.equal(detail.data.inspection, '目测拒收')
  assert.equal((detail.data.trip as { inspection: { reason: string } }).inspection.reason, '含有明显异物')
  assert.equal(detail.data.action, '')

  const workbench = app.page('index')
  await call(workbench, 'onShow')
  app.select(1)
  await call(workbench, 'switchRole')
  const exit = app.page('exit')
  await call(exit, 'onLoad', { id: '41' })
  await call(exit, 'onShow')
  assert.equal(exit.data.type, '拒收退厂')
  assert.equal(exit.data.eligible, true)
  const exited = { ...response, trip: { ...trip, stage: 'exited', exitedAt: time } }
  app.respond('POST', `${tripPath}/confirm-exit`, exited)
  await call(exit, 'confirmExit')
  assert.deepEqual(app.request('POST', `${tripPath}/confirm-exit`)?.data, { version: 1, basis: 'rejection' })
  app.respond('GET', tripPath, exited)
  await call(exit, 'onShow')
  assert.equal(exit.data.eligible, false)
  assert.deepEqual(app.unexpectedRequests, [])
})
