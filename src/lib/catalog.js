import { api as defaultApi } from './client.js'
import { errorText } from './errors.js'
import { parseAmount } from './money.js'

// Menú de la sucursal (Decisiones_Menu en restia-api): productos, estaciones de preparación y modificadores.
// Un producto nace INACTIVE y solo se activa con al menos una estación activa en sus rutas (M-2).

export const CURRENCY = 'MXN'
/** Valores fiscales de un platillo de restaurante, los mismos de restia:demo. */
export const FISCAL_DEFAULTS = { satProductCode: '90101501', satUnitCode: 'E48', taxObject: '02', taxRate: '0.160000' }
export const CODE_PATTERN = /^[A-Z0-9_-]{2,32}$/

const ifMatch = (version) => ({ headers: { 'If-Match': `"${version}"` } })

/** Código en mayúsculas sin espacios, como lo pide la API. */
export function normalizeCode(text) {
  return String(text ?? '').trim().toUpperCase().replace(/\s+/g, '-')
}

export function money(text) {
  const amount = parseAmount(text)
  return amount === null ? null : { amount, currency: CURRENCY }
}

/** Cuántas opciones se eligen, en palabras. */
export function selectionRule(m) {
  if (m.minSelections === 0 && m.maxSelections === 1) return 'Opcional, una'
  if (m.minSelections === 0) return `Opcional, hasta ${m.maxSelections}`
  if (m.minSelections === m.maxSelections) return `Obligatorio, ${m.minSelections}`
  return `Elige de ${m.minSelections} a ${m.maxSelections}`
}

/** Precio extra de una opción: "+$15.00", "−$5.00" o '' si no cambia el precio. */
export function formatDelta(priceDelta) {
  const value = Number(priceDelta?.amount)
  if (!Number.isFinite(value) || value === 0) return ''
  const text = Math.abs(value).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${value < 0 ? '−' : '+'}$${text}`
}

/** Productos agrupados por categoría, en el orden que ya trae la API (categoría, orden, nombre). */
export function byCategory(products) {
  const groups = new Map()
  for (const p of products) {
    if (!groups.has(p.category)) groups.set(p.category, [])
    groups.get(p.category).push(p)
  }
  return [...groups].map(([category, items]) => ({ category, items }))
}

/** ¿Tiene alguna estación activa? Sin ella la API no deja activarlo (PRODUCT_NOT_SELLABLE). */
export function hasActiveRoute(product, stations) {
  const active = new Set(stations.filter((s) => s.status === 'ACTIVE').map((s) => s.id))
  return (product.routes ?? []).some((r) => active.has(r.stationId))
}

const MESSAGES = {
  CATALOG_CODE_TAKEN: 'Ya existe otro con ese código en la sucursal.',
  PRODUCT_NOT_SELLABLE: 'Asígnale al menos una estación activa antes de activarlo.',
  STATION_IN_USE: 'La estación tiene pedidos pendientes o es la única estación de algún producto.',
  VERSION_CONFLICT: 'Alguien más lo cambió mientras lo editabas. Se recargó el menú; intenta de nuevo.',
}

export function catalogErrorText(error) {
  if (MESSAGES[error?.code]) return MESSAGES[error.code]
  // 422: el primer mensaje de campo es más útil que el genérico.
  const fields = error?.details?.fields
  if (error?.status === 422 && fields) {
    const first = Object.values(fields).flat()[0]
    if (first) return first
  }
  return errorText(error)
}

/** Llamadas del menú. `api` inyectable para las pruebas. */
export function catalogApi(api = defaultApi) {
  const at = (branchId, path) => `/branches/${encodeURIComponent(branchId)}/${path}`

  /** Todas las páginas: un menú no pasa de unos cientos de registros. */
  async function all(branchId, path) {
    const rows = []
    for (let page = 1; page <= 20; page++) {
      const r = await api.get(`${at(branchId, path)}?page=${page}&perPage=100`)
      rows.push(...r.data)
      const total = r.meta?.pagination?.total ?? rows.length
      if (rows.length >= total || r.data.length === 0) break
    }
    return rows
  }

  const status = (branchId, path, item, value, reason) =>
    api.post(at(branchId, `${path}/${item.id}/status`), { status: value, reason: reason.trim() }, ifMatch(item.version))

  return {
    products: (branchId) => all(branchId, 'products'),
    stations: (branchId) => all(branchId, 'stations'),
    modifiers: (branchId) => all(branchId, 'modifiers'),

    createProduct: (branchId, body) => api.post(at(branchId, 'products'), body),
    updateProduct: (branchId, p, changes) => api.patch(at(branchId, `products/${p.id}`), changes, ifMatch(p.version)),
    productStatus: (branchId, p, value, reason) => status(branchId, 'products', p, value, reason),
    availability: (branchId, p, value) => api.post(at(branchId, `products/${p.id}/availability`), { availability: value }),
    routes: (branchId, p, routes) => api.put(at(branchId, `products/${p.id}/routes`), { routes }, ifMatch(p.version)),

    createStation: (branchId, body) => api.post(at(branchId, 'stations'), body),
    updateStation: (branchId, s, changes) => api.patch(at(branchId, `stations/${s.id}`), changes, ifMatch(s.version)),
    stationStatus: (branchId, s, value, reason) => status(branchId, 'stations', s, value, reason),

    createModifier: (branchId, body) => api.post(at(branchId, 'modifiers'), body),
    updateModifier: (branchId, m, changes) => api.patch(at(branchId, `modifiers/${m.id}`), changes, ifMatch(m.version)),
    modifierStatus: (branchId, m, value, reason) => status(branchId, 'modifiers', m, value, reason),
  }
}
