import { api as defaultApi } from './client.js'

// Bitácora de la sucursal (AU-1 en restia-api): solo lectura, hasta 31 días por consulta.

export const MAX_DAYS = 31

export const ENTITY_LABELS = {
  auth_session: 'Sesión', branch: 'Sucursal', cash_movement: 'Movimiento de caja', cash_register: 'Caja', cash_shift: 'Turno de caja',
  check: 'Cuenta', customer: 'Cliente', device: 'Dispositivo', device_enrollment_code: 'Código de alta', fiscal_issuer: 'Emisor fiscal',
  ingredient: 'Insumo', inventory: 'Inventario', inventory_count: 'Conteo de inventario', invoice: 'Factura', invoice_batch: 'Factura global',
  member: 'Empleado', modifier: 'Modificador', order: 'Pedido', order_item: 'Platillo del pedido', order_unit: 'Platillo', payment: 'Pago',
  print_agent: 'Agente de impresión', print_job: 'Trabajo de impresión', print_station: 'Ruta de impresión', printer: 'Impresora',
  product: 'Producto', refund: 'Reembolso', reservation: 'Reservación', service_identity: 'Identidad de servicio', station: 'Estación',
  table: 'Mesa', table_session: 'Mesa atendida', user: 'Usuario', approval: 'Autorización', restia: 'Restia',
}

const VERBS = {
  created: 'alta', updated: 'cambio', status_changed: 'cambio de estado', cancelled: 'cancelación', closed: 'cierre', opened: 'apertura',
  revoked: 'revocación', role_changed: 'cambio de rol', activated: 'activación', deactivated: 'desactivación', blocked: 'bloqueo',
  retired: 'retiro', confirmed: 'confirmación', no_show: 'no llegó', arrived: 'llegada', checked_in: 'sentada', rotated: 'rotación',
  reopened: 'reapertura', paid: 'pago', resolved: 'resolución', retried: 'reintento', reprinted: 'reimpresión', requested: 'solicitud',
  expired: 'vencimiento', applied: 'aplicación', received: 'entrada', routes_changed: 'cambio de estaciones',
  availability_changed: 'cambio de disponibilidad', qr_rotated: 'QR nuevo', cleaned: 'limpieza', units_moved: 'platillos movidos',
  reassigned: 'reasignación', unknown: 'sin confirmar', enrolled: 'alta', anonymized: 'anonimización', login: 'inicio de sesión',
  logout: 'cierre de sesión', login_locked: 'bloqueo por intentos', granted: 'autorizada', denied: 'negada', installed: 'instalación',
  password_changed: 'cambio de contraseña', password_reset_requested: 'recuperación de contraseña',
  password_setup_link_created: 'enlace de contraseña', sessions_revoked: 'sesiones cerradas', uuid_adopted: 'adopción',
  fiscal_issuer_changed: 'cambio de emisor', movement_created: 'movimiento', lines_replaced: 'conteo capturado', replanned: 'replaneada',
  lookup_failed: 'búsqueda fallida', cancellation_requested: 'cancelación solicitada', reconcile_requested: 'conciliación solicitada',
  superseded: 'reemplazada',
}

/** "product.status_changed" → "Producto: cambio de estado". Un código desconocido se muestra tal cual. */
export function actionText(action) {
  const [entity, verb] = String(action ?? '').split('.', 2)
  if (!verb) return action ?? ''
  const e = ENTITY_LABELS[entity] ?? entity
  return `${e}: ${VERBS[verb] ?? verb.replace(/_/g, ' ')}`
}

/** Cambios para mostrar: { campo: [antes, después] } si vienen como before/after, o la lista plana. */
export function changeLines(changes) {
  if (!changes || typeof changes !== 'object') return []
  const show = (v) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v))
  if (changes.before || changes.after) {
    const keys = [...new Set([...Object.keys(changes.before ?? {}), ...Object.keys(changes.after ?? {})])]
    return keys.map((k) => ({ field: k, text: `${show(changes.before?.[k])} → ${show(changes.after?.[k])}` }))
  }
  return Object.entries(changes).map(([k, v]) => ({ field: k, text: show(v) }))
}

export function auditApi(api = defaultApi) {
  return {
    search(b, { from, to, entityType, actorId, page = 1 }) {
      const q = new URLSearchParams({ from, to, page: String(page), perPage: '50' })
      if (entityType) q.set('entityType', entityType)
      if (actorId) q.set('actorId', actorId)
      return api.get(`/branches/${encodeURIComponent(b)}/audit-log?${q}`)
    },
    async people(b) {
      try {
        const r = await api.get(`/branches/${encodeURIComponent(b)}/members?page=1&perPage=100`)
        return r.data.map((m) => ({ id: m.user.id, name: m.user.name }))
      } catch {
        return []
      }
    },
  }
}
