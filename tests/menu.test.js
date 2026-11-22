import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError } from '../src/lib/api.js'
import {
  byCategory, catalogApi, catalogErrorText, formatDelta, hasActiveRoute, money, normalizeCode, selectionRule,
} from '../src/lib/catalog.js'
import { useSession } from '../src/stores/session.js'
import MenuView from '../src/views/MenuView.vue'

const mxn = (amount) => ({ amount, currency: 'MXN' })
const station = (id, status = 'ACTIVE') => ({ id, code: id.toUpperCase(), name: `Estación ${id}`, status, version: 1 })
const product = (id, extra = {}) => ({
  id, code: id.toUpperCase(), name: `Producto ${id}`, description: null, category: 'Tacos', displayOrder: 0, price: mxn('45.00'),
  status: 'ACTIVE', availability: 'AVAILABLE', modifierIds: [], routes: [{ stationId: 'cocina', priority: 1 }],
  fiscal: { satProductCode: '90101501', satUnitCode: 'E48', taxObject: '02', taxRate: '0.160000' }, imageUrl: null, version: 2, ...extra,
})
const modifier = (id, extra = {}) => ({
  id, code: id.toUpperCase(), name: `Mod ${id}`, minSelections: 0, maxSelections: 1, status: 'ACTIVE', version: 3,
  options: [{ id: 'o1', name: 'Sin cebolla', priceDelta: mxn('0.00'), active: true, ingredientAdjustments: [{ ingredientId: 'i1', quantity: '0.05' }] }],
  ...extra,
})

describe('reglas del menú', () => {
  it('normaliza códigos, montos y reglas de selección', () => {
    expect(normalizeCode(' taco pastor ')).toBe('TACO-PASTOR')
    expect(money('45')).toEqual(mxn('45.00'))
    expect(money('4.555')).toBeNull()
    expect(selectionRule({ minSelections: 0, maxSelections: 1 })).toBe('Opcional, una')
    expect(selectionRule({ minSelections: 1, maxSelections: 1 })).toBe('Obligatorio, 1')
    expect(selectionRule({ minSelections: 1, maxSelections: 3 })).toBe('Elige de 1 a 3')
    expect(formatDelta(mxn('15.00'))).toBe('+$15.00')
    expect(formatDelta(mxn('-5.5'))).toBe('−$5.50')
    expect(formatDelta(mxn('0.00'))).toBe('')
  })

  it('un producto se puede vender solo con una estación activa', () => {
    const stations = [station('cocina'), station('barra', 'INACTIVE')]
    expect(hasActiveRoute(product('a'), stations)).toBe(true)
    expect(hasActiveRoute(product('b', { routes: [{ stationId: 'barra', priority: 1 }] }), stations)).toBe(false)
    expect(hasActiveRoute(product('c', { routes: [] }), stations)).toBe(false)
  })

  it('agrupa por categoría respetando el orden de la API', () => {
    const groups = byCategory([product('a'), product('b', { category: 'Bebidas' }), product('c')])
    expect(groups.map((g) => [g.category, g.items.map((p) => p.id)])).toEqual([['Tacos', ['a', 'c']], ['Bebidas', ['b']]])
  })

  it('usa el mensaje del campo en un 422 y los propios del menú', () => {
    expect(catalogErrorText(new ApiError(409, { error: { code: 'PRODUCT_NOT_SELLABLE', message: 'x' } }))).toMatch(/estación activa/)
    expect(catalogErrorText(new ApiError(422, { error: { code: 'VALIDATION_FAILED', message: 'x', details: { fields: { 'routes.0.stationId': ['La estación está inactiva.'] } } } })))
      .toBe('La estación está inactiva.')
  })

  it('pide todas las páginas y manda If-Match en los cambios', async () => {
    const pages = { 1: { data: [station('a')], meta: { pagination: { total: 2 } } }, 2: { data: [station('b')], meta: { pagination: { total: 2 } } } }
    const api = {
      get: vi.fn(async (url) => pages[new URL(url, 'http://x').searchParams.get('page')]),
      put: vi.fn(async () => ({ data: {} })),
      post: vi.fn(async () => ({ data: {} })),
    }
    const calls = catalogApi(api)

    expect((await calls.stations('b1')).map((s) => s.id)).toEqual(['a', 'b'])
    await calls.routes('b1', product('p'), [{ stationId: 'cocina', priority: 1 }])
    await calls.productStatus('b1', product('p'), 'INACTIVE', '  Fuera de temporada ')

    expect(api.get).toHaveBeenCalledTimes(2)
    expect(api.put).toHaveBeenCalledWith('/branches/b1/products/p/routes', { routes: [{ stationId: 'cocina', priority: 1 }] }, { headers: { 'If-Match': '"2"' } })
    expect(api.post).toHaveBeenCalledWith('/branches/b1/products/p/status', { status: 'INACTIVE', reason: 'Fuera de temporada' }, { headers: { 'If-Match': '"2"' } })
  })
})

