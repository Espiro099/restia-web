import { api as defaultApi } from './client.js'

// Avisos de la campana (NotificationController en restia-api). Cada quien ve solo los suyos en la sucursal.
// En el panel llegan sobre todo los de gerencia: stock bajo, cuenta solicitada y pagos sin confirmar.

/** Cada cuánto se pregunta por avisos nuevos mientras la pestaña está a la vista. */
export const POLL_MS = 30_000

/** Módulo del panel donde se atiende cada tipo de aviso, y el permiso para abrirlo. */
const TARGETS = {
  LOW_STOCK: { module: 'inventario', permission: 'inventory.read' },
  CHECK_REQUESTED: { module: 'caja', permission: 'cash.read' },
  PAYMENT_CONFIRMED: { module: 'caja', permission: 'cash.read' },
  PAYMENT_FAILED: { module: 'caja', permission: 'cash.read' },
  PAYMENT_UNKNOWN: { module: 'caja', permission: 'cash.read' },
  ORDER_READY: { module: 'mesas', permission: 'tables.read' },
}

/** Nombre de la ruta a la que lleva el aviso, o null si no hay módulo o no se tiene el permiso. */
export function noticeTarget(notice, canOpen) {
  const t = TARGETS[notice?.type]
  return t && canOpen(t.permission) ? t.module : null
}

/** "Ahora", "Hace 5 min", "Hace 2 h", "Ayer" o la fecha corta. */
export function noticeAge(iso, now = new Date()) {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  const minutes = Math.floor((now - at) / 60_000)
  if (minutes < 1) return 'Ahora'
  if (minutes < 60) return `Hace ${minutes} min`
  if (minutes < 24 * 60) return `Hace ${Math.floor(minutes / 60)} h`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (at.toDateString() === yesterday.toDateString()) return 'Ayer'
  return at.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

/** Texto de la insignia: hasta 9 y luego "9+". */
export function badgeText(count) {
  if (!count) return ''
  return count > 9 ? '9+' : String(count)
}

export function notificationsApi(api = defaultApi) {
  const at = (branchId, path = '') => `/branches/${encodeURIComponent(branchId)}/notifications${path}`
  return {
    /** Los 10 más recientes y el total sin leer. */
    async latest(branchId) {
      const r = await api.get(`${at(branchId)}?page=1&perPage=10`)
      return { items: r.data ?? [], unread: r.meta?.unreadCount ?? 0 }
    },
    read: (branchId, id) => api.post(at(branchId, `/${encodeURIComponent(id)}/read`)),
    readAll: (branchId) => api.post(at(branchId, '/read-all')),
  }
}
