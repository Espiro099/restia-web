import { api as defaultApi } from './client.js'
import { catalogErrorText } from './catalog.js'

// Teléfonos y tabletas de la sucursal (D-36 en restia-api). El código de alta se escribe en el teléfono
// nuevo, en la pantalla "Registrar este dispositivo". Bloquear y retirar son finales y cierran sus sesiones.

export const DEVICE_STATUS = {
  ACTIVE: { label: 'Activo', tone: '' },
  BLOCKED: { label: 'Bloqueado', tone: 'warn' },
  RETIRED: { label: 'Retirado', tone: 'muted' },
}

/** "ABCDEFGHJKMN" → "ABCD EFGH JKMN", para dictarlo. */
export function groupCode(code) {
  return String(code ?? '').match(/.{1,4}/g)?.join(' ') ?? ''
}

/** Activos primero; dentro, por última conexión más reciente. */
export function sortDevices(devices) {
  const rank = (d) => (d.status === 'ACTIVE' ? 0 : 1)
  return [...devices].sort((a, b) => rank(a) - rank(b) || String(b.lastSeenAt ?? '').localeCompare(String(a.lastSeenAt ?? '')))
}

export function devicesErrorText(error) {
  if (error?.status === 429) return 'Generaste muchos códigos seguidos. Espera unos minutos.'
  if (error?.code === 'BRANCH_INACTIVE') return 'La sucursal está desactivada; no se pueden dar de alta equipos.'
  return catalogErrorText(error)
}

export function devicesApi(api = defaultApi) {
  const at = (b, path = '') => `/branches/${encodeURIComponent(b)}/devices${path}`
  return {
    async list(b) {
      const rows = []
      for (let page = 1; page <= 10; page++) {
        const r = await api.get(`${at(b)}?page=${page}&perPage=100`)
        rows.push(...r.data)
        if (rows.length >= (r.meta?.pagination?.total ?? rows.length) || !r.data.length) break
      }
      return rows
    },
    enrollmentCode: (b) => api.post(at(b, '/enrollment-codes'), {}).then((r) => r.data),
    close: (b, d, how, reason) => api.post(at(b, `/${d.id}/${how === 'BLOCK' ? 'block' : 'retire'}`), { reason: reason.trim() }),
  }
}
