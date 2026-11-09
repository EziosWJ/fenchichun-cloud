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
}

export interface Inspection {
  method: InspectionMethod
  conclusion: Conclusion
  reason: string
  at: string
  operator: string
  values: string
}

export interface Ticket {
  id: string
  tripId: string
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
}

export interface EventRecord {
  at: string
  operator: string
  text: string
}

export interface Trip extends Registration {
  id: string
  version: number
  createdAt: string
  method: InspectionMethod
  inspection: Inspection | null
  unload: { location: string, at: string } | null
  ticket: Ticket | null
  ticketAvailable: boolean
  permit: { id: string, issuedAt: string, approvedAt: string } | null
  exitedAt: string
  events: EventRecord[]
}

export interface DemoState {
  schema: 1
  sequence: number
  user: User | null
  role: Role | null
  trips: Trip[]
  tickets: Ticket[]
}

export interface DemoStorage {
  get: () => unknown
  set: (state: DemoState) => void
}
