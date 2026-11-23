import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { catalogApi } from '../src/lib/catalog.js'
import { fitWithin, imageProblem, imageSrc, shrinkImage } from '../src/lib/productImage.js'
import { useSession } from '../src/stores/session.js'
import MenuView from '../src/views/MenuView.vue'

vi.mock('../src/lib/productImage.js', async (original) => {
  const real = await original()
  return { ...real, shrinkImage: vi.fn(real.shrinkImage) }
})

const IMG = 'https://restia-api-staging.onrender.com/api/v1/public/images/0b9a7c1e-2f43-4c1a-9d2b-7e5f3a1c8d90'

describe('foto del producto', () => {
  it('pide la foto por el dominio del panel y no muestra otras direcciones', () => {
    expect(imageSrc(IMG)).toBe('/api/v1/public/images/0b9a7c1e-2f43-4c1a-9d2b-7e5f3a1c8d90')
    expect(imageSrc('https://otro.mx/foto.jpg')).toBeNull()
    expect(imageSrc('javascript:alert(1)')).toBeNull()
    expect(imageSrc(null)).toBeNull()
  })

  it('acepta JPG, PNG o WebP de hasta 20 MB', () => {
    expect(imageProblem({ type: 'image/jpeg', size: 3_000_000 })).toBe('')
    expect(imageProblem({ type: 'image/svg+xml', size: 100 })).toMatch(/JPG, PNG o WebP/)
    expect(imageProblem({ type: 'image/png', size: 21 * 1024 * 1024 })).toMatch(/20 MB/)
    expect(imageProblem(null)).toBe('Elige una foto.')
  })

  it('reduce al lado mayor de 1200 sin agrandar', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1200, height: 900 })
    expect(fitWithin(900, 1800)).toEqual({ width: 600, height: 1200 })
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
  })

  it('dibuja la foto reducida con fondo blanco y la entrega como JPEG', async () => {
    const ctx = { fillRect: vi.fn(), drawImage: vi.fn(), fillStyle: '' }
    const blob = new Blob(['x'], { type: 'image/jpeg' })
    const canvas = { getContext: () => ctx, toBlob: vi.fn((done, type, quality) => done(blob)) }
    const bitmap = { width: 3000, height: 1500, close: vi.fn() }
    const decode = vi.fn(async () => bitmap)

    expect(await shrinkImage('archivo', { createImageBitmap: decode, createCanvas: () => canvas })).toBe(blob)
    expect(decode).toHaveBeenCalledWith('archivo', { imageOrientation: 'from-image' })
    expect([canvas.width, canvas.height]).toEqual([1200, 600])
    expect(ctx.fillStyle).toBe('#ffffff')
    expect(ctx.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1200, 600)
    expect(canvas.toBlob.mock.calls[0].slice(1)).toEqual(['image/jpeg', 0.85])
    await expect(shrinkImage('x', { createImageBitmap: async () => { throw new Error('mal') } })).rejects.toThrow(/No se pudo leer/)
  })

  it('sube con multipart e If-Match y quita con imageUrl null', async () => {
    const api = { putForm: vi.fn(async () => ({ data: {} })), patch: vi.fn(async () => ({ data: {} })) }
    const calls = catalogApi(api)
    const blob = new Blob(['x'], { type: 'image/jpeg' })
    await calls.uploadImage('b1', { id: 'p1', version: 3 }, blob)
    await calls.removeImage('b1', { id: 'p1', version: 4 })

    const [url, form, options] = api.putForm.mock.calls[0]
    expect(url).toBe('/branches/b1/products/p1/image')
    expect(form.get('image').name).toBe('foto.jpg')
    expect(options).toEqual({ headers: { 'If-Match': '"3"' } })
    expect(api.patch).toHaveBeenCalledWith('/branches/b1/products/p1', { imageUrl: null }, { headers: { 'If-Match': '"4"' } })
  })
})

describe('foto en la pantalla del Menú', () => {
  const product = (extra = {}) => ({
    id: 'p1', code: 'PASTOR', name: 'Taco al pastor', description: null, category: 'Tacos', displayOrder: 0,
    price: { amount: '25.00', currency: 'MXN' }, status: 'ACTIVE', availability: 'AVAILABLE', modifierIds: [],
    routes: [{ stationId: 's1', priority: 1 }], fiscal: null, imageUrl: null, version: 2, ...extra,
  })
  let calls
  let products

  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
    products = [product()]
    URL.createObjectURL = vi.fn(() => 'blob:vista')
    URL.revokeObjectURL = vi.fn()
    calls = {
      products: vi.fn(async () => products),
      stations: vi.fn(async () => [{ id: 's1', code: 'COCINA', name: 'Cocina', status: 'ACTIVE', version: 1 }]),
      modifiers: vi.fn(async () => []),
      uploadImage: vi.fn(async () => ({ data: {} })),
      removeImage: vi.fn(async () => ({ data: {} })),
    }
  })
  afterEach(() => vi.clearAllMocks())

  async function mountMenu() {
    const pinia = createPinia()
    setActivePinia(pinia)
    useSession().adopt({ user: { id: 'yo', name: 'Yo' }, memberships: [{ branch: { id: 'b1', name: 'Centro' }, role: 'MANAGER', permissions: ['menu.read', 'menu.manage'] }] })
    const wrapper = mount(MenuView, { props: { api: calls }, global: { plugins: [pinia] }, attachTo: document.body })
    await flushPromises()
    return wrapper
  }
  const button = (wrapper, text) => wrapper.findAll('button').find((b) => b.text() === text)

  async function choose(wrapper, file) {
    const input = wrapper.find('[role="dialog"] input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
  }

  it('elige una foto, la reduce y la sube', async () => {
    shrinkImage.mockResolvedValueOnce(new Blob(['jpeg'], { type: 'image/jpeg' }))
    const wrapper = await mountMenu()
    expect(wrapper.find('tbody img').exists()).toBe(false)
    await button(wrapper, 'Foto').trigger('click')
    expect(wrapper.find('[role="dialog"]').text()).toContain('Todavía no tiene foto.')

    await choose(wrapper, new File(['svg'], 'x.svg', { type: 'image/svg+xml' }))
    expect(wrapper.find('[role="dialog"]').text()).toContain('JPG, PNG o WebP')
    expect(wrapper.find('[role="dialog"] button[type="submit"]').attributes('disabled')).toBeDefined()

    const file = new File(['png'], 'taco.png', { type: 'image/png' })
    await choose(wrapper, file)
    expect(wrapper.find('[role="dialog"] .photo-preview img').attributes('src')).toBe('blob:vista')
    await wrapper.find('[role="dialog"] form').trigger('submit')
    await flushPromises()

    expect(shrinkImage).toHaveBeenCalledWith(file)
    expect(calls.uploadImage).toHaveBeenCalledWith('b1', products[0], expect.any(Blob))
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Se guardó la foto de Taco al pastor')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:vista')
  })

  it('muestra la foto actual por el dominio del panel y la puede quitar', async () => {
    products = [product({ imageUrl: IMG })]
    const wrapper = await mountMenu()
    expect(wrapper.find('tbody img').attributes('src')).toBe('/api/v1/public/images/0b9a7c1e-2f43-4c1a-9d2b-7e5f3a1c8d90')
    await button(wrapper, 'Foto').trigger('click')
    await button(wrapper, 'Quitar foto').trigger('click')
    await flushPromises()
    expect(calls.removeImage).toHaveBeenCalledWith('b1', products[0])
    expect(wrapper.text()).toContain('Se quitó la foto de Taco al pastor')
  })
})
