export const commonMessages = Object.freeze({
  loading: '正在加载…',
  loadFailed: '数据加载失败',
  retry: '重新加载',
  save: '保存',
  cancel: '取消',
  delete: '删除',
  create: '新建',
  edit: '编辑',
  refresh: '刷新',
  search: '查询',
  reset: '重置',
  empty: '暂无数据',
  saved: '保存成功',
  created: '创建成功',
  deleted: '删除成功',
  updated: '更新成功',
  operationFailed: '操作失败',
});

export function deleteConfirmContent(name: string): string {
  return `确定删除“${name}”吗？删除后不可恢复。`;
}
