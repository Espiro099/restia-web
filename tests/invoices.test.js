import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createApi } from '../src/lib/api.js'
import { invoiceActions, invoicesApi, receiverProblem } from '../src/lib/invoices.js'
import { useSession } from '../src/stores/session.js'
import InvoicesView from '../src/views/InvoicesView.vue'

const mxn = (amount) => ({ amount, currency: 'MXN' })
const RECEIVER = { rfc: 'XAXX010101000', legalName: 'PUBLICO', taxRegime: '616', postalCode: '44100', cfdiUse: 'S01' }
const invoice = (id, status, extra = {}) => ({
  id, scope: 'NOMINATIVE', type: 'INGRESO', status, receiver: { ...RECEIVER, rfc: 'MOLD800101AB1', legalName: 'DANA MORA', cfdiUse: 'G03', taxRegime: '612' },
  series: null, folio: null, lines: [{ description: 'Tacos', quantity: '1', amount: mxn('81.90'), taxAmount: mxn('13.10') }],
  subtotal: mxn('81.90'), taxTotal: mxn('13.10'), total: mxn('95.00'), fiscalUuid: status === 'STAMPED' ? 'AAAA-BBBB' : null,
  stampedAt: null, cancellation: null, creditNoteRequired: false, lastError: null, createdAt: '2026-11-22T12:00:00Z', version: 3, ...extra,
})

describe('cliente HTTP: multipart y ETag', () => {
  it('manda FormData sin Content-Type y devuelve el ETag cuando se pide', async () => {
    const fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: { id: 'b1' } }), headers: { get: (h) => (h === 'ETag' ? '"7"' : null) } }))
    const api = createApi({ fetch, cookies: () => 'XSRF-TOKEN=t' })
    const form = new FormData()
    form.append('password', 'x')

    await api.putForm('/fiscal-issuers/i1/csd', form, { headers: { 'If-Match': '"2"' } })
    const r = await api.get('/branches/b1', { withEtag: true })

    const init = fetch.mock.calls[0][1]
    expect(init.method).toBe('PUT')
    expect(init.body).toBe(form)
    expect(init.headers['Content-Type']).toBeUndefined()
    expect(init.headers['X-XSRF-TOKEN']).toBe('t')
    expect(r).toEqual({ data: { id: 'b1' }, etag: '"7"' })
  })
})

