import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError } from '../src/lib/api.js'
import { cashApi, cashErrorText, differenceText, unresolvedCount } from '../src/lib/cash.js'
import { useSession } from '../src/stores/session.js'
import CashView from '../src/views/CashView.vue'

const mxn = (amount) => ({ amount, currency: 'MXN' })
const register = (id, extra = {}) => ({ id, code: id.toUpperCase(), name: `Caja ${id}`, status: 'ACTIVE', differenceTolerance: mxn('20.00'), version: 1, ...extra })
const shift = (id, status, extra = {}) => ({
  id, cashRegisterId: 'r1', status, businessDate: '2026-11-21', openedBy: 'u1', openedAt: '2026-11-21T15:00:00Z', closedBy: status === 'CLOSED' ? 'u2' : null,
  closedAt: status === 'CLOSED' ? '2026-11-22T03:00:00Z' : null, openingAmount: mxn('500.00'), countedCash: status === 'CLOSED' ? mxn('1450.00') : null,
  difference: status === 'CLOSED' ? mxn('-50.00') : null, differenceReason: status === 'CLOSED' ? 'Faltó un cambio' : null, reviewRequired: status === 'CLOSED', version: 2, ...extra,
})

describe('reglas de Caja', () => {
  it('describe la diferencia del corte', () => {
    expect(differenceText(mxn('-50.00'))).toBe('Faltaron $50.00 MXN')
    expect(differenceText(mxn('12.5'))).toBe('Sobraron $12.50 MXN')
    expect(differenceText(mxn('0.00'))).toBe('Cuadró')
    expect(differenceText(null)).toBe('')
  })

  it('cuenta lo que queda sin confirmar en el turno', () => {
    expect(unresolvedCount({ unresolved: { pendingPayments: 1, unknownPayments: 2, pendingRefunds: 0, unknownRefunds: 1 } })).toBe(4)
    expect(unresolvedCount(null)).toBe(0)
  })

  it('explica por qué no se desactiva una caja con turno abierto', () => {
    expect(cashErrorText(new ApiError(409, { error: { code: 'CASH_REGISTER_HAS_ACTIVE_SHIFT', message: 'x' } }))).toMatch(/turno abierto/)
  })

  it('filtra turnos con los parámetros del contrato y sin nombres si no hay permiso de personal', async () => {
    const api = {
      get: vi.fn(async (url) => {
        if (url.includes('/members')) throw new ApiError(403, null)
        return { data: [] }
      }),
    }
    const calls = cashApi(api)
    await calls.shifts('b1', { cashRegisterId: 'r1', status: 'CLOSED', businessDate: '2026-11-21', reviewRequired: true, page: 2 })
    expect(api.get).toHaveBeenCalledWith('/branches/b1/cash-shifts?page=2&perPage=25&cashRegisterId=r1&status=CLOSED&businessDate=2026-11-21&reviewRequired=true')
    expect((await calls.people('b1')).size).toBe(0)
  })
})

describe('pantalla de Caja', () => {
  let calls

  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
    calls = {
      registers: vi.fn(async () => [register('r1')]),
      people: vi.fn(async () => new Map([['u1', 'Ana Cajera'], ['u2', 'Luis Gerente']])),
      shifts: vi.fn(async () => ({ data: [shift('s1', 'CLOSED'), shift('s2', 'OPEN')], meta: { pagination: { total: 2 } } })),
      summary: vi.fn(async () => ({
        openingAmount: mxn('500.00'), deposits: mxn('100.00'), withdrawals: mxn('50.00'), expectedCash: mxn('1500.00'),
        countedCash: mxn('1450.00'), difference: mxn('-50.00'),
        byMethod: [{ method: 'CASH', sales: mxn('950.00'), tips: mxn('40.00'), refunds: mxn('0.00') }],
        unresolved: { pendingPayments: 0, unknownPayments: 1, pendingRefunds: 0, unknownRefunds: 0 },
      })),
      movements: vi.fn(async () => [{ id: 'm1', type: 'WITHDRAWAL', amount: mxn('50.00'), reason: 'Compra de hielo', createdBy: 'u1', createdAt: '2026-11-21T18:00:00Z' }]),
      createRegister: vi.fn(async () => ({ data: {} })),
      updateRegister: vi.fn(async () => ({ data: {} })),
      registerStatus: vi.fn(async () => ({ data: {} })),
    }
  })

  async function mountAs(permissions) {
    const pinia = createPinia()
    setActivePinia(pinia)
    useSession().adopt({ user: { id: 'yo', name: 'Yo' }, memberships: [{ branch: { id: 'b1', name: 'Centro' }, role: 'MANAGER', permissions }] })
    const wrapper = mount(CashView, { props: { api: calls }, global: { plugins: [pinia] }, attachTo: document.body })
    await flushPromises()
    return wrapper
  }

  it('muestra los turnos con quién abrió, el corte y si pide revisión', async () => {
    const wrapper = await mountAs(['cash.read'])
    const first = wrapper.findAll('tbody tr')[0].text()
    expect(first).toContain('Caja r1')
    expect(first).toContain('Ana Cajera')
    expect(first).toContain('Luis Gerente')
    expect(first).toContain('Faltaron $50.00 MXN')
    expect(first).toContain('Revisar')
    expect(wrapper.findAll('tbody tr')[1].text()).toContain('Fondo $500.00 MXN')
  })

  it('el filtro de revisión vuelve a pedir la primera página', async () => {
    const wrapper = await mountAs(['cash.read'])
    await wrapper.find('input[type="checkbox"]').setValue(true)
    await flushPromises()
    expect(calls.shifts).toHaveBeenLastCalledWith('b1', expect.objectContaining({ reviewRequired: true, page: 1 }))
  })

  it('el detalle trae el resumen, lo sin confirmar y las salidas', async () => {
    const wrapper = await mountAs(['cash.read'])
    await wrapper.findAll('button').find((b) => b.text() === 'Detalle').trigger('click')
    await flushPromises()
    const dialog = wrapper.find('[role="dialog"]').text()
    expect(dialog).toContain('1 cobros o reembolsos sin confirmar')
    expect(dialog).toContain('$1,500.00 MXN')
    expect(dialog).toContain('Compra de hielo')
    expect(dialog).toContain('−$50.00 MXN')
  })

  it('sin cash.read no hay montos ni detalle', async () => {
    const wrapper = await mountAs(['cash.read_open'])
    expect(wrapper.text()).not.toContain('Faltaron')
    expect(wrapper.findAll('button').find((b) => b.text() === 'Detalle')).toBeUndefined()
  })

  it('la nueva caja manda su tolerancia como monto', async () => {
    const wrapper = await mountAs(['cash.read', 'cash.manage_registers'])
    await wrapper.findAll('[role="tab"]')[1].trigger('click')
    await wrapper.findAll('button').find((b) => b.text() === 'Nueva caja').trigger('click')
    const inputs = wrapper.findAll('[role="dialog"] input')
    await inputs[0].setValue('barra')
    await inputs[1].setValue('Caja de barra')
    await inputs[2].setValue('15')
    await wrapper.find('[role="dialog"] form').trigger('submit')
    await flushPromises()
    expect(calls.createRegister).toHaveBeenCalledWith('b1', { code: 'BARRA', name: 'Caja de barra', differenceTolerance: mxn('15.00') })
  })
})
