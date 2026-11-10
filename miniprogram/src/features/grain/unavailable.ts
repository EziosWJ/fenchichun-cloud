import type { DemoService } from './mock-core'

function unavailable(): never {
  throw new Error('业务功能尚未接入')
}

// Production builds resolve the service import here and never bundle the demo implementation.
export const demo: DemoService = {
  options: unavailable,
  setDictionary: () => {},
  current: () => null,
  login: unavailable,
  logout: unavailable,
  switchRole: unavailable,
  reset: unavailable,
  listTrips: unavailable,
  getTrip: unavailable,
  simulationTasks: unavailable,
  createTrip: unavailable,
  updateTrip: unavailable,
  recordVisual: unavailable,
  confirmUnload: unavailable,
  candidates: unavailable,
  linkTicket: unavailable,
  issuePermit: unavailable,
  approvePermit: unavailable,
  confirmExit: unavailable,
  simulateLab: unavailable,
  simulateTicket: unavailable,
}
