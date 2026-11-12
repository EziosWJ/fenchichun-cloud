import type { DictionaryPayload } from './types'
import { request } from '@/utils/api'

const CACHE_KEY = 'grain.dictionary.v1'
const emptyDictionary: DictionaryPayload = {
  version: '',
  sites: [],
  materials: [],
  suppliers: [],
  granaries: [],
}

let cached: DictionaryPayload | undefined
let refreshing: Promise<DictionaryPayload | null> | null = null

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

export function currentDictionary(): DictionaryPayload {
  if (!cached) {
    cached = readCache() ?? emptyDictionary
  }
  return cached
}

/** 登录后拉取字典并更新本地缓存，失败时保留已有缓存。 */
export function refreshDictionary(): Promise<DictionaryPayload | null> {
  if (refreshing) {
    return refreshing
  }
  refreshing = (async () => {
    try {
      const value = await request<DictionaryPayload>({
        path: '/miniprogram/dictionaries',
        timeout: 5000,
      })
      if (!valid(value)) {
        return null
      }
      cached = value
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
