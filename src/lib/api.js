// Cliente HTTP de restia-api para el panel web (D-36, sección 6): sesión con cookie HttpOnly y token
// CSRF. Nunca guarda contraseñas ni tokens en el navegador; la cookie la maneja el propio navegador.

export const API_PREFIX = '/api/v1'

/** Error del contrato: { error: { code, message, details, requestId } }. */
export class ApiError extends Error {
  constructor(status, body) {
    const error = body?.error ?? {}
    super(error.message ?? `Error ${status}`)
    this.status = status
    this.code = error.code ?? (status === 0 ? 'NETWORK' : 'UNEXPECTED')
    this.details = error.details ?? null
    this.requestId = error.requestId ?? null
  }

  /** Mensaje del campo que falló en un 422 (details.fields), si lo hay. */
  fieldMessage(field) {
    const messages = this.details?.fields?.[field]
    return Array.isArray(messages) ? messages[0] : null
  }
}

function readCookie(name, cookies) {
  const hit = cookies.split('; ').find((c) => c.startsWith(`${name}=`))
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * @param {object} options
 * @param {typeof fetch} options.fetch    inyectable para las pruebas
 * @param {() => string} options.cookies   document.cookie por omisión
 */
export function createApi({ fetch: doFetch = globalThis.fetch.bind(globalThis), cookies = () => document.cookie } = {}) {
  /** Pide la cookie XSRF-TOKEN solo si todavía no existe. */
  async function ensureCsrf() {
    if (readCookie('XSRF-TOKEN', cookies())) return
    const response = await doFetch('/sanctum/csrf-cookie', { credentials: 'include' })
    if (!response.ok) throw new ApiError(response.status, null)
  }

  async function request(method, path, { body, headers = {} } = {}) {
    if (MUTATING.has(method)) await ensureCsrf()
    const token = readCookie('XSRF-TOKEN', cookies())
    let response
    try {
      response = await doFetch(API_PREFIX + path, {
        method,
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(token && MUTATING.has(method) ? { 'X-XSRF-TOKEN': token } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
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
    get: (path, options) => request('GET', path, options),
    post: (path, body, options) => request('POST', path, { ...options, body }),
    patch: (path, body, options) => request('PATCH', path, { ...options, body }),
    put: (path, body, options) => request('PUT', path, { ...options, body }),
  }
}
