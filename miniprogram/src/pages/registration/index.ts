import type { Registration } from '@/features/grain/types'
import { env } from '@/config/env'
import { routes } from '@/config/routes'
import {
  currentDictionary,
  refreshDictionary,
  sameDictionary,
} from '@/features/grain/dictionary-service'
import { applyAsync, errorMessage, requireLogin } from '@/features/grain/page'
import { isValidPlate, normalizePlate } from '@/features/grain/plate'
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
      this.setData({
        sites,
        materials,
        materialNames,
        methods,
        suppliers,
        form,
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
    const value = field === 'plate'
      ? event.detail.value.toUpperCase()
      : event.detail.value
    this.setData({
      [`form.${field}`]: value,
      formError: '',
    })
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
      const form = {
        ...this.data.form,
        plate: normalizePlate(this.data.form.plate),
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
