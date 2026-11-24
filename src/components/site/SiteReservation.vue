<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import {
  MAX_DAYS_AHEAD, MAX_PARTY, REQUEST_STATUS, dateText, localDate, newKey, phoneDigits, requestErrorText, requestProblem,
} from '../../lib/site.js'

// Solicitud de reserva (SITE-2): se elige sucursal, día y personas; solo se ofrecen las horas con lugar. Al
// enviarla queda pendiente y la sucursal la confirma. El asistente puede llenar el formulario (`draft`), pero
// siempre es la persona quien toca «Enviar solicitud».
const props = defineProps({
  api: { type: Object, required: true },
  branches: { type: Array, required: true },
  emailAvailable: { type: Boolean, default: false },
  /** Sucursal elegida en el mapa. */
  branchCode: { type: String, default: '' },
  /** { draft, n }: propuesta del asistente; `n` cambia con cada propuesta nueva. */
  proposal: { type: Object, default: null },
})

const bookable = computed(() => props.branches.filter((b) => b.reservations))
const form = reactive({ branchCode: '', date: localDate(1), partySize: 2, time: '', name: '', phone: '', notes: '', email: '' })
const slots = ref([])
const slotsState = ref('idle') // idle | loading | ready | error
const slotsError = ref('')
const fromAssistant = ref(false)
const sending = ref(false)
const sendError = ref('')
const sent = ref(null)
const receipt = ref(null)
const sentWithEmail = ref(false)
const checkingStatus = ref(false)
const statusError = ref('')
let statusTimer = null
let statusRequest = null
let trackedLookup = null
const statusInterval = 20_000
const statusWatchLimit = 30
let key = newKey()
let slotsRequest = 0
/** Hora que propuso el asistente: se aplica cuando lleguen los horarios de ese día. */
let pendingTime = ''

const minDate = localDate(0)
const maxDate = localDate(MAX_DAYS_AHEAD)
const problem = computed(() => requestProblem(form) ||
  (props.emailAvailable && form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
    ? 'Revisa el correo para enviarte la confirmación.' : ''))
const sentMessage = computed(() => {
  if (!sent.value) return ''
  if (sent.value.status !== 'PENDING') return REQUEST_STATUS[sent.value.status] ?? sent.value.status
  return sentWithEmail.value
    ? 'Cuando la sucursal confirme, te enviaremos un correo.'
    : 'La sucursal revisará tu solicitud. Puedes volver a consultar con tu folio y teléfono.'
})
const branchName = (code) => props.branches.find((b) => b.code === code)?.name ?? code

watch([() => props.branchCode, bookable], ([code, list], [previousCode, previousList]) => {
  const arrived = code !== previousCode || !previousList?.some((branch) => branch.code === code)
  if (code && arrived && list.some((branch) => branch.code === code)) form.branchCode = code
  else if (!form.branchCode && list.length === 1) form.branchCode = list[0].code
}, { immediate: true })

async function loadSlots() {
  const mine = ++slotsRequest
  const wanted = pendingTime || form.time
  form.time = ''
  slots.value = []
  if (!form.branchCode || !form.date || !(form.partySize >= 1 && form.partySize <= MAX_PARTY)) {
    slotsState.value = 'idle'
    return
  }
  slotsState.value = 'loading'
  try {
    const list = await props.api.slots(form.branchCode, form.date, form.partySize)
    if (mine !== slotsRequest) return
    slots.value = list
    slotsState.value = 'ready'
    pendingTime = ''
    if (wanted && list.includes(wanted)) form.time = wanted
  } catch (e) {
    if (mine !== slotsRequest) return
    slotsState.value = 'error'
    slotsError.value = e?.status === 422 ? 'Elige un día entre hoy y los próximos 60 días.' : requestErrorText(e)
  }
}
watch(() => [form.branchCode, form.date, form.partySize], loadSlots, { immediate: true })

// Cualquier cambio en los datos es otra solicitud: nueva llave de idempotencia.
watch(form, () => { key = newKey() })

watch(() => props.proposal?.n, () => {
  const d = props.proposal?.draft
  if (!d) return
  resetReceipt()
  sendError.value = ''
  if (d.branchCode && bookable.value.some((b) => b.code === d.branchCode)) form.branchCode = d.branchCode
  if (d.date && d.date >= minDate && d.date <= maxDate) form.date = d.date
  if (d.partySize) form.partySize = d.partySize
  if (d.name) form.name = d.name
  if (d.phone) form.phone = d.phone
  fromAssistant.value = true
  // La hora se elige cuando lleguen los horarios del día propuesto.
  pendingTime = d.time ?? ''
  loadSlots()
})

