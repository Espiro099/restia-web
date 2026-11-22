import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ApiError } from '../src/lib/api.js'
import { anchorFor, menuSections, priceText, publicErrorText, publicMenuApi, tokenFromHash } from '../src/lib/publicMenu.js'
import { guard } from '../src/router.js'
import PublicMenuView from '../src/views/PublicMenuView.vue'

const TOKEN = '30secDfG8LLjLKQMiZQ3mjjUoau5kbZ1S-1DU84qUfs'
const mxn = (amount) => ({ amount, currency: 'MXN' })
const MENU = {
  menuVersion: 4,
  products: [
    { id: 'p2', name: 'Agua de jamaica', category: 'Bebidas', displayOrder: 0, price: mxn('35.00'), availability: 'SOLD_OUT', modifierIds: [] },
    { id: 'p1', name: 'Tacos al pastor', category: 'Platos fuertes', displayOrder: 0, price: mxn('95.00'), availability: 'AVAILABLE', modifierIds: ['m1'] },
  ],
  modifiers: [{ id: 'm1', name: 'Tamaño', minSelections: 1, maxSelections: 1, options: [{ id: 'o1', name: 'Chico', priceDelta: mxn('0.00') }, { id: 'o2', name: 'Grande', priceDelta: mxn('15.00') }] }],
}

describe('reglas del menú público', () => {
  it('toma el token del fragmento y rechaza lo que no tiene su forma', () => {
    expect(tokenFromHash(`#${TOKEN}`)).toBe(TOKEN)
    expect(tokenFromHash('#corto')).toBe('')
    expect(tokenFromHash('#<script>alert(1)</script>xxxxxxxxxx')).toBe('')
    expect(tokenFromHash('')).toBe('')
  })

  it('arma secciones por categoría con sus modificadores', () => {
    const sections = menuSections(MENU)
    expect(sections.map((s) => s.category)).toEqual(['Bebidas', 'Platos fuertes'])
    expect(sections[1].items[0].modifiers.map((m) => m.name)).toEqual(['Tamaño'])
    expect(anchorFor('Platos fuertes')).toBe('cat-platos-fuertes')
    expect(anchorFor('Bebidas frías & Café')).toBe('cat-bebidas-frias-cafe')
    expect(priceText(mxn('1250.5'))).toBe('$1,250.50')
  })

  it('manda el token en X-QR-Token y sin cookies', async () => {
    const fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: {} }) }))
    await publicMenuApi({ fetch }).menu(TOKEN)
    expect(fetch).toHaveBeenCalledWith('/api/v1/public/menu', expect.objectContaining({
      method: 'GET', credentials: 'omit', headers: expect.objectContaining({ 'X-QR-Token': TOKEN }),
    }))
  })

  it('explica un código que ya no sirve', () => {
    expect(publicErrorText(new ApiError(401, { error: { code: 'QR_TOKEN_INVALID', message: 'x' } }))).toMatch(/ya no está disponible/)
    expect(publicErrorText(new ApiError(0, null))).toMatch(/conexión/)
  })

  it('el router no pregunta por sesión en el menú público', async () => {
    const session = { restore: vi.fn() }
    expect(await guard({ meta: { anonymous: true }, fullPath: '/m' }, session)).toBe(true)
    expect(session.restore).not.toHaveBeenCalled()
  })
})

describe('página del menú público', () => {
  function fakeCalls(overrides = {}) {
    return {
      context: vi.fn(async () => ({ data: { restaurantName: 'Restia Centro', tableNumber: 3, currency: 'MXN', timezone: 'America/Mexico_City' } })),
      menu: vi.fn(async () => ({ data: MENU })),
      presence: vi.fn(async () => null),
      ...overrides,
    }
  }

  beforeEach(() => {
    window.location.hash = ''
  })

  it('muestra restaurante, mesa, precios, agotados y opciones, y avisa presencia', async () => {
    window.location.hash = `#${TOKEN}`
    const calls = fakeCalls()
    const wrapper = mount(PublicMenuView, { props: { api: calls } })
    await flushPromises()

    expect(wrapper.find('h1').text()).toBe('Restia Centro')
    expect(wrapper.text()).toContain('Mesa 3')
    expect(wrapper.text()).toContain('$95.00')
    expect(wrapper.find('.dish.out').text()).toContain('Agotado por hoy')
    expect(wrapper.text()).toContain('Tamaño (elige 1):')
    expect(wrapper.text()).toContain('Grande +$15.00')
    expect(calls.presence).toHaveBeenCalledWith(TOKEN)
    expect(document.title).toBe('Restia Centro · Menú')
  })

  it('sin token válido no llama a la API', async () => {
    window.location.hash = '#nada'
    const calls = fakeCalls()
    const wrapper = mount(PublicMenuView, { props: { api: calls } })
    await flushPromises()
    expect(wrapper.text()).toContain('Este enlace no es válido')
    expect(calls.context).not.toHaveBeenCalled()
  })

  it('un QR rotado muestra el aviso y deja reintentar', async () => {
    window.location.hash = `#${TOKEN}`
    const calls = fakeCalls({ context: vi.fn(async () => { throw new ApiError(401, { error: { code: 'QR_TOKEN_INVALID', message: 'x' } }) }) })
    const wrapper = mount(PublicMenuView, { props: { api: calls } })
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('ya no está disponible')
    expect(wrapper.find('[role="alert"] button').exists()).toBe(true)
    expect(calls.presence).not.toHaveBeenCalled()
  })
})
