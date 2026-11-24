import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory } from 'vue-router'
import { ApiError } from '../src/lib/api.js'
import { errorText } from '../src/lib/errors.js'
import { safeReturn } from '../src/lib/navigation.js'
import { guard, makeRouter } from '../src/router.js'
import { useSession } from '../src/stores/session.js'
import App from '../src/App.vue'

const ME = {
  user: { id: 'u1', name: 'Eduardo Espinoza', email: 'e@demo.mx' },
  memberships: [
    { branch: { id: 'b1', name: 'La Mesa Centro' }, role: 'ADMIN', permissions: ['members.read', 'menu.read', 'reports.read'] },
    { branch: { id: 'b2', name: 'La Mesa Norte' }, role: 'WAITER', permissions: ['tables.read'] },
  ],
}

function meApi(response = ME) {
  return {
    get: vi.fn(async () => {
      if (response instanceof Error) throw response
      return { data: response }
    }),
    post: vi.fn(async () => null),
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('sesión', () => {
  it('recupera la sesión de la cookie una sola vez y elige la primera sucursal', async () => {
    const api = meApi()
    const session = useSession()

    expect(await session.restore(api)).toBe(true)
    expect(await session.restore(api)).toBe(true)

    expect(api.get).toHaveBeenCalledTimes(1)
    expect(session.branchId).toBe('b1')
    expect(session.canHere('members.read')).toBe(true)
    expect(session.canHere('tables.read')).toBe(false)
  })

  it('sin cookie (401) no hay usuario y no se vuelve a preguntar', async () => {
    const api = meApi(new ApiError(401, null))
    const session = useSession()

    expect(await session.restore(api)).toBe(false)
    expect(session.signedIn).toBe(false)
    expect(session.restored).toBe(true)
  })

  it('recuerda la sucursal elegida por usuario e ignora una que no es suya', async () => {
    const session = useSession()
    await session.restore(meApi())
    session.selectBranch('b2')
    session.selectBranch('ajena')
    expect(session.branchId).toBe('b2')
    expect(session.canHere('tables.read')).toBe(true)
    // El mesero tiene tables.read para la app, pero el panel es de administración y gerencia.
    expect(session.canOpen('tables.read')).toBe(false)

    setActivePinia(createPinia())
    const again = useSession()
    await again.restore(meApi())
    expect(again.branchId).toBe('b2')
  })

  it('salir cierra la sesión aunque la API falle, y vencer avisa en la pantalla de acceso', async () => {
    const session = useSession()
    await session.restore(meApi())
    const api = { post: vi.fn(async () => { throw new ApiError(401, null) }) }

    await session.logout(api)
    expect(api.post).toHaveBeenCalledWith('/auth/logout')
    expect(session.signedIn).toBe(false)
    expect(session.expired).toBe(false)

    session.adopt(ME)
    session.expire()
    expect(session.signedIn).toBe(false)
    expect(session.expired).toBe(true)
  })
})

describe('guard del router', () => {
  async function signedIn() {
    const session = useSession()
    await session.restore(meApi())
    return session
  }

  it('sin sesión manda al acceso y recuerda a dónde iba', async () => {
    const session = useSession()
    await session.restore(meApi(new ApiError(401, null)))

    expect(await guard({ meta: {}, fullPath: '/panel/menu' }, session)).toEqual({ name: 'login', query: { volver: '/panel/menu' } })
    expect(await guard({ meta: { public: true }, fullPath: '/' }, session)).toBe(true)
  })

  it('con sesión, el acceso lleva al inicio y un módulo sin permiso también', async () => {
    const session = await signedIn()

    expect(await guard({ meta: { public: true }, fullPath: '/' }, session)).toEqual({ name: 'inicio' })
    expect(await guard({ meta: { permission: 'menu.read' }, fullPath: '/panel/menu' }, session)).toBe(true)
    expect(await guard({ meta: { permission: 'invoices.read' }, fullPath: '/panel/facturacion' }, session)).toEqual({ name: 'inicio' })
  })

  it('después de entrar solo regresa a rutas del panel', () => {
    expect(safeReturn('/panel/menu')).toBe('/panel/menu')
    expect(safeReturn('https://malo.example')).toBe('/panel')
    expect(safeReturn('//malo.example/panel')).toBe('/panel')
    expect(safeReturn(undefined)).toBe('/panel')
  })
})

describe('panel', () => {
  async function mountAt(path) {
    const pinia = createPinia()
    setActivePinia(pinia)
    const session = useSession()
    await session.restore(meApi())
    const router = makeRouter(createMemoryHistory())
    router.push(path)
    await router.isReady()
    const wrapper = mount(App, { global: { plugins: [pinia, router] } })
    await flushPromises()
    return { wrapper, router, session }
  }

  it('el menú muestra solo los módulos con permiso en la sucursal elegida', async () => {
    const { wrapper } = await mountAt('/panel')
    const links = wrapper.findAll('nav .nav-link').map((l) => l.text())
    // Orden del Figma; Configuración siempre está (ahí viven Avisos y los ajustes con permiso).
    expect(links).toEqual(['Inicio', 'Menú', 'Personal', 'Reportes', 'Configuración'])
    expect(wrapper.text()).toContain('Hola, Eduardo')
    expect(wrapper.text()).toContain('Administrador')
  })

  it('al cambiar a una sucursal donde el rol no ve el módulo abierto, vuelve al inicio', async () => {
    const { wrapper, router } = await mountAt('/panel/menu')
    expect(router.currentRoute.value.name).toBe('menu')

    await wrapper.find('select').setValue('b2')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('inicio')
    expect(wrapper.text()).toContain('Mesero')
    expect(wrapper.text()).toContain('El trabajo de piso se hace en la app Android')
  })
})

describe('errorText', () => {
  it('traduce los errores comunes del contrato', () => {
    expect(errorText(new ApiError(0, null))).toMatch(/conexión/)
    expect(errorText(new ApiError(403, null))).toMatch(/permiso/)
    expect(errorText(new ApiError(409, null))).toMatch(/Alguien más/)
    expect(errorText(new ApiError(422, { error: { code: 'VALIDATION_FAILED', message: 'El nombre es obligatorio.' } }))).toBe('El nombre es obligatorio.')
  })
})
