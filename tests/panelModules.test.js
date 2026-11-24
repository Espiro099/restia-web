import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { MODULES, modulesIn } from '../src/modules.js'
import { matchesSale, salesApi, salesRows, salesTotals } from '../src/lib/sales.js'
import { useSession } from '../src/stores/session.js'
import NoticesView from '../src/views/NoticesView.vue'
import OrdersView from '../src/views/OrdersView.vue'
import SalesView from '../src/views/SalesView.vue'
import SettingsView from '../src/views/SettingsView.vue'

const names = ['inicio', ...MODULES.map((m) => m.key)]
function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes: names.map((name) => ({ path: `/${name}`, name, component: { template: '<p />' } })) })
}
function signIn(permissions, role = 'MANAGER') {
  useSession().adopt({ user: { id: 'u1', name: 'Gerente' }, memberships: [{ branch: { id: 'b1', name: 'Centro' }, role, permissions }] })
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('menú del Figma', () => {
  it('el principal va en el orden del Figma y Configuración reúne los ajustes', () => {
    expect(modulesIn('main', () => true).map((m) => m.title)).toEqual([
      'Ventas', 'Comandas', 'Menú', 'Inventario', 'Personal', 'Salón', 'Reportes', 'Reservaciones', 'Clientes', 'Caja y cobros', 'Configuración',
    ])
    expect(modulesIn('config', () => true).map((m) => m.key)).toEqual(['sucursal', 'dispositivos', 'impresion', 'avisos', 'auditoria'])
  })

  it('un módulo sin permiso propio se ve con acceso al panel, no con rol de piso', () => {
    signIn([])
    expect(useSession().canOpen(null)).toBe(true)
    setActivePinia(createPinia())
    signIn(['menu.read'], 'WAITER')
    expect(useSession().canOpen(null)).toBe(false)
  })

  it('Configuración lista solo los ajustes con permiso', async () => {
    signIn(['printing.read'])
    const wrapper = mount(SettingsView, { global: { plugins: [makeRouter()] } })
    await flushPromises()
    expect(wrapper.findAll('.item .title').map((t) => t.text())).toEqual(['Impresión', 'Avisos'])
  })
})

describe('Ventas', () => {
  const checks = [
    { id: 'aaaaaa11', sessionId: 's1', status: 'PAID', total: { amount: '230.00' }, paidTotal: { amount: '230.00' }, paidAt: '2026-11-24T20:00:00Z', createdAt: '2026-11-24T19:00:00Z' },
    { id: 'bbbbbb22', sessionId: 's2', status: 'REQUESTED', total: { amount: '555.00' }, paidTotal: { amount: '0.00' }, requestedAt: '2026-11-24T21:00:00Z', createdAt: '2026-11-24T19:30:00Z' },
    { id: 'cccccc33', sessionId: 's1', status: 'CANCELLED', total: { amount: '0.00' }, paidTotal: { amount: '0.00' }, createdAt: '2026-11-24T18:00:00Z' },
  ]
  const sessions = [{ id: 's1', tables: [{ number: 4 }] }, { id: 's2', tables: [{ number: 1 }, { number: 2 }] }]

  it('une cada cuenta con sus mesas, de la más reciente a la más antigua, y suma lo cobrado', () => {
    const rows = salesRows(checks, sessions)
    expect(rows.map((r) => [r.code, r.tables, r.status])).toEqual([['#BBBBBB', [1, 2], 'REQUESTED'], ['#AAAAAA', [4], 'PAID'], ['#CCCCCC', [4], 'CANCELLED']])
    expect(salesTotals(rows)).toEqual({ paid: 23000, paidCount: 1, open: 1 })
    expect(matchesSale(rows[0], 'mesa 2')).toBe(true)
    expect(matchesSale(rows[1], '#aaa')).toBe(true)
    expect(matchesSale(rows[1], '7')).toBe(false)
  })

  it('pide las cuentas y las sesiones del día, todas las páginas', async () => {
    const api = { get: vi.fn(async (url) => ({ data: url.includes('checks') ? checks : sessions, meta: { pagination: { lastPage: 1 } } })) }
    const rows = await salesApi(api).day('b1', '2026-11-24')
    expect(rows).toHaveLength(3)
    expect(api.get.mock.calls.map((c) => c[0])).toEqual([
      '/branches/b1/checks?businessDate=2026-11-24&page=1&perPage=100',
      '/branches/b1/table-sessions?businessDate=2026-11-24&page=1&perPage=100',
    ])
  })

  it('la pantalla muestra el día, el total cobrado y filtra por mesa', async () => {
    signIn(['checks.read', 'reports.read'])
    const day = vi.fn(async () => salesRows(checks, sessions))
    const wrapper = mount(SalesView, { props: { api: { day } }, global: { plugins: [makeRouter()] } })
    await flushPromises()
    expect(wrapper.find('.summary').text()).toContain('Cobrado $230.00 MXN · 1 cuenta pagada · 1 sin terminar de cobrar')
    expect(wrapper.findAll('tbody tr')).toHaveLength(3)
    await wrapper.find('input[type="search"]').setValue('mesa 4')
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    expect(wrapper.text()).toContain('Pagada')
  })
})

describe('Comandas', () => {
  it('actualiza el estado al volver al panel', async () => {
    signIn(['orders.read'])
    const units = vi.fn(async () => [])
    const wrapper = mount(OrdersView, { props: { api: { units } }, global: { plugins: [makeRouter()] } })
    await flushPromises()
    expect(wrapper.text()).toContain('No hay comandas en curso')
    units.mockResolvedValueOnce([
      { unit: { id: '1', orderId: 'abc12345', status: 'PREPARING', createdAt: '2026-11-24T20:00:00Z' }, tableNumbers: [5], productName: 'Pozole rojo' },
    ])
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(wrapper.text()).toContain('Pozole rojo')
    expect(wrapper.find('.summary').text()).toContain('1 en preparación')
    wrapper.unmount()
  })

  it('lista lo que sigue en curso con sus platillos y busca por mesa o platillo', async () => {
    signIn(['orders.read', 'tables.read'])
    const units = vi.fn(async () => [
      { unit: { id: '1', orderId: 'abc12345', status: 'PREPARING', createdAt: '2026-11-24T20:00:00Z' }, tableNumbers: [5], productName: 'Pozole rojo' },
      { unit: { id: '2', orderId: 'abc12345', status: 'READY', createdAt: '2026-11-24T20:00:00Z' }, tableNumbers: [5], productName: 'Agua de jamaica' },
      { unit: { id: '3', orderId: 'abc12345', status: 'READY', createdAt: '2026-11-24T20:00:00Z' }, tableNumbers: [5], productName: 'Agua de jamaica' },
      { unit: { id: '4', orderId: 'def67890', status: 'READY', createdAt: '2026-11-24T20:05:00Z' }, tableNumbers: [12], productName: 'Flan napolitano' },
    ])
    const wrapper = mount(OrdersView, { props: { api: { units } }, global: { plugins: [makeRouter()] } })
    await flushPromises()
    expect(wrapper.find('.summary').text()).toBe('2 en curso · 1 en preparación')
    expect(wrapper.text()).toContain('Pozole rojo, 2 × Agua de jamaica')
    expect(wrapper.find('a.btn').attributes('href')).toBe('/mesas')
    await wrapper.find('input[type="search"]').setValue('flan')
    expect(wrapper.findAll('tbody tr').map((r) => r.text())).toEqual([expect.stringContaining('Mesa 12')])
    wrapper.unmount()
  })
})

describe('Avisos', () => {
  it('lista, filtra los sin leer, marca todo y abre el módulo del aviso', async () => {
    signIn(['inventory.read'])
    const router = makeRouter()
    const push = vi.spyOn(router, 'push')
    const n = (id, type, read) => ({ id, type, title: `Aviso ${id}`, body: 'Detalle', readAt: read ? '2026-11-24T10:00:00Z' : null, createdAt: '2026-11-24T10:00:00Z', updatedAt: '2026-11-24T10:00:00Z' })
    const calls = {
      page: vi.fn(async (b, { unread }) => ({ items: unread ? [n('1', 'LOW_STOCK', false)] : [n('1', 'LOW_STOCK', false), n('2', 'CHECK_REQUESTED', true)], unread: 1, lastPage: 1 })),
      read: vi.fn(async () => ({})),
      readAll: vi.fn(async () => ({})),
    }
    const wrapper = mount(NoticesView, { props: { api: calls }, global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.findAll('.notice')).toHaveLength(2)
    await wrapper.find('input[type="checkbox"]').setValue(true)
    await flushPromises()
    expect(calls.page).toHaveBeenLastCalledWith('b1', { unread: true, page: 1 })
    expect(wrapper.findAll('.notice')).toHaveLength(1)
    await wrapper.find('.btn-primary').trigger('click')
    await flushPromises()
    expect(calls.readAll).toHaveBeenCalledWith('b1')
    await wrapper.find('.notice').trigger('click')
    await flushPromises()
    expect(calls.read).toHaveBeenCalledWith('b1', '1')
    expect(push).toHaveBeenCalledWith({ name: 'inventario' })
    // Ya sin avisos por leer, "Marcar como leídos" queda desactivado.
    expect(wrapper.find('.btn-primary').attributes('disabled')).toBeDefined()
  })
})
