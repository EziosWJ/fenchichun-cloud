import type { DictionaryPayload } from './types'
import { request } from '@/utils/api'
import { demoDictionary } from './dictionary'
import { demo } from './service'

const CACHE_KEY = 'grain.dictionary.v1'

let cached: DictionaryPayload | undefined
let refreshing: Promise<DictionaryPayload | null> | null = null

function snapshot(): DictionaryPayload {
  return {
    version: 'snapshot',
    sites: demoDictionary.sites.map(item => ({ code: item.code, name: item.name })),
    materials: demoDictionary.materials.map(item => ({
      code: item.code,
      name: item.name,
      inspectionMethod: item.inspectionMethod,
    })),
    suppliers: demoDictionary.suppliers.map(item => ({ code: item.code, name: item.name })),
    granaries: demoDictionary.granaries.map(item => ({ id: item.id, name: item.name })),
  }
}

function valid(value: unknown): value is DictionaryPayload {
  if (!value || typeof value !== 'object') {
    return false
  }
  const dictionary = value as DictionaryPayload
  return typeof dictionary.version === 'string'
    && Array.isArray(dictionary.sites)
    && Array.isArray(dictionary.materials)
    && Array.isArray(dictionary.suppliers)
    && Array.isArray(dictionary.granaries)
}

function readCache(): DictionaryPayload | null {
  try {
    const value = wx.getStorageSync(CACHE_KEY)
    return valid(value) ? value : null
  }
  catch {
    return null
  }
}

/** 同步返回当前可用字典：接口缓存优先，其次构建时快照。 */
export function currentDictionary(): DictionaryPayload {
  if (!cached) {
    cached = readCache() ?? snapshot()
  }
  demo.setDictionary(cached)
  return cached
}

/** 匿名拉取最新字典；成功时写入缓存并更新本地演示选项，失败返回 null。 */
export function refreshDictionary(): Promise<DictionaryPayload | null> {
  if (refreshing) {
    return refreshing
  }
  refreshing = (async () => {
    try {
      const value = await request<DictionaryPayload>({
        path: '/miniprogram/dictionaries',
        anonymous: true,
        timeout: 5000,
      })
      if (!valid(value)) {
        return null
      }
      cached = value
      demo.setDictionary(value)
      try {
        wx.setStorageSync(CACHE_KEY, value)
      }
      catch {
        // 缓存不可用时仍保留本次会话内的最新字典。
      }
      return value
    }
    catch {
      return null
    }
    finally {
      refreshing = null
    }
  })()
  return refreshing
}

export function sameDictionary(a: DictionaryPayload, b: DictionaryPayload) {
  return JSON.stringify([a.sites, a.materials, a.suppliers, a.granaries])
    === JSON.stringify([b.sites, b.materials, b.suppliers, b.granaries])
}
