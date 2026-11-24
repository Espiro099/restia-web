import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ApiError } from '../src/lib/api.js'
import { MAX_CHARS, MAX_TURNS, conversationForApi, siteAssistantErrorText, telHref } from '../src/lib/site.js'
import * as publicMenu from '../src/lib/publicMenu.js'
import AssistantChat from '../src/components/AssistantChat.vue'

describe('asistente del sitio: reglas', () => {
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
    const long = Array.from({ length: 21 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }))
    const sent = conversationForApi(long)
    expect(sent.length).toBeLessThanOrEqual(MAX_TURNS)
    expect(sent[0].role).toBe('user')
    expect(sent.at(-1).content).toBe('m20')
  })

  it('teléfono y textos de error', () => {
    expect(telHref('33 1234 5678')).toBe('tel:3312345678')
    expect(telHref('12')).toBe('')
    expect(siteAssistantErrorText(new ApiError(429, null))).toMatch(/espera un minuto/i)
    expect(siteAssistantErrorText(new ApiError(503, { error: { code: 'SERVICE_BUSY' } }))).toMatch(/no está disponible/)
  })

  it('el menú del QR ya no tiene asistente (QR-14 retirado)', () => {
    const api = publicMenu.publicMenuApi({ fetch: vi.fn() })
    expect(api.ask).toBeUndefined()
    expect(publicMenu.conversationForApi).toBeUndefined()
  })
})

describe('chat del asistente', () => {
  it('abre, pregunta con una sugerencia y muestra la respuesta', async () => {
    const ask = vi.fn(async () => ({ reply: 'Te recomiendo el pozole.', reservationDraft: null }))
    const wrapper = mount(AssistantChat, { props: { ask, restaurant: 'La Mesa' }, attachTo: document.body })
    expect(wrapper.find('.fab').text()).toBe('¿Te ayudo?')
    await wrapper.find('.fab').trigger('click')
    expect(wrapper.find('[role="dialog"]').text()).toContain('Asistente de La Mesa')
    expect(wrapper.find('input').attributes('maxlength')).toBe(String(MAX_CHARS))
    await wrapper.findAll('.chips button')[1].trigger('click')
    await flushPromises()
    expect(ask).toHaveBeenCalledWith([{ role: 'user', content: '¿Qué me recomiendas?' }, { role: 'assistant', content: 'Te recomiendo el pozole.' }])
    expect(wrapper.findAll('.msg').map((m) => m.text())).toEqual(['Tú:¿Qué me recomiendas?', 'Asistente:Te recomiendo el pozole.'])
    expect(wrapper.emitted('draft')).toBeUndefined()
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