describe('pantalla del Menú', () => {
  let data

  function fakeCalls() {
    return {
      products: vi.fn(async () => data.products),
      stations: vi.fn(async () => data.stations),
      modifiers: vi.fn(async () => data.modifiers),
      createProduct: vi.fn(async (b, body) => ({ data: product('nuevo', { ...body, status: 'INACTIVE', routes: [], version: 1 }) })),
      updateProduct: vi.fn(async () => ({ data: {} })),
      productStatus: vi.fn(async () => ({ data: {} })),
      availability: vi.fn(async () => ({ data: {} })),
      routes: vi.fn(async () => ({ data: {} })),
      createStation: vi.fn(async () => ({ data: {} })),
      updateStation: vi.fn(async () => ({ data: {} })),
      stationStatus: vi.fn(async () => ({ data: {} })),
      createModifier: vi.fn(async () => ({ data: {} })),
      updateModifier: vi.fn(async () => ({ data: {} })),
      modifierStatus: vi.fn(async () => ({ data: {} })),
    }
  }

  async function mountAs(permissions) {
    const pinia = createPinia()
    setActivePinia(pinia)
    useSession().adopt({ user: { id: 'yo', name: 'Yo' }, memberships: [{ branch: { id: 'b1', name: 'Centro' }, role: 'MANAGER', permissions }] })
    const calls = fakeCalls()
    const wrapper = mount(MenuView, { props: { api: calls }, global: { plugins: [pinia] }, attachTo: document.body })
    await flushPromises()
    return { wrapper, calls }
  }

  const MANAGE = ['menu.read', 'menu.manage', 'menu.set_availability']

  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
    data = {
      products: [product('pastor'), product('agua', { category: 'Bebidas', routes: [], status: 'INACTIVE' })],
      stations: [station('cocina')],
      modifiers: [modifier('cebolla')],
    }
  })

  const button = (wrapper, text, row = null) =>
    (row ?? wrapper).findAll('button').find((b) => b.text() === text)

  it('muestra los productos por categoría y avisa cuál no tiene estación', async () => {
    const { wrapper } = await mountAs(MANAGE)
    expect(wrapper.findAll('.box h2').map((h) => h.text())).toEqual(['Tacos', 'Bebidas'])
    expect(wrapper.text()).toContain('$45.00 MXN')
    expect(wrapper.findAll('tbody tr')[1].text()).toContain('Sin estación activa')
  })

  it('solo con lectura no ofrece cambios', async () => {
    const { wrapper } = await mountAs(['menu.read'])
    expect(button(wrapper, 'Nuevo producto')).toBeUndefined()
    expect(button(wrapper, 'Editar')).toBeUndefined()
    expect(button(wrapper, 'Agotado')).toBeUndefined()
  })

  it('crear un producto lo deja inactivo y abre la elección de estaciones', async () => {
    const { wrapper, calls } = await mountAs(MANAGE)
    await button(wrapper, 'Nuevo producto').trigger('click')
    const inputs = wrapper.findAll('[role="dialog"] input')
    await inputs[0].setValue('gringa')
    await inputs[1].setValue('Gringa')
    await inputs[2].setValue('Tacos')
    await inputs[3].setValue('65')
    await wrapper.find('[role="dialog"] form').trigger('submit')
    await flushPromises()

    expect(calls.createProduct).toHaveBeenCalledWith('b1', expect.objectContaining({
      code: 'GRINGA', name: 'Gringa', category: 'Tacos', price: mxn('65.00'),
      fiscal: { satProductCode: '90101501', satUnitCode: 'E48', taxObject: '02', taxRate: '0.160000' },
    }))
    const dialog = wrapper.find('[role="dialog"]')
    expect(dialog.attributes('aria-label')).toBe('Estaciones que lo preparan')
    await dialog.find('input[type="checkbox"]').setValue(true)
    await dialog.find('form').trigger('submit')
    await flushPromises()
    expect(calls.routes).toHaveBeenCalledWith('b1', expect.objectContaining({ id: 'nuevo' }), [{ stationId: 'cocina', priority: 1 }])
  })

  it('editar manda solo lo que cambió', async () => {
    const { wrapper, calls } = await mountAs(MANAGE)
    await button(wrapper, 'Editar', wrapper.findAll('tbody tr')[0]).trigger('click')
    const inputs = wrapper.findAll('[role="dialog"] input')
    await inputs[2].setValue('49.5')
    await wrapper.find('[role="dialog"] form').trigger('submit')
    await flushPromises()
    expect(calls.updateProduct).toHaveBeenCalledWith('b1', data.products[0], { price: mxn('49.50') })
  })

  it('no deja activar un producto sin estación activa', async () => {
    const { wrapper, calls } = await mountAs(MANAGE)
    await button(wrapper, 'Activar', wrapper.findAll('tbody tr')[1]).trigger('click')
    await wrapper.find('textarea').setValue('Ya está listo')
    expect(wrapper.find('[role="dialog"] button[type="submit"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[role="dialog"]').text()).toContain('Primero elige al menos una estación activa')
    expect(calls.productStatus).not.toHaveBeenCalled()
  })

  it('marcar agotado no pide confirmación', async () => {
    const { wrapper, calls } = await mountAs(MANAGE)
    await button(wrapper, 'Agotado', wrapper.findAll('tbody tr')[0]).trigger('click')
    await flushPromises()
    expect(calls.availability).toHaveBeenCalledWith('b1', data.products[0], 'SOLD_OUT')
    expect(wrapper.text()).toContain('quedó agotado')
  })

  it('editar un modificador conserva ids y ajustes de ingredientes de sus opciones', async () => {
    const { wrapper, calls } = await mountAs(MANAGE)
    await wrapper.findAll('[role="tab"]')[2].trigger('click')
    await button(wrapper, 'Editar').trigger('click')
    await button(wrapper, 'Agregar opción').trigger('click')
    const names = wrapper.findAll('[role="dialog"] .option input.field:not(.price)')
    const prices = wrapper.findAll('[role="dialog"] .option input.price')
    await names[1].setValue('Extra queso')
    await prices[1].setValue('15')
    await wrapper.find('[role="dialog"] form').trigger('submit')
    await flushPromises()

    expect(calls.updateModifier).toHaveBeenCalledWith('b1', data.modifiers[0], {
      name: 'Mod cebolla', minSelections: 0, maxSelections: 1,
      options: [
        { id: 'o1', name: 'Sin cebolla', priceDelta: mxn('0.00'), active: true, ingredientAdjustments: [{ ingredientId: 'i1', quantity: '0.05' }] },
        { name: 'Extra queso', priceDelta: mxn('15.00'), active: true, ingredientAdjustments: [] },
      ],
    })
  })

  it('una estación nueva normaliza su código', async () => {
    const { wrapper, calls } = await mountAs(MANAGE)
    await wrapper.findAll('[role="tab"]')[1].trigger('click')
    await button(wrapper, 'Nueva estación').trigger('click')
    const inputs = wrapper.findAll('[role="dialog"] input')
    await inputs[0].setValue('barra fria')
    await inputs[1].setValue('Barra fría')
    await wrapper.find('[role="dialog"] form').trigger('submit')
    await flushPromises()
    expect(calls.createStation).toHaveBeenCalledWith('b1', { code: 'BARRA-FRIA', name: 'Barra fría' })
  })
})
