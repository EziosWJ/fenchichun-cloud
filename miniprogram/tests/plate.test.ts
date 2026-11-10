import assert from 'node:assert/strict'
import test from 'node:test'
import { isValidPlate, normalizePlate } from '../src/features/grain/plate.ts'

test('车牌格式校验', () => {
  assert.equal(normalizePlate(' 晋a12345 '), '晋A12345')
  for (const plate of ['京A12345', '晋A90002', '晋AD12345', '晋A12345D', '晋A1234挂']) {
    assert.equal(isValidPlate(plate), true, plate)
  }
  for (const plate of ['', '001', '123456', '测试', '晋A1234', '晋I12345', '晋A123456']) {
    assert.equal(isValidPlate(plate), false, plate)
  }
})
