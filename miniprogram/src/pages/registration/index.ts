import type { Registration } from '@/features/grain/types'
import { env } from '@/config/env'
import { routes } from '@/config/routes'
import {
  currentDictionary,
  refreshDictionary,
  sameDictionary,
} from '@/features/grain/dictionary-service'
import { applyAsync, errorMessage, requireLogin } from '@/features/grain/page'
import { isValidPlate, normalizePlate, plateProvinces, correctPlateOcrConfusions } from '@/features/grain/plate'
import { recognizePlatePhoto } from '@/features/grain/plate-scan'
import { canEdit } from '@/features/grain/presentation'
import { demo } from '@/features/grain/service'

function emptyForm(): Registration {
  return {
    site: '',
    plate: '',
    material: '',
    supplier: '',
    driver: '',
    phone: '',
    contract: '',
    note: '',
  }
}

Page({
  data: {
    loading: true,
    error: '',
    formError: '',
    submitting: false,
    edit: false,
    id: '',
    version: 0,
    form: emptyForm(),
    sites: [] as string[],
    materials: [] as string[],
    materialNames: [] as string[],
    methods: [] as string[],
    suppliers: [] as string[],
    siteIndex: 0,
    materialIndex: 0,
    supplierIndex: 0,
    extraOpen: false,
    provinces: plateProvinces,
    province: '',
    provinceIndex: 0,
    plateBody: '',
    scanning: false,
  },
  onLoad(query: Record<string, string | undefined>) {
    this.setData({ id: query.id || '', edit: !!query.id })
    this.load()
  },
  load(refresh: unknown = true) {
    this.setData({ loading: true, error: '' })
    try {
      if (!requireLogin('warehouse')) {
        return
      }
      if (this.data.edit && !env.mock) {
        throw new Error('请在网页版更正登记')
      }
      const dictionary = currentDictionary()
      demo.setDictionary(dictionary)
      const options = demo.options()
      const sites = ['请选择厂区', ...options.sites]
      const materialNames = ['', ...options.materials.map(item => item.name)]
      const materials = [
        '请选择货品',
        ...options.materials.map(
          item =>
            `${item.name}（${item.method === 'lab' ? '化验' : '目测'}）`,
        ),
      ]
      const methods = [
        '',
        ...options.materials.map(item =>
          item.method === 'lab' ? '化验' : '目测',
        ),
      ]
      const suppliers = ['待核实', ...options.suppliers]
      const trip = this.data.edit ? demo.getTrip(this.data.id) : null
      if (trip && !canEdit(trip)) {
        throw new Error('已有检验或后续记录，不能更正登记')
      }
      const form = trip
        ? {
            site: trip.site,
            plate: trip.plate,
            material: trip.material,
            supplier: trip.supplier,
            driver: trip.driver,
            phone: trip.phone,
            contract: trip.contract,
            note: trip.note,
          }
        : emptyForm()
      if (trip) {
        wx.setNavigationBarTitle({ title: '更正登记' })
      }
      const plate = form.plate || ''
      const hasProvince = plateProvinces.includes(plate.slice(0, 1))
      const province = hasProvince ? plate.slice(0, 1) : ''
      const plateBody = hasProvince ? plate.slice(1) : plate
      this.setData({
        sites,
        materials,
        materialNames,
        methods,
        suppliers,
        form,
        province,
        provinceIndex: Math.max(0, plateProvinces.indexOf(province)),
        plateBody,
        version: trip?.version || 0,
        siteIndex: Math.max(0, sites.indexOf(form.site)),
        materialIndex: Math.max(0, materialNames.indexOf(form.material)),
        supplierIndex: Math.max(0, suppliers.indexOf(form.supplier)),
        extraOpen: !!(form.driver || form.phone || form.contract || form.note),
      })
    }
    catch (error) {
      this.setData({ error: errorMessage(error) })
    }
    finally {
      this.setData({ loading: false })
    }
    if (refresh !== false) {
      this.refresh()
    }
  },
  refresh() {
    const before = currentDictionary()
    void refreshDictionary().then((after) => {
      if (after && !sameDictionary(before, after)) {
        demo.setDictionary(after)
        this.load(false)
      }
    })
  },
  input(event: WechatMiniprogram.Input) {
    const field = event.currentTarget.dataset.field
    this.setData({
      [`form.${field}`]: event.detail.value,
      formError: '',
    })
  },
  chooseProvince(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value)
    const province = plateProvinces[index] || ''
    this.setData({
      province,
      provinceIndex: index,
      'form.plate': `${province}${this.data.plateBody}`,
      formError: '',
    })
  },
  inputPlateBody(event: WechatMiniprogram.Input) {
    let value = event.detail.value.toUpperCase()
    let province = this.data.province
    if (plateProvinces.includes(value[0])) {
      province = value[0]
      value = value.slice(1)
    }
    value = value.replace(/[^A-Z0-9]/g, '').slice(0, 7)
    this.setData({
      province,
      provinceIndex: Math.max(0, plateProvinces.indexOf(province)),
      plateBody: value,
      'form.plate': `${province}${value}`,
      formError: '',
    })
  },
  applyScannedPlate(value: string) {
    const normalized = normalizePlate(value)
    const hasProvince = plateProvinces.includes(normalized[0])
    const province = hasProvince ? normalized[0] : this.data.province
    const body = hasProvince ? normalized.slice(1) : normalized
    this.setData({
      province,
      provinceIndex: Math.max(0, plateProvinces.indexOf(province)),
      plateBody: body,
      'form.plate': `${province}${body}`,
      formError: '',
    })
  },
  scanPlate() {
    if (this.data.scanning) {
      return
    }
    this.setData({ scanning: true, formError: '' })
    wx.authorize({
      scope: 'scope.camera',
      success: () => this.capturePlate(),
      fail: () => {
        this.setData({ scanning: false })
        wx.showModal({
          title: '相机权限',
          content: '未获得相机权限，请前往设置开启，或手动输入车牌。',
          confirmText: '去设置',
          success: ({ confirm }) => {
            if (confirm) {
              wx.openSetting({})
            }
          },
        })
      },
    })
  },
  capturePlate() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'],
      camera: 'back',
      success: (result) => {
        const path = result.tempFiles[0]?.tempFilePath
        if (!path) {
          this.setData({ scanning: false })
          return
        }
        this.recognizePlate(path)
      },
      fail: (error) => {
        this.setData({ scanning: false })
        if (!/cancel/i.test(error.errMsg || '')) {
          wx.showToast({ title: '未拍摄照片', icon: 'none' })
        }
      },
    })
  },
  async recognizePlate(imagePath: string) {
    try {
      const result = await recognizePlatePhoto(imagePath)
      const raw = result.candidates[0] || result.suggestions[0]
      if (!raw) {
        wx.showModal({
          title: '未识别到完整车牌',
          content: '请对准车牌重拍，或手动输入。',
          showCancel: false,
        })
        return
      }
      const plate = correctPlateOcrConfusions(raw)
      this.applyScannedPlate(plate)
      wx.showToast({
        title: plate !== raw
          ? '已按车牌规则校正，请核对'
          : result.candidates.length ? '已识别，请核对' : '疑似号码，请核对',
        icon: 'none',
      })
    }
    catch (error) {
      wx.showModal({
        title: '识别失败',
        content: errorMessage(error),
        showCancel: false,
      })
    }
    finally {
      this.setData({ scanning: false })
    }
  },
  chooseSite(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value)
    this.setData({
      'siteIndex': index,
      'form.site': index ? this.data.sites[index] : '',
      'formError': '',
    })
  },
  chooseMaterial(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value)
    this.setData({
      'materialIndex': index,
      'form.material': this.data.materialNames[index],
      'formError': '',
    })
  },
  chooseSupplier(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value)
    this.setData({
      'supplierIndex': index,
      'form.supplier': index ? this.data.suppliers[index] : '',
      'formError': '',
    })
  },
  toggleExtra() {
    this.setData({ extraOpen: !this.data.extraOpen })
  },
  save() {
    if (this.data.submitting) {
      return
    }
    this.setData({ submitting: true, formError: '' })
    try {
      const plate = normalizePlate(
        this.data.province
          ? `${this.data.province}${this.data.plateBody}`
          : this.data.form.plate,
      )
      const form = {
        ...this.data.form,
        plate,
      }
      if (!isValidPlate(form.plate)) {
        throw new Error('请输入正确的车牌号，例如 晋A12345')
      }
      if (!env.mock && !form.supplier) {
        throw new Error('请选择供应商')
      }
      const result = this.data.edit
        ? demo.updateTrip(this.data.id, this.data.version, form)
        : demo.createTrip(form)
      applyAsync(
        result,
        (trip) => {
          this.setData({ submitting: false })
          if (this.data.edit) {
            wx.navigateBack()
          }
          else {
            wx.redirectTo({
              url: `${routes.trip}?id=${encodeURIComponent(trip.serverId || trip.id)}`,
            })
          }
        },
        (error) => {
          this.setData({ formError: errorMessage(error), submitting: false })
        },
      )
    }
    catch (error) {
      this.setData({ formError: errorMessage(error), submitting: false })
    }
  },
})
