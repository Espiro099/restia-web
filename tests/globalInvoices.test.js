import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { globalPeriods, invoicesApi } from '../src/lib/invoices.js'
import { useSession } from '../src/stores/session.js'
import InvoicesView from '../src/views/InvoicesView.vue'

const mxn = (amount) => ({ amount, currency: 'MXN' })
const gInvoice = (id, status) => ({ id, scope: 'GLOBAL', type: 'INGRESO', status, receiver: null, total: mxn('13611.00'), lines: [], version: 2 })
const batch = (id, invoiceId, extra = {}) => ({ id, issuerId: 'iss', periodicity: 'MONTHLY', periodFrom: '2026-10-01', periodTo: '2026-10-31', checkIds: ['k1', 'k2'], invoiceId, status: 'ACTIVE', supersededBy: null, version: 1, ...extra })

describe('periodos de la factura global', () => {
  it('ayer, la semana pasada sin cruzar de mes y el mes pasado', () => {
    // Domingo 22 de noviembre de 2026.
    const p = Object.fromEntries(globalPeriods(new Date(2026, 10, 22)).map((x) => [x.key, [x.from, x.to]]))
    expect(p.day).toEqual(['2026-11-21', '2026-11-21'])
    expect(p.week).toEqual(['2026-11-09', '2026-11-15'])
    expect(p.month).toEqual(['2026-10-01', '2026-10-31'])
    // Miércoles 4 de noviembre: la semana pasada empieza en octubre y se recorta al 1 de noviembre.
    const q = Object.fromEntries(globalPeriods(new Date(2026, 10, 4)).map((x) => [x.key, [x.from, x.to]]))
    expect(q.week).toEqual(['2026-11-01', '2026-11-01'])
  })

  it('armar el lote manda Idempotency-Key y sacar cuentas If-Match', async () => {
    const api = { post: vi.fn(async () => ({ data: {} })) }
    const calls = invoicesApi(api)
    await calls.createBatch('b1', '2026-10-01', '2026-10-31')
    await calls.excludeChecks('b1', batch('bt', 'g1'), ['k1'], ' Pidió factura ')
    expect(api.post.mock.calls[0][1]).toEqual({ periodFrom: '2026-10-01', periodTo: '2026-10-31' })
    expect(api.post.mock.calls[0][2].headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
    expect(api.post.mock.calls[1]).toEqual(['/branches/b1/invoice-batches/bt/exclude-checks', { checkIds: ['k1'], reason: 'Pidió factura' },
      { headers: expect.objectContaining({ 'If-Match': '"1"' }) }])
  })
})

describe('pestaña de factura global', () => {
  let calls
  let state

  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
    state = { batches: [batch('b-old', 'g-old')], invoices: new Map([['g-old', gInvoice('g-old', 'STAMPED')]]) }
    calls = {
      list: vi.fn(async () => ({ data: [], meta: { pagination: { total: 0 } } })),
      batches: vi.fn(async () => ({ data: state.batches })),
      globalInvoices: vi.fn(async () => state.invoices),
      createBatch: vi.fn(async () => {
        state.batches = [batch('b-new', 'g-new', { periodFrom: '2026-11-21', periodTo: '2026-11-21', checkIds: ['k9'] }), ...state.batches]
        state.invoices = new Map([...state.invoices, ['g-new', gInvoice('g-new', 'DRAFT')]])
        return { data: state.batches[0] }
      }),
      stamp: vi.fn(async () => ({ data: {} })),
      excludeChecks: vi.fn(async () => ({ data: {} })),
      batchChecks: vi.fn(async () => [{ id: 'k1', businessDate: '2026-10-03', paidAt: '2026-10-03T20:00:00Z', total: mxn('95.00') }, { id: 'k2', businessDate: '2026-10-04', paidAt: '2026-10-04T21:00:00Z', total: mxn('120.00') }]),
    }
  })

  async function mountIt() {
    const pinia = createPinia()
    setActivePinia(pinia)
    useSession().adopt({ user: { id: 'yo', name: 'Yo' }, memberships: [{ branch: { id: 'b1', name: 'Centro' }, role: 'MANAGER', permissions: ['invoices.read', 'invoices.stamp', 'invoices.global'] }] })
    const wrapper = mount(InvoicesView, { props: { api: calls, today: () => new Date(2026, 10, 22) }, global: { plugins: [pinia] }, attachTo: document.body })
    await flushPromises()
    await wrapper.findAll('[role="tab"]').find((t) => t.text() === 'Factura global').trigger('click')
    await flushPromises()
    return wrapper
  }
  const button = (scope, text) => scope.findAll('button').find((b) => b.text() === text)

  it('lista los lotes con el estado y total de su factura', async () => {
    const wrapper = await mountIt()
    const row = wrapper.find('tbody tr').text()
    expect(row).toContain('31 oct 2026')
    expect(row).toContain('$13,611.00 MXN')
    expect(row).toContain('Timbrada')
    expect(button(wrapper, 'Sacar cuentas')).toBeTruthy()
  })

  it('armar la global con un periodo sugerido abre el timbrado', async () => {
    const wrapper = await mountIt()
    await button(wrapper, 'Hacer factura global').trigger('click')
    await button(wrapper.find('[role="dialog"]'), 'Ayer').trigger('click')
    await wrapper.find('[role="dialog"] form').trigger('submit')
    await flushPromises()
    expect(calls.createBatch).toHaveBeenCalledWith('b1', '2026-11-21', '2026-11-21')
    expect(wrapper.find('[role="dialog"]').attributes('aria-label')).toBe('Timbrar factura global')
    await wrapper.find('[role="dialog"] form').trigger('submit')
    await flushPromises()
    expect(calls.stamp).toHaveBeenCalledWith('b1', expect.objectContaining({ id: 'g-new' }))
  })

  it('sacar cuentas pide elegirlas y un motivo', async () => {
    const wrapper = await mountIt()
    await button(wrapper, 'Sacar cuentas').trigger('click')
    await flushPromises()
    const dialog = wrapper.find('[role="dialog"]')
    expect(dialog.findAll('input[type="checkbox"]')).toHaveLength(2)
    await dialog.findAll('input[type="checkbox"]')[1].setValue(true)
    await dialog.find('textarea').setValue('El cliente pidió su factura')
    await dialog.find('form').trigger('submit')
    await flushPromises()
    expect(calls.excludeChecks).toHaveBeenCalledWith('b1', expect.objectContaining({ id: 'b-old' }), ['k2'], 'El cliente pidió su factura')
  })
})
