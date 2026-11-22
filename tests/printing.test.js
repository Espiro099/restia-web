import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { agentOnline, connectionText, jobActions, printingApi } from '../src/lib/printing.js'
import { useSession } from '../src/stores/session.js'
import PrintingView from '../src/views/PrintingView.vue'

const NOW = new Date('2026-11-22T12:00:00Z').getTime()
const agent = (id, extra = {}) => ({ id, name: `Agente ${id}`, status: 'ACTIVE', lastSeenAt: new Date(NOW - 30_000).toISOString(), agentVersion: '1.0.0', version: 1, ...extra })
const printer = (id, extra = {}) => ({ id, code: id.toUpperCase(), name: `Impresora ${id}`, agentId: 'a1', connection: { type: 'NETWORK', host: '192.168.1.50', port: 9100 }, paperWidth: 80, status: 'ACTIVE', version: 2, ...extra })
const route = (id, extra = {}) => ({ id, code: id.toUpperCase(), name: `Ruta ${id}`, stationId: 's1', jobTypes: ['KITCHEN_TICKET'], printerId: 'p1', status: 'ACTIVE', version: 1, ...extra })
const job = (id, status, extra = {}) => ({ id, type: 'KITCHEN_TICKET', status, printerId: 'p1', attempts: 1, createdAt: '2026-11-22T11:00:00Z', lastError: null, originalJobId: null, version: 3, ...extra })

