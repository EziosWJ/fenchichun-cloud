import assert from 'node:assert/strict'
import test from 'node:test'
import { filterSearchableNames, searchableName } from '../src/features/grain/pinyin.ts'

const suppliers = [
  '上海福里希尔食品有限公司',
  '山西大曲晋酿农业科技有限公司',
  '天津新谷丰食品进出口贸易有限公司',
  '重庆粮食集团',
  '厦门建发股份有限公司',
  '北京多美利贸易有限责任公司',
  '上海（福里希尔）贸易有限公司',
].map(searchableName)

function search(query: string) {
  return filterSearchableNames(suppliers, query).map(item => item.name)
}

test('供应商按汉字匹配，支持任意位置', () => {
  assert.deepEqual(search('上海'), ['上海福里希尔食品有限公司', '上海（福里希尔）贸易有限公司'])
  assert.deepEqual(search('希尔'), ['上海福里希尔食品有限公司', '上海（福里希尔）贸易有限公司'])
  assert.deepEqual(search('粮食'), ['重庆粮食集团'])
  assert.deepEqual(search('不存在的公司'), [])
})

test('供应商按拼音首字母匹配', () => {
  assert.deepEqual(search('sh'), ['上海福里希尔食品有限公司', '上海（福里希尔）贸易有限公司'])
  assert.deepEqual(search('sx'), ['山西大曲晋酿农业科技有限公司'])
  assert.deepEqual(search('tjxgf'), ['天津新谷丰食品进出口贸易有限公司'])
  assert.deepEqual(search('bjdm'), ['北京多美利贸易有限责任公司'])
  assert.deepEqual(search('SHFLX'), ['上海福里希尔食品有限公司', '上海（福里希尔）贸易有限公司'])
})

test('常见多音字支持多个首字母读音', () => {
  assert.deepEqual(search('cq'), ['重庆粮食集团'])
  assert.deepEqual(search('zq'), ['重庆粮食集团'])
  assert.deepEqual(search('xm'), ['厦门建发股份有限公司'])
  assert.deepEqual(search('sm'), ['厦门建发股份有限公司'])
})

test('空查询与分隔符', () => {
  assert.equal(search('').length, suppliers.length)
  assert.equal(search('   ').length, suppliers.length)
  assert.deepEqual(search('上海福里'), ['上海福里希尔食品有限公司', '上海（福里希尔）贸易有限公司'])
})
