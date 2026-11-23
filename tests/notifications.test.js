import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { badgeText, noticeAge, noticeTarget, notificationsApi } from '../src/lib/notifications.js'
import { useSession } from '../src/stores/session.js'
import NoticeBell from '../src/components/NoticeBell.vue'

const NOW = new Date('2026-11-24T18:00:00Z')

describe('avisos: reglas', () => {
  it('lleva cada tipo a su módulo si se tiene el permiso', () => {
    const all = () => true
    expect(noticeTarget({ type: 'LOW_STOCK' }, all)).toBe('inventario')
    expect(noticeTarget({ type: 'PAYMENT_UNKNOWN' }, all)).toBe('caja')
    expect(noticeTarget({ type: 'CHECK_REQUESTED' }, (p) => p !== 'cash.read')).toBeNull()
    expect(noticeTarget({ type: 'OTRO' }, all)).toBeNull()
  })

  it('dice la antigüedad en palabras', () => {
    expect(noticeAge('2026-11-24T17:59:40Z', NOW)).toBe('Ahora')
    expect(noticeAge('2026-11-24T17:55:00Z', NOW)).toBe('Hace 5 min')
    expect(noticeAge('2026-11-24T15:00:00Z', NOW)).toBe('Hace 3 h')
    expect(noticeAge('no es fecha', NOW)).toBe('')
  })

  it('la insignia llega hasta 9+', () => {
    expect([badgeText(0), badgeText(3), badgeText(12)]).toEqual(['', '3', '9+'])
  })

  it('pide los 10 más recientes y marca leídos por sucursal', async () => {
    const api = { get: vi.fn(async () => ({ data: [{ id: 'n1' }], meta: { unreadCount: 4 } })), post: vi.fn(async () => ({})) }
    const calls = notificationsApi(api)
    expect(await calls.latest('b1')).toEqual({ items: [{ id: 'n1' }], unread: 4 })
    expect(api.get).toHaveBeenCalledWith('/branches/b1/notifications?page=1&perPage=10')
    await calls.read('b1', 'n1')
    await calls.readAll('b1')
    expect(api.post.mock.calls.map((c) => c[0])).toEqual(['/branches/b1/notifications/n1/read', '/branches/b1/notifications/read-all'])
  })
})

describe('campana del panel', () => {
  const stock = { id: 'n1', type: 'LOW_STOCK', title: 'Stock bajo · Jitomate', body: 'Quedan 1.5 kg; el mínimo es 3 kg.', readAt: null, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() }
  const paid = { id: 'n2', type: 'PAYMENT_CONFIRMED', title: 'Mesa 4 · pago aprobado', body: 'Se aprobó.', readAt: '2026-11-24T17:00:00Z', createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() }
  let calls
  let router

  beforeEach(() => {
    document.body.innerHTML = ''
    setActivePinia(createPinia())
    useSession().adopt({ user: { id: 'u1', name: 'Gerente' }, memberships: [{ branch: { id: 'b1', name: 'Centro' }, role: 'MANAGER', permissions: ['inventory.read', 'cash.read'] }] })
    calls = {
      latest: vi.fn(async () => ({ items: [{ ...stock }, { ...paid }], unread: 1 })),
      read: vi.fn(async () => ({})),
      readAll: vi.fn(async () => ({})),
    }
    router = createRouter({ history: createMemoryHistory(), routes: ['inicio', 'inventario', 'caja'].map((name) => ({ path: `/${name}`, name, component: { template: '<p />' } })) })
  })
  afterEach(() => vi.useRealTimers())

  async function mountBell() {
    const wrapper = mount(NoticeBell, { props: { api: calls }, global: { plugins: [router] }, attachTo: document.body })
    await flushPromises()
    return wrapper
  }

  it('muestra cuántos hay sin leer y al abrir lista los avisos', async () => {
    const wrapper = await mountBell()
    const bell = wrapper.find('.bell')
    expect(bell.attributes('aria-label')).toBe('Avisos, 1 sin leer')
    expect(wrapper.find('.badge').text()).toBe('1')
    await bell.trigger('click')
    await flushPromises()
    const rows = wrapper.findAll('.item')
    expect(rows).toHaveLength(2)
    expect(rows[0].classes()).toContain('unread')
    expect(rows[0].text()).toContain('Stock bajo · Jitomate')
    expect(calls.latest).toHaveBeenCalledTimes(2)
  })

  it('al elegir un aviso lo marca leído y abre su módulo', async () => {
    const push = vi.spyOn(router, 'push')
    const wrapper = await mountBell()
    await wrapper.find('.bell').trigger('click')
    await flushPromises()
    await wrapper.findAll('.item')[0].trigger('click')
    await flushPromises()
    expect(calls.read).toHaveBeenCalledWith('b1', 'n1')
    expect(push).toHaveBeenCalledWith({ name: 'inventario' })
    expect(wrapper.find('.badge').exists()).toBe(false)
    expect(wrapper.find('#notice-list').exists()).toBe(false)
  })

  it('marca todo como leído', async () => {
    const wrapper = await mountBell()
    await wrapper.find('.bell').trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text() === 'Marcar todo como leído').trigger('click')
    await flushPromises()
    expect(calls.readAll).toHaveBeenCalledWith('b1')
    expect(wrapper.findAll('.item.unread')).toHaveLength(0)
  })

  it('sin conexión lo dice y no rompe el panel', async () => {
    calls.latest = vi.fn(async () => { throw new Error('sin red') })
    const wrapper = await mountBell()
    await wrapper.find('.bell').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('No se pudieron cargar los avisos')
  })

  it('pregunta otra vez cada 30 segundos mientras la pestaña está a la vista', async () => {
    vi.useFakeTimers()
    await mountBell()
    expect(calls.latest).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(calls.latest).toHaveBeenCalledTimes(2)
  })
})
