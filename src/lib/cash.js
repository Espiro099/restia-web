import { api as defaultApi } from './client.js'
import { catalogErrorText } from './catalog.js'
import { formatMoney } from './money.js'

// Caja (Decisiones_Cash en restia-api). En el panel se supervisa: cajas y su tolerancia, y el historial de
// turnos con su corte. Abrir, mover efectivo y cerrar se hace en la app, frente a la caja.

export const SHIFT_STATUS = {
  OPEN: { label: 'Abierto', tone: 'accent' },
  CLOSING: { label: 'En corte', tone: 'warn' },
  CLOSED: { label: 'Cerrado', tone: 'muted' },
}
export const MOVEMENT_TYPES = { DEPOSIT: 'Entrada', WITHDRAWAL: 'Salida' }
export const METHOD_NAMES = { CASH: 'Efectivo', CARD_CREDIT: 'Tarjeta de crédito', CARD_DEBIT: 'Tarjeta de débito', TRANSFER: 'Transferencia' }

/** Diferencia del corte en palabras: faltante, sobrante o cuadrado. */
export function differenceText(diff) {
  if (!diff) return ''
  const v = Number(diff.amount)
  if (v === 0) return 'Cuadró'
  return `${v < 0 ? 'Faltaron' : 'Sobraron'} ${formatMoney({ amount: Math.abs(v).toFixed(2), currency: diff.currency })}`
}

/** Hay algo en el turno que impide o complica cerrarlo. */
export function unresolvedCount(summary) {
  const u = summary?.unresolved ?? {}
  return (u.pendingPayments ?? 0) + (u.unknownPayments ?? 0) + (u.pendingRefunds ?? 0) + (u.unknownRefunds ?? 0)
}

export function cashErrorText(error) {
  if (error?.code === 'CASH_REGISTER_HAS_ACTIVE_SHIFT') return 'La caja tiene un turno abierto. Ciérralo en la app antes de desactivarla.'
  return catalogErrorText(error)
}

const ifMatch = (version) => ({ headers: { 'If-Match': `"${version}"` } })

export function cashApi(api = defaultApi) {
  const at = (b, path) => `/branches/${encodeURIComponent(b)}/${path}`
  return {
    async registers(b) {
      const r = await api.get(`${at(b, 'cash-registers')}?page=1&perPage=100`)
      return r.data
    },
    shifts(b, { cashRegisterId, status, businessDate, reviewRequired, page = 1 } = {}) {
      const q = new URLSearchParams({ page: String(page), perPage: '25' })
      if (cashRegisterId) q.set('cashRegisterId', cashRegisterId)
      if (status) q.set('status', status)
      if (businessDate) q.set('businessDate', businessDate)
      if (reviewRequired) q.set('reviewRequired', 'true')
      return api.get(`${at(b, 'cash-shifts')}?${q}`)
    },
    summary: (b, s) => api.get(at(b, `cash-shifts/${s.id}/summary`)).then((r) => r.data),
    movements: (b, s) => api.get(`${at(b, `cash-shifts/${s.id}/movements`)}?page=1&perPage=100`).then((r) => r.data),
    /** Nombres del personal, para mostrar quién abrió y cerró. Sin members.read se queda sin nombres. */
    async people(b) {
      try {
        const r = await api.get(`${at(b, 'members')}?page=1&perPage=100`)
        return new Map(r.data.map((m) => [m.user.id, m.user.name]))
      } catch {
        return new Map()
      }
    },
    createRegister: (b, body) => api.post(at(b, 'cash-registers'), body),
    updateRegister: (b, r, changes) => api.patch(at(b, `cash-registers/${r.id}`), changes, ifMatch(r.version)),
    registerStatus: (b, r, value, reason) => api.post(at(b, `cash-registers/${r.id}/status`), { status: value, reason: reason.trim() }, ifMatch(r.version)),
  }
}
