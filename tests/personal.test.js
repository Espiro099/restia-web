import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError } from '../src/lib/api.js'
import { assignableRoles, canManageMember, memberStatus, personalApi, validReason } from '../src/lib/personal.js'
import { useSession } from '../src/stores/session.js'
import PersonalView from '../src/views/PersonalView.vue'

const member = (id, role, { active = true, status = 'ACTIVE', version = 1 } = {}) => ({
  user: { id, email: `${id}@demo.mx`, name: `Persona ${id}`, status, version: 4 },
  branchId: 'b1', role, active, version,
})

describe('reglas de Personal', () => {
  it('el gerente solo asigna y maneja meseros y cocina; nadie se maneja a sí mismo', () => {
    expect(assignableRoles('ADMIN')).toEqual(['ADMIN', 'MANAGER', 'WAITER', 'KITCHEN'])
    expect(assignableRoles('MANAGER')).toEqual(['WAITER', 'KITCHEN'])
    expect(assignableRoles('WAITER')).toEqual([])
    expect(canManageMember('MANAGER', member('m', 'WAITER'), 'yo')).toBe(true)
    expect(canManageMember('MANAGER', member('a', 'ADMIN'), 'yo')).toBe(false)
    expect(canManageMember('ADMIN', member('yo', 'ADMIN'), 'yo')).toBe(false)
    expect(canManageMember('ADMIN', member('b', 'WAITER', { active: false }), 'yo')).toBe(false)
  })

  it('el estado distingue baja de la sucursal, usuario desactivado e invitado', () => {
    expect(memberStatus(member('a', 'WAITER', { active: false })).key).toBe('revoked')
    expect(memberStatus(member('a', 'WAITER', { status: 'INACTIVE' })).key).toBe('inactive')
    expect(memberStatus(member('a', 'WAITER', { status: 'INVITED' })).key).toBe('invited')
    expect(memberStatus(member('a', 'WAITER')).key).toBe('active')
  })

  it('el motivo pide de 3 a 500 caracteres sin contar espacios', () => {
    expect(validReason('  ab ')).toBe(false)
    expect(validReason('Renuncia')).toBe(true)
    expect(validReason('x'.repeat(501))).toBe(false)
  })

  it('las llamadas usan las rutas del contrato y mandan If-Match con la versión', async () => {
    const api = { get: vi.fn(async () => ({ data: [] })), post: vi.fn(async () => ({ data: {} })), patch: vi.fn(async () => ({ data: {} })) }
    const calls = personalApi(api)
    const m = member('u1', 'WAITER', { version: 3 })

    await calls.list('b1', { role: 'WAITER', active: true, page: 2, perPage: 50 })
    await calls.changeRole('b1', m, 'KITCHEN')
    await calls.revoke('b1', m, '  Renuncia  ')
    await calls.deactivate(m.user, 'Robo de equipo')

    expect(api.get).toHaveBeenCalledWith('/branches/b1/members?page=2&perPage=50&role=WAITER&active=true')
    expect(api.patch).toHaveBeenCalledWith('/branches/b1/members/u1', { role: 'KITCHEN' }, { headers: { 'If-Match': '"3"' } })
    expect(api.post).toHaveBeenCalledWith('/branches/b1/members/u1/revoke', { reason: 'Renuncia' }, { headers: { 'If-Match': '"3"' } })
    expect(api.post).toHaveBeenCalledWith('/users/u1/deactivate', { reason: 'Robo de equipo' }, { headers: { 'If-Match': '"4"' } })
  })
})

