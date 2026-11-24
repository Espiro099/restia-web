import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ApiError } from '../src/lib/api.js'
import {
  byDistance, conversationForApi, distanceKm, distanceText, hoursText, localDate, requestErrorText, requestProblem, siteApi,
} from '../src/lib/site.js'
import { generalChanges, generalForm, generalProblem, parseLocation } from '../src/lib/branch.js'
import SiteView from '../src/views/SiteView.vue'
import { routes } from '../src/router.js'
import SiteReservation from '../src/components/site/SiteReservation.vue'

const CENTRO = {
  code: 'CENTRO', name: 'La Mesa Centro', phone: '33 1234 5678', addressText: 'Av. Juárez 120, Centro, 44100 Guadalajara, Jalisco',
  location: { lat: 20.674, lng: -103.344 }, hours: [1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, opensAt: '13:00', closesAt: '22:00' })),
  reservations: true, mapsUrl: 'https://www.google.com/maps/search/?api=1&query=20.674%2C-103.344',
}
const ZAPOPAN = { ...CENTRO, code: 'ZAPOPAN', name: 'La Mesa Zapopan', location: { lat: 20.72, lng: -103.39 }, phone: null, reservations: false, hours: [] }
const STUBS = { BranchMap: { props: ['points', 'selected', 'user'], template: '<div class="map-stub" :data-selected="selected" :data-points="points.length" />' } }

function fakeApi(overrides = {}) {
  return {
    branches: vi.fn(async () => ({ branches: [CENTRO, ZAPOPAN], assistant: true })),
    slots: vi.fn(async () => ['13:00', '13:30', '20:00']),
    createRequest: vi.fn(async (body) => ({ folio: 'ABCD2345', status: 'PENDING', branchCode: body.branchCode, branchName: 'La Mesa Centro', date: body.date, time: body.time, partySize: body.partySize, name: body.name })),
    lookup: vi.fn(async () => ({ folio: 'ABCD2345', status: 'CONFIRMED', branchCode: 'CENTRO', branchName: 'La Mesa Centro', date: '2026-11-28', time: '20:00', partySize: 2, name: 'Ana' })),
    ask: vi.fn(async () => ({ reply: 'Hola', reservationDraft: null })),
    ...overrides,
  }
}

async function mountSite(api, geolocation = null) {
  const router = createRouter({ history: createMemoryHistory(), routes })
  router.push('/')
  await router.isReady()
  const wrapper = mount(SiteView, { props: { api, geolocation }, global: { plugins: [router], stubs: STUBS }, attachTo: document.body })
  await flushPromises()
  return wrapper
}

describe('sitio público: datos', () => {
  it('pide al sitio sin cookies y con llave de idempotencia', async () => {
    const fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: { folio: 'X' }, meta: { assistant: true } }) }))
    const api = siteApi({ fetch })
    await api.createRequest({ branchCode: 'CENTRO' }, 'k-1')
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('/api/v1/public/site/reservation-requests')
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit' })
    expect(init.headers['Idempotency-Key']).toBe('k-1')
    await api.slots('CENTRO', '2026-11-28', 4)
    expect(fetch.mock.calls[1][0]).toBe('/api/v1/public/site/branches/CENTRO/availability?date=2026-11-28&partySize=4')
    expect(await api.branches()).toEqual({ branches: { folio: 'X' }, assistant: true, reservationEmail: false })
  })

  it('ordena por distancia, la más cercana primero, y la escribe', () => {
    const user = { lat: 20.721, lng: -103.389 }
    expect(byDistance([CENTRO, ZAPOPAN], user).map((b) => b.code)).toEqual(['ZAPOPAN', 'CENTRO'])
    expect(byDistance([CENTRO, ZAPOPAN], null).map((b) => b.code)).toEqual(['CENTRO', 'ZAPOPAN'])
    expect(distanceKm(CENTRO.location, ZAPOPAN.location)).toBeCloseTo(7, 0)
    expect(distanceText(0.12)).toBe('a 100 m')
    expect(distanceText(3.46)).toBe('a 3.5 km')
    expect(distanceText(25.4)).toBe('a 25 km')
  })

  it('agrupa el horario por días seguidos', () => {
    const hours = [...CENTRO.hours, { dayOfWeek: 6, opensAt: '12:00', closesAt: '23:00' }, { dayOfWeek: 7, opensAt: '12:00', closesAt: '23:00' }]
    expect(hoursText(hours)).toBe('Lun a Vie 13:00–22:00 · Sáb y Dom 12:00–23:00')
    expect(hoursText([])).toBe('')
  })

  it('valida la solicitud y explica los errores de la API', () => {
    const form = { branchCode: 'CENTRO', date: '2026-11-28', time: '20:00', partySize: 2, name: 'Ana', phone: '33 9876 5432' }
    expect(requestProblem(form)).toBe('')
    expect(requestProblem({ ...form, phone: '123' })).toMatch(/10 dígitos/)
    expect(requestProblem({ ...form, time: '' })).toMatch(/hora/)
    expect(requestErrorText(new ApiError(409, { error: { code: 'RESERVATION_NOT_AVAILABLE' } }))).toMatch(/ya no está disponible/)
    expect(requestErrorText(new ApiError(409, { error: { code: 'RESERVATION_ACTIVE_LIMIT_EXCEEDED' } }))).toMatch(/dos reservas activas/)
    expect(localDate(1, new Date(2026, 10, 30))).toBe('2026-12-01')
  })

  it('manda la conversación alternada y sin errores', () => {
    const msgs = [{ role: 'assistant', content: 'x' }, { role: 'user', content: 'Hola' }, { role: 'assistant', content: 'falló', error: true }]
    expect(conversationForApi(msgs)).toEqual([{ role: 'user', content: 'Hola' }])
  })

  it('el panel lee el punto como lo copia Google Maps', () => {
    expect(parseLocation('20.6736123456, -103.3440123456')).toEqual({ lat: 20.673612, lng: -103.344012 })
    expect(parseLocation('20.6736 -103.344')).toEqual({ lat: 20.6736, lng: -103.344 })
    expect(parseLocation('')).toBeNull()
    expect(parseLocation('Guadalajara')).toBeUndefined()
    expect(parseLocation('95, 10')).toBeUndefined()
    const branch = { name: 'Centro', phone: null, address: null, location: null }
    const form = generalForm(branch)
    form.location = 'abc'
    expect(generalProblem(form)).toMatch(/latitud, longitud/)
    form.location = '20.67, -103.34'
    expect(generalChanges(branch, form)).toEqual({ location: { lat: 20.67, lng: -103.34 } })
    expect(generalChanges({ ...branch, location: { lat: 20.67, lng: -103.34 } }, form)).toEqual({})
  })
})

