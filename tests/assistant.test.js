import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ApiError } from '../src/lib/api.js'
import { addressText, assistantErrorText, conversationForApi, MAX_TURNS, publicMenuApi, telHref } from '../src/lib/publicMenu.js'
import AssistantChat from '../src/components/AssistantChat.vue'
import PublicMenuView from '../src/views/PublicMenuView.vue'

const TOKEN = '30secDfG8LLjLKQMiZQ3mjjUoau5kbZ1S-1DU84qUfs'
const MENU = { menuVersion: 1, products: [], modifiers: [] }

describe('asistente y datos de la sucursal: reglas', () => {
  it('manda la conversación sin errores, alternando y recortada por el principio', () => {
    // Así queda después de un error: la pregunta que falló se quitó y el aviso no se manda.
    const msgs = [
      { role: 'user', content: 'Hola' },
      { role: 'assistant', content: '¡Hola!' },
      { role: 'assistant', content: 'Sin conexión', error: true },
      { role: 'user', content: '¿Qué me recomiendas?' },
    ]
    expect(conversationForApi(msgs)).toEqual([
      { role: 'user', content: 'Hola' }, { role: 'assistant', content: '¡Hola!' }, { role: 'user', content: '¿Qué me recomiendas?' },
    ])
    const long = Array.from({ length: 15 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }))
    const sent = conversationForApi(long)
    expect(sent.length).toBeLessThanOrEqual(MAX_TURNS)
    expect(sent[0].role).toBe('user')
    expect(sent.at(-1).content).toBe('m14')
  })

  it('dirección, teléfono y textos de error', () => {
    expect(addressText({ line1: 'Av. Juárez 120', line2: 'Centro', city: 'Guadalajara', state: 'Jalisco', postalCode: '44100' })).toBe('Av. Juárez 120, Centro, 44100 Guadalajara, Jalisco')
    expect(addressText(null)).toBe('')
    expect(telHref('33 1234 5678')).toBe('tel:3312345678')
    expect(telHref('12')).toBe('')
    expect(assistantErrorText(new ApiError(429, null))).toMatch(/espera un minuto/i)
    expect(assistantErrorText(new ApiError(503, { error: { code: 'SERVICE_BUSY' } }))).toMatch(/no está disponible/)
  })

  it('pregunta por POST con el token del QR y sin cookies', async () => {
    const fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: { reply: 'Los tacos' } }) }))
    const reply = await publicMenuApi({ fetch }).ask(TOKEN, [{ role: 'user', content: '¿Qué pido?' }])
    expect(reply).toBe('Los tacos')
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('/api/v1/public/assistant')
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit' })
    expect(init.headers['X-QR-Token']).toBe(TOKEN)
    expect(JSON.parse(init.body)).toEqual({ messages: [{ role: 'user', content: '¿Qué pido?' }] })
  })
})

describe('chat del asistente', () => {
  it('abre, pregunta con una sugerencia y muestra la respuesta', async () => {
    const ask = vi.fn(async () => 'Te recomiendo el pozole.')
    const wrapper = mount(AssistantChat, { props: { ask, restaurant: 'La Mesa Centro' }, attachTo: document.body })
    await wrapper.find('.fab').trigger('click')
    expect(wrapper.find('[role="dialog"]').text()).toContain('Asistente de La Mesa Centro')
    await wrapper.findAll('.chips button')[0].trigger('click')
    await flushPromises()
    expect(ask).toHaveBeenCalledWith([{ role: 'user', content: '¿Qué me recomiendas?' }, { role: 'assistant', content: 'Te recomiendo el pozole.' }])
    expect(wrapper.findAll('.msg').map((m) => m.text())).toEqual(['Tú:¿Qué me recomiendas?', 'Asistente:Te recomiendo el pozole.'])
    wrapper.unmount()
  })

  it('si falla, lo dice, devuelve la pregunta al campo y no la deja en la conversación', async () => {
    const ask = vi.fn(async () => { throw new ApiError(429, null) })
    const wrapper = mount(AssistantChat, { props: { ask }, attachTo: document.body })
    await wrapper.find('.fab').trigger('click')
    await wrapper.find('input').setValue('¿Tienen postres?')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('.msg.error').text()).toMatch(/Espera un minuto/)
    expect(wrapper.find('input').element.value).toBe('¿Tienen postres?')
    expect(wrapper.findAll('.msg.user')).toHaveLength(0)
    wrapper.unmount()
  })
})

describe('página del menú: visita y asistente', () => {
  beforeEach(() => { window.location.hash = `#${TOKEN}` })

  const calls = (context) => ({
    context: vi.fn(async () => ({ data: { restaurantName: 'La Mesa Centro', tableNumber: 2, currency: 'MXN', timezone: 'America/Mexico_City', ...context } })),
    menu: vi.fn(async () => ({ data: MENU })),
    presence: vi.fn(async () => null),
    ask: vi.fn(async () => 'ok'),
  })

  it('muestra la dirección, Cómo llegar, el teléfono y el asistente cuando la API lo ofrece', async () => {
    const wrapper = mount(PublicMenuView, { props: { api: calls({
      address: { line1: 'Av. Juárez 120', city: 'Guadalajara', state: 'Jalisco', postalCode: '44100' }, phone: '33 1234 5678',
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Av.%20Ju%C3%A1rez', assistant: true,
    }) } })
    await flushPromises()
    expect(wrapper.find('.visit').text()).toContain('Av. Juárez 120, 44100 Guadalajara, Jalisco')
    const link = wrapper.find('.visit a[target="_blank"]')
    expect(link.attributes('href')).toMatch(/^https:\/\/www\.google\.com\/maps\/search/)
    expect(link.attributes('rel')).toBe('noopener noreferrer')
    expect(wrapper.find('a[href="tel:3312345678"]').exists()).toBe(true)
    expect(wrapper.find('.chat .fab').exists()).toBe(true)
  })

  it('sin dirección ni asistente no muestra ninguno de los dos', async () => {
    const wrapper = mount(PublicMenuView, { props: { api: calls({ assistant: false }) } })
    await flushPromises()
    expect(wrapper.find('.visit').exists()).toBe(false)
    expect(wrapper.find('.chat').exists()).toBe(false)
  })
})
