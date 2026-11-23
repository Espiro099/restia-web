import { API_PREFIX } from './api.js'
import { api as defaultApi } from './client.js'
import { catalogErrorText } from './catalog.js'

// Facturación CFDI 4.0 (Decisiones_Fiscal en restia-api). Una factura nominativa nace en borrador desde una
// cuenta pagada, se timbra de forma asíncrona (202) y se cancela con un motivo del SAT. El emisor y su CSD
// los configura administración.

export const INVOICE_STATUS = {
  DRAFT: { label: 'Borrador', tone: 'muted' },
  DISCARDED: { label: 'Descartada', tone: 'muted' },
  PENDING_STAMP: { label: 'Por timbrar', tone: 'accent' },
  STAMPING: { label: 'Timbrando', tone: 'accent' },
  STAMPED: { label: 'Timbrada', tone: '' },
  STAMP_FAILED: { label: 'Timbrado rechazado', tone: 'warn' },
  CANCELLATION_REQUESTED: { label: 'Cancelación solicitada', tone: 'accent' },
  CANCELLATION_IN_PROGRESS: { label: 'Cancelando', tone: 'accent' },
  CANCELLED: { label: 'Cancelada', tone: 'muted' },
  CANCELLATION_REJECTED: { label: 'Cancelación rechazada', tone: 'warn' },
  UNKNOWN: { label: 'Sin confirmar', tone: 'warn' },
}

/** Regímenes fiscales del SAT (c_RegimenFiscal) más comunes. */
export const TAX_REGIMES = {
  601: 'General de Ley Personas Morales', 603: 'Personas Morales con Fines no Lucrativos', 605: 'Sueldos y Salarios',
  606: 'Arrendamiento', 608: 'Demás ingresos', 612: 'Personas Físicas con Actividades Empresariales y Profesionales',
  616: 'Sin obligaciones fiscales', 621: 'Incorporación Fiscal', 625: 'Plataformas Tecnológicas', 626: 'Régimen Simplificado de Confianza',
}

/** Usos del CFDI más comunes en un restaurante. */
export const CFDI_USES = {
  G03: 'Gastos en general', G01: 'Adquisición de mercancías', S01: 'Sin efectos fiscales', CP01: 'Pagos',
}

/** Motivos de cancelación del SAT. El 01 exige una factura que la sustituya, ya timbrada. */
export const CANCEL_REASONS = {
  '01': 'Comprobante emitido con errores con relación',
  '02': 'Comprobante emitido con errores sin relación',
  '03': 'No se llevó a cabo la operación',
  '04': 'Operación nominativa relacionada en una factura global',
}

export const PERIODICITIES = { DAILY: 'Diaria', WEEKLY: 'Semanal', BIWEEKLY: 'Quincenal', MONTHLY: 'Mensual', BIMONTHLY: 'Bimestral' }

/** Periodos sugeridos para la factura global, terminando antes de hoy. La API valida contra la periodicidad. */
export function globalPeriods(today = new Date()) {
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const y = today.getFullYear()
  const m = today.getMonth()
  const d = today.getDate()
  const yesterday = new Date(y, m, d - 1)
  // Semana pasada de lunes a domingo, recortada al mes del domingo (la global semanal no cruza meses).
  const lastSunday = new Date(y, m, d - (today.getDay() || 7))
  const monday = new Date(lastSunday.getFullYear(), lastSunday.getMonth(), lastSunday.getDate() - 6)
  const weekStart = monday.getMonth() === lastSunday.getMonth() ? monday : new Date(lastSunday.getFullYear(), lastSunday.getMonth(), 1)
  return [
    { key: 'day', label: 'Ayer', from: iso(yesterday), to: iso(yesterday) },
    { key: 'week', label: 'Semana pasada', from: iso(weekStart), to: iso(lastSunday) },
    { key: 'month', label: 'Mes pasado', from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) },
  ]
}

export const RFC_PATTERN = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/u

