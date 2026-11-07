export function showError(error: unknown) {
  wx.showToast({
    title: error instanceof Error ? error.message : '操作失败，请重试',
    icon: 'none',
  })
}
export async function withLoading<T>(action: () => Promise<T>): Promise<T> {
  wx.showLoading({
    title: '加载中',
    mask: true,
  })
  try {
    return await action()
  }
  finally {
    wx.hideLoading()
  }
}
