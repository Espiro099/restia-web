<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { useSession } from '../stores/session.js'
import ErrorNotice from '../components/ErrorNotice.vue'
import ModalDialog from '../components/ModalDialog.vue'
import { STATE_LABELS, STATUS_LABELS, byZone, nextNumber, tablesApi, tablesErrorText } from '../lib/tables.js'
import { validReason } from '../lib/personal.js'
import { useAction } from '../lib/useAction.js'
import { useVisibleRefresh } from '../lib/useVisibleRefresh.js'

const props = defineProps({ api: { type: Object, default: null } })
const calls = props.api ?? tablesApi()
const session = useSession()

const tables = ref([])
const loaded = ref(false)
const loadError = ref(null)
const status = ref('')
const canManage = computed(() => session.canHere('tables.manage'))
const canQr = computed(() => session.canHere('tables.qr_read'))
const canRotate = computed(() => session.canHere('tables.qr_rotate'))

let seq = 0
let loading = false
async function load() {
  const branchId = session.branchId
  if (!branchId) return
  const mine = ++seq
  loading = true
  try {
    const rows = await calls.list(branchId)
    if (mine !== seq) return
    tables.value = rows
    loaded.value = true
    loadError.value = null
  } catch (e) {
    if (mine === seq) loadError.value = e
  } finally {
    if (mine === seq) loading = false
  }
}
watch(() => session.branchId, () => {
  seq++
  loaded.value = false
  tables.value = []
  loadError.value = null
  load()
}, { immediate: true })
onBeforeUnmount(() => { seq++ })

const { busy, error, notice, run } = useAction(load, tablesErrorText)

const visible = computed(() => tables.value.filter((t) => !status.value || t.status === status.value))
const groups = computed(() => byZone(visible.value))
const zones = computed(() => [...new Set(tables.value.map((t) => t.zone).filter(Boolean))].sort())
const groupsUsed = computed(() => [...new Set(tables.value.map((t) => t.combinationGroup).filter(Boolean))].sort())
const seats = computed(() => tables.value.filter((t) => t.status === 'ACTIVE').reduce((n, t) => n + t.capacity, 0))

// ---------------------------------------------------------------- Diálogos
const dialog = ref(null)
useVisibleRefresh(() => {
  if (!loading && !busy.value) load()
}, 5_000)

function open(kind, table = null) {
  notice.value = ''
  error.value = ''
  dialog.value = {
    kind,
    table,
    number: table?.number ?? nextNumber(tables.value),
    capacity: table?.capacity ?? 4,
    zone: table?.zone ?? '',
    combinationGroup: table?.combinationGroup ?? '',
    status: kind === 'status' ? (table.status === 'ACTIVE' ? 'MAINTENANCE' : 'ACTIVE') : null,
    reason: '',
    qr: null,
    qrImage: '',
    qrError: '',
    rotating: false,
  }
  if (kind === 'qr') loadQr()
}
function close() {
  if (!busy.value) dialog.value = null
}

const TITLES = { add: 'Nueva mesa', edit: 'Editar mesa', status: 'Cambiar estado', qr: 'Código QR' }

const formProblem = computed(() => {
  const d = dialog.value
  if (!d || !['add', 'edit'].includes(d.kind)) return ''
  const n = Number(d.number)
  const c = Number(d.capacity)
  if (!Number.isInteger(n) || n < 1 || n > 9999) return 'El número va de 1 a 9999.'
  if (!Number.isInteger(c) || c < 1 || c > 200) return 'La capacidad va de 1 a 200 personas.'
  return ''
})

const canSubmit = computed(() => {
  const d = dialog.value
  if (!d || busy.value) return false
  if (d.kind === 'status') return d.status !== d.table.status && validReason(d.reason)
  if (d.kind === 'qr') return d.rotating && validReason(d.reason)
  return !formProblem.value
})

function body(d) {
  return {
    number: Number(d.number),
    capacity: Number(d.capacity),
    zone: d.zone.trim() || null,
    combinationGroup: d.combinationGroup.trim() || null,
  }
}

function changes(t, next) {
  return Object.fromEntries(Object.entries(next).filter(([k, v]) => (t[k] ?? null) !== v))
}

async function submit() {
  if (!canSubmit.value) return
  const d = dialog.value
  const b = session.branchId
  if (d.kind === 'qr') return rotate()
  const ok = await run(async () => {
    if (d.kind === 'add') await calls.create(b, body(d))
    else if (d.kind === 'edit') {
      const diff = changes(d.table, body(d))
      if (Object.keys(diff).length) await calls.update(b, d.table, diff)
    } else await calls.status(b, d.table, d.status, d.reason)
  }, () => ({
    add: `Se creó la mesa ${d.number}.`,
    edit: `Se guardó la mesa ${d.number}.`,
    status: `La mesa ${d.table?.number} quedó ${STATUS_LABELS[d.status]?.toLowerCase()}.`,
  })[d.kind])
  if (ok) dialog.value = null
}

