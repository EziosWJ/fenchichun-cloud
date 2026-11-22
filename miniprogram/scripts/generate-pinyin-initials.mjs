// 生成 src/features/grain/pinyin-table.ts 的一次性脚本。
//
// 小程序运行时只引用生成后的表，不依赖 pinyin-pro。需要重新生成时：
//   1. 在仓库外准备依赖：mkdir /tmp/pygen && cd /tmp/pygen && npm init -y && npm i pinyin-pro
//   2. 把本文件复制到 /tmp/pygen 下执行：node generate-pinyin-initials.mjs
//   3. 将生成的 pinyin-table.ts 覆盖回 miniprogram/src/features/grain/
//
// 表内按 U+4E00 - U+9FFF 的码位顺序保存每个字的拼音首字母，
// 多音字取 pinyin-pro 的默认读音；常见例外在 features/grain/pinyin.ts 中补充。

import { writeFileSync } from 'node:fs'
import { pinyin } from 'pinyin-pro'

const BASE = 0x4E00
const END = 0x9FFF
const NONE = '0'

const initials = []
for (let code = BASE; code <= END; code++) {
  const char = String.fromCodePoint(code)
  let letters = []
  try {
    letters = String(pinyin(char, { toneType: 'none', pattern: 'first', multiple: true }))
      .toLowerCase()
      .split(/\s+/)
      .filter(item => /^[a-z]$/.test(item))
  }
  catch {
    // 个别兼容汉字在字典中无读音，按无首字母处理。
  }
  initials.push([...new Set(letters)][0] || NONE)
}

const table = initials.join('')
const chunks = []
for (let index = 0; index < table.length; index += 100) {
  chunks.push(table.slice(index, index + 100))
}

const source = `// 本文件由 scripts/generate-pinyin-initials.mjs 生成，请勿手工修改。
// 覆盖 U+4E00 - U+9FFF 共 ${table.length} 个码位，按码位顺序存放拼音首字母；'${NONE}' 表示无读音。
export const PINYIN_BASE = 0x4E00
export const PINYIN_NONE = '${NONE}'

const INITIALS = [
${chunks.map(line => `  '${line}',`).join('\n')}
].join('')

/** 返回单个汉字的拼音首字母；非汉字或表外字符返回空字符串。 */
export function initialsOf(char: string): string {
  const index = (char.codePointAt(0) ?? 0) - PINYIN_BASE
  if (index < 0 || index >= INITIALS.length) {
    return ''
  }
  const value = INITIALS[index]
  return value === PINYIN_NONE ? '' : value
}
`

writeFileSync(new URL('../src/features/grain/pinyin-table.ts', import.meta.url), source, 'utf8')
console.log(`generated ${table.length} code points`)