async function chooseDateAndParty(wrapper) {
  const form = wrapper.find('form.rsv-card')
  await form.find('input[type="date"]').setValue(localDate(1))
  await form.findAll('select')[1].setValue('2')
  await flushPromises()
}

describe('sitio público: página', () => {
  it('preselecciona la sucursal del enlace cuando llegan los horarios de sucursales', async () => {
    const api = fakeApi()
    const wrapper = mount(SiteReservation, { props: { api, branches: [], branchCode: ZAPOPAN.code } })
    await wrapper.setProps({ branches: [CENTRO, { ...ZAPOPAN, reservations: true }] })
    await flushPromises()
    expect(wrapper.find('form.rsv-card select').element.value).toBe(ZAPOPAN.code)
    expect(api.slots).not.toHaveBeenCalled()
    await chooseDateAndParty(wrapper)
    expect(api.slots).toHaveBeenCalledWith(ZAPOPAN.code, localDate(1), 2)
    wrapper.unmount()
  })

  it('muestra las sucursales y, con la ubicación, marca la más cercana', async () => {
    const geolocation = { getCurrentPosition: vi.fn((ok) => ok({ coords: { latitude: 20.721, longitude: -103.389 } })) }
    const wrapper = await mountSite(fakeApi(), geolocation)
    expect(wrapper.findAll('.loc-card')).toHaveLength(2)
    expect(wrapper.find('.loc-card a[href^="https://www.google.com/maps"]').exists()).toBe(true)
    // Zapopan no acepta reservas en línea.
    expect(wrapper.findAll('.loc-reserve')).toHaveLength(1)
    await wrapper.find('.loc-locate').trigger('click')
    await flushPromises()
    expect(wrapper.find('.loc-nearest').text()).toContain('La Mesa Zapopan')
    expect(wrapper.find('.map-stub').attributes('data-selected')).toBe('ZAPOPAN')
    expect(wrapper.findAll('.loc-name span').map((s) => s.text())).toEqual(['La Mesa Zapopan', 'La Mesa Centro'])
    wrapper.unmount()
  })

  it('si niegan la ubicación, lo dice y deja elegir a mano', async () => {
    const geolocation = { getCurrentPosition: vi.fn((ok, fail) => fail({ code: 1 })) }
    const wrapper = await mountSite(fakeApi(), geolocation)
    await wrapper.find('.loc-locate').trigger('click')
    expect(wrapper.find('.loc-note').text()).toMatch(/permiso/)
    wrapper.unmount()
  })

  it('sin asistente no muestra el chat', async () => {
    const wrapper = await mountSite(fakeApi({ branches: vi.fn(async () => ({ branches: [CENTRO], assistant: false })) }))
    expect(wrapper.find('.fab').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Restia')
    wrapper.unmount()
  })

  it('solicita correo si está habilitado y muestra el cambio a confirmada', async () => {
    const api = fakeApi()
    const wrapper = mount(SiteReservation, { props: { api, branches: [CENTRO], emailAvailable: true } })
    await flushPromises()
    await chooseDateAndParty(wrapper)
    await wrapper.find('input[value="20:00"]').setValue(true)
    await wrapper.find('input[autocomplete="name"]').setValue('Ana')
    await wrapper.find('input[autocomplete="tel-national"]').setValue('3311112222')
    await wrapper.find('input[type="email"]').setValue('ana@example.com')
    await wrapper.find('form.rsv-card').trigger('submit')
    await flushPromises()
    expect(api.createRequest).toHaveBeenCalledWith(expect.objectContaining({ email: 'ana@example.com' }), expect.any(String))
    expect(wrapper.find('.rsv-done h3').text()).toBe('Solicitud recibida')
    expect(wrapper.find('.rsv-done').text()).toContain('este folio por correo')
    expect(wrapper.find('.rsv-done').text()).not.toContain('Ana')
    const form = wrapper.find('form.rsv-card')
    expect(form.findAll('input,select').map((field) => field.element.value)).toEqual(['', '', '', '', '', '', ''])
    await wrapper.find('.rsv-actions .rsv-primary').trigger('click')
    await flushPromises()
    expect(api.lookup).toHaveBeenCalledWith({ branchCode: 'CENTRO', folio: 'ABCD2345', phone: '3311112222' })
    expect(wrapper.find('.rsv-done h3').text()).toBe('Reserva confirmada')
    wrapper.unmount()
  })

  it('la propuesta del asistente llena el formulario, pero no lo envía', async () => {
    const api = fakeApi({ ask: vi.fn(async () => ({ reply: 'Revisa los datos', reservationDraft: { branchCode: 'CENTRO', date: localDate(2), time: '20:00', partySize: 3, name: 'Luis', phone: '3311112222' } })) })
    const wrapper = await mountSite(api)
    await wrapper.find('.fab').trigger('click')
    await wrapper.find('#assistant-input').setValue('Mesa para 3 pasado mañana a las 8')
    await wrapper.find('.compose').trigger('submit')
    await flushPromises()
    expect(wrapper.find('.rsv-assist').exists()).toBe(true)
    expect(wrapper.find('.rsv-slot.on').text()).toBe('20:00')
    expect(wrapper.find('input[autocomplete="name"]').element.value).toBe('Luis')
    expect(api.createRequest).not.toHaveBeenCalled()
    await wrapper.find('form.rsv-card').trigger('submit')
    await flushPromises()
    expect(api.createRequest).toHaveBeenCalledWith({ branchCode: 'CENTRO', date: localDate(2), time: '20:00', partySize: 3, name: 'Luis', phone: '3311112222' }, expect.any(String))
    expect(wrapper.find('.rsv-ticket strong').text()).toContain('ABCD2345')
    wrapper.unmount()
  })
})

describe('solicitud de reserva', () => {
  it('solo ofrece horas con lugar y reintenta con la misma llave', async () => {
    let fail = true
    const api = fakeApi({
      createRequest: vi.fn(async () => {
        if (fail) { fail = false; throw new ApiError(0, null) }
        return { folio: 'ABCD2345', status: 'PENDING', branchCode: 'CENTRO', branchName: 'La Mesa Centro', date: localDate(1), time: '13:30', partySize: 2, name: 'Ana' }
      }),
    })
    const wrapper = mount(SiteReservation, { props: { api, branches: [CENTRO, ZAPOPAN] } })
    await flushPromises()
    // Solo Centro acepta solicitudes: queda elegida sola.
    expect(wrapper.findAll('select')[0].element.value).toBe('CENTRO')
    await chooseDateAndParty(wrapper)
    expect(api.slots).toHaveBeenCalledWith('CENTRO', localDate(1), 2)
    expect(wrapper.findAll('.rsv-slot').map((s) => s.text())).toEqual(['13:00', '13:30', '20:00'])
    await wrapper.findAll('.rsv-slot input')[1].setValue(true)
    await wrapper.find('input[autocomplete="name"]').setValue('Ana')
    await wrapper.find('input[autocomplete="tel-national"]').setValue('33 9876 5432')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('.rsv-error').text()).toMatch(/conexión/)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    const [first, second] = api.createRequest.mock.calls
    expect(second[1]).toBe(first[1])
    expect(second[0]).toMatchObject({ phone: '3398765432', time: '13:30' })
    expect(wrapper.find('.rsv-done').text()).toContain('ABCD2345')
    wrapper.unmount()
  })

  it('consulta el estado con folio y teléfono', async () => {
    const api = fakeApi()
    const wrapper = mount(SiteReservation, { props: { api, branches: [CENTRO] } })
    await flushPromises()
    const lookup = wrapper.find('.rsv-lookup form')
    const [select] = lookup.findAll('select')
    await select.setValue('CENTRO')
    const inputs = lookup.findAll('input')
    await inputs[0].setValue('abcd2345')
    await inputs[1].setValue('3398765432')
    await lookup.trigger('submit')
    await flushPromises()
    expect(api.lookup).toHaveBeenCalledWith({ branchCode: 'CENTRO', folio: 'ABCD2345', phone: '3398765432' })
    expect(wrapper.find('.rsv-found').text()).toContain('Confirmada')
  })
})
