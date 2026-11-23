import { api as defaultApi } from './client.js'
import { catalogErrorText } from './catalog.js'

// Inventario (restia-api: Ingredients, Movements, Receipts, Counts y Recipes). Las existencias bajan solas
// cuando cocina empieza un platillo con receta; aquí se dan de alta insumos, se registran entradas, mermas,
// ajustes y conteos, y se publican recetas.

export const UNITS = { G: 'g', KG: 'kg', ML: 'ml', L: 'l', PIECE: 'pza' }
export const UNIT_NAMES = { G: 'Gramos', KG: 'Kilos', ML: 'Mililitros', L: 'Litros', PIECE: 'Piezas' }
export const MOVEMENT_TYPES = {
  CONSUMPTION: 'Consumo', RECEIPT: 'Entrada', ADJUSTMENT: 'Ajuste', WASTE: 'Merma', COUNT_ADJUSTMENT: 'Por conteo',
}
export const COUNT_STATUS = { OPEN: { label: 'Abierto', tone: 'accent' }, APPLIED: { label: 'Aplicado', tone: '' }, CANCELLED: { label: 'Cancelado', tone: 'muted' } }

/** Cantidad como la pide la API: hasta 4 decimales, sin signo. '' si no es válida. */
export function quantity(text, { signed = false } = {}) {
  const t = String(text ?? '').trim().replace(',', '.')
  const re = signed ? /^-?\d{1,9}(\.\d{1,4})?$/ : /^\d{1,9}(\.\d{1,4})?$/
  return re.test(t) ? t : ''
}

/** "1.5000" kg → "1.5 kg". */
export function qtyText(value, unit) {
  const n = Number(value)
  if (!Number.isFinite(n)) return value ?? ''
  return `${n.toLocaleString('es-MX', { maximumFractionDigits: 4 })} ${UNITS[unit] ?? ''}`.trim()
}

/**
 * La existencia la suma la API en segundo plano: `stockAsOf` es la hora hasta la que ya está todo sumado.
 * Si quedó atrás de la consulta, hay movimientos por sumar.
 */
export function stockPending(i, now = Date.now()) {
  return !!i.stockAsOf && now - new Date(i.stockAsOf).getTime() > 15_000
}

export function belowMinimum(i) {
  return Number(i.stock) < Number(i.minStock)
}

const MESSAGES = {
  INGREDIENT_IN_USE: 'Una receta vigente usa este insumo. Quítalo de la receta antes de desactivarlo.',
  INVENTORY_BLOCKED_FOOD_SAFETY: 'El insumo está bloqueado por seguridad alimentaria.',
  INVENTORY_COUNT_ALREADY_OPEN: 'Ya hay un conteo abierto. Termínalo o cancélalo antes de abrir otro.',
  INVENTORY_COUNT_INVALID_STATE: 'El conteo cambió de estado. Se recargó la lista.',
  INVENTORY_INSUFFICIENT: 'No hay existencia suficiente para esa salida.',
}

export function inventoryErrorText(error) {
  return MESSAGES[error?.code] ?? catalogErrorText(error)
}

export function inventoryApi(api = defaultApi) {
  const at = (b, path) => `/branches/${encodeURIComponent(b)}/${path}`
  const key = () => ({ 'Idempotency-Key': globalThis.crypto.randomUUID() })
  const ifMatch = (version) => ({ 'If-Match': `"${version}"` })
  async function all(b, path) {
    const rows = []
    for (let page = 1; page <= 20; page++) {
      const r = await api.get(`${at(b, path)}${path.includes('?') ? '&' : '?'}page=${page}&perPage=100`)
      rows.push(...r.data)
      if (rows.length >= (r.meta?.pagination?.total ?? rows.length) || !r.data.length) break
    }
    return rows
  }
  return {
    ingredients: (b) => all(b, 'ingredients'),
    createIngredient: (b, body) => api.post(at(b, 'ingredients'), body),
    updateIngredient: (b, i, changes) => api.patch(at(b, `ingredients/${i.id}`), changes, { headers: ifMatch(i.version) }),
    ingredientStatus: (b, i, status, reason) => api.post(at(b, `ingredients/${i.id}/status`), { status, reason: reason.trim() }, { headers: ifMatch(i.version) }),
    foodSafety: (b, i, blocked, reason) => api.post(at(b, `ingredients/${i.id}/food-safety`), { blocked, reason: reason.trim() }),

    movements(b, { ingredientId, type, page = 1 } = {}) {
      const q = new URLSearchParams({ page: String(page), perPage: '50' })
      if (ingredientId) q.set('ingredientId', ingredientId)
      if (type) q.set('type', type)
      return api.get(`${at(b, 'inventory-movements')}?${q}`)
    },
    createMovement: (b, body) => api.post(at(b, 'inventory-movements'), body, { headers: key() }),

    receipts: (b, page = 1) => api.get(`${at(b, 'inventory-receipts')}?page=${page}&perPage=25`),
    createReceipt: (b, body) => api.post(at(b, 'inventory-receipts'), body, { headers: key() }),

    counts: (b) => api.get(`${at(b, 'inventory-counts')}?page=1&perPage=25`).then((r) => r.data),
    openCount: (b, notes) => api.post(at(b, 'inventory-counts'), notes ? { notes } : {}, { headers: key() }),
    saveCountLines: (b, c, lines) => api.put(at(b, `inventory-counts/${c.id}/lines`), { lines }, { headers: ifMatch(c.version) }),
    applyCount: (b, c) => api.post(at(b, `inventory-counts/${c.id}/apply`), {}, { headers: { ...key(), ...ifMatch(c.version) } }),
    cancelCount: (b, c, reason) => api.post(at(b, `inventory-counts/${c.id}/cancel`), { reason: reason.trim() }, { headers: ifMatch(c.version) }),

    products: (b) => all(b, 'products'),
    recipes: (b, p) => api.get(`${at(b, `products/${p.id}/recipes`)}?page=1&perPage=10`).then((r) => r.data),
    publishRecipe: (b, p, items) => api.post(at(b, `products/${p.id}/recipes`), { items }, { headers: ifMatch(p.version) }),
  }
}