async function submit() {
  if (problem.value || sending.value) return
  sending.value = true
  sendError.value = ''
  try {
    const phone = phoneDigits(form.phone)
    const email = props.emailAvailable ? form.email.trim() : ''
    const response = await props.api.createRequest({
      branchCode: form.branchCode, date: form.date, time: form.time, partySize: form.partySize,
      name: form.name.trim(), phone, ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      ...(email ? { email } : {}),
    }, key)
    trackedLookup = { branchCode: response.branchCode, folio: response.folio, phone }
    sentWithEmail.value = !!email
    sent.value = response
    fromAssistant.value = false
    await nextTick()
    receipt.value?.focus()
  } catch (e) {
    sendError.value = requestErrorText(e)
    if (e?.code === 'RESERVATION_NOT_AVAILABLE') loadSlots()
  } finally {
    sending.value = false
  }
}

function resetReceipt() {
  clearInterval(statusTimer)
  statusRequest = null
  trackedLookup = null
  statusError.value = ''
  checkingStatus.value = false
  sent.value = null
}

async function updateStatus(manual = false) {
  if (statusRequest || !trackedLookup || sent.value?.status !== 'PENDING') return
  const token = Symbol()
  statusRequest = token
  if (manual) {
    checkingStatus.value = true
    statusError.value = ''
  }
  try {
    const response = await props.api.lookup(trackedLookup)
    if (statusRequest !== token) return
    sent.value = response
    statusError.value = ''
  } catch (e) {
    if (statusRequest === token && manual) statusError.value = requestErrorText(e)
  } finally {
    if (statusRequest === token) {
      statusRequest = null
      checkingStatus.value = false
    }
  }
}

watch(() => sent.value?.status, (status) => {
  clearInterval(statusTimer)
  if (status !== 'PENDING') return
  let attempts = 0
  statusTimer = setInterval(() => {
    if (document.visibilityState !== 'visible') return
    updateStatus()
    if (++attempts >= statusWatchLimit) clearInterval(statusTimer)
  }, statusInterval)
})
onBeforeUnmount(resetReceipt)

function another() {
  resetReceipt()
  form.time = ''
  form.notes = ''
  form.email = ''
  key = newKey()
  loadSlots()
}

// Consulta por folio y teléfono.
const look = reactive({ branchCode: '', folio: '', phone: '' })
const found = ref(null)
const lookError = ref('')
const looking = ref(false)
async function lookup() {
  if (!look.branchCode || look.folio.trim().length < 6 || phoneDigits(look.phone).length !== 10) {
    lookError.value = 'Elige la sucursal y escribe tu folio y tu teléfono a 10 dígitos.'
    return
  }
  looking.value = true
  lookError.value = ''
  found.value = null
  try {
    found.value = await props.api.lookup({ branchCode: look.branchCode, folio: look.folio.trim().toUpperCase(), phone: phoneDigits(look.phone) })
  } catch (e) {
    lookError.value = requestErrorText(e)
  } finally {
    looking.value = false
  }
}
</script>

