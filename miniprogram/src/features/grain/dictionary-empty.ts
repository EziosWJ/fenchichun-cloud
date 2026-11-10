// 生产构建用它替换离线字典快照，避免把基础资料和演示数据打进小程序包。
export const demoDictionary = {
  syncedAt: '',
  sites: [],
  materials: [],
  suppliers: [],
  granaries: [],
} as const