describe('pantalla de Personal', () => {
  let rows

  function fakeCalls() {
    return {
      list: vi.fn(async () => ({ data: rows, meta: { pagination: { total: rows.length } } })),
      add: vi.fn(async (branchId, d) => ({ data: { member: member('nuevo', d.role), setupUrl: 'https://api.test/contrasena#tok', setupExpiresAt: '2026-11-25T12:00:00Z' } })),
      changeRole: vi.fn(async () => ({ data: {} })),
      revoke: vi.fn(async () => ({ data: {} })),
      setupLink: vi.fn(async () => ({ data: { setupUrl: 'https://api.test/contrasena#otro', expiresAt: '2026-11-25T12:00:00Z' } })),
      deactivate: vi.fn(async () => ({ data: {} })),
      activate: vi.fn(async () => ({ data: {} })),
      revokeSessions: vi.fn(async () => null),
    }
  }

  async function mountAs(role, permissions) {
    const pinia = createPinia()
    setActivePinia(pinia)
    const session = useSession()
    session.adopt({
      user: { id: 'yo', name: 'Yo', email: 'yo@demo.mx' },
      memberships: [
        { branch: { id: 'b1', name: 'Centro' }, role, permissions },
        { branch: { id: 'b2', name: 'Norte' }, role, permissions },
      ],
    })
    const calls = fakeCalls()
    const wrapper = mount(PersonalView, { props: { api: calls }, global: { plugins: [pinia] }, attachTo: document.body })
    await flushPromises()
    return { wrapper, calls, session }
  }

  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
    rows = [member('yo', 'MANAGER'), member('a', 'ADMIN'), member('w', 'WAITER')]
  })

  const buttonsOf = (wrapper, i) => wrapper.findAll('tbody tr')[i].findAll('button').map((b) => b.text())

  it('el gerente ve acciones solo sobre meseros y cocina, y ninguna sobre sí mismo', async () => {
    const { wrapper, calls } = await mountAs('MANAGER', ['members.read', 'members.manage'])

    expect(calls.list).toHaveBeenCalledWith('b1', { role: undefined, active: true, page: 1, perPage: 50 })
    expect(wrapper.text()).toContain('(tú)')
    expect(buttonsOf(wrapper, 0)).toEqual([])
    expect(buttonsOf(wrapper, 1)).toEqual([])
    expect(buttonsOf(wrapper, 2)).toEqual(['Cambiar rol', 'Dar de baja'])
  })

  it('agregar muestra el enlace de contraseña una sola vez', async () => {
    const { wrapper, calls } = await mountAs('MANAGER', ['members.read', 'members.manage'])
    await wrapper.find('button.primary').trigger('click')
    const dialog = wrapper.find('[role="dialog"]')
    expect(dialog.findAll('option').map((o) => o.text())).toEqual(['Mesero', 'Cocina'])

    await dialog.find('input').setValue(' Ana López ')
    await dialog.find('input[type="email"]').setValue('ana@demo.mx')
    await dialog.find('form').trigger('submit')
    await flushPromises()

    expect(calls.add).toHaveBeenCalledWith('b1', expect.objectContaining({ name: ' Ana López ', email: 'ana@demo.mx', role: 'WAITER' }))
    expect(wrapper.find('input.link').element.value).toBe('https://api.test/contrasena#tok')
    expect(calls.list).toHaveBeenCalledTimes(2)
  })

  it('dar de baja pide motivo; un conflicto de versión recarga y deja el diálogo abierto', async () => {
    const { wrapper, calls } = await mountAs('ADMIN', ['members.read', 'members.manage', 'users.manage', 'users.sessions.revoke'])
    calls.revoke.mockRejectedValueOnce(new ApiError(409, { error: { code: 'VERSION_CONFLICT', message: 'x' } }))
    await wrapper.findAll('tbody tr')[2].findAll('button').find((b) => b.text() === 'Dar de baja').trigger('click')
    const confirm = () => wrapper.find('[role="dialog"] button[type="submit"]')
    expect(confirm().attributes('disabled')).toBeDefined()

    await wrapper.find('textarea').setValue('Renuncia')
    await wrapper.find('[role="dialog"] form').trigger('submit')
    await flushPromises()

    expect(calls.revoke).toHaveBeenCalledWith('b1', rows[2], 'Renuncia')
    expect(wrapper.find('[role="dialog"]').text()).toContain('Alguien más lo cambió')
    expect(calls.list).toHaveBeenCalledTimes(2)
  })

  it('el enlace de contraseña avisa que cierra sesiones antes de generarlo', async () => {
    const { wrapper, calls } = await mountAs('ADMIN', ['members.read', 'members.manage', 'users.manage'])
    await wrapper.findAll('tbody tr')[2].findAll('button').find((b) => b.text() === 'Enlace de contraseña').trigger('click')

    expect(calls.setupLink).not.toHaveBeenCalled()
    expect(wrapper.find('[role="dialog"]').text()).toContain('se cierran todas sus sesiones')
    await wrapper.find('[role="dialog"] form').trigger('submit')
    await flushPromises()

    expect(calls.setupLink).toHaveBeenCalledWith(rows[2].user)
    expect(wrapper.find('input.link').element.value).toBe('https://api.test/contrasena#otro')
  })

  it('cambiar de sucursal vuelve a pedir la lista', async () => {
    const { calls, session } = await mountAs('MANAGER', ['members.read'])
    session.selectBranch('b2')
    await flushPromises()
    expect(calls.list).toHaveBeenLastCalledWith('b2', expect.objectContaining({ page: 1 }))
  })
})
