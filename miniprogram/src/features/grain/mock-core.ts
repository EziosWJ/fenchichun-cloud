import type {
  Conclusion,
  DemoState,
  DemoStorage,
  Inspection,
  InspectionMethod,
  Registration,
  Role,
  Ticket,
  Trip,
  User,
} from './types.ts'
import { demoDictionary } from './dictionary.ts'
import { canEdit, exitEligible } from './presentation.ts'

const users: Array<User & { password: string }> = [
  {
    account: 'warehouse',
    password: 'demo123',
    name: '演示库管',
    roles: ['warehouse'],
  },
  { account: 'guard', password: 'demo123', name: '演示门卫', roles: ['guard'] },
  {
    account: 'both',
    password: 'demo123',
    name: '演示员工',
    roles: ['warehouse', 'guard'],
  },
]
// 下拉选项与网页版基础资料保持一致，由 scripts/sync-dictionary.mjs 生成快照。
const options: {
  sites: string[]
  materials: Array<{ name: string, method: InspectionMethod }>
  suppliers: string[]
  granaries: string[]
} = {
  sites: demoDictionary.sites.map(item => item.name),
  materials: demoDictionary.materials.map(item => ({
    name: item.name,
    method: item.method,
  })),
  suppliers: demoDictionary.suppliers.map(item => item.name),
  granaries: demoDictionary.granaries.map(item => item.name),
}
const seedSite = options.sites[0] ?? ''
const seedSupplier = options.suppliers[0] ?? ''

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function clock() {
  const date = new Date()
  const two = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`
}

function seed(): DemoState {
  const at = '2026-11-08 09:00'
  const registration = (
    plate: string,
    material: string,
    supplier = seedSupplier,
  ): Registration => ({
    site: seedSite,
    plate,
    material,
    supplier,
    driver: '',
    phone: '',
    contract: '',
    note: '',
  })
  const inspection = (
    method: InspectionMethod,
    conclusion: Conclusion,
    reason = '',
  ): Inspection => ({
    method,
    conclusion,
    reason,
    at,
    operator: method === 'lab' ? '模拟化验员' : '演示库管',
    values: method === 'lab' ? '水分 12.5% / 杂质 1.0% / 容重 720 g/L' : '',
  })
  const trip = (
    id: string,
    plate: string,
    material: string,
    method: InspectionMethod,
  ): Trip => ({
    ...registration(plate, material),
    id,
    method,
    version: 1,
    createdAt: at,
    inspection: null,
    unload: null,
    ticket: null,
    ticketAvailable: false,
    permit: null,
    exitedAt: '',
    events: [{ at, operator: '演示库管', text: '登记流转单' }],
  })
  const ticket = (t: Trip): Ticket => ({
    id: `BD${t.id.slice(-3)}`,
    tripId: t.id,
    site: t.site,
    plate: t.plate,
    material: t.material,
    supplier: t.supplier,
    firstAt: '2026-11-08 09:20',
    secondAt: '2026-11-08 10:10',
    gross: '40,000 kg',
    tare: '12,000 kg',
    net: '28,000 kg',
    deducted: '27,760 kg',
  })
  const accepted = trip('LZD20261108001', '晋A12345', '高粱', 'lab')
  accepted.inspection = inspection('lab', 'accept')
  const waiting = trip('LZD20261108002', '晋B67890', '大麦', 'lab')
  const visual = trip('LZD20261108003', '晋C21867', '木片', 'visual')
  visual.inspection = inspection('visual', 'accept')
  visual.unload = { location: '2号仓', at: '2026-11-08 09:40' }
  const visualReject = trip('LZD20261108004', '晋D12876', '木片', 'visual')
  visualReject.inspection = inspection('visual', 'reject', '含有明显异物')
  const labReject = trip('LZD20261108005', '晋E51888', '高粱', 'lab')
  labReject.inspection = inspection('lab', 'reject', '水分不符合接收要求')
  const ready = trip('LZD20261108006', '晋F66888', '高粱', 'lab')
  ready.inspection = inspection('lab', 'accept')
  ready.unload = { location: '1号仓', at: '2026-11-08 09:40' }
  ready.ticket = ticket(ready)
  ready.permit = {
    id: 'CMZ006',
    issuedAt: '2026-11-08 10:15',
    approvedAt: '2026-11-08 10:20',
  }
  const exited = trip('LZD20261107007', '晋F66888', '高粱', 'lab')
  exited.createdAt = '2026-11-07 09:00'
  exited.inspection = inspection('lab', 'accept')
  exited.unload = { location: '1号仓', at: '2026-11-08 09:40' }
  exited.ticket = ticket(exited)
  exited.permit = {
    id: 'CMZ007',
    issuedAt: '2026-11-08 10:15',
    approvedAt: '2026-11-08 10:20',
  }
  exited.exitedAt = '2026-11-08 10:30'
  const visualPending = trip('LZD20261108008', '晋G30668', '木片', 'visual')
  visualPending.supplier = ''
  const trips = [
    accepted,
    waiting,
    visual,
    visualReject,
    labReject,
    ready,
    exited,
    visualPending,
  ]
  trips.forEach((item) => {
    item.events[0].at = item.createdAt
    if (item.inspection) {
      item.events.push({
        at: item.inspection.at,
        operator: item.inspection.operator,
        text: `${item.inspection.method === 'lab' ? '模拟化验' : '目测'}${item.inspection.conclusion === 'accept' ? '接收' : `拒收：${item.inspection.reason}`}`,
      })
    }
    if (item.unload) {
      item.events.push({
        at: item.unload.at,
        operator: '演示库管',
        text: `确认卸粮：${item.unload.location}`,
      })
    }
    if (item.ticket) {
      item.events.push({
        at: item.ticket.secondAt,
        operator: '演示库管',
        text: `关联正式磅单 ${item.ticket.id}`,
      })
    }
    if (item.permit) {
      item.events.push({
        at: item.permit.issuedAt,
        operator: '演示库管',
        text: `开具出门证 ${item.permit.id}`,
      })
      if (item.permit.approvedAt) {
        item.events.push({
          at: item.permit.approvedAt,
          operator: '演示库管',
          text: '审批出门证，等待门卫确认实际出厂',
        })
      }
    }
    if (item.exitedAt) {
      item.events.push({
        at: item.exitedAt,
        operator: '演示门卫',
        text: '确认实际出厂',
      })
    }
  })
  return {
    schema: 1,
    sequence: 8,
    user: null,
    role: null,
    trips,
    tickets: [ready.ticket, exited.ticket],
  }
}

export function createDemoService(
  storage: DemoStorage,
  now: () => string = clock,
) {
  function read(): DemoState {
    const value = storage.get()
    if (value === '' || value === undefined || value === null) {
      const initial = seed()
      storage.set(initial)
      return copy(initial)
    }
    if (
      typeof value !== 'object'
      || !('schema' in value)
      || value.schema !== 1
      || !('trips' in value)
      || !Array.isArray(value.trips)
      || !('tickets' in value)
      || !Array.isArray(value.tickets)
    ) {
      throw new Error('本地演示数据无法读取，请重试或恢复初始数据')
    }
    const state = copy(value as DemoState)
    state.trips.forEach((trip) => {
      trip.ticketAvailable = state.tickets.some(ticket => ticket.tripId === trip.id && trip.ticket?.id !== ticket.id)
    })
    return state
  }
  function save(state: DemoState) {
    storage.set(copy(state))
  }
  function requireUser(state: DemoState, role?: Role) {
    if (!state.user || !state.role || !state.user.roles.includes(state.role)) {
      throw new Error('请先登录演示账号')
    }
    if (role && state.role !== role) {
      throw new Error(`请先切换到${role === 'warehouse' ? '库管' : '门卫'}岗位`)
    }
    return state.user
  }
  function find(state: DemoState, id: string) {
    const trip = state.trips.find(item => item.id === id)
    if (!trip) {
      throw new Error('未找到这趟流转单，请返回刷新')
    }
    return trip
  }
  function event(trip: Trip, operator: string, text: string) {
    trip.events.push({ at: now(), operator, text })
  }
  function mutate(
    id: string,
    version: number,
    role: Role | undefined,
    action: (trip: Trip, state: DemoState, user: User) => void,
  ) {
    const state = read()
    const user = requireUser(state, role)
    const trip = find(state, id)
    if (trip.version !== version) {
      throw new Error('记录已变化，请刷新后重新核对')
    }
    action(trip, state, user)
    trip.version++
    save(state)
    return copy(trip)
  }
  function cleanRegistration(input: Registration) {
    const result = {
      ...input,
      site: input.site.trim(),
      plate: input.plate.trim().toUpperCase(),
      material: input.material.trim(),
      supplier: input.supplier.trim(),
      driver: input.driver.trim(),
      phone: input.phone.trim(),
      contract: input.contract.trim(),
      note: input.note.trim(),
    }
    if (!options.sites.includes(result.site)) {
      throw new Error('请选择厂区')
    }
    if (!result.plate) {
      throw new Error('请填写车牌')
    }
    if (!options.materials.some(item => item.name === result.material)) {
      throw new Error('请选择货品')
    }
    if (result.supplier && !options.suppliers.includes(result.supplier)) {
      throw new Error('请选择已有供应商')
    }
    return result
  }
  function method(material: string) {
    return options.materials.find(item => item.name === material)!.method
  }
  function checkAccepted(trip: Trip) {
    if (trip.exitedAt || trip.inspection?.conclusion !== 'accept') {
      throw new Error('本趟尚无接收结论或已出厂，请刷新核对')
    }
  }
  return {
    options: () => copy(options),
    current() {
      const state = read()
      if (
        !state.user
        || !state.role
        || !state.user.roles.includes(state.role)
      ) {
        return null
      }
      return { user: state.user, role: state.role }
    },
    login(account: string, password: string) {
      const match = users.find(
        user => user.account === account.trim() && user.password === password,
      )
      if (!match) {
        throw new Error('演示账号或密码不正确')
      }
      const state = read()
      state.user = {
        account: match.account,
        name: match.name,
        roles: match.roles,
      }
      state.role = match.roles[0]
      save(state)
    },
    logout() {
      const state = read()
      state.user = null
      state.role = null
      save(state)
    },
    switchRole(role: Role) {
      const state = read()
      const user = requireUser(state)
      if (!user.roles.includes(role)) {
        throw new Error('当前账号没有这个岗位')
      }
      state.role = role
      save(state)
    },
    reset() {
      const state = read()
      const initial = seed()
      initial.user = state.user
      initial.role = state.role
      save(initial)
    },
    listTrips() {
      const state = read()
      requireUser(state)
      return state.trips
    },
    getTrip(id: string) {
      const state = read()
      requireUser(state)
      return find(state, id)
    },
    simulationTasks() {
      const state = read()
      requireUser(state)
      return {
        lab: state.trips.filter(
          trip => trip.method === 'lab' && !trip.inspection && !trip.exitedAt,
        ),
        weigh: state.trips.filter(
          trip =>
            trip.inspection?.conclusion === 'accept'
            && trip.unload
            && !trip.ticket
            && !trip.exitedAt
            && !state.tickets.some(ticket => ticket.tripId === trip.id),
        ),
      }
    },
    createTrip(input: Registration) {
      const state = read()
      const user = requireUser(state, 'warehouse')
      const data = cleanRegistration(input)
      const id = `LZDDEMO${String(++state.sequence).padStart(4, '0')}`
      const trip: Trip = {
        ...data,
        id,
        version: 1,
        createdAt: now(),
        method: method(data.material),
        inspection: null,
        unload: null,
        ticket: null,
        ticketAvailable: false,
        permit: null,
        exitedAt: '',
        events: [],
      }
      event(trip, user.name, '登记流转单')
      state.trips.unshift(trip)
      save(state)
      return copy(trip)
    },
    updateTrip(id: string, version: number, input: Registration) {
      return mutate(id, version, 'warehouse', (trip, _state, user) => {
        if (!canEdit(trip)) {
          throw new Error('已有检验或后续记录，不能更正登记')
        }
        const data = cleanRegistration(input)
        const materialChanged = trip.material !== data.material
        Object.assign(trip, data)
        if (materialChanged) {
          trip.method = method(data.material)
        }
        event(trip, user.name, '更正登记信息')
      })
    },
    recordVisual(
      id: string,
      version: number,
      conclusion: Conclusion,
      reason: string,
    ) {
      return mutate(id, version, 'warehouse', (trip, _state, user) => {
        if (trip.method !== 'visual' || trip.inspection || trip.exitedAt) {
          throw new Error('当前状态不能确认目测')
        }
        if (!trip.supplier) {
          throw new Error('请先补充供应商')
        }
        if (conclusion !== 'accept' && conclusion !== 'reject') {
          throw new Error('请选择目测结论')
        }
        if (conclusion === 'reject' && !reason.trim()) {
          throw new Error('请填写拒收原因')
        }
        trip.inspection = {
          method: 'visual',
          conclusion,
          reason: reason.trim(),
          at: now(),
          operator: user.name,
          values: '',
        }
        event(
          trip,
          user.name,
          conclusion === 'accept' ? '目测接收' : `目测拒收：${reason.trim()}`,
        )
      })
    },
    confirmUnload(id: string, version: number, location: string) {
      return mutate(id, version, 'warehouse', (trip, _state, user) => {
        checkAccepted(trip)
        if (trip.unload) {
          throw new Error('本趟已经确认卸粮')
        }
        if (!location.trim()) {
          throw new Error('请填写实际卸粮地点')
        }
        trip.unload = { location: location.trim(), at: now() }
        event(trip, user.name, `确认卸粮：${location.trim()}`)
      })
    },
    candidates(id: string) {
      const state = read()
      requireUser(state, 'warehouse')
      const trip = find(state, id)
      return state.tickets.filter(
        ticket =>
          ticket.tripId === trip.id
          && !state.trips.some(item => item.ticket?.id === ticket.id),
      )
    },
    linkTicket(id: string, version: number, ticketId: string) {
      return mutate(id, version, 'warehouse', (trip, state, user) => {
        checkAccepted(trip)
        if (!trip.unload || trip.ticket) {
          throw new Error('请先确认卸粮，且每趟只能关联一张磅单')
        }
        const ticket = state.tickets.find(
          item => item.id === ticketId && item.tripId === trip.id,
        )
        if (
          !ticket
          || state.trips.some(item => item.ticket?.id === ticketId)
          || ticket.site !== trip.site
          || ticket.plate !== trip.plate
          || ticket.material !== trip.material
          || ticket.supplier !== trip.supplier
        ) {
          throw new Error('磅单不可关联，请刷新候选后重新核对')
        }
        trip.ticket = copy(ticket)
        trip.ticketAvailable = false
        event(trip, user.name, `关联正式磅单 ${ticket.id}`)
      })
    },
    issuePermit(id: string, version: number) {
      return mutate(id, version, 'warehouse', (trip, _state, user) => {
        checkAccepted(trip)
        if (!trip.unload || !trip.ticket || trip.permit) {
          throw new Error('需先确认卸粮并关联正式磅单，且不能重复开证')
        }
        trip.permit = {
          id: `CMZ${trip.id.slice(-4)}`,
          issuedAt: now(),
          approvedAt: '',
        }
        event(trip, user.name, `开具出门证 ${trip.permit.id}`)
      })
    },
    approvePermit(id: string, version: number) {
      return mutate(id, version, 'warehouse', (trip, _state, user) => {
        checkAccepted(trip)
        if (
          !trip.ticket
          || !trip.unload
          || !trip.permit
          || trip.permit.approvedAt
        ) {
          throw new Error('出门证或相关依据已变化，请刷新核对')
        }
        trip.permit.approvedAt = now()
        event(trip, user.name, '审批出门证，等待门卫确认实际出厂')
      })
    },
    confirmExit(id: string, version: number) {
      return mutate(id, version, 'guard', (trip, _state, user) => {
        if (trip.exitedAt) {
          throw new Error('本趟已出厂，不能重复确认')
        }
        if (!exitEligible(trip)) {
          throw new Error('出厂依据不满足，请刷新核对')
        }
        trip.exitedAt = now()
        event(trip, user.name, '确认实际出厂')
      })
    },
    simulateLab(
      id: string,
      version: number,
      conclusion: Conclusion,
      reason: string,
    ) {
      return mutate(id, version, undefined, (trip) => {
        if (trip.method !== 'lab' || trip.inspection || trip.exitedAt) {
          throw new Error('本趟不在等待化验')
        }
        if (!trip.supplier) {
          throw new Error('请先在流转单补充供应商')
        }
        if (conclusion !== 'accept' && conclusion !== 'reject') {
          throw new Error('请选择模拟化验结论')
        }
        if (conclusion === 'reject' && !reason.trim()) {
          throw new Error('请填写模拟拒收原因')
        }
        trip.inspection = {
          method: 'lab',
          conclusion,
          reason: reason.trim(),
          at: now(),
          operator: '模拟化验员',
          values: '水分 12.5% / 杂质 1.0% / 容重 720 g/L（模拟）',
        }
        event(
          trip,
          '模拟化验员',
          conclusion === 'accept'
            ? '模拟化验接收'
            : `模拟化验拒收：${reason.trim()}`,
        )
      })
    },
    simulateTicket(id: string, version: number) {
      return mutate(id, version, undefined, (trip, state) => {
        checkAccepted(trip)
        if (
          !trip.unload
          || trip.ticket
          || state.tickets.some(item => item.tripId === id)
        ) {
          throw new Error('本趟尚未卸粮，或已有模拟磅单')
        }
        const ticket: Ticket = {
          id: `BDDEMO${String(++state.sequence).padStart(4, '0')}`,
          tripId: id,
          site: trip.site,
          plate: trip.plate,
          material: trip.material,
          supplier: trip.supplier,
          firstAt: trip.unload.at,
          secondAt: now(),
          gross: '40,000 kg',
          tare: '12,000 kg',
          net: '28,000 kg',
          deducted: '27,760 kg',
        }
        state.tickets.push(ticket)
        trip.ticketAvailable = true
        event(trip, '模拟地磅', `模拟正式磅单已同步 ${ticket.id}`)
      })
    },
  }
}
export type DemoService = ReturnType<typeof createDemoService>
