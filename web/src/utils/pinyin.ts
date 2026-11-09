import { pinyin } from 'pinyin-pro';

interface OptionLike {
  label?: unknown;
  value?: unknown;
}

/**
 * 下拉框搜索：支持中文名、拼音全拼与首字母。
 * 例如“小麦”可用 “xm” 或 “xiaomai” 命中。
 */
export function pinyinFilter(input: string, option?: OptionLike): boolean {
  const keyword = input.trim().toLowerCase();
  if (!keyword) return true;
  if (!option) return false;
  const label = String(option.label ?? '');
  const value = String(option.value ?? '');
  if (label.toLowerCase().includes(keyword) || value.toLowerCase().includes(keyword)) return true;
  const full = pinyin(label, { toneType: 'none', type: 'array' }).join('').toLowerCase();
  if (full.includes(keyword)) return true;
  const initials = pinyin(label, { pattern: 'first', toneType: 'none', type: 'array' }).join('').toLowerCase();
  return initials.includes(keyword);
}
