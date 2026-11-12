export type Role = 'warehouse' | 'guard'
export type InspectionMethod = 'lab' | 'visual'
export type Conclusion = 'accept' | 'reject'

export interface User {
  account: string
  name: string
  roles: Role[]
}

export interface Registration {
  site: string
  plate: string
  material: string
  supplier: string
  driver: string
  phone: string
  contract: string
  note: string
  /** 登记重试幂等键，仅用于新建，不显示。 */
  clientRequestId?: string
}

export interface Inspection {
  method: InspectionMethod
  conclusion: Conclusion
  reason: string
  at: string
  operator: string
  values: string
  id?: number
  version?: number
}

export interface Ticket {
  id: string
  site: string
  plate: string
  material: string
  supplier: string
  firstAt: string
  secondAt: string
  gross: string
  tare: string
  net: string
  deducted: string
  linkable?: boolean
  reason?: string
}

export interface EventRecord {
  at: string
  operator: string
  text: string
}

export interface Trip extends Registration {
  id: string
  /** 服务端数字主键。 */
  serverId: string
  stage: string
  number?: string
  version: number
  createdAt: string
  updatedAt?: string
  method: InspectionMethod
  inspection: Inspection | null
  unload: { location: string, at: string } | null
  ticket: Ticket | null
  ticketConfirmedAt?: string
  ticketWarning?: string
  permit: { id: string, numericId?: number, issuedAt: string, approvedAt: string } | null
  exitedAt: string
  events: EventRecord[]
}

export interface DictionarySite {
  code: string
  name: string
}

export interface DictionaryMaterial {
  code: string
  name: string
  inspectionMethod: InspectionMethod
}

export interface DictionaryParty {
  code: string
  name: string
}

export interface DictionaryGranary {
  id: number
  name: string
}

export interface DictionaryPayload {
  version: string
  sites: DictionarySite[]
  materials: DictionaryMaterial[]
  suppliers: DictionaryParty[]
  granaries: DictionaryGranary[]
}