<template>
  <div class="rsv">
    <div v-if="sent" ref="receipt" class="rsv-card rsv-done" tabindex="-1">
      <div role="status">
        <h3>{{ sent.status === 'PENDING' ? 'Solicitud recibida' : sent.status === 'CONFIRMED' ? 'Reserva confirmada' : sentMessage }}</h3>
        <p v-if="sent.status === 'PENDING'" class="muted">{{ sentMessage }}</p>
      </div>
      <div class="rsv-ticket">
        <p>Folio <strong>{{ sent.folio }}</strong></p>
        <p>{{ sent.branchName }} · {{ dateText(sent.date) }} · {{ sent.time }}</p>
        <p class="muted">{{ sent.name }} · {{ sent.partySize }} {{ sent.partySize === 1 ? 'persona' : 'personas' }}</p>
      </div>
      <p v-if="statusError" class="rsv-error" role="alert">{{ statusError }}</p>
      <div class="rsv-actions">
        <button v-if="sent.status === 'PENDING'" type="button" class="rsv-primary" :disabled="checkingStatus" @click="updateStatus(true)">
          {{ checkingStatus ? 'Consultando…' : 'Actualizar estado' }}
        </button>
        <button type="button" class="rsv-secondary" @click="another">Hacer otra solicitud</button>
      </div>
    </div>

    <form v-else class="rsv-card" novalidate @submit.prevent="submit">
      <p v-if="fromAssistant" class="rsv-assist" role="status">El asistente llenó la solicitud con lo que le dijiste. Revisa los datos y envíala.</p>
      <p v-if="!bookable.length" class="muted">En este momento no hay sucursales con reservas en línea.</p>
      <template v-else>
        <div class="rsv-row">
          <label>Sucursal
            <select v-model="form.branchCode" class="rsv-field">
              <option value="" disabled>Elige una sucursal</option>
              <option v-for="b in bookable" :key="b.code" :value="b.code">{{ b.name }}</option>
            </select>
          </label>
          <label>Día<input v-model="form.date" class="rsv-field" type="date" :min="minDate" :max="maxDate" /></label>
          <label>Personas
            <select v-model.number="form.partySize" class="rsv-field">
              <option v-for="n in MAX_PARTY" :key="n" :value="n">{{ n }}</option>
            </select>
          </label>
        </div>

        <fieldset class="rsv-times">
          <legend>Hora</legend>
          <p v-if="slotsState === 'idle'" class="muted">Elige sucursal, día y personas para ver las horas.</p>
          <p v-else-if="slotsState === 'loading'" class="muted" aria-live="polite">Buscando horas con lugar…</p>
          <p v-else-if="slotsState === 'error'" class="rsv-error">{{ slotsError }}</p>
          <p v-else-if="!slots.length" class="muted">No hay lugar ese día para {{ form.partySize }}. Prueba otro día o llama a la sucursal.</p>
          <div v-else class="rsv-slots">
            <label v-for="s in slots" :key="s" class="rsv-slot" :class="{ on: form.time === s }">
              <input v-model="form.time" type="radio" name="rsv-time" :value="s" />{{ s }}
            </label>
          </div>
        </fieldset>

        <div class="rsv-row two">
          <label>Nombre<input v-model="form.name" class="rsv-field" maxlength="120" autocomplete="name" /></label>
          <label>Teléfono (10 dígitos)<input v-model="form.phone" class="rsv-field" maxlength="20" inputmode="tel" autocomplete="tel-national" /></label>
        </div>
        <label v-if="emailAvailable">Correo para la confirmación (opcional)
          <input v-model="form.email" class="rsv-field" type="email" maxlength="254" autocomplete="email" />
        </label>
        <label>Comentarios (opcional)<input v-model="form.notes" class="rsv-field" maxlength="300" placeholder="Cumpleaños, silla para bebé…" /></label>

        <p v-if="sendError" class="rsv-error" role="alert">{{ sendError }}</p>
        <div class="rsv-send">
          <p class="muted small">{{ problem || 'La sucursal revisará tu solicitud antes de confirmarla.' }}</p>
          <button type="submit" class="rsv-primary" :disabled="!!problem || sending">{{ sending ? 'Enviando…' : 'Enviar solicitud' }}</button>
        </div>
      </template>
    </form>

    <details class="rsv-card rsv-lookup">
      <summary>¿Ya enviaste una solicitud? Consulta su estado</summary>
      <form class="rsv-row three" novalidate @submit.prevent="lookup">
        <label>Sucursal
          <select v-model="look.branchCode" class="rsv-field">
            <option value="" disabled>Elige</option>
            <option v-for="b in bookable" :key="b.code" :value="b.code">{{ b.name }}</option>
          </select>
        </label>
        <label>Folio<input v-model="look.folio" class="rsv-field mono" maxlength="16" autocapitalize="characters" /></label>
        <label>Teléfono<input v-model="look.phone" class="rsv-field" maxlength="20" inputmode="tel" /></label>
        <button type="submit" class="rsv-secondary" :disabled="looking">Consultar</button>
      </form>
      <p v-if="lookError" class="rsv-error" role="alert">{{ lookError }}</p>
      <p v-if="found" class="rsv-found" role="status">
        <strong>{{ REQUEST_STATUS[found.status] ?? found.status }}</strong> · {{ branchName(found.branchCode) }}, {{ dateText(found.date) }} a las {{ found.time }}, {{ found.partySize }} {{ found.partySize === 1 ? 'persona' : 'personas' }}.
      </p>
    </details>
  </div>
