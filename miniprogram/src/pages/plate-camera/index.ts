interface Channel {
  emit: (name: string, data?: string) => void
}

let plateCameraChannel: Channel | undefined
let plateCaptured = false

Page({
  data: {
    flash: 'off',
    cameraReady: false,
    busy: false,
    error: '',
  },
  onLoad() {
    plateCaptured = false
    plateCameraChannel = (this as unknown as {
      getOpenerEventChannel?: () => Channel
    }).getOpenerEventChannel?.()
  },
  cameraInitialized() {
    this.setData({ cameraReady: true, error: '' })
  },
  cameraError() {
    this.setData({ error: '相机启动失败，请返回手动输入车牌' })
  },
  toggleFlash() {
    this.setData({ flash: this.data.flash === 'torch' ? 'off' : 'torch' })
  },
  takePhoto() {
    if (this.data.busy || !this.data.cameraReady) {
      return
    }
    this.setData({ busy: true })
    wx.createCameraContext().takePhoto({
      quality: 'high',
      success: (result) => {
        plateCaptured = true
        plateCameraChannel?.emit('onPhoto', result.tempImagePath)
        wx.navigateBack()
      },
      fail: () => {
        this.setData({ busy: false })
        wx.showToast({ title: '拍照失败，请重试', icon: 'none' })
      },
    })
  },
  cancel() {
    plateCameraChannel?.emit('onCancel')
    wx.navigateBack()
  },
  onUnload() {
    if (!plateCaptured) {
      plateCameraChannel?.emit('onCancel')
    }
    plateCameraChannel = undefined
  },
})
