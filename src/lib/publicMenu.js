import { API_PREFIX, ApiError } from './api.js'

// Menú público del QR (Decisiones_Public_QR en restia-api). El cliente no tiene cuenta: el token del QR,
// que llega en el fragmento de la URL (#token), es la única credencial y viaja en X-QR-Token. Sin cookies,
// para que la sesión de alguien del personal en el mismo navegador no se mezcle.

/** Token del fragmento `#token` de la URL; '' si no hay uno con forma válida. */
export function tokenFromHash(hash) {
  const token = String(hash ?? '').replace(/^#/, '').trim()
  return /^[A-Za-z0-9_-]{16,256}$/.test(token) ? token : ''
}

export function publicMenuApi({ fetch: doFetch = globalThis.fetch.bind(globalThis) } = {}) {
  async function request(method, path, token, body) {
    let response
    try {
      response = await doFetch(API_PREFIX + path, {
        method,
        credentials: 'omit',
        headers: { Accept: 'application/json', 'X-QR-Token': token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
    } catch {
      throw new ApiError(0, null)
    }
    if (response.status === 204) return null
    const data = await response.json().catch(() => null)
    if (!response.ok) throw new ApiError(response.status, data)
    return data
  }

  return {
    context: (token) => request('GET', '/public/context', token),
    menu: (token) => request('GET', '/public/menu', token),
    /** Avisa al personal que alguien abrió el menú en la mesa (posible ocupación). Si falla, no importa. */
    presence: (token) => request('POST', '/public/presence', token).catch(() => null),
  }
}

/** Productos agrupados por categoría, con los modificadores que aplican a cada uno ya resueltos. */
export function menuSections(menu) {
  const modifiers = new Map((menu?.modifiers ?? []).map((m) => [m.id, m]))
  const sections = new Map()
  const products = [...(menu?.products ?? [])].sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name, 'es'))
  for (const p of products) {
    if (!sections.has(p.category)) sections.set(p.category, [])
    sections.get(p.category).push({ ...p, modifiers: (p.modifierIds ?? []).map((id) => modifiers.get(id)).filter(Boolean) })
  }
  return [...sections].map(([category, items]) => ({ category, items, anchor: anchorFor(category) }))
}

/** Recomendaciones del día (M-13), con sus modificadores resueltos, en el orden de la carta. */
export function recommendedOf(menu) {
  return menuSections(menu).flatMap((s) => s.items).filter((p) => p.recommended)
}

/** Id de ancla estable para saltar a una categoría. */
export function anchorFor(category) {
  return 'cat-' + String(category).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function priceText(money) {
  const value = Number(money?.amount)
  if (!Number.isFinite(value)) return ''
  return `$${value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function publicErrorText(error) {
  if (error?.code === 'NETWORK') return 'No hay conexión. Revisa tu internet e intenta de nuevo.'
  if (error?.status === 401 || error?.code === 'QR_TOKEN_INVALID') return 'Este código ya no está disponible. Pide ayuda al personal.'
  if (error?.status === 429) return 'Demasiadas consultas seguidas. Espera un momento.'
  return 'No pudimos cargar el menú. Intenta de nuevo en un momento.'
}
