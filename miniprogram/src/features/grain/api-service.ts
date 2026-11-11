import type {
  Conclusion,
  Inspection,
  Registration,
  Role,
  Ticket,
  Trip,
  User,
} from './types'
import { request, session } from '@/utils/api'
import { currentDictionary, refreshDictionary } from './dictionary-service'

const AUTH_KEY = 'grain.auth.v1'

interface AuthState {
  user: User
  role: Role
}

interface ServerRole {
  roleCode: string
  roleName: string
}

interface ServerUser {
  id: number
  username: string
  nickname: string
  roles: ServerRole[]
}

interface ServerTrip {
  id: number
  number: string
  version: number
  siteCode: string
  plate: string
  materialCode: string
  partyCode: string
  driver: string
  driverPhone: string
  contractNo: string
  remark: string
  inspectionMethod: 'lab' | 'visual'
  visualConclusion: '' | 'accept' | 'reject'
  visualReason: string
  visualInspectedAt: string | null
  materialName: string
  partyName: string
  effectiveInspectionId: number | null
  unloadingLocation: string
  unloadedAt: string | null
  ticketId: number | null
  ticketConfirmedAt: string | null
  createdAt: string
  updatedAt: string
  exitedAt: string | null
  stage: string
  effectiveConclusion: string
  inspectionConclusion: string
}

interface ServerInspection {
  id: number
  version: number
  conclusion: 'accept' | 'reject'
  reason: string
  moisture: string
  impurity: string
  confirmedAt: string | null
  createdAt: string
}

interface ServerPermit {
  id: number
  number: string
  status: string
  createdAt: string
  approvedAt: string | null
}

interface ServerTicketRecord {
  siteCode: string
  status: string
  ticket: {
    ticketNo: string
    plate: string
    materialName: string
    partyName: string
    firstConfirmedAt: string
    secondConfirmedAt: string
    finalGross: string
    finalTare: string
    finalNet?: string
  }
}

interface ServerEvent {
  id: number
  actorName: string
  description: string
  createdAt: string
}

interface ServerCandidate {
  siteCode: string
  ticketNo: string
  plate: string
  materialName: string
  partyName: string
  finalGross: string
  finalTare: string
  finalNetMilliTonne: number
  firstConfirmedAt: string
  secondConfirmedAt: string
  issuedAt: string
  linkable: boolean
  reason: string
}

interface ServerDetail {
  trip: ServerTrip
  inspections: ServerInspection[]
  permit: ServerPermit | null
  ticket: ServerTicketRecord | null
  events: ServerEvent[]
}

interface ServerPage {
  records: ServerTrip[]
  total: number
}

function readAuth(): AuthState | null {
  try {
    const value = wx.getStorageSync(AUTH_KEY)
    if (value && typeof value === 'object' && value.user && value.role) {
      return value as AuthState
    }
  }
  catch {
    // 存储不可用时按未登录处理。
  }
  return null
}

function writeAuth(value: AuthState) {
  wx.setStorageSync(AUTH_KEY, value)
}

function clearAuth() {
  try {
    wx.removeStorageSync(AUTH_KEY)
  }
  catch {
    // 存储不可用时只清理内存会话。
  }
}

function rolesFrom(user: ServerUser): Role[] {
  const codes = new Set(user.roles.map(role => role.roleCode))
  const roles: Role[] = []
  if (codes.has('STORE') || codes.has('ADMIN')) {
    roles.push('warehouse')
  }
  if (codes.has('GUARD') || codes.has('ADMIN')) {
    roles.push('guard')
  }
  return roles
}

