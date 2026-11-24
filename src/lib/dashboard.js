import { api as defaultApi } from './client.js'
import { isoDate, METHODS, periodRange, shortDate } from './reports.js'

// Inicio del panel (Figma "Restia web", 02 · Panel → Inicio): ventas del día contra ayer, ticket promedio,
// las comandas que siguen en curso, la semana de ventas, los métodos de pago y el inventario bajo mínimo.
// Todo sale de la API real; cada tarjeta aparece solo con su permiso.

const cents = (money) => Math.round(Number(money?.amount ?? 0) * 100)

/** "17 nov": corto para el eje de la gráfica. */
export function dayLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }).replace('.', '')
}

/** Cambio porcentual redondeado; null si no hay base para comparar. */
export function percentChange(now, before) {
  if (!before) return null
  return Math.round(((now - before) / before) * 100)
}

/** "+12 % vs. ayer", "−5 % vs. ayer", "Igual que ayer" o "Sin ventas ayer". */
export function changeText(pct) {
  if (pct === null) return 'Sin ventas ayer para comparar'
  if (pct === 0) return 'Igual que ayer'
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct)} % vs. ayer`
}

/**
 * Resumen de ventas a partir de los días del reporte (los últimos 7, incluido hoy). Los días sin ventas no
 * llegan del servidor y cuentan como 0.
 */
export function salesSummary(rows, today = new Date()) {
  const byDate = new Map((rows ?? []).filter(Boolean).map((r) => [r.businessDate, r]))
  const { from } = periodRange('week', today)
  const days = []
  for (let d = new Date(`${from}T12:00:00`); isoDate(d) <= isoDate(today); d.setDate(d.getDate() + 1)) days.push(isoDate(d))
  const net = (iso) => cents(byDate.get(iso)?.netSales)
  const checks = (iso) => byDate.get(iso)?.checkCount ?? 0
  const t = isoDate(today)
  const y = days[days.length - 2]
  const ticket = (iso) => (checks(iso) ? Math.round(net(iso) / checks(iso)) : 0)
  const methods = Object.keys(METHODS).map((m) => ({
    method: m,
    label: METHODS[m],
    value: [...byDate.values()].reduce((sum, r) => sum + cents((r.byMethod ?? []).find((x) => x.method === m)?.sales), 0),
  }))
  const methodTotal = methods.reduce((s, m) => s + m.value, 0)
  return {
    today: net(t),
    salesChange: percentChange(net(t), net(y)),
    checksToday: checks(t),
    avgTicket: ticket(t),
    ticketChange: percentChange(ticket(t), ticket(y)),
    week: days.map((iso) => ({ key: iso, label: dayLabel(iso), longLabel: shortDate(iso), value: net(iso) / 100 })),
    weekTotal: days.reduce((s, iso) => s + net(iso), 0),
    methods: methods.map((m) => ({ ...m, share: methodTotal ? m.value / methodTotal : 0 })),
    methodTotal,
  }
}

const STAGE = { PENDING: 0, PREPARING: 1, READY: 2 }
export const STAGE_TEXT = ['Recibida', 'En preparación', 'Lista']

/**
 * Comandas en curso a partir de sus unidades pendientes, en preparación o listas: una fila por comanda, en
 * el paso de su unidad más atrasada, de la más reciente a la más antigua.
 */
export function activeOrders(units) {
  const orders = new Map()
  for (const row of units ?? []) {
    const u = row.unit ?? row
    const stage = STAGE[u.status]
    if (stage === undefined) continue
    const o = orders.get(u.orderId) ?? { orderId: u.orderId, tables: row.tableNumbers ?? [], createdAt: u.createdAt, stage, units: 0, products: [] }
    o.stage = Math.min(o.stage, stage)
    o.units += 1
    if (row.productName) o.products.push(row.productName)
    if (u.createdAt < o.createdAt) o.createdAt = u.createdAt
    orders.set(u.orderId, o)
  }
  const list = [...orders.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  return { list, total: list.length, preparing: list.filter((o) => o.stage === 1).length }
}

/** Hora local HH:MM de una marca ISO. */
export function clock(iso) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** Crítico si queda la mitad del mínimo o menos; bajo en otro caso. */
export function stockLevel(ingredient) {
  const stock = Number(ingredient.stock)
  const min = Number(ingredient.minStock)
  return stock <= min / 2 ? 'Crítico' : 'Bajo'
}

export function dashboardApi(api = defaultApi) {
  const at = (b, path) => `/branches/${encodeURIComponent(b)}/${path}`
  return {
    sales: (b, today = new Date()) => api.get(`${at(b, 'reports/daily-sales')}?from=${periodRange('week', today).from}&to=${isoDate(today)}`).then((r) => r.data),
    async units(b) {
      const lists = await Promise.all(['PENDING', 'PREPARING', 'READY'].map((s) => api.get(`${at(b, 'order-units')}?status=${s}&perPage=100`)))
      return lists.flatMap((r) => r.data ?? [])
    },
    async lowStock(b) {
      const r = await api.get(`${at(b, 'ingredients')}?status=ACTIVE&belowMinimum=true&perPage=5`)
      return { items: r.data ?? [], total: r.meta?.pagination?.total ?? (r.data ?? []).length }
    },
  }
}
