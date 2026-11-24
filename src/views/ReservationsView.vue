<script setup>
import { computed, inject, ref, watch } from 'vue'
import { routeLocationKey } from 'vue-router'
import { useSession } from '../stores/session.js'
import ErrorNotice from '../components/ErrorNotice.vue'
import ModalDialog from '../components/ModalDialog.vue'
import { customersApi, normalizePhone, phoneText } from '../lib/customers.js'
import { isoDate } from '../lib/reports.js'
import { validReason } from '../lib/personal.js'
import { useAction } from '../lib/useAction.js'
import {
  DEFAULT_MINUTES, STATUS, hhmm, reservationActions, reservationsApi, reservationsErrorText, shiftDay, slot,
} from '../lib/reservations.js'

const props = defineProps({
  api: { type: Object, default: null },
  customers: { type: Object, default: null },
  today: { type: Function, default: () => new Date() },
})
const calls = props.api ?? reservationsApi()
const customerCalls = props.customers ?? customersApi()
const session = useSession()

const perms = computed(() => ({
  create: session.canHere('reservations.create'),
  update: session.canHere('reservations.update'),
  confirm: session.canHere('reservations.confirm'),
  cancel: session.canHere('reservations.cancel'),
  noShow: session.canHere('reservations.mark_no_show'),
  customers: session.canHere('customers.read'),
}))

const route = inject(routeLocationKey, null)
const requestedDate = computed(() => typeof route?.query.dia === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(route.query.dia) ? route.query.dia : '')
const requestedId = computed(() => typeof route?.query.solicitud === 'string' ? route.query.solicitud : '')
const day = ref(requestedId.value && requestedDate.value || isoDate(props.today()))
const status = ref('')
watch([requestedDate, requestedId], ([date, id]) => {
  if (date && id) {
    day.value = date
    status.value = ''
  }
})
const rows = ref([])
const tableNumber = ref(new Map())
const loading = ref(false)
const error = ref(null)

let seq = 0
async function load() {
  const mine = ++seq
  loading.value = true
  error.value = null
  try {
    const r = await calls.day(session.branchId, day.value, status.value || undefined)
    if (mine !== seq) return
    rows.value = r
  } catch (e) {
    if (mine === seq) error.value = e
  } finally {
    if (mine === seq) loading.value = false
  }
}
watch(() => `${session.branchId}|${day.value}|${status.value}|${requestedId.value}`, load, { immediate: true })
watch(() => session.branchId, async () => {
  try {
    tableNumber.value = new Map((await calls.tables(session.branchId)).map((t) => [t.id, t.number]))
  } catch {
    tableNumber.value = new Map()
  }
}, { immediate: true })

const guests = computed(() => rows.value.filter((r) => !['CANCELLED', 'NO_SHOW'].includes(r.status)).reduce((n, r) => n + r.partySize, 0))
const { busy, error: actionError, notice, run } = useAction(load, reservationsErrorText)

// ---------------------------------------------------------------- Diálogos
const dialog = ref(null)
function open(kind, r = null) {
  notice.value = ''
  actionError.value = ''
  dialog.value = {
    kind,
    reservation: r,
    phone: '',
    name: '',
    customerId: null,
    found: '',
    date: r ? isoDate(new Date(r.startAt)) : day.value,
    time: r ? hhmm(r.startAt) : '20:00',
    minutes: r ? Math.round((new Date(r.endAt) - new Date(r.startAt)) / 60_000) : DEFAULT_MINUTES,
    partySize: r?.partySize ?? 2,
    notes: r?.notes ?? '',
    reason: '',
  }
}
function close() {
  if (!busy.value) dialog.value = null
}
const TITLES = { add: 'Nueva reservación', edit: 'Cambiar reservación', cancel: 'Cancelar reservación', noShow: 'Marcar que no llegó', confirm: 'Confirmar reservación' }

async function findCustomer() {
  const d = dialog.value
  const phone = normalizePhone(d.phone)
  if (!phone) return
  try {
    const r = await customerCalls.search(session.branchId, { phone })
    const c = r.data[0]
    d.customerId = c?.id ?? null
    if (c) d.name = c.name
    d.found = c ? `Cliente registrado: ${c.profile?.visitCount ?? 0} visitas.` : 'No está registrado; se registra al guardar.'
  } catch {
    d.found = ''
  }
}

