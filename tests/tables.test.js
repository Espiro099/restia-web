import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError } from '../src/lib/api.js'
import { byZone, nextNumber, tablesApi, tablesErrorText } from '../src/lib/tables.js'
import { useSession } from '../src/stores/session.js'
import TablesView from '../src/views/TablesView.vue'

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async (url) => `data:image/png;base64,${btoa(url)}`) } }))

const table = (number, extra = {}) => ({
  id: `t${number}`, branchId: 'b1', number, capacity: 4, zone: 'Salón', status: 'ACTIVE', operationalState: 'LIBRE',
  currentSessionId: null, version: 2, combinationGroup: null, ...extra,
})

describe('reglas de Mesas', () => {
  it('agrupa por zona con "Sin zona" al final y propone el siguiente número', () => {
    const tables = [table(3, { zone: null }), table(1, { zone: 'Terraza' }), table(2)]
    expect(byZone(tables).map((g) => [g.zone, g.items.map((t) => t.number)])).toEqual([['Salón', [2]], ['Terraza', [1]], ['Sin zona', [3]]])
    expect(nextNumber(tables)).toBe(4)
    expect(nextNumber([])).toBe(1)
  })

  it('explica los conflictos propios de las mesas', () => {
    expect(tablesErrorText(new ApiError(409, { error: { code: 'TABLE_NUMBER_TAKEN', message: 'x' } }))).toMatch(/ese número/)
    expect(tablesErrorText(new ApiError(409, { error: { code: 'TABLE_ALREADY_ASSIGNED', message: 'x' } }))).toMatch(/gente sentada/)
  })

  it('las llamadas usan el contrato e If-Match', async () => {
    const api = { get: vi.fn(async () => ({ data: [] })), post: vi.fn(async () => ({ data: {} })), patch: vi.fn(async () => ({ data: {} })) }
    const calls = tablesApi(api)
    await calls.update('b1', table(5), { capacity: 6 })
    await calls.status('b1', table(5), 'MAINTENANCE', ' Pata rota ')
    await calls.rotateQr('b1', table(5), 7, 'Se llevaron el QR')
    expect(api.patch).toHaveBeenCalledWith('/branches/b1/tables/t5', { capacity: 6 }, { headers: { 'If-Match': '"2"' } })
    expect(api.post).toHaveBeenCalledWith('/branches/b1/tables/t5/status', { status: 'MAINTENANCE', reason: 'Pata rota' }, { headers: { 'If-Match': '"2"' } })
    expect(api.post).toHaveBeenCalledWith('/branches/b1/tables/t5/qr/rotate', { reason: 'Se llevaron el QR' }, { headers: { 'If-Match': '"7"' } })
  })
})

