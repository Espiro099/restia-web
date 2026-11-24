import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError } from '../src/lib/api.js'
import { GSI_SRC, googleConfig, loadGoogleIdentity } from '../src/lib/google.js'
import { loginErrorText, useSession } from '../src/stores/session.js'
import GoogleSignInButton from '../src/components/GoogleSignInButton.vue'
import { SECURITY_HEADERS } from '../security-headers.js'

const CLIENT = '1234-abc.apps.googleusercontent.com'

function fakeGsi() {
  const gsi = { initialize: vi.fn(), renderButton: vi.fn() }
  return gsi
}

describe('inicio de sesión con Google en el panel', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('lee si está encendido; si la API falla, queda apagado', async () => {
    expect(await googleConfig({ get: async () => ({ data: { enabled: true, clientId: CLIENT } }) })).toEqual({ enabled: true, clientId: CLIENT })
    expect(await googleConfig({ get: async () => ({ data: { enabled: false, clientId: null } }) })).toEqual({ enabled: false, clientId: null })
    expect(await googleConfig({ get: async () => { throw new ApiError(0, null) } })).toEqual({ enabled: false, clientId: null })
  })

  it('carga el script de Google una sola vez', async () => {
    const appended = []
    const win = {}
    const doc = { createElement: () => ({}), head: { appendChild: (s) => { appended.push(s); win.google = { accounts: { id: 'gsi' } }; s.onload() } } }
    expect(await loadGoogleIdentity(doc, win)).toBe('gsi')
    expect(await loadGoogleIdentity(doc, win)).toBe('gsi')
    expect(appended).toHaveLength(1)
    expect(appended[0].src).toBe(GSI_SRC)
  })

  it('dibuja el botón con el ID de cliente y entrega el token', async () => {
    const gsi = fakeGsi()
    const api = { get: vi.fn(async () => ({ data: { enabled: true, clientId: CLIENT } })) }
    const wrapper = mount(GoogleSignInButton, { props: { api, load: async () => gsi }, attachTo: document.body })
    await flushPromises()
    expect(api.get).toHaveBeenCalledWith('/auth/google')
    expect(gsi.initialize.mock.calls[0][0]).toMatchObject({ client_id: CLIENT, ux_mode: 'popup', auto_select: false })
    expect(gsi.renderButton).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.google').isVisible()).toBe(true)
    gsi.initialize.mock.calls[0][0].callback({ credential: 'jwt-de-google' })
    expect(wrapper.emitted('credential')).toEqual([['jwt-de-google']])
    wrapper.unmount()
  })

  it('apagado, o sin script, no muestra nada', async () => {
    const load = vi.fn()
    const off = mount(GoogleSignInButton, { props: { api: { get: async () => ({ data: { enabled: false } }) }, load } })
    await flushPromises()
    expect(load).not.toHaveBeenCalled()
    expect(off.find('.google').isVisible()).toBe(false)

    const broken = mount(GoogleSignInButton, { props: { api: { get: async () => ({ data: { enabled: true, clientId: CLIENT } }) }, load: async () => { throw new Error('gsi') } } })
    await flushPromises()
    expect(broken.find('.google').isVisible()).toBe(false)
  })

  it('la sesión manda el token y explica el rechazo sin hablar de contraseñas', async () => {
    const session = useSession()
    const me = { user: { id: 'u1', name: 'Ana', email: 'ana@demo.mx' }, memberships: [{ branch: { id: 'b1', name: 'Centro' }, role: 'MANAGER', permissions: [] }], session: { id: 's1' } }
    const api = { post: vi.fn(async () => ({ data: me })) }
    expect(await session.loginWithGoogle('jwt-de-google', api)).toBe(true)
    expect(api.post).toHaveBeenCalledWith('/auth/google', { credential: 'jwt-de-google' })

    const failing = { post: vi.fn(async () => { throw new ApiError(401, { error: { code: 'AUTHENTICATION_INVALID' } }) }) }
    session.$reset?.()
    expect(await session.loginWithGoogle('otro', failing)).toBe(false)
    expect(session.error).toMatch(/no está dada de alta/)
    expect(loginErrorText(new ApiError(401, { error: { code: 'AUTHENTICATION_INVALID' } }))).toBe('Correo o contraseña incorrectos.')
  })

  it('la CSP solo abre lo necesario de Google', () => {
    const csp = SECURITY_HEADERS['Content-Security-Policy']
    expect(csp).toContain("script-src 'self' https://accounts.google.com/gsi/client")
    expect(csp).toContain('frame-src https://accounts.google.com/gsi/')
    expect(csp).not.toMatch(/script-src[^;]*\*/)
  })
})
