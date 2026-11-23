import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { belowMinimum, inventoryApi, qtyText, quantity, stockPending } from '../src/lib/inventory.js'
import { useSession } from '../src/stores/session.js'
import InventoryView from '../src/views/InventoryView.vue'

const ing = (id, extra = {}) => ({ id, code: id.toUpperCase(), name: `Insumo ${id}`, baseUnit: 'KG', minStock: '2.0000', stock: '5.5000', stockAsOf: '', status: 'ACTIVE', foodSafetyBlock: null, version: 1, ...extra })

describe('reglas de Inventario', () => {
  it('valida cantidades y las muestra con su unidad', () => {
    expect(quantity('1,5')).toBe('1.5')
    expect(quantity('-2')).toBe('')
    expect(quantity('-2', { signed: true })).toBe('-2')
    expect(quantity('1.23456')).toBe('')
    expect(qtyText('1.5000', 'KG')).toBe('1.5 kg')
    expect(qtyText('12.0000', 'PIECE')).toBe('12 pza')
    expect(belowMinimum(ing('a', { stock: '1.0000' }))).toBe(true)
    expect(belowMinimum(ing('a'))).toBe(false)
  })

  it('avisa cuando hay movimientos por sumar a la existencia', () => {
    const now = new Date('2026-11-22T12:00:30Z').getTime()
    expect(stockPending(ing('a', { stockAsOf: '2026-11-22T12:00:00Z' }), now)).toBe(true)
    expect(stockPending(ing('a', { stockAsOf: '2026-11-22T12:00:25Z' }), now)).toBe(false)
  })

  it('las operaciones mandan Idempotency-Key o If-Match según el contrato', async () => {
    const api = { post: vi.fn(async () => ({ data: {} })), put: vi.fn(async () => ({ data: {} })) }
    const calls = inventoryApi(api)
    await calls.createMovement('b1', { ingredientId: 'a', type: 'WASTE', quantity: '1', reason: 'Se echó a perder' })
    await calls.saveCountLines('b1', { id: 'c1', version: 4 }, [])
    await calls.publishRecipe('b1', { id: 'p1', version: 7 }, [{ ingredientId: 'a', quantity: '0.2' }])
    expect(api.post.mock.calls[0][2].headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
    expect(api.put).toHaveBeenCalledWith('/branches/b1/inventory-counts/c1/lines', { lines: [] }, { headers: { 'If-Match': '"4"' } })
    expect(api.post.mock.calls[1]).toEqual(['/branches/b1/products/p1/recipes', { items: [{ ingredientId: 'a', quantity: '0.2' }] }, { headers: { 'If-Match': '"7"' } }])
  })
})

describe('pantalla de Inventario', () => {
  let calls
  let openCount

  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
    openCount = null
    calls = {
      ingredients: vi.fn(async () => [ing('cebolla'), ing('queso', { stock: '0.5000' }), ing('viejo', { status: 'INACTIVE' })]),
      createIngredient: vi.fn(async () => ({ data: {} })),
      updateIngredient: vi.fn(async () => ({ data: {} })),
      ingredientStatus: vi.fn(async () => ({ data: {} })),
      foodSafety: vi.fn(async () => ({ data: {} })),
      movements: vi.fn(async () => ({ data: [{ id: 'm1', ingredientId: 'cebolla', type: 'CONSUMPTION', quantity: '-0.2000', recipeVersion: 2, reason: null, createdAt: '2026-11-22T12:00:00Z' }], meta: { pagination: { total: 1 } } })),
      createMovement: vi.fn(async () => ({ data: {} })),
      receipts: vi.fn(async () => ({ data: [] })),
      createReceipt: vi.fn(async () => ({ data: {} })),
      counts: vi.fn(async () => (openCount ? [openCount] : [])),
      openCount: vi.fn(async () => { openCount = { id: 'c1', status: 'OPEN', lines: [], createdAt: '2026-11-22T10:00:00Z', version: 1 }; return { data: openCount } }),
      saveCountLines: vi.fn(async () => ({ data: {} })),
      applyCount: vi.fn(async () => ({ data: {} })),
      cancelCount: vi.fn(async () => ({ data: {} })),
      products: vi.fn(async () => [{ id: 'p1', name: 'Tacos', status: 'ACTIVE', currentRecipeVersion: 1, version: 7 }]),
      recipes: vi.fn(async () => [{ recipeVersion: 1, items: [{ ingredientId: 'cebolla', quantity: '0.1000' }] }]),
      publishRecipe: vi.fn(async () => ({ data: {} })),
    }
  })

  const ALL = ['inventory.read', 'inventory.manage', 'inventory.adjust', 'inventory.record_waste', 'inventory.receive', 'inventory.count', 'inventory.apply_count', 'inventory.food_safety', 'recipes.read', 'recipes.manage']
  async function mountIt(permissions = ALL) {
    const pinia = createPinia()
    setActivePinia(pinia)
    useSession().adopt({ user: { id: 'yo', name: 'Yo' }, memberships: [{ branch: { id: 'b1', name: 'Centro' }, role: 'MANAGER', permissions }] })
    const wrapper = mount(InventoryView, { props: { api: calls }, global: { plugins: [pinia] }, attachTo: document.body })
    await flushPromises()
    return wrapper
  }
  const tab = async (w, label) => { await w.findAll('[role="tab"]').find((t) => t.text() === label).trigger('click'); await flushPromises() }
  const button = (scope, text) => scope.findAll('button').find((b) => b.text() === text)

  it('muestra activos con su existencia y avisa lo que está bajo el mínimo', async () => {
    const wrapper = await mountIt()
    const rows = wrapper.findAll('tbody tr').map((r) => r.text())
    expect(rows).toHaveLength(2)
    expect(rows[0]).toContain('5.5 kg')
    expect(rows[1]).toContain('Bajo el mínimo')
  })

  it('la merma se manda positiva con su motivo', async () => {
    const wrapper = await mountIt()
    await button(wrapper.findAll('tbody tr')[0], 'Merma').trigger('click')
    await wrapper.find('[role="dialog"] input').setValue('0.75')
    await wrapper.find('textarea').setValue('Se echó a perder')
    await wrapper.find('[role="dialog"] form').trigger('submit')
    await flushPromises()
    expect(calls.createMovement).toHaveBeenCalledWith('b1', { ingredientId: 'cebolla', type: 'WASTE', quantity: '0.75', reason: 'Se echó a perder' })
  })

  it('solo con lectura no hay acciones', async () => {
    const wrapper = await mountIt(['inventory.read'])
    expect(wrapper.findAll('tbody button')).toHaveLength(0)
    expect(wrapper.findAll('[role="tab"]').map((t) => t.text())).not.toContain('Recetas')
  })

  it('los movimientos muestran el consumo por receta', async () => {
    const wrapper = await mountIt()
    await tab(wrapper, 'Movimientos')
    expect(wrapper.find('tbody tr').text()).toContain('Consumo')
    expect(wrapper.find('tbody tr').text()).toContain('Receta v2')
  })

  it('un conteo se abre, se guarda lo capturado y se aplica', async () => {
    const wrapper = await mountIt()
    await tab(wrapper, 'Conteos')
    await button(wrapper, 'Empezar conteo').trigger('click')
    await flushPromises()
    const inputs = wrapper.findAll('input.qty')
    expect(inputs).toHaveLength(2)
    await inputs[0].setValue('4.25')
    await button(wrapper, 'Guardar lo contado').trigger('click')
    await flushPromises()
    const [, count, lines] = calls.saveCountLines.mock.calls[0]
    expect(count.id).toBe('c1')
    expect(lines).toEqual([{ ingredientId: 'cebolla', counted: '4.25', countedAt: expect.any(String) }])

    openCount = { ...openCount, lines: [{ ingredientId: 'cebolla', counted: '4.2500', countedAt: lines[0].countedAt, expected: '5.5000', difference: '-1.2500' }], version: 2 }
    await wrapper.findAll('[role="tab"]')[0].trigger('click')
    await tab(wrapper, 'Conteos')
    await button(wrapper, 'Aplicar').trigger('click')
    expect(wrapper.find('[role="dialog"]').text()).toContain('Insumo cebolla: -1.25 kg')
    await wrapper.find('[role="dialog"] form').trigger('submit')
    await flushPromises()
    expect(calls.applyCount).toHaveBeenCalledWith('b1', expect.objectContaining({ id: 'c1', version: 2 }))
  })

  it('una receta solo se publica si cambió', async () => {
    const wrapper = await mountIt()
    await tab(wrapper, 'Recetas')
    await flushPromises()
    const publish = () => button(wrapper, 'Publicar versión nueva')
    expect(publish().attributes('disabled')).toBeDefined()
    await wrapper.find('.line input').setValue('0.15')
    await publish().trigger('click')
    await flushPromises()
    expect(calls.publishRecipe).toHaveBeenCalledWith('b1', expect.objectContaining({ id: 'p1' }), [{ ingredientId: 'cebolla', quantity: '0.15' }])
  })
})