// ---------------------------------------------------------------- QR
async function loadQr() {
  const d = dialog.value
  try {
    const { data } = await calls.qr(session.branchId, d.table)
    if (dialog.value !== d) return
    d.qr = data
    d.qrImage = await QRCode.toDataURL(data.url, { margin: 1, width: 360, errorCorrectionLevel: 'M' })
  } catch (e) {
    if (dialog.value === d) d.qrError = tablesErrorText(e)
  }
}

async function rotate() {
  const d = dialog.value
  const ok = await run(async () => {
    const { data } = await calls.rotateQr(session.branchId, d.table, d.qr.version, d.reason)
    d.qr = data
    d.qrImage = await QRCode.toDataURL(data.url, { margin: 1, width: 360, errorCorrectionLevel: 'M' })
  }, `Se generó un QR nuevo para la mesa ${d.table.number}. Imprímelo y cámbialo en la mesa.`)
  if (ok) {
    d.rotating = false
    d.reason = ''
  }
}

function printQr() {
  window.print()
}

function date(iso) {
  return iso ? new Date(iso).toLocaleDateString('es-MX', { dateStyle: 'long' }) : ''
}
</script>

<template>
  <section>
    <header class="mod-head">
      <div>
        <h1>Mesas y QR</h1>
        <p class="mod-lead">Las mesas de {{ session.currentMembership?.branch?.name }}, su capacidad y el código QR que los clientes escanean para ver el menú.</p>
      </div>
      <button v-if="canManage && loaded" type="button" class="btn btn-primary" @click="open('add')">Nueva mesa</button>
    </header>

    <ErrorNotice :error="loadError" @retry="load" />
    <p v-if="!loaded && !loadError" class="help" aria-live="polite">Cargando mesas…</p>

    <template v-if="loaded">
      <div class="toolbar">
        <label>Estado
          <select v-model="status" class="field">
            <option value="">Todas</option>
            <option value="ACTIVE">Activas</option>
            <option value="MAINTENANCE">En mantenimiento</option>
            <option value="INACTIVE">Inactivas</option>
          </select>
        </label>
        <span class="count">{{ tables.length }} {{ tables.length === 1 ? 'mesa' : 'mesas' }} · {{ seats }} {{ seats === 1 ? 'lugar activo' : 'lugares activos' }}</span>
      </div>
      <p v-if="notice && !dialog" class="notice-ok" role="status">{{ notice }}</p>

      <div v-for="g in groups" :key="g.zone" class="box">
        <h2>{{ g.zone }}</h2>
        <table class="data-table">
          <thead><tr><th scope="col">Mesa</th><th scope="col">Lugares</th><th scope="col">Estado</th><th scope="col">Ahora</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
          <tbody>
            <tr v-for="t in g.items" :key="t.id">
              <td><span class="cell-main">Mesa {{ t.number }}</span><span v-if="t.combinationGroup" class="cell-sub">Se junta con el grupo {{ t.combinationGroup }}</span></td>
              <td>{{ t.capacity }}</td>
              <td><span class="pill" :class="{ muted: t.status === 'INACTIVE', warn: t.status === 'MAINTENANCE' }">{{ STATUS_LABELS[t.status] }}</span></td>
              <td><span v-if="t.operationalState" class="pill" :class="t.operationalState === 'LIBRE' ? 'muted' : 'accent'">{{ STATE_LABELS[t.operationalState] ?? t.operationalState }}</span></td>
              <td class="actions">
                <button v-if="canQr" type="button" class="btn" @click="open('qr', t)">QR</button>
                <template v-if="canManage">
                  <button type="button" class="btn" @click="open('edit', t)">Editar</button>
                  <button type="button" class="btn" @click="open('status', t)">Cambiar estado</button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="!groups.length" class="box empty-row">{{ tables.length ? 'Ninguna mesa con ese estado.' : 'Todavía no hay mesas. Da de alta la primera.' }}</p>
    </template>

    <ModalDialog v-if="dialog" :title="dialog.kind === 'qr' ? `QR de la mesa ${dialog.table.number}` : TITLES[dialog.kind]" :busy="busy" @close="close">
      <form class="form" @submit.prevent="submit">
        <template v-if="dialog.kind === 'add' || dialog.kind === 'edit'">
          <div class="row">
            <label>Número<input v-model.number="dialog.number" class="field" type="number" min="1" max="9999" required /></label>
            <label>Lugares<input v-model.number="dialog.capacity" class="field" type="number" min="1" max="200" required /></label>
          </div>
          <label>Zona (opcional)<input v-model="dialog.zone" class="field" maxlength="60" list="table-zones" placeholder="Terraza" autocomplete="off" /></label>
          <datalist id="table-zones"><option v-for="z in zones" :key="z" :value="z" /></datalist>
          <label>Grupo para juntar (opcional)<input v-model="dialog.combinationGroup" class="field" maxlength="60" list="table-groups" placeholder="A" autocomplete="off" /></label>
          <datalist id="table-groups"><option v-for="g in groupsUsed" :key="g" :value="g" /></datalist>
          <p class="help">Las mesas del mismo grupo se pueden juntar para una mesa grande.</p>
          <p v-if="formProblem" class="help" aria-live="polite">{{ formProblem }}</p>
        </template>

        <template v-else-if="dialog.kind === 'status'">
          <p class="help">La mesa {{ dialog.table.number }} está {{ STATUS_LABELS[dialog.table.status].toLowerCase() }}. Si no está activa, la app no la ofrece para sentar a nadie.</p>
          <label>Nuevo estado
            <select v-model="dialog.status" class="field">
              <option v-for="(label, key) in STATUS_LABELS" :key="key" :value="key" :disabled="key === dialog.table.status">{{ label }}</option>
            </select>
          </label>
          <label>Motivo<textarea v-model="dialog.reason" class="field" rows="3" maxlength="500" required /></label>
        </template>

        <template v-else>
          <p v-if="notice" class="notice-ok" role="status">{{ notice }}</p>
          <p v-if="dialog.qrError" class="form-error" role="alert">{{ dialog.qrError }}</p>
          <p v-else-if="!dialog.qrImage" class="help">Generando el código…</p>
          <div v-else class="qr-print">
            <img :src="dialog.qrImage" :alt="`Código QR del menú de la mesa ${dialog.table.number}`" width="240" height="240" />
            <p class="qr-title">Mesa {{ dialog.table.number }}</p>
            <p class="qr-caption">Escanea para ver el menú</p>
          </div>
          <p v-if="dialog.qr" class="help qr-url">{{ dialog.qr.url }}</p>
          <p v-if="dialog.qr?.previousTokenExpiresAt" class="help">El QR anterior sigue funcionando hasta el {{ date(dialog.qr.previousTokenExpiresAt) }}.</p>
          <template v-if="dialog.rotating">
            <p class="help">El QR nuevo reemplaza al actual. El impreso hoy en la mesa seguirá funcionando 7 días, para que haya tiempo de cambiarlo. Úsalo si alguien se llevó o copió el código.</p>
            <label>Motivo<textarea v-model="dialog.reason" class="field" rows="2" maxlength="500" required /></label>
          </template>
        </template>

        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <div class="form-buttons">
          <template v-if="dialog.kind === 'qr'">
            <button v-if="canRotate && dialog.qr && !dialog.rotating" type="button" class="btn" @click="dialog.rotating = true">Generar uno nuevo</button>
            <a v-if="dialog.qrImage && !dialog.rotating" class="btn" :href="dialog.qrImage" :download="`mesa-${dialog.table.number}-qr.png`">Descargar</a>
            <button v-if="dialog.qrImage && !dialog.rotating" type="button" class="btn" @click="printQr">Imprimir</button>
            <button v-if="dialog.rotating" type="button" class="btn" :disabled="busy" @click="dialog.rotating = false">Cancelar</button>
            <button v-if="dialog.rotating" type="submit" class="btn btn-danger-solid" :disabled="!canSubmit">{{ busy ? 'Generando…' : 'Generar QR nuevo' }}</button>
            <button v-else type="button" class="btn btn-primary" @click="close">Listo</button>
          </template>
          <template v-else>
            <button type="button" class="btn" :disabled="busy" @click="close">Cancelar</button>
            <button type="submit" class="btn btn-primary" :disabled="!canSubmit">{{ busy ? 'Guardando…' : 'Guardar' }}</button>
          </template>
        </div>
      </form>
    </ModalDialog>
  </section>
</template>

<style scoped>
.qr-print { display: grid; justify-items: center; gap: 4px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; }
.qr-print img { width: 240px; height: 240px; image-rendering: pixelated; }
.qr-title { margin: 6px 0 0; font-size: 1.3rem; font-weight: 700; }
.qr-caption { margin: 0; color: var(--muted); }
.qr-url { font-family: ui-monospace, monospace; font-size: .78rem; overflow-wrap: anywhere; }
a.btn { text-decoration: none; display: inline-flex; align-items: center; }
</style>
