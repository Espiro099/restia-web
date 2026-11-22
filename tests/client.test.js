import { afterEach, describe, expect, it, vi } from 'vitest'

// El cliente compartido avisa del 401 de una petición con sesión, pero no del login ni de /auth/me.
describe('cliente compartido', () => {
  afterEach(() => vi.unstubAllGlobals())

  async function load(status) {
    vi.resetModules()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: status < 300, status, json: async () => ({ error: { code: 'X' } }) })))
    return import('../src/lib/client.js')
  }

  it('un 401 en un módulo avisa una vez y propaga el error', async () => {
    const { api, setUnauthorizedHandler } = await load(401)
    const handler = vi.fn()
    setUnauthorizedHandler(handler)

    await expect(api.get('/branches/b1/members')).rejects.toMatchObject({ status: 401 })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('el 401 de /auth/me no cuenta como sesión vencida', async () => {
    const { api, setUnauthorizedHandler } = await load(401)
    const handler = vi.fn()
    setUnauthorizedHandler(handler)

    await expect(api.get('/auth/me')).rejects.toMatchObject({ status: 401 })
    expect(handler).not.toHaveBeenCalled()
  })

  it('otros errores no avisan', async () => {
    const { api, setUnauthorizedHandler } = await load(403)
    const handler = vi.fn()
    setUnauthorizedHandler(handler)

    await expect(api.get('/branches/b1/members')).rejects.toMatchObject({ status: 403 })
    expect(handler).not.toHaveBeenCalled()
  })
})
