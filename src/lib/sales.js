import { api as defaultApi } from './client.js'

// Ventas (Figma "Restia web", 02 · Panel → Ventas): las cuentas de un día de negocio con su mesa, su total
// y su estado. La mesa sale de las sesiones de ese mismo día.

export const CHECK_STATUS = {
  OPEN: { text: 'Abierta', tone: 'muted' },
  REQUESTED: { text: 'Solicitada', tone: 'accent' },
  PARTIALLY_PAID: { text: 'Pago parcial', tone: 'accent' },
  PAID: { text: 'Pagada', tone: '' },
  CANCELLED: { text: 'Cancelada', tone: 'muted' },
  REFUNDED: { text: 'Reembolsada', tone: 'warn' },
}

const cents = (m) => Math.round(Number(m?.amount ?? 0) * 100)

/** Filas de la tabla: de la más reciente a la más antigua, con las mesas de su sesión. */
export function salesRows(checks, sessions) {
  const tables = new Map((sessions ?? []).map((s) => [s.id, (s.tables ?? []).map((t) => t.number).filter(Boolean)]))
  return (checks ?? [])
    .map((c) => ({
      id: c.id,
      code: `#${c.id.slice(0, 6).toUpperCase()}`,
      tables: tables.get(c.sessionId) ?? [],
      total: cents(c.total),
      paid: cents(c.paidTotal),
      status: c.status,
      at: c.paidAt ?? c.requestedAt ?? c.createdAt,
    }))
    .sort((a, b) => (a.at < b.at ? 1 : -1))
}

/** Lo cobrado del día: suma de lo pagado en cuentas no canceladas y cuántas quedaron pagadas. */
export function salesTotals(rows) {
  const live = rows.filter((r) => r.status !== 'CANCELLED')
  return { paid: live.reduce((s, r) => s + r.paid, 0), paidCount: rows.filter((r) => r.status === 'PAID').length, open: live.filter((r) => r.status !== 'PAID' && r.status !== 'REFUNDED').length }
}

/** Coincide por código de cuenta (#ABC123) o número de mesa ("5" o "mesa 5"). */
export function matchesSale(row, query) {
  const q = query.trim().toLowerCase().replace(/^#/, '')
  if (!q) return true
  return row.id.toLowerCase().startsWith(q) || row.tables.some((t) => String(t) === q || `mesa ${t}` === q)
}

export function salesApi(api = defaultApi) {
  const at = (b, path) => `/branches/${encodeURIComponent(b)}/${path}`
  async function all(b, path) {
    const rows = []
    for (let page = 1; page <= 10; page++) {
      const r = await api.get(`${at(b, path)}&page=${page}&perPage=100`)
      rows.push(...(r.data ?? []))
      if (page >= (r.meta?.pagination?.lastPage ?? 1)) break
    }
    return rows
  }
  return {
    day: async (b, date) => {
      const [checks, sessions] = await Promise.all([all(b, `checks?businessDate=${date}`), all(b, `table-sessions?businessDate=${date}`)])
      return salesRows(checks, sessions)
    },
  }
}
