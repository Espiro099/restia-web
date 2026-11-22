import { api as defaultApi } from './client.js'
import { catalogErrorText } from './catalog.js'

// Reservaciones (R-1 a R-12 en restia-api). En el panel se ve la agenda del día, se crean, confirman,
// reprograman, cancelan y se marcan como "no llegó". Registrar la llegada y sentarlas es en la app.

export const STATUS = {
  PENDING: { label: 'Por confirmar', tone: 'warn' },
  CONFIRMED: { label: 'Confirmada', tone: 'accent' },
  ARRIVED_WAITING: { label: 'Llegó, esperando mesa', tone: 'accent' },
  CHECKED_IN: { label: 'Sentada', tone: '' },
  COMPLETED: { label: 'Terminada', tone: 'muted' },
  CANCELLED: { label: 'Cancelada', tone: 'muted' },
  NO_SHOW: { label: 'No llegó', tone: 'muted' },
}

export const DEFAULT_MINUTES = 90

/** Qué se ofrece según el estado (Reservations::confirm/cancel/noShow/update). */
export function reservationActions(r, perms, now = Date.now()) {
  const open = ['PENDING', 'CONFIRMED'].includes(r.status)
  return {
    confirm: perms.confirm && r.status === 'PENDING',
    edit: perms.update && open,
    cancel: perms.cancel && open,
    // "No llegó" solo cuando ya pasó la hora.
    noShow: perms.noShow && r.status === 'CONFIRMED' && new Date(r.startAt).getTime() <= now,
  }
}

/** Inicio y fin del día local en ISO, para pedir la agenda. */
export function dayRange(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const start = new Date(y, m - 1, d)
  const end = new Date(y, m - 1, d + 1)
  return { from: start.toISOString(), to: end.toISOString() }
}

/** Fecha y hora locales + duración → { startAt, endAt } en ISO. */
export function slot(date, time, minutes = DEFAULT_MINUTES) {
  const [y, m, d] = date.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)
  const start = new Date(y, m - 1, d, h, min)
  return { startAt: start.toISOString(), endAt: new Date(start.getTime() + minutes * 60_000).toISOString() }
}

export function shiftDay(iso, n) {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(y, m - 1, d + n)
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

export function hhmm(iso) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const MESSAGES = {
  RESERVATION_NOT_AVAILABLE: 'No hay mesas libres para ese horario y número de personas.',
  RESERVATION_ACTIVE_LIMIT_EXCEEDED: 'Ese teléfono ya tiene el máximo de reservaciones activas.',
  RESERVATION_INVALID_STATE: 'La reservación cambió de estado. Se recargó la agenda.',
  RESERVATION_PRIORITY_CONFLICT: 'Otra reservación tiene prioridad para esas mesas.',
}

export function reservationsErrorText(error) {
  return MESSAGES[error?.code] ?? catalogErrorText(error)
}

export function reservationsApi(api = defaultApi) {
  const at = (b, path = '') => `/branches/${encodeURIComponent(b)}/reservations${path}`
  const key = () => ({ 'Idempotency-Key': globalThis.crypto.randomUUID() })
  const change = (version) => ({ headers: { ...key(), 'If-Match': `"${version}"` } })
  return {
    async day(b, date, status) {
      const { from, to } = dayRange(date)
      const q = new URLSearchParams({ from, to, page: '1', perPage: '100' })
      if (status) q.set('status', status)
      return (await api.get(`${at(b)}?${q}`)).data
    },
    tables: async (b) => (await api.get(`/branches/${encodeURIComponent(b)}/tables?page=1&perPage=100`)).data,
    create: (b, body) => api.post(at(b), body, { headers: key() }),
    update: (b, r, changes) => api.patch(at(b, `/${r.id}`), changes, change(r.version)),
    confirm: (b, r) => api.post(at(b, `/${r.id}/confirm`), {}, change(r.version)),
    cancel: (b, r, reason) => api.post(at(b, `/${r.id}/cancel`), { reason: reason.trim() }, change(r.version)),
    noShow: (b, r) => api.post(at(b, `/${r.id}/no-show`), {}, change(r.version)),
  }
}
