import { api as defaultApi } from './client.js'
import { catalogErrorText } from './catalog.js'

// Impresión (Decisiones_Printing en restia-api). La cadena es: identidad de servicio → agente (programa en
// una computadora del local) → impresoras que ese agente maneja → rutas que dicen qué documentos van a qué
// impresora → trabajos.

export const JOB_TYPES = {
  KITCHEN_TICKET: 'Comanda de cocina',
  VOID_NOTICE: 'Aviso de cancelación',
  PRE_CHECK: 'Precuenta',
  PAYMENT_RECEIPT: 'Recibo de pago',
  CASH_SHIFT_REPORT: 'Corte de caja',
  TEST: 'Prueba',
}
/** Solo estos dos van ligados a una estación de preparación (PrintStation::STATION_TYPES). */
export const STATION_JOB_TYPES = ['KITCHEN_TICKET', 'VOID_NOTICE']

export const JOB_STATUS = {
  PENDING: { label: 'En cola', tone: 'accent' },
  CLAIMED: { label: 'Tomado por el agente', tone: 'accent' },
  PRINTING: { label: 'Imprimiendo', tone: 'accent' },
  PRINTED: { label: 'Impreso', tone: '' },
  FAILED: { label: 'Falló', tone: 'warn' },
  UNKNOWN: { label: 'Sin confirmar', tone: 'warn' },
  CANCELLED: { label: 'Cancelado', tone: 'muted' },
}

/** Qué se puede hacer con un trabajo según su estado (PrintJobs::retry/resolve/cancel/reprint). */
export function jobActions(job, perms) {
  const s = job.status
  return {
    retry: perms.resolve && s === 'FAILED',
    resolve: perms.resolve && s === 'UNKNOWN',
    cancel: perms.resolve && ['PENDING', 'FAILED', 'UNKNOWN'].includes(s),
    reprint: perms.reprint && ['PRINTED', 'UNKNOWN'].includes(s) && job.type !== 'TEST',
  }
}

export function connectionText(c) {
  if (!c) return ''
  return c.type === 'NETWORK' ? `Red · ${c.host}:${c.port}` : `USB · ${c.localName}`
}

/** Un agente se considera en línea si reportó en los últimos 2 minutos (manda latido cada pocos segundos). */
export function agentOnline(agent, now = Date.now()) {
  return agent.status === 'ACTIVE' && !!agent.lastSeenAt && now - new Date(agent.lastSeenAt).getTime() < 120_000
}

const MESSAGES = {
  PRINTER_HAS_ACTIVE_JOBS: 'La impresora tiene trabajos en curso. Espera a que terminen o cancélalos.',
  PRINTER_INACTIVE: 'La impresora está inactiva.',
  PRINT_AGENT_INACTIVE: 'El agente está inactivo.',
  PRINT_JOB_INVALID_STATE: 'El trabajo cambió de estado. Se recargó la lista.',
  PRINT_JOB_UNKNOWN: 'No se sabe si salió impreso: primero indica si salió o no.',
  PRINT_ROUTE_NOT_CONFIGURED: 'No hay una ruta activa para ese documento.',
}

export function printingErrorText(error) {
  return MESSAGES[error?.code] ?? catalogErrorText(error)
}

const ifMatch = (version) => ({ 'If-Match': `"${version}"` })
const newKey = () => globalThis.crypto.randomUUID()

export function printingApi(api = defaultApi) {
  const at = (branchId, path) => `/branches/${encodeURIComponent(branchId)}/${path}`

  async function all(branchId, path) {
    const rows = []
    for (let page = 1; page <= 20; page++) {
      const r = await api.get(`${at(branchId, path)}${path.includes('?') ? '&' : '?'}page=${page}&perPage=100`)
      rows.push(...r.data)
      if (rows.length >= (r.meta?.pagination?.total ?? rows.length) || !r.data.length) break
    }
    return rows
  }

  const status = (branchId, path, item, value, reason) =>
    api.post(at(branchId, `${path}/${item.id}/status`), { status: value, reason: reason.trim() }, { headers: ifMatch(item.version) })

  return {
    printers: (b) => all(b, 'printers'),
    routes: (b) => all(b, 'print-stations'),
    agents: (b) => all(b, 'print-agents'),
    stations: (b) => all(b, 'stations'),
    /** Una página de trabajos, los más recientes primero. */
    jobs: (b, { status: s, type, page = 1 } = {}) => {
      const q = new URLSearchParams({ page: String(page), perPage: '50' })
      if (s) q.set('status', s)
      if (type) q.set('type', type)
      return api.get(`${at(b, 'print-jobs')}?${q}`)
    },

    createPrinter: (b, body) => api.post(at(b, 'printers'), body),
    updatePrinter: (b, p, changes) => api.patch(at(b, `printers/${p.id}`), changes, { headers: ifMatch(p.version) }),
    printerStatus: (b, p, value, reason) => status(b, 'printers', p, value, reason),
    testPrint: (b, p) => api.post(at(b, 'print-jobs'), { type: 'TEST', sourceId: p.id }, { headers: { 'Idempotency-Key': newKey() } }),

    createRoute: (b, body) => api.post(at(b, 'print-stations'), body),
    updateRoute: (b, r, changes) => api.patch(at(b, `print-stations/${r.id}`), changes, { headers: ifMatch(r.version) }),
    routeStatus: (b, r, value, reason) => status(b, 'print-stations', r, value, reason),

    /** Identidad de servicio para el agente: el token se muestra una sola vez. Solo ADMIN. */
    createIdentity: (b, name) => api.post('/service-identities', { name, type: 'PRINTING_AGENT', branchIds: [b] }),
    createAgent: (b, serviceIdentityId, name) => api.post(at(b, 'print-agents'), { serviceIdentityId, name }),
    agentStatus: (b, a, value, reason) => status(b, 'print-agents', a, value, reason),

    retry: (b, j) => api.post(at(b, `print-jobs/${j.id}/retry`), {}, { headers: ifMatch(j.version) }),
    resolve: (b, j, outcome, reason) => api.post(at(b, `print-jobs/${j.id}/resolve`), { outcome, reason: reason.trim() }, { headers: ifMatch(j.version) }),
    cancel: (b, j, reason) => api.post(at(b, `print-jobs/${j.id}/cancel`), { reason: reason.trim() }, { headers: ifMatch(j.version) }),
    reprint: (b, j, reason) => api.post(at(b, `print-jobs/${j.id}/reprint`), { reason: reason.trim() }, { headers: { 'Idempotency-Key': newKey() } }),
  }
}
