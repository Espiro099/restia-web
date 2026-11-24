import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { activeOrders, changeText, dashboardApi, percentChange, salesSummary, stockLevel } from '../src/lib/dashboard.js'
import { useSession } from '../src/stores/session.js'
import HomeView from '../src/views/HomeView.vue'

const TODAY = new Date(2026, 10, 24, 15, 0)
const day = (date, net, checks, cash = net) => ({
  businessDate: date, netSales: { amount: net, currency: 'MXN' }, checkCount: checks,
  byMethod: [{ method: 'CASH', sales: { amount: cash } }, { method: 'CARD_CREDIT', sales: { amount: String(Number(net) - Number(cash)) } }],
})

describe('Inicio: cálculos', () => {
  it('ventas de hoy contra ayer, ticket promedio y la semana con ceros', () => {
    const s = salesSummary([day('2026-11-23', '1000.00', 4), day('2026-11-24', '1200.00', 4, '900.00')], TODAY)
    expect(s.today).toBe(120000)
    expect(s.salesChange).toBe(20)
    expect(s.avgTicket).toBe(30000)
    expect(s.ticketChange).toBe(20)
    expect(s.week).toHaveLength(7)
    expect(s.week[0]).toMatchObject({ key: '2026-11-18', value: 0, label: '18 nov' })
    expect(s.week.at(-1)).toMatchObject({ key: '2026-11-24', value: 1200 })
    expect(s.weekTotal).toBe(220000)
    const cash = s.methods.find((m) => m.method === 'CASH')
    expect(cash.value).toBe(190000)
    expect(cash.share).toBeCloseTo(190000 / 220000)
  })

  it('el cambio se dice en palabras y sin base no compara', () => {
    expect(percentChange(120, 0)).toBeNull()
    expect(changeText(null)).toMatch(/Sin ventas ayer/)
    expect(changeText(12)).toBe('+12 % vs. ayer')
    expect(changeText(-5)).toBe('−5 % vs. ayer')
    expect(changeText(0)).toBe('Igual que ayer')
  })

  it('agrupa las unidades en comandas, en el paso de la más atrasada y de la más reciente a la más antigua', () => {
    const u = (order, status, at, tables = [3]) => ({ unit: { id: `${order}${status}`, orderId: order, status, createdAt: at }, tableNumbers: tables })
    const r = activeOrders([
      u('a', 'READY', '2026-11-24T20:00:00Z'), u('a', 'PREPARING', '2026-11-24T20:00:00Z'),
      u('b', 'READY', '2026-11-24T20:10:00Z', [5]), u('c', 'DELIVERED', '2026-11-24T20:20:00Z'),
    ])
    expect(r.list.map((o) => [o.orderId, o.stage])).toEqual([['b', 2], ['a', 1]])
    expect(r.total).toBe(2)
    expect(r.preparing).toBe(1)
  })

  it('crítico con la mitad del mínimo o menos', () => {
    expect(stockLevel({ stock: '1.5', minStock: '3' })).toBe('Crítico')
    expect(stockLevel({ stock: '2', minStock: '3' })).toBe('Bajo')
  })

  it('pide la semana, las tres colas y los insumos bajo mínimo', async () => {
    const api = { get: vi.fn(async (url) => (url.includes('ingredients') ? { data: [{ id: 'i1' }], meta: { pagination: { total: 4 } } } : { data: [] })) }
    const calls = dashboardApi(api)
    await calls.sales('b1', TODAY)
    await calls.units('b1')
    expect(await calls.lowStock('b1')).toEqual({ items: [{ id: 'i1' }], total: 4 })
    expect(api.get.mock.calls.map((c) => c[0])).toEqual([
      '/branches/b1/reports/daily-sales?from=2026-11-18&to=2026-11-24',
      '/branches/b1/order-units?status=PENDING&perPage=100',
      '/branches/b1/order-units?status=PREPARING&perPage=100',
      '/branches/b1/order-units?status=READY&perPage=100',
      '/branches/b1/ingredients?status=ACTIVE&belowMinimum=true&perPage=5',
    ])
  })
})

describe('Inicio: pantalla', () => {
  let router
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<p />' } }, { path: '/inventario', name: 'inventario', component: { template: '<p />' } }, { path: '/menu', name: 'menu', component: { template: '<p />' } }, { path: '/configuracion', name: 'configuracion', component: { template: '<p />' } }] })
  })

  async function mountWith(permissions, calls) {
    useSession().adopt({ user: { id: 'u1', name: 'Alejandro García' }, memberships: [{ branch: { id: 'b1', name: 'Centro' }, role: 'MANAGER', permissions }] })
    const wrapper = mount(HomeView, { props: { api: calls }, global: { plugins: [router], stubs: { BarChart: true, DonutChart: true } } })
    await flushPromises()
    return wrapper
  }

  it('muestra cada tarjeta con su permiso y lo que llegó de la API', async () => {
    const calls = {
      sales: vi.fn(async () => [day(new Date().toISOString().slice(0, 10), '500.00', 2)]),
      units: vi.fn(async () => [{ unit: { id: 'x', orderId: 'abcdef12', status: 'PREPARING', createdAt: '2026-11-24T20:00:00Z' }, tableNumbers: [7] }]),
      lowStock: vi.fn(async () => ({ items: [{ id: 'i1', name: 'Jitomate', stock: '1', minStock: '3' }], total: 1 })),
    }
    const wrapper = await mountWith(['reports.read', 'orders.read', 'inventory.read'], calls)
    expect(wrapper.find('h1').text()).toBe('Hola, Alejandro')
    expect(wrapper.text()).toContain('Comandas activas')
    expect(wrapper.text()).toContain('1 en preparación')
    expect(wrapper.text()).toContain('#ABCDEF')
    expect(wrapper.text()).toContain('Mesa 7')
    expect(wrapper.text()).toContain('Jitomate')
    expect(wrapper.text()).toContain('Crítico')
    expect(wrapper.find('a.hint').attributes('href')).toBe('/inventario')
  })

  it('sin permiso de reportes no pide ventas, y una falla no tumba lo demás', async () => {
    const calls = {
      sales: vi.fn(),
      units: vi.fn(async () => { throw new Error('sin red') }),
      lowStock: vi.fn(async () => ({ items: [], total: 0 })),
    }
    const wrapper = await mountWith(['orders.read', 'inventory.read', 'menu.read'], calls)
    expect(calls.sales).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('Ventas del día')
    expect(wrapper.text()).toContain('No se pudieron cargar las comandas.')
    expect(wrapper.text()).toContain('Ningún insumo está bajo su mínimo.')
  })

  it('sin ninguna tarjeta muestra los módulos que puede abrir', async () => {
    const wrapper = await mountWith(['menu.read'], { sales: vi.fn(), units: vi.fn(), lowStock: vi.fn() })
    expect(wrapper.find('.tiles').text()).toContain('Menú')
  })
})