</template>

<style scoped>
.rsv { display: flex; flex-direction: column; gap: 16px; margin-top: 28px; text-align: left; width: 100%; max-width: 860px; }
.rsv-card { background: var(--paper); border-radius: 16px; padding: 24px; display: flex; flex-direction: column; gap: 16px; }
.rsv-row { display: grid; grid-template-columns: 1.4fr 1fr .7fr; gap: 14px; }
.rsv-row.two { grid-template-columns: 1fr 1fr; }
.rsv-row.three { grid-template-columns: 1.2fr 1fr 1fr auto; align-items: end; margin-top: 14px; }
label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 700; }
.rsv-field {
  font: inherit; font-size: 16px; font-weight: 400; min-height: 46px; padding: 0 12px; border-radius: 10px;
  border: 1px solid #d9c9b6; background: #fff; color: var(--ink); width: 100%; box-sizing: border-box;
}
.rsv-field:focus-visible, .rsv-slot:focus-within, button:focus-visible, summary:focus-visible { outline: 2px solid var(--clay); outline-offset: 2px; }
.mono { font-family: ui-monospace, monospace; text-transform: uppercase; letter-spacing: .08em; }
fieldset { border: 0; margin: 0; padding: 0; }
legend { font-size: 13px; font-weight: 700; margin-bottom: 8px; padding: 0; }
.rsv-slots { display: flex; flex-wrap: wrap; gap: 8px; }
.rsv-slot {
  flex-direction: row; align-items: center; min-height: 40px; padding: 0 14px; border-radius: 999px; border: 1px solid #d9c9b6;
  background: #fff; font-size: 14px; cursor: pointer; font-variant-numeric: tabular-nums;
}
.rsv-slot input { position: absolute; opacity: 0; pointer-events: none; }
.rsv-slot.on { background: var(--clay); border-color: var(--clay); color: #fff; }
.rsv-send { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.rsv-primary, .rsv-secondary { font: inherit; font-weight: 700; font-size: 14px; min-height: 48px; padding: 0 20px; border-radius: 10px; cursor: pointer; }
.rsv-primary { border: 0; background: var(--clay); color: #fff; white-space: nowrap; }
.rsv-primary:hover:not(:disabled) { background: var(--clay-dark); }
.rsv-primary:disabled { opacity: .5; cursor: default; }
.rsv-secondary { border: 1.5px solid var(--clay); background: transparent; color: var(--clay); align-self: flex-start; }
.rsv-assist { margin: 0; padding: 10px 14px; border-radius: 10px; background: #fdebd3; font-size: 14px; }
.rsv-error { margin: 0; color: #a3260b; font-size: 14px; }
.muted { margin: 0; color: var(--gray); font-size: 14px; }
.small { font-size: 13px; }
.rsv-done h3 { margin: 0 0 6px; font-size: clamp(1.55rem, 3vw, 2.1rem); }
.rsv-done p { margin: 0; }
.rsv-ticket { display: grid; gap: 6px; padding-block: 14px; border-block: 1px solid var(--line); }
.rsv-ticket p:first-child { display: flex; align-items: baseline; gap: 12px; }
.rsv-ticket strong { font-size: 1.3rem; font-variant-numeric: tabular-nums; letter-spacing: .08em; }
.rsv-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.rsv-lookup { gap: 0; }
.rsv-lookup summary { cursor: pointer; font-weight: 700; font-size: 15px; }
.rsv-found { margin: 14px 0 0; font-size: 15px; }

@media (max-width: 760px) {
  .rsv-card { padding: 18px; }
  .rsv-row, .rsv-row.two, .rsv-row.three { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .rsv-row > label:first-child { grid-column: 1 / -1; }
  .rsv-row.two > label { grid-column: 1 / -1; }
  .rsv-row.three > button { grid-column: 1 / -1; }
  .rsv-send { flex-direction: column-reverse; align-items: stretch; }
}
@media (prefers-reduced-motion: no-preference) {
  .rsv-done { animation: receipt-enter 180ms ease-out both; }
  @keyframes receipt-enter { from { opacity: .72; transform: translateY(6px); } }
  :is(.rsv-primary, .rsv-secondary) { transition: transform 150ms ease-out, background-color 150ms ease; }
  :is(.rsv-primary, .rsv-secondary):active:not(:disabled) { transform: scale(.98); }
}
</style>
