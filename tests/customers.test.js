import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { customersApi, normalizePhone, phoneText, searchQuery, splitPreferences } from '../src/lib/customers.js'
import { useSession } from '../src/stores/session.js'
import CustomersView from '../src/views/CustomersView.vue'

const customer = (id, extra = {}) => ({
  id, name: `Cliente ${id}`, phone: '+523312345678', email: null, anonymized: false,
  profile: { notes: null, preferences: ['sin cebolla'], visitCount: 3, lastVisitAt: '2026-11-20T20:00:00Z' }, version: 2, ...extra,
})

describe('reglas de Clientes', () => {
  it('normaliza el teléfono al formato internacional', () => {
    expect(normalizePhone('33 1234 5678')).toBe('+523312345678')
    expect(normalizePhone('(33) 1234-5678')).toBe('+523312345678')
    expect(normalizePhone('+1 415 555 0100')).toBe('+14155550100')
    expect(normalizePhone('52 33 1234 5678')).toBe('+523312345678')
    expect(normalizePhone('12345')).toBe('')
    expect(phoneText('+523312345678')).toBe('33 1234 5678')
  })

  it('busca por teléfono si lo parece y si no por nombre', () => {
    expect(searchQuery('33 1234 5678')).toEqual({ phone: '+523312345678' })
    expect(searchQuery('Ana')).toEqual({ name: 'Ana' })
    expect(searchQuery('A')).toBeNull()
    expect(splitPreferences(' terraza ,  , sin cebolla')).toEqual(['terraza', 'sin cebolla'])
  })

  it('registrar manda Idempotency-Key y anonimizar If-Match', async () => {
    const api = { post: vi.fn(async () => ({ data: {} })), patch: vi.fn() }
    const calls = customersApi(api)
    await calls.create('b1', { name: 'Ana', phone: '+523312345678' })
    await calls.anonymize('b1', customer('c1'), ' Lo pidió ')
    expect(api.post.mock.calls[0][2].headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
    expect(api.post.mock.calls[1]).toEqual(['/branches/b1/customers/c1/anonymize', { reason: 'Lo pidió' }, { headers: { 'If-Match': '"2"' } }])
  })
})

describe('pantalla de Clientes', () => {
  let calls

  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
    calls = {
      search: vi.fn(async () => ({ data: [customer('c1')], meta: { pagination: { total: 1 } } })),
      create: vi.fn(async (b, body) => ({ data: customer('nuevo', { name: body.name, phone: body.phone }) })),
      update: vi.fn(async () => ({ data: {} })),
      anonymize: vi.fn(async () => ({ data: {} })),
    }
  })

  async function mountAs(permissions) {
    const pinia = createPinia()
    setActivePinia(pinia)
    useSession().adopt({ user: { id: 'yo', name: 'Yo' }, memberships: [{ branch: { id: 'b1', name: 'Centro' }, role: 'MANAGER', permissions }] })
    const wrapper = mount(CustomersView, { props: { api: calls }, global: { plugins: [pinia] }, attachTo: document.body })
    await flushPromises()
    return wrapper
  }
  const button = (scope, text) => scope.findAll('button').find((b) => b.text() === text)

  it('no lista nada hasta buscar, y busca por teléfono', async () => {
    const wrapper = await mountAs(['customers.read'])
    expect(calls.search).not.toHaveBeenCalled()
    await wrapper.find('input[type="search"]').setValue('33 1234 5678')
    await wrapper.find('form[role="search"]').trigger('submit')
    await flushPromises()
    expect(calls.search).toHaveBeenCalledWith('b1', { phone: '+523312345678' }, 1)
    expect(wrapper.text()).toContain('Cliente c1')
    expect(wrapper.text()).toContain('33 1234 5678')
    expect(button(wrapper, 'Editar')).toBeUndefined()
  })

  it('registrar con lo buscado ya escrito y mostrarlo como resultado', async () => {
    calls.search.mockResolvedValueOnce({ data: [], meta: { pagination: { total: 0 } } })
    const wrapper = await mountAs(['customers.read', 'customers.create'])
    await wrapper.find('input[type="search"]').setValue('3398765432')
    await wrapper.find('form[role="search"]').trigger('submit')
    await flushPromises()
    await button(wrapper, 'Registrarlo').trigger('click')
    const dialog = wrapper.find('[role="dialog"]')
    expect(dialog.find('input[type="tel"]').element.value).toBe('33 9876 5432')
    await dialog.find('input').setValue('Ana López')
    await dialog.find('form').trigger('submit')
    await flushPromises()
    expect(calls.create).toHaveBeenCalledWith('b1', { name: 'Ana López', phone: '+523398765432', notes: null, preferences: [] })
    expect(wrapper.text()).toContain('Ana López')
  })

  it('editar manda solo lo que cambió', async () => {
    const wrapper = await mountAs(['customers.read', 'customers.update'])
    await wrapper.find('input[type="search"]').setValue('Cliente')
    await wrapper.find('form[role="search"]').trigger('submit')
    await flushPromises()
    await button(wrapper, 'Editar').trigger('click')
    const inputs = wrapper.findAll('[role="dialog"] input')
    await inputs[3].setValue('sin cebolla, terraza')
    await wrapper.find('[role="dialog"] form').trigger('submit')
    await flushPromises()
    expect(calls.update).toHaveBeenCalledWith('b1', expect.objectContaining({ id: 'c1' }), { preferences: ['sin cebolla', 'terraza'] })
  })

  it('anonimizar es solo con su permiso y pide motivo', async () => {
    const wrapper = await mountAs(['customers.read', 'customers.anonymize'])
    await wrapper.find('input[type="search"]').setValue('Cliente')
    await wrapper.find('form[role="search"]').trigger('submit')
    await flushPromises()
    await button(wrapper, 'Anonimizar').trigger('click')
    expect(wrapper.find('[role="dialog"]').text()).toContain('No se puede deshacer')
    await wrapper.find('textarea').setValue('El cliente lo pidió')
    await wrapper.find('[role="dialog"] form').trigger('submit')
    await flushPromises()
    expect(calls.anonymize).toHaveBeenCalledWith('b1', expect.objectContaining({ id: 'c1' }), 'El cliente lo pidió')
  })
})