/** Qué se ofrece según el estado (Invoice::EDITABLE y CANCELLABLE). */
export function invoiceActions(inv, perms) {
  const editable = ['DRAFT', 'STAMP_FAILED'].includes(inv.status)
  return {
    edit: perms.create && editable,
    discard: perms.create && editable,
    stamp: perms.stamp && editable,
    cancel: perms.cancel && ['STAMPED', 'CANCELLATION_REJECTED'].includes(inv.status),
    reconcile: perms.reconcile && inv.status === 'UNKNOWN',
    files: ['STAMPED', 'CANCELLATION_REQUESTED', 'CANCELLATION_IN_PROGRESS', 'CANCELLED', 'CANCELLATION_REJECTED'].includes(inv.status),
  }
}

/** Problema del receptor capturado, o ''. */
export function receiverProblem(r) {
  if (!RFC_PATTERN.test(r.rfc ?? '')) return 'Revisa el RFC: 12 o 13 caracteres en mayúsculas.'
  if (!r.legalName?.trim()) return 'Falta el nombre o razón social, tal como aparece en la constancia fiscal.'
  if (!/^[0-9]{3}$/.test(r.taxRegime ?? '')) return 'Elige el régimen fiscal.'
  if (!/^[0-9]{5}$/.test(r.postalCode ?? '')) return 'El código postal fiscal lleva 5 dígitos.'
  if (!/^[A-Z0-9]{3,4}$/.test(r.cfdiUse ?? '')) return 'Elige el uso del CFDI.'
  return ''
}

const MESSAGES = {
  FISCAL_ISSUER_NOT_CONFIGURED: 'La sucursal no tiene un emisor activo con CSD vigente. Pide a un administrador que lo configure.',
  FISCAL_ISSUER_RFC_TAKEN: 'Ya existe un emisor con ese RFC.',
  FISCAL_OPERATION_FAILED: 'El PAC rechazó la operación. Revisa el motivo en el detalle.',
  FISCAL_STATUS_UNKNOWN: 'No se sabe el resultado; usa "Consultar estado" en unos minutos.',
  CSD_INVALID: 'El certificado, la llave o la contraseña no son válidos.',
  INVOICE_CHECK_ALREADY_INVOICED: 'Esa cuenta ya tiene una factura activa.',
  INVOICE_CHECK_IN_STAMPED_GLOBAL: 'Esa cuenta ya está en una factura global timbrada.',
  INVOICE_CHECK_NOT_ELIGIBLE: 'La cuenta todavía no se puede facturar (debe estar pagada).',
  INVOICE_INVALID_STATE: 'La factura cambió de estado. Se recargó la lista.',
  INVOICE_REPLACEMENT_REQUIRED: 'El motivo 01 necesita la factura que la sustituye, ya timbrada.',
  INVOICE_BATCH_EMPTY: 'En ese periodo no hay cuentas pagadas sin factura.',
}

export function invoicesErrorText(error) {
  return MESSAGES[error?.code] ?? catalogErrorText(error)
}

