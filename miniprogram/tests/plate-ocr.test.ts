import assert from 'node:assert/strict'
import test from 'node:test'
import { extractPlateCandidates } from '../src/features/plate-ocr/plate-analysis.ts'

function part(text: string, x: number) {
  return {
    text,
    box: [
      { x, y: 0 },
      { x: x + 24, y: 0 },
      { x: x + 24, y: 20 },
      { x, y: 20 },
    ],
  }
}

test('OCR 车牌提取：完整号码、相邻片段与疑似结果', () => {
  assert.deepEqual(extractPlateCandidates([{ text: '粤B12345' }]), ['粤B12345'])
  assert.deepEqual(extractPlateCandidates([part('粤B', 0), part('12345', 24)]), ['粤B12345'])
  assert.deepEqual(extractPlateCandidates([{ text: '沪B8OOA5' }]), [])
})
