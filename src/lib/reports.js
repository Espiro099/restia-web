import { api as defaultApi } from './client.js'

// Reportes de la sucursal (RP-1 a RP-3 en restia-api): proyecciones por día de ventas y ocupación por hora.
// Los montos llegan como texto; se suman en centavos para no perder precisión.

export const MAX_DAYS = 92
export const METHODS = { CASH: 'Efectivo', CARD_CREDIT: 'Tarjeta de crédito', CARD_DEBIT: 'Tarjeta de débito', TRANSFER: 'Transferencia' }

export const PERIODS = [
  { key: 'today', label: 'Hoy' },
  { key: 'yesterday', label: 'Ayer' },
  { key: 'week', label: '7 días' },
  { key: 'month', label: '30 días' },
  { key: 'thisMonth', label: 'Este mes' },
  { key: 'custom', label: 'Fechas' },
]

const pad = (n) => String(n).padStart(2, '0')
/** Fecha local en formato de la API (YYYY-MM-DD). */
export function isoDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function addDays(iso, n) {
  const d = parseDate(iso)
  d.setDate(d.getDate() + n)
  return isoDate(d)
}
export function daysBetween(from, to) {
  return Math.round((parseDate(to) - parseDate(from)) / 86_400_000) + 1
}

/** Rango [from, to] de un periodo, terminando hoy (o ayer). */
export function periodRange(key, today = new Date(), custom = null) {
  const t = isoDate(today)
  switch (key) {
    case 'yesterday': return { from: addDays(t, -1), to: addDays(t, -1) }
    case 'week': return { from: addDays(t, -6), to: t }
    case 'month': return { from: addDays(t, -29), to: t }
    case 'thisMonth': return { from: `${t.slice(0, 8)}01`, to: t }
    case 'custom': return custom ?? { from: t, to: t }
    default: return { from: t, to: t }
  }
}

/** El periodo inmediato anterior, del mismo largo, para comparar. */
export function previousRange({ from, to }) {
  const n = daysBetween(from, to)
  return { from: addDays(from, -n), to: addDays(from, -1) }
}

/** Problema de un rango elegido a mano, o '' si sirve. */
export function rangeProblem({ from, to }, today = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(to ?? '')) return 'Elige las dos fechas.'
  if (from > to) return 'La fecha inicial va antes de la final.'
  if (to > isoDate(today)) return 'No hay datos de días que no han pasado.'
  if (daysBetween(from, to) > MAX_DAYS) return `El rango puede ser de hasta ${MAX_DAYS} días.`
  return ''
}

const cents = (money) => Math.round(Number(money?.amount ?? 0) * 100)

/**
 * Totales del periodo, venta por día (con los días sin venta en cero), métodos de pago con su parte y
 * ocupación promedio por hora entre la primera y la última hora con actividad.
 */
export function summarize(daily, hourly, from, to) {
  const days = daysBetween(from, to)
  const byDate = new Map(daily.map((d) => [d.businessDate, d]))
  const t = { net: 0, refunds: 0, tips: 0, courtesies: 0, invoiced: 0, checks: 0, guests: 0 }
  const methods = new Map()
  const series = []
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i)
    const d = byDate.get(date)
    series.push({ date, net: d ? cents(d.netSales) : 0, checks: d?.checkCount ?? 0, guests: d?.guestCount ?? 0, row: d ?? null })
    if (!d) continue
    t.net += cents(d.netSales)
    t.refunds += cents(d.refunds)
    t.tips += cents(d.tips)
    t.courtesies += cents(d.courtesies)
    t.invoiced += cents(d.invoiced)
    t.checks += d.checkCount ?? 0
    t.guests += d.guestCount ?? 0
    for (const m of d.byMethod ?? []) methods.set(m.method, (methods.get(m.method) ?? 0) + cents(m.sales))
  }
  const methodTotal = [...methods.values()].reduce((a, b) => a + b, 0)
  const byMethod = [...methods].map(([method, amount]) => ({ method, amount, share: methodTotal ? amount / methodTotal : 0 }))
    .sort((a, b) => b.amount - a.amount)

  const perHour = new Map()
  for (const h of hourly) {
    const cur = perHour.get(h.hour) ?? { tables: 0, sessions: 0, guests: 0 }
    cur.tables += h.tablesOccupied ?? 0
    cur.sessions += h.sessionsOpened ?? 0
    cur.guests += h.guestCount ?? 0
    perHour.set(h.hour, cur)
  }
  const hoursWithData = [...perHour.keys()]
  const hours = []
  if (hoursWithData.length) {
    for (let h = Math.min(...hoursWithData); h <= Math.max(...hoursWithData); h++) {
      const cur = perHour.get(h) ?? { tables: 0, sessions: 0, guests: 0 }
      hours.push({ hour: h, tables: cur.tables / days, sessions: cur.sessions, guests: cur.guests })
    }
  }
  const best = series.reduce((b, d) => (d.net > (b?.net ?? 0) ? d : b), null)
  const peak = hours.reduce((b, h) => (h.tables > (b?.tables ?? 0) ? h : b), null)
  const asOf = daily.map((d) => d.asOf).filter(Boolean).sort().at(-1) ?? null

  return {
    days, ...t, averageTicket: t.checks ? Math.round(t.net / t.checks) : null, byMethod, series, hours, best, peak, asOf,
    empty: t.checks === 0 && t.net === 0,
  }
}

/** Cambio contra el periodo anterior: { pct, dir } o null si no hay con qué comparar. */
export function change(current, previous) {
  if (current === null || previous === null || previous === undefined || previous === 0) return null
  const pct = Math.round(((current - previous) / previous) * 100)
  return { pct, dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'same' }
}

export function money(centsValue, currency = 'MXN') {
  if (centsValue === null || centsValue === undefined) return '—'
  const v = centsValue / 100
  return `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ''}`
}

export function shortDate(iso) {
  return parseDate(iso).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })
}

const csvCell = (v) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV por día para abrir en Excel: con BOM para que respete acentos, montos con punto decimal. */
export function toCsv(summary) {
  const methodKeys = Object.keys(METHODS)
  const header = ['Fecha', 'Venta neta', 'Cuentas', 'Personas', 'Ticket promedio', 'Propinas', 'Reembolsos', 'Cortesías', 'Facturado',
    ...methodKeys.map((k) => METHODS[k])]
  const amount = (c) => (c / 100).toFixed(2)
  const lines = summary.series.map((d) => {
    const r = d.row
    const by = new Map((r?.byMethod ?? []).map((m) => [m.method, cents(m.sales)]))
    return [d.date, amount(d.net), d.checks, d.guests, d.checks ? amount(Math.round(d.net / d.checks)) : '',
      amount(cents(r?.tips)), amount(cents(r?.refunds)), amount(cents(r?.courtesies)), amount(cents(r?.invoiced)),
      ...methodKeys.map((k) => amount(by.get(k) ?? 0))]
  })
  return '﻿' + [header, ...lines].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

export function reportsApi(api = defaultApi) {
  const at = (b, path, { from, to }) => `/branches/${encodeURIComponent(b)}/reports/${path}?from=${from}&to=${to}`
  return {
    dailySales: (b, range) => api.get(at(b, 'daily-sales', range)).then((r) => r.data),
    hourlyOccupancy: (b, range) => api.get(at(b, 'hourly-occupancy', range)).then((r) => r.data),
  }
}