const formProblem = computed(() => {
  const d = dialog.value
  if (!d || !['add', 'edit'].includes(d.kind)) return ''
  if (d.kind === 'add' && !normalizePhone(d.phone)) return 'Escribe el teléfono a 10 dígitos.'
  if (d.kind === 'add' && !d.name.trim()) return 'Falta el nombre.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || !/^\d{2}:\d{2}$/.test(d.time)) return 'Elige día y hora.'
  if (new Date(slot(d.date, d.time).startAt).getTime() < props.today().getTime() - 60_000 && d.kind === 'add') return 'Esa hora ya pasó.'
  if (!(Number.isInteger(Number(d.partySize)) && d.partySize >= 1 && d.partySize <= 200)) return 'El número de personas va de 1 a 200.'
  if (!(Number(d.minutes) >= 30 && Number(d.minutes) <= 360)) return 'La duración va de 30 minutos a 6 horas.'
  return ''
})
const canSubmit = computed(() => {
  const d = dialog.value
  if (!d || busy.value) return false
  if (d.kind === 'cancel') return validReason(d.reason)
  if (d.kind === 'confirm' || d.kind === 'noShow') return true
  return !formProblem.value
})

async function submit() {
  if (!canSubmit.value) return
  const d = dialog.value
  const b = session.branchId
  const ok = await run(() => {
    if (d.kind === 'add') {
      return calls.create(b, {
        ...slot(d.date, d.time, Number(d.minutes)),
        partySize: Number(d.partySize),
        customer: { ...(d.customerId ? { customerId: d.customerId } : {}), name: d.name.trim(), phone: normalizePhone(d.phone) },
        ...(d.notes.trim() ? { notes: d.notes.trim() } : {}),
      })
    }
    if (d.kind === 'edit') {
      const r = d.reservation
      const s = slot(d.date, d.time, Number(d.minutes))
      const diff = {}
      if (s.startAt !== new Date(r.startAt).toISOString()) diff.startAt = s.startAt
      if (s.endAt !== new Date(r.endAt).toISOString()) diff.endAt = s.endAt
      if (Number(d.partySize) !== r.partySize) diff.partySize = Number(d.partySize)
      if ((d.notes.trim() || null) !== (r.notes ?? null)) diff.notes = d.notes.trim() || null
      return Object.keys(diff).length ? calls.update(b, r, diff) : null
    }
    if (d.kind === 'confirm') return calls.confirm(b, d.reservation)
    if (d.kind === 'cancel') return calls.cancel(b, d.reservation, d.reason)
    return calls.noShow(b, d.reservation)
  }, () => ({
    add: `Se reservó para ${d.name.trim()} el ${d.date} a las ${d.time}.`,
    edit: 'Se guardaron los cambios.',
    confirm: `Se confirmó la reservación de ${d.reservation?.customer.name}.`,
    cancel: `Se canceló la reservación de ${d.reservation?.customer.name}.`,
    noShow: `Se marcó que ${d.reservation?.customer.name} no llegó.`,
  })[d.kind])
  if (!ok) return
  if (d.kind === 'add' && d.date !== day.value) day.value = d.date
  dialog.value = null
}

const dayTitle = computed(() => {
  const [y, m, d] = day.value.split('-').map(Number)
  const text = new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
  return text.charAt(0).toUpperCase() + text.slice(1)
})
</script>

