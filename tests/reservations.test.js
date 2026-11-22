import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { dayRange, reservationActions, reservationsApi, shiftDay, slot } from '../src/lib/reservations.js'
import { useSession } from '../src/stores/session.js'
import ReservationsView from '../src/views/ReservationsView.vue'

const NOW = new Date(2026, 10, 22, 18, 0)
const at = (h, m = 0, d = 22) => new Date(2026, 10, d, h, m).toISOString()
const reservation = (id, status, extra = {}) => ({
  id, status, startAt: at(20), endAt: at(21, 30), partySize: 4, customer: { customerId: null, name: `Cliente ${id}`, phone: '+523312345678' },
  source: 'STAFF', notes: null, confirmationCode: 'ABC123', plannedTableIds: ['t1'], planConflict: false, version: 2, ...extra,
})

describe('reglas de Reservaciones', () => {
  const all = { confirm: true, update: true, cancel: true, noShow: true }

  it('ofrece acciones según el estado y la hora', () => {
    expect(reservationActions(reservation('a', 'PENDING'), all, NOW.getTime())).toEqual({ confirm: true, edit: true, cancel: true, noShow: false })
    expect(reservationActions(reservation('b', 'CONFIRMED', { startAt: at(17) }), all, NOW.getTime()).noShow).toBe(true)
    expect(reservationActions(reservation('c', 'CONFIRMED'), all, NOW.getTime()).noShow).toBe(false)
    expect(reservationActions(reservation('d', 'CHECKED_IN'), all, NOW.getTime())).toEqual({ confirm: false, edit: false, cancel: false, noShow: false })
  })

  it('convierte día y hora locales a ISO y recorre días', () => {
    expect(slot('2026-11-22', '20:00', 90)).toEqual({ startAt: at(20), endAt: at(21, 30) })
    expect(dayRange('2026-11-22')).toEqual({ from: new Date(2026, 10, 22).toISOString(), to: new Date(2026, 10, 23).toISOString() })
    expect(shiftDay('2026-11-30', 1)).toBe('2026-12-01')
  })

  it('cada cambio manda Idempotency-Key e If-Match', async () => {
    const api = { post: vi.fn(async () => ({ data: {} })) }
    await reservationsApi(api).cancel('b1', reservation('r1', 'CONFIRMED'), ' Llamó ')
    const [url, body, opts] = api.post.mock.calls[0]
    expect(url).toBe('/branches/b1/reservations/r1/cancel')
    expect(body).toEqual({ reason: 'Llamó' })
    expect(opts.headers['If-Match']).toBe('"2"')
    expect(opts.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe('pantalla de Reservaciones', () => {
  let calls
  let customers

  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
    calls = {
      day: vi.fn(async () => [reservation('r1', 'PENDING'), reservation('r2', 'CANCELLED', { partySize: 6 })]),
      tables: vi.fn(async () => [{ id: 't1', number: 5 }]),
      create: vi.fn(async () => ({ data: {} })),
      update: vi.fn(async () => ({ data: {} })),
      confirm: vi.fn(async () => ({ data: {} })),
      cancel: vi.fn(async () => ({ data: {} })),
      noShow: vi.fn(async () => ({ data: {} })),
    }
    customers = { search: vi.fn(async () => ({ data: [{ id: 'c9', name: 'Dana Mora', profile: { visitCount: 3 } }] })) }
  })

  async function mountIt(permissions) {
    const pinia = createPinia()
    setActivePinia(pinia)
    useSession().adopt({ user: { id: 'yo', name: 'Yo' }, memberships: [{ branch: { id: 'b1', name: 'Centro' }, role: 'MANAGER', permissions }] })
    const wrapper = mount(ReservationsView, { props: { api: calls, customers, today: () => NOW }, global: { plugins: [pinia] }, attachTo: document.body })
    await flushPromises()
    return wrapper
  }
  const ALL = ['reservations.read', 'reservations.create', 'reservations.update', 'reservations.confirm', 'reservations.cancel', 'reservations.mark_no_show', 'customers.read']
  const button = (scope, text) => scope.findAll('button').find((b) => b.text() === text)

  it('muestra la agenda del día con mesa planeada y cuenta personas activas', async () => {
    const wrapper = await mountIt(ALL)
    expect(calls.day).toHaveBeenCalledWith('b1', '2026-11-22', undefined)
    expect(wrapper.text()).toContain('2 reservaciones · 4 personas')
    expect(wrapper.findAll('tbody tr')[0].text()).toContain('Mesa 5')
    expect(wrapper.findAll('tbody tr')[0].text()).toContain('Por confirmar')
  })

  it('cambiar de día vuelve a pedir la agenda', async () => {
    const wrapper = await mountIt(ALL)
    await wrapper.find('[aria-label="Día siguiente"]').trigger('click')
    await flushPromises()
    expect(calls.day).toHaveBeenLastCalledWith('b1', '2026-11-23', undefined)
  })

  it('una reservación nueva busca al cliente por teléfono y lo liga', async () => {
    const wrapper = await mountIt(ALL)
    await button(wrapper, 'Nueva reservación').trigger('click')
    const tel = wrapper.find('[role="dialog"] input[type="tel"]')
    await tel.setValue('33 1111 2222')
    await tel.trigger('blur')
    await flushPromises()
    expect(customers.search).toHaveBeenCalledWith('b1', { phone: '+523311112222' })
    expect(wrapper.find('[role="dialog"]').text()).toContain('Cliente registrado: 3 visitas.')
    await wrapper.find('[role="dialog"] form').trigger('submit')
    await flushPromises()
    expect(calls.create).toHaveBeenCalledWith('b1', {
      startAt: at(20), endAt: at(21, 30), partySize: 2,
      customer: { customerId: 'c9', name: 'Dana Mora', phone: '+523311112222' },
    })
  })

  it('confirmar y cancelar con motivo', async () => {
    const wrapper = await mountIt(ALL)
    await button(wrapper.findAll('tbody tr')[0], 'Confirmar').trigger('click')
    await wrapper.find('[role="dialog"] form').trigger('submit')
    await flushPromises()
    expect(calls.confirm).toHaveBeenCalledWith('b1', expect.objectContaining({ id: 'r1' }))

    await button(wrapper.findAll('tbody tr')[0], 'Cancelar').trigger('click')
    await wrapper.find('textarea').setValue('El cliente llamó')
    await wrapper.find('[role="dialog"] form').trigger('submit')
    await flushPromises()
    expect(calls.cancel).toHaveBeenCalledWith('b1', expect.objectContaining({ id: 'r1' }), 'El cliente llamó')
  })
})
