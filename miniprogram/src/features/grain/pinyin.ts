import { initialsOf } from './pinyin-table.ts'

/**
 * 常见多音字补充：默认读音取自 pinyin-table，这里追加通用读音的首字母，
 * 避免“重庆”“厦门”“长沙”等名称只能按单一读音检索。
 */
const EXTRA_INITIALS: Record<string, string> = {
  重: 'cz',
  厦: 'sx',
  参: 'cs',
  朝: 'cz',
  乐: 'ly',
  单: 'dcs',
  解: 'xj',
  番: 'pf',
  会: 'hk',
  藏: 'cz',
  曾: 'cz',
  车: 'cj',
  石: 'sd',
  区: 'qo',
  仇: 'qc',
  朴: 'pp',
  查: 'zc',
  盖: 'gy',
  尉: 'wy',
  沈: 'sc',
  长: 'cz',
}

const SEPARATOR = /[\s·・()（）\-_,，.。、]/
const SEPARATORS = /[\s·・()（）\-_,，.。、]/g

export interface SearchableName {
  name: string
  /** 汉字名称本身 + 拼音首字母组合，供本地过滤直接匹配。 */
  keys: string[]
}

/** 去掉空白和常见分隔符并转小写，汉字保留原样。 */
export function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(SEPARATORS, '')
}

function initialOptions(char: string): string {
  const extra = EXTRA_INITIALS[char]
  if (extra) {
    return extra
  }
  const initial = initialsOf(char)
  if (initial) {
    return initial
  }
  const lower = char.toLowerCase()
  return /^[a-z0-9]$/.test(lower) ? lower : ''
}

/** 多音字组合上限，避免极端名称生成过多检索键。 */
const VARIANT_LIMIT = 16

/**
 * 生成供应商等中文名称的检索键：汉字可整段包含匹配；
 * 拼音首字母支持从任意位置开始匹配，例如“sh”匹配“上海…”。
 */
export function searchableName(name: string): SearchableName {
  let variants = ['']
  for (const char of name) {
    if (SEPARATOR.test(char)) {
      continue
    }
    const options = initialOptions(char)
    if (!options) {
      continue
    }
    const next: string[] = []
    for (const prefix of variants) {
      for (const option of options) {
        next.push(prefix + option)
      }
    }
    variants = next.length > VARIANT_LIMIT ? next.slice(0, VARIANT_LIMIT) : next
  }
  const keys = [normalizeSearchText(name), ...variants]
  return { name, keys: [...new Set(keys.filter(Boolean))] }
}

/**
 * 按汉字或拼音首字母过滤名称；空查询返回全部。
 * 多音字组合超过上限时只保留前若干种，不影响按汉字匹配。
 */
export function filterSearchableNames(
  items: SearchableName[],
  query: string,
): SearchableName[] {
  const keyword = normalizeSearchText(query)
  if (!keyword) {
    return items
  }
  return items.filter(item => item.keys.some(key => key.includes(keyword)))
}