<template>
  <section>
    <header class="mod-head">
      <div>
        <h1>Reservaciones</h1>
        <p class="mod-lead">La agenda de {{ session.currentMembership?.branch?.name }}. Registrar la llegada y sentar a los clientes se hace en la app.</p>
      </div>
      <button v-if="perms.create" type="button" class="btn btn-primary" @click="open('add')">Nueva reservación</button>
    </header>

    <div class="toolbar">
      <div class="days" role="group" aria-label="Día">
        <button type="button" class="btn" aria-label="Día anterior" @click="day = shiftDay(day, -1)">‹</button>
        <input v-model="day" class="field" type="date" aria-label="Día de la agenda" />
        <button type="button" class="btn" aria-label="Día siguiente" @click="day = shiftDay(day, 1)">›</button>
        <button type="button" class="btn" @click="day = isoDate(today())">Hoy</button>
      </div>
      <label>Estado
        <select v-model="status" class="field">
          <option value="">Todas</option>
          <option v-for="(s, k) in STATUS" :key="k" :value="k">{{ s.label }}</option>
        </select>
      </label>
      <span class="count" aria-live="polite">{{ loading ? 'Cargando…' : `${rows.length} ${rows.length === 1 ? 'reservación' : 'reservaciones'} · ${guests} ${guests === 1 ? 'persona' : 'personas'}` }}</span>
    </div>
    <h2 class="day-title">{{ dayTitle }}</h2>
    <p v-if="notice && !dialog" class="notice-ok" role="status">{{ notice }}</p>
    <ErrorNotice :error="error" @retry="load" />

    <div v-if="!error" class="box">
      <table class="data-table">
        <thead><tr><th scope="col">Hora</th><th scope="col">Cliente</th><th scope="col">Personas</th><th scope="col">Estado</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id" :class="{ 'requested-row': r.id === requestedId }">
            <td><span class="cell-main">{{ hhmm(r.startAt) }}</span><span class="cell-sub">a {{ hhmm(r.endAt) }}</span></td>
            <td>
              <span class="cell-main">{{ r.customer.name }}</span>
              <span class="cell-sub">{{ phoneText(r.customer.phone) }} · código {{ r.confirmationCode }}</span>
              <span v-if="r.notes" class="cell-sub">{{ r.notes }}</span>
            </td>
            <td>
              <span class="cell-main">{{ r.partySize }} {{ r.partySize === 1 ? 'persona' : 'personas' }}</span>
              <span v-if="r.plannedTableIds?.length" class="cell-sub">Mesa {{ r.plannedTableIds.map((id) => tableNumber.get(id) ?? '?').join(' + ') }}</span>
            </td>
            <td>
              <span class="pill" :class="STATUS[r.status]?.tone">{{ STATUS[r.status]?.label ?? r.status }}</span>
              <span v-if="r.planConflict" class="pill warn">Revisar mesas</span>
            </td>
            <td class="actions">
              <button v-if="reservationActions(r, perms, today().getTime()).confirm" type="button" class="btn" @click="open('confirm', r)">Confirmar</button>
              <button v-if="reservationActions(r, perms, today().getTime()).edit" type="button" class="btn" @click="open('edit', r)">Cambiar</button>
              <button v-if="reservationActions(r, perms, today().getTime()).noShow" type="button" class="btn" @click="open('noShow', r)">No llegó</button>
              <button v-if="reservationActions(r, perms, today().getTime()).cancel" type="button" class="btn btn-danger" @click="open('cancel', r)">Cancelar</button>
            </td>
          </tr>
          <tr v-if="!loading && !rows.length"><td colspan="5" class="empty-row">No hay reservaciones este día.</td></tr>
        </tbody>
      </table>
    </div>

    <ModalDialog v-if="dialog" :title="TITLES[dialog.kind]" :busy="busy" @close="close">
      <form class="form" @submit.prevent="submit">
        <template v-if="dialog.kind === 'add' || dialog.kind === 'edit'">
          <template v-if="dialog.kind === 'add'">
            <div class="row">
              <label>Teléfono<input v-model="dialog.phone" class="field" type="tel" placeholder="33 1234 5678" autocomplete="off" @blur="perms.customers && findCustomer()" /></label>
              <label>Nombre<input v-model="dialog.name" class="field" maxlength="120" autocomplete="off" /></label>
            </div>
            <p v-if="dialog.found" class="help" aria-live="polite">{{ dialog.found }}</p>
          </template>
          <p v-else class="help">{{ dialog.reservation.customer.name }} · código {{ dialog.reservation.confirmationCode }}</p>
          <div class="row">
            <label>Día<input v-model="dialog.date" class="field" type="date" /></label>
            <label>Hora<input v-model="dialog.time" class="field" type="time" step="900" /></label>
          </div>
          <div class="row">
            <label>Personas<input v-model.number="dialog.partySize" class="field" type="number" min="1" max="200" /></label>
            <label>Duración (minutos)<input v-model.number="dialog.minutes" class="field" type="number" min="30" max="360" step="15" /></label>
          </div>
          <label>Notas<textarea v-model="dialog.notes" class="field" rows="2" maxlength="500" placeholder="Cumpleaños, silla para bebé…" /></label>
          <p v-if="formProblem" class="help" aria-live="polite">{{ formProblem }}</p>
        </template>
        <p v-else-if="dialog.kind === 'confirm'" class="help">Confirma que {{ dialog.reservation.customer.name }} viene a las {{ hhmm(dialog.reservation.startAt) }} con {{ dialog.reservation.partySize }} personas.</p>
        <p v-else-if="dialog.kind === 'noShow'" class="help">La reservación de {{ dialog.reservation.customer.name }} queda como "no llegó" y sus mesas se liberan.</p>
        <template v-else>
          <p class="help">Se libera el horario de {{ dialog.reservation.customer.name }} ({{ hhmm(dialog.reservation.startAt) }}, {{ dialog.reservation.partySize }} personas).</p>
          <label>Motivo<textarea v-model="dialog.reason" class="field" rows="3" maxlength="500" placeholder="El cliente llamó para cancelar" /></label>
        </template>
        <p v-if="actionError" class="form-error" role="alert">{{ actionError }}</p>
        <div class="form-buttons">
          <button type="button" class="btn" :disabled="busy" @click="close">Volver</button>
          <button type="submit" class="btn" :class="dialog.kind === 'cancel' ? 'btn-danger-solid' : 'btn-primary'" :disabled="!canSubmit">{{ busy ? 'Guardando…' : 'Confirmar' }}</button>
        </div>
      </form>
    </ModalDialog>
  </section>
</template>

<style scoped>
.requested-row > td { background: color-mix(in srgb, var(--accent) 9%, var(--surface)); }
.days { display: flex; gap: 6px; align-items: center; }
.day-title { margin: 0 0 10px; font-size: 1rem; color: var(--muted); }
</style>
