import { describe, expect, it } from 'vitest'
import { isValidPlate, normalizePlate } from '../../src/utils/plate'

describe('plate validation', () => {
  it('normalizes whitespace and lower case', () => {
    expect(normalizePlate(' 晋a12345 ')).toBe('晋A12345')
  })

  it('accepts civilian, new-energy and common suffix plates', () => {
    for (const plate of ['京A12345', '晋A90002', '晋AD12345', '晋A12345D', '晋A1234挂', '晋A1234警']) {
      expect(isValidPlate(plate), plate).toBe(true)
    }
  })

  it('rejects incomplete or non-standard plates', () => {
    for (const plate of ['', '001', '123456', '测试', '晋A1234', '晋I12345', '晋A123456']) {
      expect(isValidPlate(plate), plate).toBe(false)
    }
  })
})
