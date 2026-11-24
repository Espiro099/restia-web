import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { guard, routes } from '../src/router.js'
import SiteView from '../src/views/SiteView.vue'

describe('sitio de La Mesa', () => {
  it('la raíz es el sitio para clientes y el acceso del personal vive en /acceso', async () => {
    const byName = Object.fromEntries(routes.filter((r) => r.name).map((r) => [r.name, r]))
    expect(byName.sitio.path).toBe('/')
    expect(byName.sitio.meta.anonymous).toBe(true)
    expect(byName.login.path).toBe('/acceso')
    // El sitio no pregunta por sesión: cualquiera lo ve.
    const session = { restore: () => { throw new Error('no debe consultarse') } }
    expect(await guard({ meta: byName.sitio.meta, fullPath: '/' }, session)).toBe(true)
  })

  it('lleva la marca La Mesa, sus secciones sin publicar el enlace del personal', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    router.push('/')
    await router.isReady()
    const api = { branches: async () => ({ branches: [], assistant: false }) }
    const wrapper = mount(SiteView, { props: { api }, global: { plugins: [router], stubs: { BranchMap: true } } })
    await flushPromises()
    expect(document.title).toBe('La Mesa · Restaurante')
    expect(wrapper.find('h1').text()).toContain('El sabor de compartir')
    expect(wrapper.findAll('img[alt="La Mesa · Inicio"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('Reserva una mesa.')
    expect(wrapper.text()).not.toContain('Restia')
    for (const id of ['menu', 'instalaciones', 'nosotros', 'sucursales', 'reservar', 'contacto']) expect(wrapper.find(`#${id}`).exists()).toBe(true)
    expect(wrapper.find('#novedades').exists()).toBe(false)
    expect(wrapper.find('a[href="/#novedades"]').exists()).toBe(false)
    expect(wrapper.find('#nosotros').text()).toContain('Abrimos La Mesa')
    expect(wrapper.text().toLowerCase()).not.toContain('proyecto estudiantil')
    expect(wrapper.findAll('.dish-preview')).toHaveLength(4)
    expect(wrapper.find('a[href="/como-llegar"]').exists()).toBe(true)
    expect(wrapper.find('a[href="/privacidad"]').exists()).toBe(true)
    expect(wrapper.find('a[href="/acceso"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Acceso para el personal')
    wrapper.unmount()
  })
})
