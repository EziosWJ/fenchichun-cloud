import assert from 'node:assert/strict'
import test from 'node:test'
import { actualNet } from '../src/features/grain/weight.ts'

test('实际净重按毛重减皮重计算', () => {
  assert.equal(actualNet('30', '10'), '20.000')
  assert.equal(actualNet('30.5', '9.75'), '20.750')
  assert.equal(actualNet('', '10'), '')
})
