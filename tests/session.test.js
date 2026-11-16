import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError } from '../src/lib/api.js'
import { loginErrorText, useSession } from '../src/stores/session.js'

describe('useSession', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('guarda usuario y permisos por sucursal al entrar', async () => {
    const api = {
      post: vi.fn(async () => ({
        data: {
          user: { id: 'u1', name: 'Gerente', email: 'gerente@demo.mx' },
          memberships: [{ branch: { id: 'b1', name: 'Centro' }, role: 'MANAGER', permissions: ['cash.read'] }],
        },
      })),
    }
    const session = useSession()

    expect(await session.login(' gerente@demo.mx ', 'secreta', api)).toBe(true)

    expect(api.post).toHaveBeenCalledWith('/auth/login', { email: 'gerente@demo.mx', password: 'secreta' })
    expect(session.signedIn).toBe(true)
    expect(session.can('b1', 'cash.read')).toBe(true)
    expect(session.can('b1', 'members.manage')).toBe(false)
    expect(session.can('b2', 'cash.read')).toBe(false)
  })

  it('un rechazo deja un mensaje claro y no inicia sesión', async () => {
    const api = { post: vi.fn(async () => { throw new ApiError(422, { error: { code: 'AUTHENTICATION_INVALID', message: 'x' } }) }) }
    const session = useSession()

    expect(await session.login('a@b.mx', 'mala', api)).toBe(false)

    expect(session.signedIn).toBe(false)
    expect(session.error).toBe('Correo o contraseña incorrectos.')
    expect(session.submitting).toBe(false)
  })
})

describe('loginErrorText', () => {
  it('traduce red, límite de intentos y fallas del servidor', () => {
    expect(loginErrorText(new ApiError(0, null))).toBe('No hay conexión con el servidor.')
    expect(loginErrorText(new ApiError(429, null))).toBe('Demasiados intentos. Espera un momento.')
    expect(loginErrorText(new ApiError(503, null))).toBe('El servidor tuvo un problema. Intenta de nuevo.')
  })
})
