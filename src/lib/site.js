import { API_PREFIX, ApiError } from './api.js'

// Sitio público de La Mesa (Decisiones_Public_Site en restia-api): sucursales en el mapa, solicitudes de
// reserva y asistente. Sin cuenta ni cookies (credentials: 'omit'), para que la sesión de alguien del
// personal en el mismo navegador no se mezcle. La ubicación de la persona solo se usa aquí, en el navegador.

export const MAX_PARTY = 12
export const MAX_DAYS_AHEAD = 60
/** Límites de la conversación con el asistente del sitio (SITE-3). */
export const MAX_TURNS = 16
export const MAX_CHARS = 600

export function siteApi({ fetch: doFetch = globalThis.fetch.bind(globalThis) } = {}) {
  async function request(method, path, { body, headers = {} } = {}) {
    let response
    try {
      response = await doFetch(API_PREFIX + '/public/site' + path, {
        method,
        credentials: 'omit',
        headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
    } catch {
      throw new ApiError(0, null)
    }
    const data = await response.json().catch(() => null)
    if (!response.ok) throw new ApiError(response.status, data)
    return data
  }

  return {
    /** { branches, assistant } */
    branches: async () => {
      const r = await request('GET', '/branches')
      return { branches: r.data, assistant: !!r.meta?.assistant }
    },
    slots: async (code, date, partySize) => (await request('GET', `/branches/${encodeURIComponent(code)}/availability?date=${date}&partySize=${partySize}`)).data.slots,
    /** La misma `key` en un reintento no crea otra solicitud. */
    createRequest: async (body, key) => (await request('POST', '/reservation-requests', { body, headers: { 'Idempotency-Key': key } })).data,
    lookup: async (body) => (await request('POST', '/reservation-requests/lookup', { body })).data,
    /** { reply, reservationDraft } */
    ask: async (messages) => (await request('POST', '/assistant', { body: { messages: conversationForApi(messages) } })).data,
  }
}

/** La conversación como la pide la API: alterna, empieza y termina con el cliente, a lo más MAX_TURNS. */
export function conversationForApi(messages) {
  const clean = messages.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }))
  let list = clean.slice(-MAX_TURNS)
  while (list.length && list[0].role !== 'user') list = list.slice(1)
  return list
}

/** Distancia en km entre dos puntos { lat, lng } (fórmula del haversine). */
export function distanceKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

/**
 * Sucursales con su distancia a la persona, la más cercana primero. Sin ubicación quedan en el orden de la
 * API (por nombre); las que no tienen punto en el mapa van al final.
 */
export function byDistance(branches, user) {
  const list = branches.map((b) => ({ ...b, distanceKm: user && b.location ? distanceKm(user, b.location) : null }))
  if (!user) return list
  return list.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
}

export function distanceText(km) {
  if (km == null) return ''
  if (km < 1) return `a ${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`
  return `a ${km < 10 ? km.toFixed(1) : Math.round(km)} km`
}

const DAY_NAMES = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

/** "Lun a Vie 13:00–22:00 · Sáb y Dom 12:00–23:00": agrupa los días seguidos con el mismo horario. */
export function hoursText(hours) {
  if (!hours?.length) return ''
  const byDay = new Map()
  for (const h of [...hours].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.opensAt.localeCompare(b.opensAt))) {
    byDay.set(h.dayOfWeek, [...(byDay.get(h.dayOfWeek) ?? []), `${h.opensAt}–${h.closesAt}`])
  }
  const groups = []
  for (const [day, ranges] of byDay) {
    const text = ranges.join(', ')
    const last = groups[groups.length - 1]
    if (last && last.text === text && last.to === day - 1) last.to = day
    else groups.push({ from: day, to: day, text })
  }
  return groups.map((g) => {
    const days = g.from === g.to ? DAY_NAMES[g.from] : `${DAY_NAMES[g.from]} ${g.to - g.from === 1 ? 'y' : 'a'} ${DAY_NAMES[g.to]}`
    return `${days} ${g.text}`
  }).join(' · ')
}

/** Fecha local AAAA-MM-DD de hoy más `days`. */
export function localDate(days = 0, now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "sábado 29 de noviembre" */
export function dateText(iso) {
  const [y, m, d] = String(iso).split('-').map(Number)
  if (!y || !m || !d) return iso ?? ''
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function phoneDigits(text) {
  return String(text ?? '').replace(/\D/g, '')
}

/** Qué le falta a la solicitud; '' si está lista para enviarse. */
export function requestProblem(form) {
  if (!form.branchCode) return 'Elige la sucursal.'
  if (!form.date) return 'Elige el día.'
  if (!form.time) return 'Elige la hora.'
  if (!(form.partySize >= 1 && form.partySize <= MAX_PARTY)) return `Para más de ${MAX_PARTY} personas, llama a la sucursal.`
  if (form.name.trim().length < 2) return 'Escribe tu nombre.'
  if (phoneDigits(form.phone).length !== 10) return 'Escribe tu teléfono a 10 dígitos.'
  return ''
}

export const REQUEST_STATUS = {
  PENDING: 'Pendiente: la sucursal la confirmará contigo',
  CONFIRMED: 'Confirmada',
  ARRIVED_WAITING: 'Ya llegaste',
  CHECKED_IN: 'En tu mesa',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
  NO_SHOW: 'No se presentó',
}

export function requestErrorText(error) {
  if (error?.code === 'NETWORK') return 'No hay conexión. Revisa tu internet e intenta de nuevo.'
  if (error?.code === 'RESERVATION_NOT_AVAILABLE') return 'Ese horario ya no está disponible. Elige otro.'
  if (error?.code === 'RESERVATION_ACTIVE_LIMIT_EXCEEDED') return 'Ese teléfono ya tiene dos reservas activas en esta sucursal. Llama si necesitas otra.'
  if (error?.status === 429) return 'Hiciste varios intentos seguidos. Espera un minuto y vuelve a intentar.'
  if (error?.status === 404) return 'No encontramos una solicitud con ese folio y teléfono.'
  if (error?.status === 422) return error.fieldMessage?.('phone') ?? error.fieldMessage?.('date') ?? 'Revisa los datos de la solicitud.'
  return 'No pudimos enviar tu solicitud. Intenta de nuevo en un momento.'
}

export function siteAssistantErrorText(error) {
  if (error?.code === 'NETWORK') return 'No hay conexión. Revisa tu internet e intenta de nuevo.'
  if (error?.status === 429) return 'Hiciste varias preguntas seguidas. Espera un minuto y vuelve a intentar.'
  if (error?.status === 503 || error?.code === 'SERVICE_BUSY') return 'El asistente no está disponible ahorita. Puedes reservar con el formulario o llamar a la sucursal.'
  return 'No pude responder. Intenta de nuevo en un momento.'
}

/** UUID para Idempotency-Key. */
export function newKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/** Enlace de llamada a partir del teléfono de la sucursal (solo dígitos y +). */
export function telHref(phone) {
  const digits = String(phone ?? '').replace(/[^\d+]/g, '')
  return digits.length >= 7 ? `tel:${digits}` : ''
}
