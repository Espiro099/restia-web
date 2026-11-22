import { api as defaultApi } from './client.js'
import { catalogErrorText } from './catalog.js'

// Clientes de la sucursal (CU-1 a CU-4 en restia-api). Teléfono y correo van cifrados en la API; aquí solo
// se muestran a quien tiene customers.read. Anonimizar borra los datos personales y no se deshace.

/**
 * Teléfono al formato internacional que pide la API (+52…). Diez dígitos se toman como México; con + se
 * respeta el país. Devuelve '' si no parece un teléfono.
 */
export function normalizePhone(text) {
  const raw = String(text ?? '').trim()
  const digits = raw.replace(/\D/g, '')
  if (raw.startsWith('+')) return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : ''
  if (digits.length === 10) return `+52${digits}`
  if (digits.length === 12 && digits.startsWith('52')) return `+${digits}`
  return ''
}

/** Búsqueda: si parece teléfono, por teléfono; si no, por nombre (2 letras o más). */
export function searchQuery(text) {
  const t = String(text ?? '').trim()
  const phone = /^[+\d\s()-]{8,}$/.test(t) ? normalizePhone(t) : ''
  if (phone) return { phone }
  return t.length >= 2 ? { name: t } : null
}

export function phoneText(phone) {
  const m = /^\+52(\d{2})(\d{4})(\d{4})$/.exec(phone ?? '')
  return m ? `${m[1]} ${m[2]} ${m[3]}` : (phone ?? '')
}

/** "mesa junto a la ventana, sin cebolla" → ['mesa junto a la ventana', 'sin cebolla'] */
export function splitPreferences(text) {
  return String(text ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50).map((s) => s.slice(0, 60))
}

export function customersErrorText(error) {
  if (error?.code === 'CUSTOMER_ANONYMIZED') return 'Este cliente fue anonimizado: ya no tiene datos que editar.'
  return catalogErrorText(error)
}

const ifMatch = (version) => ({ headers: { 'If-Match': `"${version}"` } })

export function customersApi(api = defaultApi) {
  const at = (b, path = '') => `/branches/${encodeURIComponent(b)}/customers${path}`
  return {
    search: (b, query, page = 1) => api.post(`${at(b, '/search')}?page=${page}&perPage=25`, query),
    create: (b, body) => api.post(at(b), body, { headers: { 'Idempotency-Key': globalThis.crypto.randomUUID() } }),
    update: (b, c, changes) => api.patch(at(b, `/${c.id}`), changes, ifMatch(c.version)),
    anonymize: (b, c, reason) => api.post(at(b, `/${c.id}/anonymize`), { reason: reason.trim() }, ifMatch(c.version)),
  }
}