describe('reglas de Facturación', () => {
  const all = { create: true, stamp: true, cancel: true, reconcile: true }

  it('las acciones siguen los estados editables y cancelables', () => {
    expect(invoiceActions(invoice('a', 'DRAFT'), all)).toMatchObject({ edit: true, discard: true, stamp: true, cancel: false, files: false })
    expect(invoiceActions(invoice('b', 'STAMP_FAILED'), all).stamp).toBe(true)
    expect(invoiceActions(invoice('c', 'STAMPED'), all)).toMatchObject({ edit: false, stamp: false, cancel: true, files: true })
    expect(invoiceActions(invoice('d', 'UNKNOWN'), all).reconcile).toBe(true)
    expect(invoiceActions(invoice('e', 'STAMPED'), { ...all, cancel: false }).cancel).toBe(false)
  })

  it('valida al receptor como lo pide el SAT', () => {
    expect(receiverProblem(RECEIVER)).toBe('')
    expect(receiverProblem({ ...RECEIVER, rfc: 'ABC' })).toMatch(/RFC/)
    expect(receiverProblem({ ...RECEIVER, postalCode: '441' })).toMatch(/código postal/)
  })

  it('timbrar y cancelar mandan Idempotency-Key e If-Match; asignar emisor usa el ETag de la sucursal', async () => {
    const api = {
      get: vi.fn(async () => ({ data: {}, etag: '"9"' })),
      post: vi.fn(async () => ({ data: {} })),
      put: vi.fn(async () => ({ data: {} })),
    }
    const calls = invoicesApi(api)
    await calls.stamp('b1', invoice('i1', 'DRAFT'))
    await calls.cancel('b1', invoice('i1', 'STAMPED'), '01', ' Datos mal ', 'r-1')
    await calls.assignToBranch('b1', 'iss-1')

    expect(api.post.mock.calls[0][2].headers).toMatchObject({ 'If-Match': '"3"' })
    expect(api.post.mock.calls[0][2].headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
    expect(api.post.mock.calls[1][1]).toEqual({ reasonCode: '01', reason: 'Datos mal', replacementInvoiceId: 'r-1' })
    expect(api.get).toHaveBeenCalledWith('/branches/b1', { withEtag: true })
    expect(api.put).toHaveBeenCalledWith('/branches/b1/fiscal-issuer', { fiscalIssuerId: 'iss-1' }, { headers: { 'If-Match': '"9"' } })
  })
})

describe('pantalla de Facturación', () => {
  let calls

  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
    calls = {
      list: vi.fn(async () => ({ data: [invoice('i1', 'STAMPED'), invoice('i2', 'DRAFT')], meta: { pagination: { total: 2 } } })),
      payableChecks: vi.fn(async () => [{ id: 'k1', number: 12, total: mxn('95.00') }]),
      create: vi.fn(async () => ({ data: invoice('nuevo', 'DRAFT') })),
      update: vi.fn(async () => ({ data: {} })),
      discard: vi.fn(async () => ({ data: {} })),
      stamp: vi.fn(async () => ({ data: {} })),
      cancel: vi.fn(async () => ({ data: {} })),
      reconcile: vi.fn(async () => ({ data: {} })),
      fileUrl: (b, inv, kind) => `/api/v1/branches/${b}/invoices/${inv.id}/${kind}`,
      issuers: vi.fn(async () => [{ id: 'iss', rfc: 'EKU9003173C9', legalName: 'ESCUELA KEMPER URGATE', taxRegime: '601', postalCode: '42501', globalPeriodicity: 'MONTHLY', csd: null, status: 'ACTIVE', version: 1 }]),
      uploadCsd: vi.fn(async () => ({ data: {} })),
    }
  })

  async function mountAs(permissions) {
    const pinia = createPinia()
    setActivePinia(pinia)
    useSession().adopt({ user: { id: 'yo', name: 'Yo' }, memberships: [{ branch: { id: 'b1', name: 'Centro' }, role: 'ADMIN', permissions }] })
    const wrapper = mount(InvoicesView, { props: { api: calls, today: () => new Date(2026, 10, 22) }, global: { plugins: [pinia] }, attachTo: document.body })
    await flushPromises()
    return wrapper
  }
  const MANAGER = ['invoices.read', 'invoices.create', 'invoices.stamp', 'invoices.cancel', 'invoices.reconcile']
  const button = (scope, text) => scope.findAll('button').find((b) => b.text() === text)

  it('sin fiscal.manage_issuers no hay pestaña de emisores', async () => {
    const wrapper = await mountAs(MANAGER)
    expect(wrapper.find('[role="tab"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('DANA MORA')
    expect(wrapper.text()).toContain('$95.00 MXN')
  })

  it('facturar una cuenta crea el borrador y pasa directo a timbrar', async () => {
    const wrapper = await mountAs(MANAGER)
    await button(wrapper, 'Facturar una cuenta').trigger('click')
    await flushPromises()
    expect(calls.payableChecks).toHaveBeenCalledWith('b1', '2026-11-22')
    const dialog = wrapper.find('[role="dialog"]')
    const inputs = dialog.findAll('input.field')
    await inputs[1].setValue('mold800101ab1')
    await inputs[2].setValue('44100')
    await inputs[3].setValue('Dana Mora')
    await dialog.find('form').trigger('submit')
    await flushPromises()

    expect(calls.create).toHaveBeenCalledWith('b1', 'k1', { rfc: 'MOLD800101AB1', legalName: 'DANA MORA', taxRegime: '616', postalCode: '44100', cfdiUse: 'G03' })
    expect(wrapper.find('[role="dialog"]').attributes('aria-label')).toBe('Timbrar factura')
    await wrapper.find('[role="dialog"] form').trigger('submit')
    await flushPromises()
    expect(calls.stamp).toHaveBeenCalledWith('b1', expect.objectContaining({ id: 'nuevo' }))
  })

  it('cancelar con motivo 01 pide la factura sustituta', async () => {
    const wrapper = await mountAs(MANAGER)
    await button(wrapper.findAll('tbody tr')[0], 'Cancelar').trigger('click')
    const dialog = wrapper.find('[role="dialog"]')
    await dialog.find('select').setValue('01')
    await dialog.find('textarea').setValue('El RFC venía mal')
    expect(dialog.find('button[type="submit"]').attributes('disabled')).toBeDefined()
    await dialog.find('input.mono').setValue('12345678-1234-4123-8123-123456789012')
    await dialog.find('form').trigger('submit')
    await flushPromises()
    expect(calls.cancel).toHaveBeenCalledWith('b1', expect.objectContaining({ id: 'i1' }), '01', 'El RFC venía mal', '12345678-1234-4123-8123-123456789012')
  })

  it('la factura timbrada ofrece PDF y XML', async () => {
    const wrapper = await mountAs(MANAGER)
    await button(wrapper.findAll('tbody tr')[0], 'Ver').trigger('click')
    const links = wrapper.findAll('[role="dialog"] a[download]').map((a) => a.attributes('href'))
    expect(links).toEqual(['/api/v1/branches/b1/invoices/i1/pdf', '/api/v1/branches/b1/invoices/i1/xml'])
  })

  it('subir el CSD manda archivos y contraseña, y la contraseña no se queda', async () => {
    const wrapper = await mountAs([...MANAGER, 'fiscal.manage_issuers'])
    await wrapper.findAll('[role="tab"]')[1].trigger('click')
    await flushPromises()
    await button(wrapper, 'Subir CSD').trigger('click')
    const dialog = wrapper.find('[role="dialog"]')
    const [cer, key] = dialog.findAll('input[type="file"]')
    const cerFile = new File(['c'], 'EKU9003173C9.cer')
    const keyFile = new File(['k'], 'EKU9003173C9.key')
    Object.defineProperty(cer.element, 'files', { value: [cerFile] })
    Object.defineProperty(key.element, 'files', { value: [keyFile] })
    await cer.trigger('change')
    await key.trigger('change')
    await dialog.find('input[type="password"]').setValue('12345678a')
    await dialog.find('form').trigger('submit')
    await flushPromises()

    expect(calls.uploadCsd).toHaveBeenCalledWith(expect.objectContaining({ id: 'iss' }), cerFile, keyFile, '12345678a')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Ya se puede timbrar')
  })
})