function formatTime(value: string | null | undefined) {
  if (!value) {
    return ''
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  const two = (number: number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`
}

function siteName(code: string) {
  return currentDictionary().sites.find(item => item.code === code)?.name || code
}

function inspectionValues(value: ServerInspection) {
  return `水分 ${value.moisture}% / 杂质 ${value.impurity}%`
}

function inspectionsOf(trip: ServerTrip, detail?: ServerDetail): Inspection | null {
  if (trip.inspectionMethod === 'visual') {
    if (!trip.visualConclusion) {
      return null
    }
    return {
      method: 'visual',
      conclusion: trip.visualConclusion,
      reason: trip.visualReason,
      at: formatTime(trip.visualInspectedAt),
      operator: '化验员',
      values: '',
    }
  }
  const inspection = detail?.inspections.find(item => item.id === trip.effectiveInspectionId)
    ?? detail?.inspections[0]
  if (inspection) {
    return {
      method: 'lab',
      conclusion: inspection.conclusion,
      reason: inspection.reason,
      at: formatTime(inspection.confirmedAt ?? inspection.createdAt),
      operator: '化验员',
      values: inspectionValues(inspection),
      id: inspection.id,
      version: inspection.version,
    }
  }
  const conclusion = trip.effectiveConclusion || trip.inspectionConclusion
  if (!conclusion) {
    return null
  }
  return {
    method: 'lab',
    conclusion: conclusion as Conclusion,
    reason: '',
    at: '',
    operator: '化验员',
    values: '',
    id: trip.effectiveInspectionId ?? undefined,
  }
}

function ticketOf(detail?: ServerDetail): Ticket | null {
  const record = detail?.ticket
  if (!record?.ticket) {
    return null
  }
  const value = record.ticket
  return {
    id: value.ticketNo,
    tripId: '',
    site: siteName(record.siteCode),
    plate: value.plate,
    material: value.materialName,
    supplier: value.partyName,
    firstAt: formatTime(value.firstConfirmedAt),
    secondAt: formatTime(value.secondConfirmedAt),
    gross: value.finalGross,
    tare: value.finalTare,
    net: value.finalNet ?? '',
    deducted: value.finalNet ?? '',
  }
}

function adaptTrip(trip: ServerTrip, detail?: ServerDetail): Trip {
  return {
    id: trip.number,
    serverId: String(trip.id),
    number: trip.number,
    stage: trip.stage,
    version: trip.version,
    createdAt: formatTime(trip.createdAt),
    updatedAt: formatTime(trip.updatedAt),
    site: siteName(trip.siteCode),
    plate: trip.plate,
    material: trip.materialName,
    supplier: trip.partyName,
    driver: trip.driver,
    phone: trip.driverPhone,
    contract: trip.contractNo,
    note: trip.remark,
    method: trip.inspectionMethod,
    inspection: inspectionsOf(trip, detail),
    unload: trip.unloadedAt
      ? { location: trip.unloadingLocation, at: formatTime(trip.unloadedAt) }
      : null,
    ticket: ticketOf(detail),
    ticketAvailable: false,
    ticketConfirmedAt: formatTime(trip.ticketConfirmedAt),
    permit: detail?.permit
      ? {
          id: detail.permit.number,
          numericId: detail.permit.id,
          issuedAt: formatTime(detail.permit.createdAt),
          approvedAt: formatTime(detail.permit.approvedAt),
        }
      : null,
    exitedAt: formatTime(trip.exitedAt),
    events: (detail?.events ?? []).map(event => ({
      at: formatTime(event.createdAt),
      operator: event.actorName || '系统',
      text: event.description,
    })),
  }
}

function finish(message: string): never {
  throw new Error(message)
}

export const demo = {
  options() {
    const dictionary = currentDictionary()
    return {
      sites: dictionary.sites.map(item => item.name),
      materials: dictionary.materials.map(item => ({
        name: item.name,
        method: item.inspectionMethod,
      })),
      suppliers: dictionary.suppliers.map(item => item.name),
      granaries: dictionary.granaries.map(item => item.name),
    }
  },
  setDictionary() {},
  current(): AuthState | null {
    const auth = readAuth()
    if (!auth) {
      return null
    }
    if (!session.snapshot().token) {
      clearAuth()
      return null
    }
    return auth
  },
  async login(account: string, password: string) {
    session.clear()
    const result = await request<{ tokenValue: string }>({
      path: '/auth/login',
      method: 'POST',
      data: { username: account.trim(), password },
      anonymous: true,
    })
    session.save(result.tokenValue)
    try {
      const me = await request<ServerUser>({ path: '/auth/me' })
      const roles = rolesFrom(me)
      if (!roles.length) {
        finish('小程序仅支持库管、门卫和管理员账号')
      }
      const user: User = {
        account: me.username,
        name: me.nickname || me.username,
        roles,
      }
      writeAuth({ user, role: roles[0] })
      await refreshDictionary().catch(() => null)
      return user
    }
    catch (error) {
      session.clear()
      clearAuth()
      throw error
    }
  },
  async logout() {
    try {
      await request({ path: '/auth/logout', method: 'POST' })
    }
    catch {
      // 退出以本地清理为准。
    }
    finally {
      session.clear()
      clearAuth()
    }
  },
  switchRole(role: Role) {
    const current = readAuth()
    if (!current) {
      finish('请先登录')
    }
    if (!current.user.roles.includes(role)) {
      finish('当前账号没有这个岗位')
    }
    writeAuth({ ...current, role })
  },
  async listTrips() {
    if (!readAuth()) {
      finish('请先登录')
    }
    const page = await request<ServerPage>({
      path: '/grain-intake/trips',
      data: { page: 1, pageSize: 100 },
    })
    return page.records.map(record => adaptTrip(record))
  },
  async getTrip(id: string) {
    if (!readAuth()) {
      finish('请先登录')
    }
    const detail = await request<ServerDetail>({ path: `/grain-intake/trips/${id}` })
    return adaptTrip(detail.trip, detail)
  },
  async createTrip(input: Registration) {
    const dictionary = currentDictionary()
    const site = dictionary.sites.find(item => item.name === input.site)
    const material = dictionary.materials.find(item => item.name === input.material)
    const party = dictionary.suppliers.find(item => item.name === input.supplier)
    if (!site || !material || !party) {
      finish('请选择有效的厂区、货品和供应商')
    }
    const detail = await request<ServerDetail>({
      path: '/grain-intake/trips',
      method: 'POST',
      data: {
        siteCode: site.code,
        plate: input.plate,
        materialCode: material.code,
        partyCode: party.code,
        driver: input.driver,
        driverPhone: input.phone,
        contractNo: input.contract,
        remark: input.note,
      },
    })
    return adaptTrip(detail.trip, detail)
  },
  async updateTrip(id: string, version: number, input: Registration) {
    const dictionary = currentDictionary()
    const site = dictionary.sites.find(item => item.name === input.site)
    const material = dictionary.materials.find(item => item.name === input.material)
    const party = dictionary.suppliers.find(item => item.name === input.supplier)
    if (!site || !material || !party) {
      finish('请选择有效的厂区、货品和供应商')
    }
    const detail = await request<ServerDetail>({
      path: `/grain-intake/trips/${id}`,
      method: 'PUT',
      data: {
        siteCode: site.code,
        plate: input.plate,
        materialCode: material.code,
        partyCode: party.code,
        driver: input.driver,
        driverPhone: input.phone,
        contractNo: input.contract,
        remark: input.note,
        version,
      },
    })
    return adaptTrip(detail.trip, detail)
  },
  async confirmExit(id: string, version: number) {
    const detail = await request<ServerDetail>({ path: `/grain-intake/trips/${id}` })
    const trip = detail.trip
    const data: Record<string, unknown> = { version, basis: '' }
    if (trip.stage === 'rejected') {
      data.basis = 'rejection'
      if (trip.inspectionMethod !== 'visual') {
        const inspection = detail.inspections.find(item => item.id === trip.effectiveInspectionId)
          ?? detail.inspections[0]
        if (!inspection) {
          finish('未找到拒收化验依据')
        }
        data.inspectionId = inspection.id
        data.inspectionVersion = inspection.version
      }
    }
    else {
      if (!detail.permit) {
        finish('未找到已审批的出门证')
      }
      data.basis = 'permit'
      data.permitId = detail.permit.id
    }
    const result = await request<ServerDetail>({
      path: `/grain-intake/trips/${id}/confirm-exit`,
      method: 'POST',
      data,
    })
    return adaptTrip(result.trip, result)
  },
  async confirmUnload(id: string, version: number, location: string) {
    const detail = await request<ServerDetail>({
      path: `/grain-intake/trips/${id}/confirm-unloading`,
      method: 'POST',
      data: { version, location },
    })
    return adaptTrip(detail.trip, detail)
  },
  async issuePermit(id: string, version: number) {
    const detail = await request<ServerDetail>({
      path: `/grain-intake/trips/${id}/issue-permit`,
      method: 'POST',
      data: { version },
    })
    return adaptTrip(detail.trip, detail)
  },
  async approvePermit(id: string, version: number) {
    const current = await request<ServerDetail>({ path: `/grain-intake/trips/${id}` })
    if (!current.permit) {
      finish('未找到待审批的出门证')
    }
    const detail = await request<ServerDetail>({
      path: `/grain-intake/trips/${id}/approve-permit`,
      method: 'POST',
      data: { version, permitId: current.permit.id },
    })
    return adaptTrip(detail.trip, detail)
  },
  async candidates(id: string) {
    const list = await request<ServerCandidate[]>({
      path: `/grain-intake/trips/${id}/ticket-candidates`,
    })
    return list
      .filter(item => item.linkable)
      .map(item => ({
        id: item.ticketNo,
        tripId: '',
        site: siteName(item.siteCode),
        plate: item.plate,
        material: item.materialName,
        supplier: item.partyName,
        firstAt: formatTime(item.firstConfirmedAt),
        secondAt: formatTime(item.secondConfirmedAt),
        gross: item.finalGross,
        tare: item.finalTare,
        net: `${(item.finalNetMilliTonne / 1000).toFixed(3)} 吨`,
        deducted: `${(item.finalNetMilliTonne / 1000).toFixed(3)} 吨`,
      }))
  },
  async linkTicket(id: string, version: number, ticketNo: string) {
    const list = await request<ServerCandidate[]>({
      path: `/grain-intake/trips/${id}/ticket-candidates`,
    })
    const candidate = list.find(item => item.ticketNo === ticketNo && item.linkable)
    if (!candidate) {
      finish('磅单不可关联，请刷新候选后重新核对')
    }
    const detail = await request<ServerDetail>({
      path: `/grain-intake/trips/${id}/link-ticket`,
      method: 'POST',
      data: {
        version,
        ticketSiteCode: candidate.siteCode,
        ticketNo,
      },
    })
    return adaptTrip(detail.trip, detail)
  },
  async confirmTicket(id: string, version: number) {
    const detail = await request<ServerDetail>({
      path: `/grain-intake/trips/${id}/confirm-ticket`,
      method: 'POST',
      data: { version },
    })
    return adaptTrip(detail.trip, detail)
  },
  simulationTasks() {
    return { lab: [], weigh: [] }
  },
  recordVisual() {
    finish('请在网页版录入目测结果')
  },
  simulateLab() {
    finish('模拟化验仅在离线演示模式可用')
  },
  simulateTicket() {
    finish('模拟磅单仅在离线演示模式可用')
  },
  reset() {
    finish('真实模式不能重置数据')
  },
}
