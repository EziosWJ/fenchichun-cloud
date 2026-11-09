import type { DemoState, Registration } from '../src/features/grain/types.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createDemoService } from '../src/features/grain/mock-core.ts'
import {
  exitEligible,
  exitType,
  tripStatus,
} from '../src/features/grain/presentation.ts'

function fixture() {
  let state: DemoState | undefined
  const storage = {
    get: () => state,
    set: (value: DemoState) => {
      state = structuredClone(value)
    },
  }
  const make = () => createDemoService(storage, () => '2026-11-09 12:00')
  const warehouse = make()
  warehouse.login('both', 'demo123')
  return { warehouse, otherPage: make(), make }
}

function registration(
  material = '木片',
  supplier = '示例供应商甲',
): Registration {
  return {
    site: '示例一厂区',
    plate: '晋A12345',
    material,
    supplier,
    driver: '',
    phone: '',
    contract: '',
    note: '',
  }
}

test('登记至正常实际出厂，两个页面读取同一份状态', () => {
  const { warehouse, otherPage } = fixture()
  let trip = warehouse.createTrip(registration())
  assert.equal(tripStatus(trip).label, '待目测')
  trip = warehouse.recordVisual(trip.id, trip.version, 'accept', '')
  assert.equal(tripStatus(otherPage.getTrip(trip.id)).label, '待卸粮')
  trip = warehouse.confirmUnload(trip.id, trip.version, '3 号卸料点')
  assert.equal(tripStatus(trip).label, '等待磅单同步')
  assert.deepEqual(warehouse.candidates(trip.id), [])
  trip = otherPage.simulateTicket(trip.id, trip.version)
  assert.equal(tripStatus(warehouse.getTrip(trip.id)).label, '待关联磅单')
  const candidate = warehouse.candidates(trip.id)[0]
  assert.equal(candidate.plate, trip.plate)
  trip = warehouse.linkTicket(trip.id, trip.version, candidate.id)
  trip = warehouse.issuePermit(trip.id, trip.version)
  assert.equal(exitEligible(trip), false)
  trip = warehouse.approvePermit(trip.id, trip.version)
  assert.equal(tripStatus(trip).label, '等待出厂')
  assert.equal(exitEligible(otherPage.getTrip(trip.id)), true)
  otherPage.switchRole('guard')
  trip = otherPage.confirmExit(trip.id, trip.version)
  assert.equal(tripStatus(warehouse.getTrip(trip.id)).label, '已出厂')
  assert.equal(exitEligible(trip), false)
  assert.equal(
    otherPage.listTrips().filter(item => item.plate === trip.plate).length
    >= 2,
    true,
  )
  assert.throws(() => otherPage.confirmExit(trip.id, trip.version), /已出厂/)
})

test('化验拒收和目测拒收可直接退厂，拒收原因不可缺失', () => {
  const { warehouse, otherPage } = fixture()
  let lab = warehouse.createTrip(registration('高粱'))
  assert.equal(tripStatus(lab).label, '等待化验')
  assert.throws(
    () => otherPage.simulateLab(lab.id, lab.version, 'reject', ''),
    /原因/,
  )
  lab = otherPage.simulateLab(lab.id, lab.version, 'reject', '水分超标')
  let visual = warehouse.createTrip(registration())
  assert.throws(
    () => warehouse.recordVisual(visual.id, visual.version, 'reject', ''),
    /原因/,
  )
  visual = warehouse.recordVisual(visual.id, visual.version, 'reject', '含杂物')
  assert.equal(exitType(lab), '拒收退厂')
  assert.equal(exitType(visual), '拒收退厂')
  assert.equal(lab.ticket, null)
  assert.equal(visual.permit, null)
  otherPage.switchRole('guard')
  assert.ok(otherPage.confirmExit(lab.id, lab.version).exitedAt)
  assert.ok(otherPage.confirmExit(visual.id, visual.version).exitedAt)
  assert.equal(
    otherPage
      .listTrips()
      .filter(exitEligible)
      .some(item => item.id === lab.id || item.id === visual.id),
    false,
  )
})

test('供应商、前置条件、版本和岗位限制在状态层生效', () => {
  const { warehouse, otherPage } = fixture()
  let trip = warehouse.createTrip(registration('木片', ''))
  assert.throws(
    () => warehouse.recordVisual(trip.id, trip.version, 'accept', ''),
    /供应商/,
  )
  trip = warehouse.updateTrip(trip.id, trip.version, registration())
  const oldVersion = trip.version
  trip = warehouse.recordVisual(trip.id, trip.version, 'accept', '')
  assert.throws(
    () => warehouse.updateTrip(trip.id, trip.version, registration()),
    /不能更正/,
  )
  assert.throws(
    () => warehouse.confirmUnload(trip.id, oldVersion, '一号'),
    /已变化/,
  )
  assert.throws(() => warehouse.issuePermit(trip.id, trip.version), /卸粮/)
  otherPage.switchRole('guard')
  assert.throws(() => otherPage.confirmExit(trip.id, trip.version), /依据/)
  assert.throws(() => otherPage.createTrip(registration()), /库管/)
})

test('重置恢复初始场景并保留当前登录岗位', () => {
  const { warehouse, otherPage } = fixture()
  const trip = warehouse.createTrip(registration())
  otherPage.switchRole('guard')
  otherPage.reset()
  assert.equal(warehouse.current()?.role, 'guard')
  assert.equal(
    warehouse.listTrips().some(item => item.id === trip.id),
    false,
  )
  assert.ok(
    warehouse
      .listTrips()
      .some(
        item =>
          item.inspection?.method === 'lab'
          && item.inspection.conclusion === 'reject',
      ),
  )
})

test('进行中列表不限制车辆数量', () => {
  const { warehouse } = fixture()
  const before = warehouse.listTrips().filter(trip => !trip.exitedAt).length
  for (let index = 0; index < 20; index++) {
    warehouse.createTrip({ ...registration(), plate: `晋A${10000 + index}` })
  }
  assert.equal(warehouse.listTrips().filter(trip => !trip.exitedAt).length, before + 20)
})
