import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'

type Data = Record<string, unknown>
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
  let storageError = false
  const wx = {
    getStorageSync: (key: string) => {
      if (storageError) {
        throw new Error('本地存储不可用')
      }
      return storage.get(key)
    },
    setStorageSync: (key: string, value: unknown) => storage.set(key, value),
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
    __APP_CONFIG__: { mode: 'development', mock: true, baseURL: '' },
    Page: (options: Data) => {
      registered = options
    },
  })
  function load(path: string, cache = true): unknown {
    const file = path.endsWith('.ts') ? path : `${path}.ts`
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
    failStorage: (fail: boolean) => {
      storageError = fail
    },
  }
}

function call(page: MiniPage, method: string, ...args: unknown[]) {
  const fn = page[method] as (...values: unknown[]) => void
  assert.equal(typeof fn, 'function', `missing ${method}`)
  fn.apply(page, args)
}

function input(value: string, field = '') {
  return {
    detail: { value },
    currentTarget: { dataset: { field } },
  }
}
const tap = (id: string) => ({ currentTarget: { dataset: { id } } })

test('页面控制器从登录、登记到跨岗位确认实际出厂', () => {
  const app = runtime()
  const login = app.page('login')
  call(login, 'onShow')
  call(login, 'accountInput', input('both'))
  call(login, 'passwordInput', input('demo123'))
  call(login, 'login')
  assert.equal(app.navigation(), '/pages/index/index')

  const register = app.page('registration')
  call(register, 'onLoad', {})
  call(register, 'chooseSite', { detail: { value: '1' } })
  call(register, 'chooseMaterial', { detail: { value: '1' } })
  call(register, 'chooseSupplier', { detail: { value: '1' } })
  call(register, 'input', input('晋A90909', 'plate'))
  call(register, 'save')
  const id = app.navigation().split('id=')[1]
  assert.ok(id)

  const detail = app.page('trip')
  call(detail, 'onLoad', { id })
  call(detail, 'onShow')
  assert.equal(detail.data.status, '等待化验')
  assert.equal(detail.data.waiting, true)
  assert.equal((detail.data.expanded as Data).inspection, false)
  call(detail, 'toggleSection', { currentTarget: { dataset: { section: 'inspection' } } })
  assert.equal((detail.data.expanded as Data).inspection, true)
  call(detail, 'toggleSection', { currentTarget: { dataset: { section: 'inspection' } } })
  assert.equal((detail.data.expanded as Data).inspection, false)
  const simulation = app.page('simulation')
  call(simulation, 'onShow')
  app.select(0)
  call(simulation, 'lab', tap(id))
  call(detail, 'onShow')
  assert.equal(detail.data.status, '待卸粮')

  const action = app.page('action')
  call(action, 'onLoad', { id, action: 'unload' })
  call(action, 'inputLocation', input('演示卸粮点'))
  call(action, 'submit')
  call(detail, 'onShow')
  assert.equal(detail.data.status, '等待磅单同步')
  assert.equal(detail.data.waiting, true)
  call(detail, 'act')
  assert.match(app.navigation(), /^\/pages\/tickets\/index\?id=/)
  call(simulation, 'onShow')
  call(simulation, 'ticket', tap(id))
  call(detail, 'onShow')
  assert.equal(detail.data.status, '待关联磅单')
  const tickets = app.page('tickets')
  call(tickets, 'onLoad', { id })
  call(tickets, 'onShow')
  const candidate = (tickets.data.tickets as Array<{ id: string }>)[0]
  assert.ok(candidate)
  call(tickets, 'link', tap(candidate.id))
  call(detail, 'onShow')
  assert.equal(detail.data.status, '待开证')
  call(detail, 'act')
  assert.equal(detail.data.status, '待审批')
  call(detail, 'act')
  assert.equal(detail.data.status, '等待出厂')

  const workbench = app.page('index')
  call(workbench, 'onShow')
  app.select(1)
  call(workbench, 'switchRole')
  assert.equal(workbench.data.role, 'guard')
  assert.ok(
    (workbench.data.trips as Array<{ id: string }>).some(
      item => item.id === id,
    ),
  )
  const exit = app.page('exit')
  call(exit, 'onLoad', { id })
  call(exit, 'onShow')
  assert.equal(exit.data.eligible, true)
  assert.equal(exit.data.evidenceExpanded, false)
  call(exit, 'toggleEvidence')
  assert.equal(exit.data.evidenceExpanded, true)
  call(exit, 'toggleEvidence')
  assert.equal(exit.data.evidenceExpanded, false)
  call(exit, 'confirmExit')
  assert.equal(exit.data.eligible, false)
  call(workbench, 'onShow')
  assert.equal(
    (workbench.data.trips as Array<{ id: string }>).some(
      item => item.id === id,
    ),
    false,
  )
  call(workbench, 'showHistory')
  assert.ok(
    (workbench.data.trips as Array<{ id: string }>).some(
      item => item.id === id,
    ),
  )
  call(workbench, 'search', input('不存在的单号'))
  assert.equal((workbench.data.trips as unknown[]).length, 0)
  assert.equal(workbench.data.error, '')
  app.failStorage(true)
  call(workbench, 'load')
  assert.ok(workbench.data.error)
  app.failStorage(false)
  call(workbench, 'load')
  assert.equal(workbench.data.error, '')
})

test('拒收退厂仍显示依据并由门卫确认实际出厂', () => {
  const app = runtime()
  const login = app.page('login')
  call(login, 'accountInput', input('both'))
  call(login, 'passwordInput', input('demo123'))
  call(login, 'login')

  const id = 'LZD20261108004'
  const detail = app.page('trip')
  call(detail, 'onLoad', { id })
  call(detail, 'onShow')
  assert.equal(detail.data.status, '等待退厂')
  assert.equal(detail.data.inspection, '目测拒收')
  assert.equal((detail.data.trip as { inspection: { reason: string } }).inspection.reason, '含有明显异物')
  assert.equal(detail.data.action, '')

  const workbench = app.page('index')
  call(workbench, 'onShow')
  app.select(1)
  call(workbench, 'switchRole')
  const exit = app.page('exit')
  call(exit, 'onLoad', { id })
  call(exit, 'onShow')
  assert.equal(exit.data.type, '拒收退厂')
  assert.equal(exit.data.eligible, true)
  call(exit, 'confirmExit')
  assert.equal(exit.data.eligible, false)
})