describe('reglas de Impresión', () => {
  it('las acciones dependen del estado del trabajo y del permiso', () => {
    const all = { resolve: true, reprint: true }
    expect(jobActions(job('j', 'FAILED'), all)).toEqual({ retry: true, resolve: false, cancel: true, reprint: false })
    expect(jobActions(job('j', 'UNKNOWN'), all)).toEqual({ retry: false, resolve: true, cancel: true, reprint: true })
    expect(jobActions(job('j', 'PRINTED'), all)).toEqual({ retry: false, resolve: false, cancel: false, reprint: true })
    expect(jobActions(job('j', 'PRINTED', { type: 'TEST' }), all).reprint).toBe(false)
    expect(jobActions(job('j', 'FAILED'), { resolve: false, reprint: true }).retry).toBe(false)
  })

  it('describe la conexión y si el agente está en línea', () => {
    expect(connectionText({ type: 'NETWORK', host: '10.0.0.5', port: 9100 })).toBe('Red · 10.0.0.5:9100')
    expect(connectionText({ type: 'USB', localName: 'EPSON TM-T20' })).toBe('USB · EPSON TM-T20')
    expect(agentOnline(agent('a'), NOW)).toBe(true)
    expect(agentOnline(agent('a', { lastSeenAt: new Date(NOW - 600_000).toISOString() }), NOW)).toBe(false)
    expect(agentOnline(agent('a', { lastSeenAt: null }), NOW)).toBe(false)
  })

  it('reimprimir y la prueba mandan Idempotency-Key; los cambios, If-Match', async () => {
    const api = { get: vi.fn(), post: vi.fn(async () => ({ data: {} })), patch: vi.fn() }
    const calls = printingApi(api)
    await calls.reprint('b1', job('j1', 'PRINTED'), ' Se rompió el papel ')
    await calls.testPrint('b1', printer('p1'))
    await calls.resolve('b1', job('j2', 'UNKNOWN'), 'NOT_PRINTED', 'No salió nada')

    const [reprintUrl, reprintBody, reprintOpts] = api.post.mock.calls[0]
    expect(reprintUrl).toBe('/branches/b1/print-jobs/j1/reprint')
    expect(reprintBody).toEqual({ reason: 'Se rompió el papel' })
    expect(reprintOpts.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
    expect(api.post.mock.calls[1][1]).toEqual({ type: 'TEST', sourceId: 'p1' })
    expect(api.post.mock.calls[2]).toEqual(['/branches/b1/print-jobs/j2/resolve', { outcome: 'NOT_PRINTED', reason: 'No salió nada' }, { headers: { 'If-Match': '"3"' } }])
  })
})

describe('pantalla de Impresión', () => {
  let data

  function fakeCalls() {
    return {
      printers: vi.fn(async () => data.printers),
      routes: vi.fn(async () => data.routes),
      agents: vi.fn(async () => data.agents),
      stations: vi.fn(async () => [{ id: 's1', name: 'Cocina', status: 'ACTIVE' }]),
      jobs: vi.fn(async () => ({ data: data.jobs, meta: { pagination: { total: data.jobs.length } } })),
      createPrinter: vi.fn(async () => ({ data: {} })),
      updatePrinter: vi.fn(async () => ({ data: {} })),
      printerStatus: vi.fn(async () => ({ data: {} })),
      testPrint: vi.fn(async () => ({ data: {} })),
      createRoute: vi.fn(async () => ({ data: {} })),
      updateRoute: vi.fn(async () => ({ data: {} })),
      routeStatus: vi.fn(async () => ({ data: {} })),
      createIdentity: vi.fn(async () => ({ data: { identity: { id: 'si1', tokenExpiresAt: '2027-11-22T00:00:00Z' }, token: 'rsv_secreto' } })),
      createAgent: vi.fn(async () => ({ data: {} })),
      agentStatus: vi.fn(async () => ({ data: {} })),
      retry: vi.fn(async () => ({ data: {} })),
      resolve: vi.fn(async () => ({ data: {} })),
      cancel: vi.fn(async () => ({ data: {} })),
      reprint: vi.fn(async () => ({ data: {} })),
    }
  }

  const MANAGER = ['printing.read', 'printing.manage', 'printing.resolve', 'printing.reprint']

  async function mountAs(permissions) {
    const pinia = createPinia()
    setActivePinia(pinia)
    useSession().adopt({ user: { id: 'yo', name: 'Yo' }, memberships: [{ branch: { id: 'b1', name: 'Centro' }, role: 'MANAGER', permissions }] })
    const calls = fakeCalls()
    const wrapper = mount(PrintingView, { props: { api: calls }, global: { plugins: [pinia] }, attachTo: document.body })
    await flushPromises()
    return { wrapper, calls }
  }
  const tab = async (wrapper, label) => {
    await wrapper.findAll('[role="tab"]').find((t) => t.text() === label).trigger('click')
    await flushPromises()
  }
  const button = (scope, text) => scope.findAll('button').find((b) => b.text() === text)

  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
    data = {
      agents: [agent('a1')],
      printers: [printer('p1')],
      routes: [route('r1')],
      jobs: [job('j1', 'FAILED', { lastError: { code: 'OFFLINE', message: 'La impresora no respondió.' } }), job('j2', 'UNKNOWN')],
    }
  })

  it('sin printing.manage no hay pestaña de agentes ni se piden', async () => {
    const { wrapper, calls } = await mountAs(['printing.read'])
    expect(wrapper.findAll('[role="tab"]').map((t) => t.text())).toEqual(['Trabajos', 'Impresoras', 'Rutas'])
    expect(calls.agents).not.toHaveBeenCalled()
    expect(button(wrapper, 'Reintentar')).toBeUndefined()
  })

  it('un trabajo fallido muestra su error y se reintenta; uno sin confirmar se resuelve con motivo', async () => {
    const { wrapper, calls } = await mountAs(MANAGER)
    expect(wrapper.text()).toContain('La impresora no respondió.')
    await button(wrapper, 'Reintentar').trigger('click')
    await flushPromises()
    expect(calls.retry).toHaveBeenCalledWith('b1', data.jobs[0])

    await button(wrapper, '¿Salió?').trigger('click')
    await wrapper.find('input[value="NOT_PRINTED"]').setValue(true)
    await wrapper.find('textarea').setValue('No salió nada')
    await wrapper.find('[role="dialog"] form').trigger('submit')
    await flushPromises()
    expect(calls.resolve).toHaveBeenCalledWith('b1', data.jobs[1], 'NOT_PRINTED', 'No salió nada')
  })

  it('una impresora USB manda solo su nombre local', async () => {
    const { wrapper, calls } = await mountAs(MANAGER)
    await tab(wrapper, 'Impresoras')
    await button(wrapper, 'Nueva impresora').trigger('click')
    const dialog = wrapper.find('[role="dialog"]')
    const inputs = dialog.findAll('input.field')
    await inputs[0].setValue('caja usb')
    await inputs[1].setValue('Térmica de caja')
    await dialog.find('input[value="USB"]').setValue(true)
    await dialog.findAll('input.field').at(-1).setValue('EPSON TM-T20')
    await dialog.find('form').trigger('submit')
    await flushPromises()
    expect(calls.createPrinter).toHaveBeenCalledWith('b1', {
      code: 'CAJA-USB', agentId: 'a1', name: 'Térmica de caja', connection: { type: 'USB', localName: 'EPSON TM-T20' }, paperWidth: 80,
    })
  })

  it('imprimir prueba manda un trabajo TEST a esa impresora', async () => {
    const { wrapper, calls } = await mountAs(MANAGER)
    await tab(wrapper, 'Impresoras')
    await button(wrapper, 'Imprimir prueba').trigger('click')
    await flushPromises()
    expect(calls.testPrint).toHaveBeenCalledWith('b1', data.printers[0])
    expect(wrapper.text()).toContain('Se mandó una hoja de prueba')
  })

  it('una ruta de comandas sin estación no se puede guardar', async () => {
    const { wrapper, calls } = await mountAs(MANAGER)
    await tab(wrapper, 'Rutas')
    await button(wrapper, 'Nueva ruta').trigger('click')
    const dialog = wrapper.find('[role="dialog"]')
    await dialog.findAll('input.field')[0].setValue('comandas')
    await dialog.findAll('input.field')[1].setValue('Comandas')
    expect(dialog.text()).toContain('necesitan la estación')
    expect(dialog.find('button[type="submit"]').attributes('disabled')).toBeDefined()

    await dialog.findAll('select').at(-1).setValue('s1')
    await dialog.find('form').trigger('submit')
    await flushPromises()
    expect(calls.createRoute).toHaveBeenCalledWith('b1', { code: 'COMANDAS', name: 'Comandas', printerId: 'p1', jobTypes: ['KITCHEN_TICKET', 'VOID_NOTICE'], stationId: 's1' })
  })

  it('conectar un agente es de administración y muestra el token una vez', async () => {
    const manager = await mountAs(MANAGER)
    await tab(manager.wrapper, 'Agentes')
    expect(button(manager.wrapper, 'Conectar un agente')).toBeUndefined()
    manager.wrapper.unmount()

    const { wrapper, calls } = await mountAs([...MANAGER, 'service_identities.manage'])
    await tab(wrapper, 'Agentes')
    await button(wrapper, 'Conectar un agente').trigger('click')
    await wrapper.find('[role="dialog"] input').setValue('Computadora de caja')
    await wrapper.find('[role="dialog"] form').trigger('submit')
    await flushPromises()

    expect(calls.createIdentity).toHaveBeenCalledWith('b1', 'Computadora de caja')
    expect(calls.createAgent).toHaveBeenCalledWith('b1', 'si1', 'Computadora de caja')
    expect(wrapper.find('input.token').element.value).toBe('rsv_secreto')
  })
})
