import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError } from '../src/lib/api.js'
import { actionText, changeLines } from '../src/lib/audit.js'
import { devicesErrorText, groupCode, sortDevices } from '../src/lib/devices.js'
import { useSession } from '../src/stores/session.js'
import DevicesView from '../src/views/DevicesView.vue'
import AuditView from '../src/views/AuditView.vue'

function sessionWith(permissions) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSession().adopt({ user: { id: 'yo', name: 'Yo' }, memberships: [{ branch: { id: 'b1', name: 'Centro' }, role: 'MANAGER', permissions }] })
  return pinia
}
const device = (id, status, lastSeenAt) => ({ id, branchId: 'b1', type: 'ANDROID', status, displayName: `Teléfono ${id}`, enrolledAt: '2026-11-10T15:00:00Z', lastSeenAt, version: 1 })

describe('reglas de Dispositivos y Auditoría', () => {
  it('agrupa el código, ordena activos primero y explica el límite de códigos', () => {
    expect(groupCode('ABCDEFGHJKMN')).toBe('ABCD EFGH JKMN')
    const sorted = sortDevices([device('a', 'RETIRED', '2026-11-22T10:00:00Z'), device('b', 'ACTIVE', '2026-11-20T10:00:00Z'), device('c', 'ACTIVE', '2026-11-21T10:00:00Z')])
    expect(sorted.map((d) => d.id)).toEqual(['c', 'b', 'a'])
    expect(devicesErrorText(new ApiError(429, null))).toMatch(/muchos códigos/)
  })

  it('traduce acciones y muestra cambios antes y después', () => {
    expect(actionText('product.status_changed')).toBe('Producto: cambio de estado')
    expect(actionText('cash_shift.closed')).toBe('Turno de caja: cierre')
    expect(actionText('algo.nuevo_evento')).toBe('algo: nuevo evento')
    expect(changeLines({ before: { role: 'WAITER' }, after: { role: 'KITCHEN' } })).toEqual([{ field: 'role', text: 'WAITER → KITCHEN' }])
    expect(changeLines({ code: 'X', name: null })).toEqual([{ field: 'code', text: 'X' }, { field: 'name', text: '—' }])
    expect(changeLines(null)).toEqual([])
  })
})

describe('pantalla de Dispositivos', () => {
  let calls
  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
    calls = {
      list: vi.fn(async () => [device('a', 'ACTIVE', '2026-11-22T10:00:00Z'), device('b', 'BLOCKED', null)]),
      enrollmentCode: vi.fn(async () => ({ code: 'ABCDEFGHJKMN', expiresAt: '2026-11-22T18:15:00Z' })),
      close: vi.fn(async () => ({ data: null })),
    }
  })

  it('oculta los cerrados hasta pedirlos y genera el código agrupado', async () => {
    const wrapper = mount(DevicesView, { props: { api: calls }, global: { plugins: [sessionWith(['devices.read', 'devices.enroll', 'devices.manage'])] }, attachTo: document.body })
    await flushPromises()
    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    await wrapper.find('input[type="checkbox"]').setValue(true)
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)

    await wrapper.findAll('button').find((b) => b.text() === 'Generar código de alta').trigger('click')
    await flushPromises()
    expect(wrapper.find('.code').text()).toBe('ABCD EFGH JKMN')
  })

  it('bloquear pide motivo y manda la acción', async () => {
    const wrapper = mount(DevicesView, { props: { api: calls }, global: { plugins: [sessionWith(['devices.read', 'devices.manage'])] }, attachTo: document.body })
    await flushPromises()
    expect(wrapper.findAll('button').find((b) => b.text() === 'Generar código de alta')).toBeUndefined()
    await wrapper.findAll('button').find((b) => b.text() === 'Bloquear').trigger('click')
    await wrapper.find('textarea').setValue('Se perdió')
    await wrapper.find('[role="dialog"] form').trigger('submit')
    await flushPromises()
    expect(calls.close).toHaveBeenCalledWith('b1', expect.objectContaining({ id: 'a' }), 'BLOCK', 'Se perdió')
  })
})

describe('pantalla de Auditoría', () => {
  let calls
  beforeEach(() => {
    calls = {
      search: vi.fn(async () => ({
        data: [
          { id: 'e1', actorType: 'USER', actorId: 'u1', action: 'member.role_changed', entityType: 'member', reason: null, changes: { before: { role: 'WAITER' }, after: { role: 'KITCHEN' } }, requestId: 'req-1', createdAt: '2026-11-22T12:00:00Z' },
          { id: 'e2', actorType: 'SYSTEM', actorId: null, action: 'print_job.expired', entityType: 'print_job', reason: null, changes: null, requestId: null, createdAt: '2026-11-22T11:00:00Z' },
        ],
        meta: { pagination: { total: 2 } },
      })),
      people: vi.fn(async () => [{ id: 'u1', name: 'Ana Gerente' }]),
    }
  })

  it('pide los últimos 7 días, nombra a quién y abre los cambios', async () => {
    const wrapper = mount(AuditView, { props: { api: calls, today: () => new Date(2026, 10, 22) }, global: { plugins: [sessionWith(['audit.read'])] } })
    await flushPromises()
    const args = calls.search.mock.calls[0][1]
    expect(new Date(args.from).getDate()).toBe(16)
    expect(new Date(args.to).getDate()).toBe(22)
    expect(wrapper.text()).toContain('Ana Gerente')
    expect(wrapper.text()).toContain('Empleado: cambio de rol')
    expect(wrapper.text()).toContain('Sistema')
    await wrapper.findAll('button').find((b) => b.text() === 'Ver cambios').trigger('click')
    expect(wrapper.find('.detail').text()).toContain('WAITER → KITCHEN')
  })

  it('no consulta más de 31 días', async () => {
    const wrapper = mount(AuditView, { props: { api: calls, today: () => new Date(2026, 10, 22) }, global: { plugins: [sessionWith(['audit.read'])] } })
    await flushPromises()
    calls.search.mockClear()
    await wrapper.find('input[type="date"]').setValue('2026-09-01')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toMatch(/31 días/)
    expect(calls.search).not.toHaveBeenCalled()
  })
})
