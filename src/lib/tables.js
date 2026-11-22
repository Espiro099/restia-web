import { api as defaultApi } from './client.js'
import { catalogErrorText } from './catalog.js'

// Mesas de la sucursal (restia-api: TableAdmin, Tables y Public QR). El estado operativo lo calcula la API
// con las sesiones abiertas; aquí solo se muestra.

export const STATUS_LABELS = { ACTIVE: 'Activa', INACTIVE: 'Inactiva', MAINTENANCE: 'Mantenimiento' }

export const STATE_LABELS = {
  LIBRE: 'Libre',
  POSIBLE_OCUPACION: 'Posible ocupación',
  OCUPADA_SIN_COMANDA: 'Ocupada, sin pedido',
  ESPERANDO_COMIDA: 'Esperando comida',
  CONSUMIENDO: 'Consumiendo',
  CUENTA_SOLICITADA: 'Pidió la cuenta',
  POR_LIMPIAR: 'Por limpiar',
}

/** Mesas por zona; las que no tienen zona van al final. */
export function byZone(tables) {
  const groups = new Map()
  for (const t of [...tables].sort((a, b) => a.number - b.number)) {
    const zone = t.zone || ''
    if (!groups.has(zone)) groups.set(zone, [])
    groups.get(zone).push(t)
  }
  return [...groups].sort(([a], [b]) => (a === '') - (b === '') || a.localeCompare(b, 'es'))
    .map(([zone, items]) => ({ zone: zone || 'Sin zona', items }))
}

/** El primer número libre después del más alto, para proponerlo al dar de alta. */
export function nextNumber(tables) {
  return tables.reduce((max, t) => Math.max(max, t.number), 0) + 1
}

const MESSAGES = {
  TABLE_NUMBER_TAKEN: 'Ya existe una mesa con ese número.',
  TABLE_ALREADY_ASSIGNED: 'La mesa tiene gente sentada. Ciérrala en la app antes de cambiar su estado.',
}

export function tablesErrorText(error) {
  return MESSAGES[error?.code] ?? catalogErrorText(error)
}

const ifMatch = (version) => ({ headers: { 'If-Match': `"${version}"` } })

export function tablesApi(api = defaultApi) {
  const at = (branchId, path = '') => `/branches/${encodeURIComponent(branchId)}/tables${path}`
  return {
    async list(branchId) {
      const rows = []
      for (let page = 1; page <= 20; page++) {
        const r = await api.get(`${at(branchId)}?page=${page}&perPage=100`)
        rows.push(...r.data)
        if (rows.length >= (r.meta?.pagination?.total ?? rows.length) || !r.data.length) break
      }
      return rows
    },
    create: (branchId, body) => api.post(at(branchId), body),
    update: (branchId, t, changes) => api.patch(at(branchId, `/${t.id}`), changes, ifMatch(t.version)),
    status: (branchId, t, value, reason) => api.post(at(branchId, `/${t.id}/status`), { status: value, reason: reason.trim() }, ifMatch(t.version)),
    qr: (branchId, t) => api.get(at(branchId, `/${t.id}/qr`)),
    rotateQr: (branchId, t, version, reason) => api.post(at(branchId, `/${t.id}/qr/rotate`), { reason: reason.trim() }, ifMatch(version)),
  }
}
