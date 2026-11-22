import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import {
  change, daysBetween, money, periodRange, previousRange, rangeProblem, summarize, toCsv,
} from '../src/lib/reports.js'
import { useSession } from '../src/stores/session.js'
import ReportsView from '../src/views/ReportsView.vue'

const TODAY = new Date(2026, 10, 22)
const mxn = (amount) => ({ amount, currency: 'MXN' })
const day = (date, net, checks, guests, methods = [['CASH', net]]) => ({
  businessDate: date, netSales: mxn(net), refunds: mxn('0.00'), tips: mxn('10.00'), courtesies: mxn('0.00'), invoiced: mxn('0.00'),
  checkCount: checks, guestCount: guests, byMethod: methods.map(([method, a]) => ({ method, sales: mxn(a), tips: mxn('0.00'), refunds: mxn('0.00') })),
  asOf: `${date}T23:00:00Z`,
})
const hour = (date, h, tables, guests = 4) => ({ businessDate: date, hour: h, sessionsOpened: tables, tablesOccupied: tables, guestCount: guests, asOf: '' })

describe('cálculos de Reportes', () => {
  it('los periodos terminan hoy e incluyen ambos extremos', () => {
    expect(periodRange('today', TODAY)).toEqual({ from: '2026-11-22', to: '2026-11-22' })
    expect(periodRange('yesterday', TODAY)).toEqual({ from: '2026-11-21', to: '2026-11-21' })
    expect(periodRange('week', TODAY)).toEqual({ from: '2026-11-16', to: '2026-11-22' })
    expect(periodRange('month', TODAY)).toEqual({ from: '2026-10-24', to: '2026-11-22' })
    expect(periodRange('thisMonth', TODAY)).toEqual({ from: '2026-11-01', to: '2026-11-22' })
    expect(daysBetween('2026-10-24', '2026-11-22')).toBe(30)
  })

  it('el periodo anterior tiene el mismo largo y termina un día antes', () => {
    expect(previousRange({ from: '2026-11-16', to: '2026-11-22' })).toEqual({ from: '2026-11-09', to: '2026-11-15' })
    expect(previousRange({ from: '2026-11-22', to: '2026-11-22' })).toEqual({ from: '2026-11-21', to: '2026-11-21' })
  })

  it('valida el rango elegido a mano', () => {
    expect(rangeProblem({ from: '2026-11-10', to: '2026-11-01' }, TODAY)).toMatch(/antes de la final/)
    expect(rangeProblem({ from: '2026-11-10', to: '2026-11-30' }, TODAY)).toMatch(/no han pasado/)
    expect(rangeProblem({ from: '2026-01-01', to: '2026-11-22' }, TODAY)).toMatch(/92 días/)
    expect(rangeProblem({ from: '2026-11-01', to: '2026-11-22' }, TODAY)).toBe('')
  })

  it('suma en centavos, llena días sin venta y calcula la parte de cada método', () => {
    const s = summarize(
      [day('2026-11-16', '300.10', 2, 5, [['CASH', '100.10'], ['CARD_CREDIT', '200.00']]), day('2026-11-20', '0.20', 1, 1)],
      [hour('2026-11-16', 13, 4), hour('2026-11-20', 13, 3), hour('2026-11-20', 15, 7)],
      '2026-11-16', '2026-11-22',
    )
    expect(s.net).toBe(30030)
    expect(s.checks).toBe(3)
    expect(s.averageTicket).toBe(10010)
    expect(s.tips).toBe(2000)
    expect(s.series).toHaveLength(7)
    expect(s.series[1].net).toBe(0)
    expect(s.byMethod.map((m) => m.method)).toEqual(['CARD_CREDIT', 'CASH'])
    expect(s.byMethod[0].share).toBeCloseTo(200 / 300.3, 5)
    expect(s.hours.map((h) => h.hour)).toEqual([13, 14, 15])
    expect(s.hours[0].tables).toBe(1)
    expect(s.peak.hour).toBe(13)
    expect(s.best.date).toBe('2026-11-16')
    expect(s.asOf).toBe('2026-11-20T23:00:00Z')
  })

  it('compara con el periodo anterior solo si hay base', () => {
    expect(change(120, 100)).toEqual({ pct: 20, dir: 'up' })
    expect(change(80, 100)).toEqual({ pct: -20, dir: 'down' })
    expect(change(100, 0)).toBeNull()
    expect(change(null, 100)).toBeNull()
    expect(money(123456)).toBe('$1,234.56 MXN')
  })

  it('el CSV tiene BOM, una fila por día y columnas por método', () => {
    const s = summarize([day('2026-11-21', '207.00', 1, 2)], [], '2026-11-21', '2026-11-22')
    const csv = toCsv(s)
    expect(csv.startsWith('﻿Fecha,Venta neta,Cuentas')).toBe(true)
    const lines = csv.trim().split('\r\n')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toBe('2026-11-21,207.00,1,2,207.00,10.00,0.00,0.00,0.00,207.00,0.00,0.00,0.00')
    expect(lines[2].startsWith('2026-11-22,0.00,0,0,,')).toBe(true)
  })
})

describe('pantalla de Reportes', () => {
  let calls

  beforeEach(() => {
    localStorage.clear()
    calls = {
      dailySales: vi.fn(async (b, r) => (r.from === '2026-11-16'
        ? [day('2026-11-16', '300.00', 2, 5), day('2026-11-20', '100.00', 1, 2)]
        : [day('2026-11-10', '200.00', 2, 4)])),
      hourlyOccupancy: vi.fn(async () => [hour('2026-11-16', 14, 2)]),
    }
  })

  async function mountIt() {
    const pinia = createPinia()
    setActivePinia(pinia)
    useSession().adopt({ user: { id: 'yo', name: 'Yo' }, memberships: [{ branch: { id: 'b1', name: 'Centro' }, role: 'MANAGER', permissions: ['reports.read'] }] })
    const wrapper = mount(ReportsView, { props: { api: calls, today: () => TODAY }, global: { plugins: [pinia] } })
    await flushPromises()
    return wrapper
  }

  it('pide 7 días y el periodo anterior, y compara la venta', async () => {
    const wrapper = await mountIt()
    expect(calls.dailySales).toHaveBeenCalledWith('b1', { from: '2026-11-16', to: '2026-11-22' })
    expect(calls.dailySales).toHaveBeenCalledWith('b1', { from: '2026-11-09', to: '2026-11-15' })
    const tile = wrapper.findAll('.tile')[0]
    expect(tile.text()).toContain('$400.00 MXN')
    expect(tile.text()).toContain('▲ 100 % vs. periodo anterior')
    expect(wrapper.findAll('svg [role="img"]').length).toBe(7 + 1)
  })

  it('las barras dicen su valor al enfocarlas con el teclado', async () => {
    const wrapper = await mountIt()
    await wrapper.find('svg [role="img"][tabindex="0"]').trigger('focus')
    expect(wrapper.find('.tip').text()).toMatch(/\$300\.00 MXN · 2 cuentas/)
  })

  it('un rango a mano inválido no consulta y lo explica', async () => {
    const wrapper = await mountIt()
    calls.dailySales.mockClear()
    await wrapper.findAll('.periods button').find((b) => b.text() === 'Fechas').trigger('click')
    await wrapper.findAll('input[type="date"]')[0].setValue('2026-11-25')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toMatch(/antes de la final|no han pasado/)
    expect(calls.dailySales).not.toHaveBeenCalled()
  })
})