export function invoicesApi(api = defaultApi) {
  const at = (b, path = '') => `/branches/${encodeURIComponent(b)}/invoices${path}`
  const key = () => ({ 'Idempotency-Key': globalThis.crypto.randomUUID() })
  const ifMatch = (version) => ({ 'If-Match': `"${version}"` })
  return {
    list(b, { status, scope, from, to, page = 1 } = {}) {
      const q = new URLSearchParams({ page: String(page), perPage: '25' })
      if (status) q.set('status', status)
      if (scope) q.set('scope', scope)
      if (from) q.set('from', from)
      if (to) q.set('to', to)
      return api.get(`${at(b)}?${q}`)
    },
    get: (b, id) => api.get(at(b, `/${id}`)).then((r) => r.data),
    /** Cuentas pagadas de un día que todavía no tienen factura. */
    async payableChecks(b, businessDate) {
      const r = await api.get(`/branches/${encodeURIComponent(b)}/checks?businessDate=${businessDate}&status=PAID&page=1&perPage=100`)
      return r.data.filter((c) => !c.activeInvoiceId)
    },
    create: (b, checkId, receiver) => api.post(at(b), { checkId, receiver }, { headers: key() }),
    update: (b, inv, receiver) => api.patch(at(b, `/${inv.id}`), { receiver }, { headers: ifMatch(inv.version) }),
    discard: (b, inv, reason) => api.post(at(b, `/${inv.id}/discard`), { reason: reason.trim() }, { headers: ifMatch(inv.version) }),
    stamp: (b, inv) => api.post(at(b, `/${inv.id}/stamp`), {}, { headers: { ...key(), ...ifMatch(inv.version) } }),
    cancel: (b, inv, reasonCode, reason, replacementInvoiceId) => api.post(at(b, `/${inv.id}/cancel`),
      { reasonCode, reason: reason.trim(), ...(replacementInvoiceId ? { replacementInvoiceId } : {}) },
      { headers: { ...key(), ...ifMatch(inv.version) } }),
    reconcile: (b, inv) => api.post(at(b, `/${inv.id}/reconcile`), {}),
    fileUrl: (b, inv, kind) => `${API_PREFIX}${at(b, `/${inv.id}/${kind}`)}`,

    // --- Factura global (F-6, F-7) ---
    batches: (b, page = 1) => api.get(`/branches/${encodeURIComponent(b)}/invoice-batches?page=${page}&perPage=25`),
    createBatch: (b, periodFrom, periodTo) =>
      api.post(`/branches/${encodeURIComponent(b)}/invoice-batches`, { periodFrom, periodTo }, { headers: key() }),
    excludeChecks: (b, batch, checkIds, reason) => api.post(`/branches/${encodeURIComponent(b)}/invoice-batches/${batch.id}/exclude-checks`,
      { checkIds, reason: reason.trim() }, { headers: { ...key(), ...ifMatch(batch.version) } }),
    /** Facturas globales de la sucursal, por id, para mostrar el estado de cada lote. */
    async globalInvoices(b) {
      const r = await api.get(`${at(b)}?scope=GLOBAL&page=1&perPage=100`)
      return new Map(r.data.map((i) => [i.id, i]))
    },
    /** Cuentas de un lote: se buscan día por día en su periodo (máximo dos meses). */
    async batchChecks(b, batch) {
      const ids = new Set(batch.checkIds)
      const days = []
      for (let d = new Date(`${batch.periodFrom}T12:00:00`); d <= new Date(`${batch.periodTo}T12:00:00`); d.setDate(d.getDate() + 1)) {
        days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
      }
      const found = []
      for (let i = 0; i < days.length; i += 6) {
        const chunk = await Promise.all(days.slice(i, i + 6).map((day) =>
          api.get(`/branches/${encodeURIComponent(b)}/checks?businessDate=${day}&page=1&perPage=100`).then((r) => r.data)))
        found.push(...chunk.flat().filter((c) => ids.has(c.id)))
      }
      return found
    },

    // --- Emisores (solo administración) ---
    issuers: () => api.get('/fiscal-issuers?page=1&perPage=100').then((r) => r.data),
    createIssuer: (body) => api.post('/fiscal-issuers', body),
    updateIssuer: (iss, changes) => api.patch(`/fiscal-issuers/${iss.id}`, changes, { headers: ifMatch(iss.version) }),
    issuerStatus: (iss, status, reason) => api.post(`/fiscal-issuers/${iss.id}/status`, { status, reason: reason.trim() }, { headers: ifMatch(iss.version) }),
    uploadCsd(iss, certificate, privateKey, password) {
      const form = new FormData()
      form.append('certificate', certificate)
      form.append('privateKey', privateKey)
      form.append('password', password)
      return api.putForm(`/fiscal-issuers/${iss.id}/csd`, form, { headers: ifMatch(iss.version) })
    },
    /** Asignar el emisor a la sucursal pide la versión de la sucursal, que llega en su ETag. */
    async assignToBranch(b, issuerId) {
      const branch = await api.get(`/branches/${encodeURIComponent(b)}`, { withEtag: true })
      return api.put(`/branches/${encodeURIComponent(b)}/fiscal-issuer`, { fiscalIssuerId: issuerId }, { headers: { 'If-Match': branch.etag } })
    },
  }
}
