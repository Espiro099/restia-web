<script setup>
import { computed, ref, watch } from 'vue'
import { useSession } from '../stores/session.js'
import ErrorNotice from '../components/ErrorNotice.vue'
import BranchMap from '../components/BranchMap.vue'
import {
  MAX_RANGES_PER_DAY, branchApi, branchErrorText, crossesMidnight, daysFromHours, generalChanges, generalForm,
  generalProblem, hoursProblem, locationText, parseLocation, reservationChanges, toleranceProblem,
} from '../lib/branch.js'
import { useAction } from '../lib/useAction.js'

const props = defineProps({ api: { type: Object, default: null } })
const calls = props.api ?? branchApi()
const session = useSession()

const branch = ref(null)
const loadError = ref(null)
const general = ref(null)
const days = ref([])
const tolerance = ref('15')

function fill(b) {
  branch.value = b
  general.value = generalForm(b)
  days.value = daysFromHours(b.reservationHours)
  tolerance.value = String(b.reservationNoShowToleranceMinutes ?? 15)
}

async function load() {
  loadError.value = null
  try {
    fill(await calls.get(session.branchId))
  } catch (e) {
    loadError.value = e
  }
}
watch(() => session.branchId, () => {
  branch.value = null
  load()
}, { immediate: true })

// Cada sección guarda por separado: así un error en una no obliga a rehacer la otra.
const saveGeneral = useAction(load, branchErrorText)
const saveReservations = useAction(load, branchErrorText)

const generalIssue = computed(() => (general.value ? generalProblem(general.value) : ''))
const generalDiff = computed(() => (branch.value && general.value ? generalChanges(branch.value, general.value) : {}))
const reservationsIssue = computed(() => hoursProblem(days.value) || toleranceProblem(tolerance.value))
const reservationsDiff = computed(() => (branch.value && !reservationsIssue.value ? reservationChanges(branch.value, days.value, tolerance.value) : {}))
const openDays = computed(() => days.value.filter((d) => d.ranges.length).length)

// Punto en el mapa del sitio público (B-8): se escribe o se toca en el minimapa.
const mapPoints = computed(() => {
  const point = general.value ? parseLocation(general.value.location) : null
  return point ? [{ key: 'branch', label: branch.value?.name ?? 'Sucursal', ...point }] : []
})
function pickLocation(point) {
  const rounded = parseLocation(`${point.lat}, ${point.lng}`)
  if (rounded) general.value.location = locationText(rounded)
}

async function submitGeneral() {
  if (generalIssue.value || !Object.keys(generalDiff.value).length) return
  const changes = generalDiff.value
  const ok = await saveGeneral.run(() => calls.update(session.branchId, branch.value, changes), 'Se guardaron los datos de la sucursal.')
  // El selector de sucursal muestra el nombre de la sesión: se actualiza sin volver a entrar.
  if (ok && changes.name && session.currentMembership?.branch) session.currentMembership.branch.name = changes.name
}

async function submitReservations() {
  if (reservationsIssue.value || !Object.keys(reservationsDiff.value).length) return
  await saveReservations.run(() => calls.update(session.branchId, branch.value, reservationsDiff.value),
    'Se guardó el horario de reservas. La app lo usa desde la siguiente reserva.')
}

function addRange(d) {
  if (d.ranges.length < MAX_RANGES_PER_DAY) d.ranges.push({ opensAt: '13:00', closesAt: '22:00' })
}
function removeRange(d, i) {
  d.ranges.splice(i, 1)
}
/** Copia el horario del lunes a todos los días. */
function copyMonday() {
  const monday = days.value[0].ranges
  for (const d of days.value.slice(1)) d.ranges = monday.map((r) => ({ ...r }))
}
</script>

