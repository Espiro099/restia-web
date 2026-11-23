import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import HomeView from '../src/views/HomeView.vue'
import { useSession } from '../src/stores/session.js'
import { SECURITY_HEADERS } from '../security-headers.js'

// Actividad 3.2: codificación de salida contra XSS y CSP del panel.

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : [path]
  })
}

describe('XSS', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('el texto que llega de la API se muestra escapado, nunca como HTML', async () => {
    const session = useSession()
    // Sin espacios: el inicio saluda con la primera palabra del nombre.
    const payload = '<img/src=x/onerror="alert(1)"><script>alert(2)</script>'
    session.user = { id: 'u1', name: payload }
    session.memberships = []

    const wrapper = mount(HomeView)

    // Vue codifica la interpolación {{ }}: el navegador recibe &lt;img ... y no crea elementos.
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.text()).toContain(payload)
    expect(wrapper.html()).toContain('&lt;img')
  })

  it('el código del panel no usa v-html ni innerHTML', () => {
    const offenders = files('src')
      .filter((f) => /\.(vue|js)$/.test(f))
      .filter((f) => /v-html|innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('index.html no tiene estilos ni scripts en línea, para una CSP sin unsafe-inline', () => {
    const html = readFileSync('index.html', 'utf8')
    expect(html).not.toMatch(/<style/i)
    expect(html).not.toMatch(/\sstyle=/i)
    expect(html).not.toMatch(/\son[a-z]+=/i)
    expect(html.match(/<script[^>]*>/gi)).toEqual(['<script type="module" src="/src/main.js">'])
  })
})

describe('Cabeceras de seguridad del panel', () => {
  it('CSP solo con recursos propios y sin marcos', () => {
    const csp = SECURITY_HEADERS['Content-Security-Policy']
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).not.toContain('unsafe-inline')
    expect(csp).not.toContain('unsafe-eval')
    expect(SECURITY_HEADERS['X-Frame-Options']).toBe('DENY')
    expect(SECURITY_HEADERS['X-Content-Type-Options']).toBe('nosniff')
  })

  it('render.yaml publica las mismas cabeceras que security-headers.js', () => {
    const yaml = readFileSync('render.yaml', 'utf8')
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      const block = new RegExp(`name: ${name}\\s+value: "?([^"\\n]+)"?`).exec(yaml)
      expect(block, name).not.toBeNull()
      expect(block[1].trim()).toBe(value)
    }
  })
})
