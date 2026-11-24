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

  it('muestra restaurante, mesa, precios y agotados, y avisa presencia', async () => {
    window.location.hash = `#${TOKEN}`
    const calls = fakeCalls()
    const wrapper = mount(PublicMenuView, { props: { api: calls } })
    await flushPromises()

    expect(wrapper.find('h1').text()).toBe('Nuestro menú')
    expect(wrapper.find('.eyebrow').text()).toBe('Restia Centro')
    expect(wrapper.find('.table').text()).toBe('Mesa 3')
    expect(wrapper.text()).toContain('$95.00')
    expect(wrapper.find('.dish.out').text()).toContain('Agotado por hoy')
    expect(wrapper.findAll('.cat').map((c) => c.find('.cat-name').text())).toEqual(['Bebidas', 'Platos fuertes'])
    // Sin recomendación del día no aparece esa sección, ni el chat ni la ubicación (solo menú).
    expect(wrapper.find('.picks').exists()).toBe(false)
    expect(wrapper.find('.chat').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Cómo llegar')
    expect(calls.presence).toHaveBeenCalledWith(TOKEN)
    expect(document.title).toBe('Restia Centro · Menú')
  })

  it('destaca la recomendación del día y al tocar un platillo abre su foto, descripción y opciones', async () => {
    window.location.hash = `#${TOKEN}`
    const img = 'https://restia-api-staging.onrender.com/api/v1/public/images/0b9a7c1e-2f43-4c1a-9d2b-7e5f3a1c8d90'
    const menu = { ...MENU, products: MENU.products.map((p) => (p.id === 'p1' ? { ...p, recommended: true, description: 'Con piña y cilantro', imageUrl: img } : p)) }
    const wrapper = mount(PublicMenuView, { props: { api: fakeCalls({ menu: vi.fn(async () => ({ data: menu })) }) }, attachTo: document.body })
    await flushPromises()

    const pick = wrapper.find('.pick')
    expect(pick.text()).toContain('Tacos al pastor')
    expect(pick.text()).toContain('Con piña y cilantro')
    expect(pick.find('img').attributes('src')).toBe('/api/v1/public/images/0b9a7c1e-2f43-4c1a-9d2b-7e5f3a1c8d90')

    await wrapper.findAll('.dish').find((d) => d.text().includes('Tacos al pastor')).trigger('click')
    const sheet = wrapper.find('[role="dialog"]')
    expect(sheet.find('h2').text()).toBe('Tacos al pastor')
    expect(sheet.find('.sheet-photo').attributes('alt')).toBe('Tacos al pastor')
    expect(sheet.text()).toContain('Recomendación del día')
    expect(sheet.text()).toContain('Con piña y cilantro')
    expect(sheet.text()).toContain('Tamaño (elige 1)')
    expect(sheet.text()).toContain('Grande +$15.00')
    expect(document.activeElement).toBe(sheet.find('.close').element)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    wrapper.unmount()
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