<template>
  <section>
    <header class="mod-head">
      <div>
        <h1>Sucursal</h1>
        <p class="mod-lead">Datos de {{ session.currentMembership?.branch?.name }} y el horario en que la app acepta reservas.</p>
      </div>
    </header>

    <ErrorNotice :error="loadError" @retry="load" />
    <p v-if="!branch && !loadError" class="help" aria-live="polite">Cargando la sucursal…</p>

    <template v-if="branch">
      <form class="box form branch-section" @submit.prevent="submitGeneral">
        <h2>Datos generales</h2>
        <p v-if="saveGeneral.notice.value" class="notice-ok" role="status">{{ saveGeneral.notice.value }}</p>
        <div class="row">
          <label>Nombre<input v-model="general.name" class="field" maxlength="120" /></label>
          <label>Teléfono<input v-model="general.phone" class="field" maxlength="32" inputmode="tel" placeholder="+523312345678" /></label>
        </div>
        <fieldset>
          <legend>Dirección</legend>
          <label>Calle y número<input v-model="general.address.line1" class="field" maxlength="200" /></label>
          <label>Colonia o referencia (opcional)<input v-model="general.address.line2" class="field" maxlength="200" /></label>
          <div class="row">
            <label>Ciudad<input v-model="general.address.city" class="field" maxlength="100" /></label>
            <label>Estado<input v-model="general.address.state" class="field" maxlength="100" /></label>
          </div>
          <div class="row">
            <label>Código postal<input v-model="general.address.postalCode" class="field" maxlength="16" inputmode="numeric" /></label>
            <label>País<input v-model="general.address.country" class="field mono" maxlength="2" /></label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Punto en el mapa</legend>
          <p class="help">Así aparece la sucursal en el sitio de La Mesa. Toca el mapa o pega las coordenadas de Google Maps (clic derecho sobre el lugar).</p>
          <label>Latitud, longitud<input v-model="general.location" class="field mono" maxlength="40" inputmode="decimal" placeholder="20.673600, -103.344000" /></label>
          <BranchMap class="branch-map" :points="mapPoints" selected="branch" pickable label="Mapa para ubicar la sucursal" @pick="pickLocation" />
        </fieldset>
        <p class="help">Código {{ branch.code }} · zona horaria {{ branch.timezone }} · el día de negocio cambia a las {{ branch.businessDayCutoff }}.</p>
        <p v-if="generalIssue" class="help" aria-live="polite">{{ generalIssue }}</p>
        <p v-if="saveGeneral.error.value" class="form-error" role="alert">{{ saveGeneral.error.value }}</p>
        <div class="form-buttons">
          <button type="submit" class="btn btn-primary" :disabled="saveGeneral.busy.value || !!generalIssue || !Object.keys(generalDiff).length">Guardar datos</button>
        </div>
      </form>

      <form class="box form branch-section" @submit.prevent="submitReservations">
        <h2>Reservas</h2>
        <p class="help">La app acepta reservas que empiezan y terminan dentro de estos horarios, en la hora de la sucursal. Un día sin horario no recibe reservas.</p>
        <p v-if="!openDays" class="form-error">Sin horario, nadie puede reservar: la app responde "Fuera del horario de reservas".</p>
        <p v-if="saveReservations.notice.value" class="notice-ok" role="status">{{ saveReservations.notice.value }}</p>
        <table class="data-table hours">
          <thead><tr><th scope="col">Día</th><th scope="col">Horarios</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
          <tbody>
            <tr v-for="d in days" :key="d.day">
              <th scope="row">{{ d.label }}</th>
              <td>
                <span v-if="!d.ranges.length" class="cell-sub">Sin reservas</span>
                <div v-for="(r, i) in d.ranges" :key="i" class="range">
                  <input v-model="r.opensAt" type="time" class="field" :aria-label="`${d.label}: abre`" />
                  <span aria-hidden="true">a</span>
                  <input v-model="r.closesAt" type="time" class="field" :aria-label="`${d.label}: cierra`" />
                  <span v-if="crossesMidnight(r)" class="cell-sub">termina al día siguiente</span>
                  <button type="button" class="btn" :aria-label="`Quitar horario del ${d.label}`" @click="removeRange(d, i)">Quitar</button>
                </div>
              </td>
              <td class="actions">
                <button v-if="d.ranges.length < MAX_RANGES_PER_DAY" type="button" class="btn" @click="addRange(d)">Agregar horario</button>
              </td>
            </tr>
          </tbody>
        </table>
        <div class="row">
          <label>Tolerancia antes de marcar "no llegó" (minutos)<input v-model="tolerance" class="field" inputmode="numeric" maxlength="3" /></label>
        </div>
        <p v-if="reservationsIssue" class="help" aria-live="polite">{{ reservationsIssue }}</p>
        <p v-if="saveReservations.error.value" class="form-error" role="alert">{{ saveReservations.error.value }}</p>
        <div class="form-buttons">
          <button type="button" class="btn" :disabled="!days[0]?.ranges.length" @click="copyMonday">Copiar el lunes a todos los días</button>
          <button type="submit" class="btn btn-primary" :disabled="saveReservations.busy.value || !!reservationsIssue || !Object.keys(reservationsDiff).length">Guardar horario</button>
        </div>
      </form>
    </template>
  </section>
</template>

<style scoped>
.branch-section { margin-bottom: 18px; }
.branch-section h2 { margin: 0; font-size: 1.05rem; }
.hours th[scope="row"] { font-weight: 600; white-space: nowrap; }
.range { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 4px 0; }
.range .field { width: auto; min-width: 0; }
.branch-map { height: 280px; margin-top: 10px; }
</style>
