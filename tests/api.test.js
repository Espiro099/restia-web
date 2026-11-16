import { describe, expect, it, vi } from 'vitest'
import { ApiError, createApi } from '../src/lib/api.js'

function json(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

describe('createApi', () => {
  it('pide la cookie CSRF antes del primer POST y manda el token', async () => {
    let cookie = ''
    const fetch = vi.fn(async (url) => {
      if (url === '/sanctum/csrf-cookie') {
        cookie = 'XSRF-TOKEN=abc%3D%3D'
        return { ok: true, status: 204 }
      }
      return json(200, { data: { ok: true } })
    })
    const api = createApi({ fetch, cookies: () => cookie })

    await api.post('/auth/login', { email: 'gerente@demo.mx', password: 'x' })

    expect(fetch.mock.calls[0][0]).toBe('/sanctum/csrf-cookie')
    const [url, init] = fetch.mock.calls[1]
    expect(url).toBe('/api/v1/auth/login')
    expect(init.credentials).toBe('include')
    expect(init.headers['X-XSRF-TOKEN']).toBe('abc==')
    expect(JSON.parse(init.body)).toEqual({ email: 'gerente@demo.mx', password: 'x' })
  })

  it('no vuelve a pedir la cookie si ya existe, ni la usa en un GET', async () => {
    const fetch = vi.fn(async () => json(200, { data: [] }))
    const api = createApi({ fetch, cookies: () => 'XSRF-TOKEN=t' })

    await api.get('/auth/me')
    await api.post('/auth/logout')

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[0][1].headers['X-XSRF-TOKEN']).toBeUndefined()
    expect(fetch.mock.calls[1][1].headers['X-XSRF-TOKEN']).toBe('t')
  })

  it('convierte el sobre de error del contrato en ApiError', async () => {
    const fetch = vi.fn(async () =>
      json(422, { error: { code: 'VALIDATION_FAILED', message: 'Datos inválidos.', details: { fields: { email: ['El correo no es válido.'] } } } }),
    )
    const api = createApi({ fetch, cookies: () => 'XSRF-TOKEN=t' })

    const error = await api.post('/auth/login', {}).catch((e) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(422)
    expect(error.code).toBe('VALIDATION_FAILED')
    expect(error.fieldMessage('email')).toBe('El correo no es válido.')
  })

  it('una caída de red es un ApiError con código NETWORK', async () => {
    const api = createApi({ fetch: vi.fn(async () => { throw new TypeError('Failed to fetch') }), cookies: () => '' })

    const error = await api.get('/auth/me').catch((e) => e)

    expect(error.code).toBe('NETWORK')
  })
})
