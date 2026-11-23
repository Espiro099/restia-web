import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError } from '../src/lib/api.js'
import {
  branchErrorText, crossesMidnight, daysFromHours, generalChanges, generalForm, generalProblem, hoursFromDays, hoursProblem,
  reservationChanges, toleranceProblem,
} from '../src/lib/branch.js'
import { checksText } from '../src/lib/invoices.js'
import { actionText } from '../src/lib/audit.js'
import { useSession } from '../src/stores/session.js'
import BranchView from '../src/views/BranchView.vue'

const branch = (over = {}) => ({
  id: 'b1', code: 'CENTRO', name: 'La Mesa Centro', status: 'ACTIVE', timezone: 'America/Mexico_City', businessDayCutoff: '04:00',
  phone: null, address: null, version: 4, reservationHours: [], reservationNoShowToleranceMinutes: 15, ...over,
})

describe('reglas de la sucursal', () => {
  it('pasa el horario de la API a un renglón por día y de regreso', () => {
    const hours = [
      { dayOfWeek: 1, opensAt: '18:00', closesAt: '23:00' },
      { dayOfWeek: 1, opensAt: '13:00', closesAt: '16:00' },
      { dayOfWeek: 6, opensAt: '20:00', closesAt: '02:00' },
    ]
    const days = daysFromHours(hours)
    expect(days).toHaveLength(7)
    expect(days[0].ranges.map((r) => r.opensAt)).toEqual(['13:00', '18:00'])
    expect(days[1].ranges).toEqual([])
    expect(hoursFromDays(days)).toHaveLength(3)
    expect(crossesMidnight(days[5].ranges[0])).toBe(true)
    expect(crossesMidnight(days[0].ranges[0])).toBe(false)
  })

  it('revisa horas, tolerancia y el máximo de horarios por día', () => {
    const days = daysFromHours([{ dayOfWeek: 2, opensAt: '13:00', closesAt: '22:00' }])
    expect(hoursProblem(days)).toBe('')
    days[1].ranges[0].opensAt = '25:00'
    expect(hoursProblem(days)).toMatch(/Martes/)
    days[1].ranges = Array.from({ length: 4 }, () => ({ opensAt: '10:00', closesAt: '11:00' }))
    expect(hoursProblem(days)).toMatch(/hasta 3/)
    expect(toleranceProblem('20')).toBe('')
    expect(toleranceProblem('241')).not.toBe('')
    expect(toleranceProblem('-1')).not.toBe('')
  })

  it('manda solo lo que cambió', () => {
    const b = branch({ reservationHours: [{ dayOfWeek: 1, opensAt: '13:00', closesAt: '22:00' }] })
    expect(reservationChanges(b, daysFromHours(b.reservationHours), '15')).toEqual({})
    const days = daysFromHours(b.reservationHours)
    days[1].ranges.push({ opensAt: '13:00', closesAt: '22:00' })
    expect(reservationChanges(b, days, '20')).toEqual({
      reservationHours: [{ dayOfWeek: 1, opensAt: '13:00', closesAt: '22:00' }, { dayOfWeek: 2, opensAt: '13:00', closesAt: '22:00' }],
      reservationNoShowToleranceMinutes: 20,
    })

    const form = generalForm(b)
    expect(generalChanges(b, form)).toEqual({})
    form.name = ' Centro '
    form.phone = '+523311112222'
    expect(generalChanges(b, form)).toEqual({ name: 'Centro', phone: '+523311112222' })
  })

  it('la dirección va completa o no va', () => {
    const form = generalForm(branch())
    expect(generalProblem(form)).toBe('')
    form.address.line1 = 'Av. Juárez 100'
    expect(generalProblem(form)).toMatch(/calle, ciudad/)
    Object.assign(form.address, { city: 'Guadalajara', state: 'Jalisco', postalCode: '44100', country: 'mx' })
    expect(generalProblem(form)).toBe('')
    expect(generalChanges(branch(), form).address).toEqual({
      line1: 'Av. Juárez 100', line2: null, city: 'Guadalajara', state: 'Jalisco', postalCode: '44100', country: 'MX',
    })
    form.name = ''
    expect(generalProblem(form)).toMatch(/nombre/)
  })

  it('explica que un cambio de zona horaria o corte necesita la operación cerrada', () => {
    expect(branchErrorText(new ApiError(409, { error: { code: 'BRANCH_HAS_ACTIVE_OPERATIONS', message: 'x' } }))).toMatch(/mesas o turnos abiertos/)
  })
})

describe('textos', () => {
  it('auditoría en español para el corte de caja y el timbrado', () => {
    expect(actionText('cash_shift.closing_started')).toBe('Turno de caja: inicio de corte')
    expect(actionText('invoice.stamp_requested')).toBe('Factura: timbrado solicitado')
  })

  it('singular y plural de cuentas', () => {
    expect(checksText(1)).toBe('1 cuenta')
    expect(checksText(3)).toBe('3 cuentas')
  })
})

describe('pantalla de Sucursal', () => {
  let calls
  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
    calls = {
      get: vi.fn(async () => branch()),
      update: vi.fn(async () => ({ data: branch() })),
    }
  })

  function mountView() {
    const pinia = createPinia()
    setActivePinia(pinia)
    useSession().adopt({ user: { id: 'yo', name: 'Yo' }, memberships: [{ branch: { id: 'b1', name: 'La Mesa Centro' }, role: 'ADMIN', permissions: ['branches.update'] }] })
    return mount(BranchView, { props: { api: calls }, global: { plugins: [pinia] }, attachTo: document.body })
  }

  it('sin horario avisa que nadie puede reservar; copiar el lunes y guardar manda el horario con la versión', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('Fuera del horario de reservas')
    const button = (text) => wrapper.findAll('button').find((b) => b.text() === text)
    await wrapper.findAll('button').filter((b) => b.text() === 'Agregar horario')[0].trigger('click')
    await button('Copiar el lunes a todos los días').trigger('click')
    expect(wrapper.text()).not.toContain('nadie puede reservar')
    await wrapper.findAll('form')[1].trigger('submit')
    await flushPromises()
    const [b, current, changes] = calls.update.mock.calls[0]
    expect(b).toBe('b1')
    expect(current.version).toBe(4)
    expect(changes.reservationHours).toHaveLength(7)
    expect(changes.reservationHours[0]).toEqual({ dayOfWeek: 1, opensAt: '13:00', closesAt: '22:00' })
    expect(changes).not.toHaveProperty('reservationNoShowToleranceMinutes')
  })

  it('al cambiar el nombre lo actualiza en el selector de sucursal', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('input').setValue('La Mesa Centro Histórico')
    await wrapper.findAll('form')[0].trigger('submit')
    await flushPromises()
    expect(calls.update).toHaveBeenCalledWith('b1', expect.objectContaining({ version: 4 }), { name: 'La Mesa Centro Histórico' })
    expect(useSession().currentMembership.branch.name).toBe('La Mesa Centro Histórico')
  })
})