describe('pantalla de Mesas', () => {
  let rows

  function fakeCalls() {
    return {
      list: vi.fn(async () => rows),
      create: vi.fn(async () => ({ data: {} })),
      update: vi.fn(async () => ({ data: {} })),
      status: vi.fn(async () => ({ data: {} })),
      qr: vi.fn(async () => ({ data: { tableId: 't1', token: 'tok', url: 'http://127.0.0.1:5173/m#tok', previousTokenExpiresAt: null, version: 2 } })),
      rotateQr: vi.fn(async () => ({ data: { tableId: 't1', token: 'nuevo', url: 'http://127.0.0.1:5173/m#nuevo', previousTokenExpiresAt: '2026-11-29T00:00:00Z', version: 3 } })),
    }
  }

  async function mountAs(permissions) {
    const pinia = createPinia()
    setActivePinia(pinia)
    useSession().adopt({ user: { id: 'yo', name: 'Yo' }, memberships: [{ branch: { id: 'b1', name: 'Centro' }, role: 'MANAGER', permissions }] })
    const calls = fakeCalls()
    const wrapper = mount(TablesView, { props: { api: calls }, global: { plugins: [pinia] }, attachTo: document.body })
    await flushPromises()
    return { wrapper, calls }
  }

  const ALL = ['tables.read', 'tables.manage', 'tables.qr_read', 'tables.qr_rotate']
  const button = (scope, text) => scope.findAll('button').find((b) => b.text() === text)

  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
    rows = [table(1, { operationalState: 'CONSUMIENDO' }), table(2, { zone: 'Terraza', capacity: 2 }), table(3, { status: 'MAINTENANCE', operationalState: null })]
  })

  it('muestra mesas por zona, su estado y los lugares activos', async () => {
    const { wrapper } = await mountAs(ALL)
    expect(wrapper.findAll('.box h2').map((h) => h.text())).toEqual(['Salón', 'Terraza'])
    expect(wrapper.text()).toContain('3 mesas · 6 lugares activos')
    expect(wrapper.text()).toContain('Consumiendo')
    expect(wrapper.text()).toContain('Mantenimiento')
  })

  it('solo con lectura no ofrece cambios ni QR', async () => {
    const { wrapper } = await mountAs(['tables.read'])
    expect(button(wrapper, 'Nueva mesa')).toBeUndefined()
    expect(button(wrapper, 'QR')).toBeUndefined()
    expect(button(wrapper, 'Editar')).toBeUndefined()
  })

  it('la mesa nueva propone el siguiente número y manda zona vacía como null', async () => {
    const { wrapper, calls } = await mountAs(ALL)
    await button(wrapper, 'Nueva mesa').trigger('click')
    const inputs = wrapper.findAll('[role="dialog"] input')
    expect(inputs[0].element.value).toBe('4')
    await wrapper.find('[role="dialog"] form').trigger('submit')
    await flushPromises()
    expect(calls.create).toHaveBeenCalledWith('b1', { number: 4, capacity: 4, zone: null, combinationGroup: null })
  })

  it('editar manda solo lo que cambió', async () => {
    const { wrapper, calls } = await mountAs(ALL)
    await button(wrapper.findAll('tbody tr')[0], 'Editar').trigger('click')
    await wrapper.findAll('[role="dialog"] input')[1].setValue(6)
    await wrapper.find('[role="dialog"] form').trigger('submit')
    await flushPromises()
    expect(calls.update).toHaveBeenCalledWith('b1', rows[0], { capacity: 6 })
  })

  it('cambiar el estado de una mesa ocupada muestra el motivo de la API', async () => {
    const { wrapper, calls } = await mountAs(ALL)
    calls.status.mockRejectedValueOnce(new ApiError(409, { error: { code: 'TABLE_ALREADY_ASSIGNED', message: 'x' } }))
    await button(wrapper.findAll('tbody tr')[0], 'Cambiar estado').trigger('click')
    expect(wrapper.find('[role="dialog"] select').element.value).toBe('MAINTENANCE')
    await wrapper.find('textarea').setValue('Pata rota')
    await wrapper.find('[role="dialog"] form').trigger('submit')
    await flushPromises()
    expect(calls.status).toHaveBeenCalledWith('b1', rows[0], 'MAINTENANCE', 'Pata rota')
    expect(wrapper.find('[role="dialog"]').text()).toContain('gente sentada')
  })

  it('el QR se dibuja con la URL de la API y se puede rotar con motivo', async () => {
    const { wrapper, calls } = await mountAs(ALL)
    await button(wrapper.findAll('tbody tr')[0], 'QR').trigger('click')
    await flushPromises()
    const img = wrapper.find('.qr-print img')
    expect(atob(img.attributes('src').split(',')[1])).toBe('http://127.0.0.1:5173/m#tok')
    expect(wrapper.find('a[download]').attributes('download')).toBe('mesa-1-qr.png')

    await button(wrapper.find('[role="dialog"]'), 'Generar uno nuevo').trigger('click')
    await wrapper.find('textarea').setValue('Se llevaron el código')
    await wrapper.find('[role="dialog"] form').trigger('submit')
    await flushPromises()

    expect(calls.rotateQr).toHaveBeenCalledWith('b1', rows[0], 2, 'Se llevaron el código')
    expect(atob(wrapper.find('.qr-print img').attributes('src').split(',')[1])).toBe('http://127.0.0.1:5173/m#nuevo')
    expect(wrapper.text()).toContain('El QR anterior sigue funcionando')
  })
})
