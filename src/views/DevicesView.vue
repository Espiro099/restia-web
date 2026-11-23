<script setup>
import { computed, ref, watch } from 'vue'
import { useSession } from '../stores/session.js'
import ErrorNotice from '../components/ErrorNotice.vue'
import ModalDialog from '../components/ModalDialog.vue'
import { DEVICE_STATUS, devicesApi, devicesErrorText, groupCode, sortDevices } from '../lib/devices.js'
import { validReason } from '../lib/personal.js'
import { useAction } from '../lib/useAction.js'

const props = defineProps({ api: { type: Object, default: null } })
const calls = props.api ?? devicesApi()
const session = useSession()

const canEnroll = computed(() => session.canHere('devices.enroll'))
const canManage = computed(() => session.canHere('devices.manage'))

const devices = ref([])
const loaded = ref(false)
const loadError = ref(null)
const showClosed = ref(false)

async function load() {
  loadError.value = null
  try {
    devices.value = sortDevices(await calls.list(session.branchId))
    loaded.value = true
  } catch (e) {
    loadError.value = e
  }
}
watch(() => session.branchId, () => {
  loaded.value = false
  load()
}, { immediate: true })

const active = computed(() => devices.value.filter((d) => d.status === 'ACTIVE'))
const closed = computed(() => devices.value.filter((d) => d.status !== 'ACTIVE'))
const visible = computed(() => (showClosed.value ? devices.value : active.value))

const { busy, error, notice, run } = useAction(load, devicesErrorText)

const dialog = ref(null)
async function newCode() {
  notice.value = ''
  error.value = ''
  dialog.value = { kind: 'code', code: null }
  const d = dialog.value
  await run(async () => { d.code = await calls.enrollmentCode(session.branchId) })
}
function openClose(device, how) {
  notice.value = ''
  error.value = ''
  dialog.value = { kind: 'close', device, how, reason: '' }
}
function close() {
  if (!busy.value) dialog.value = null
}
async function submit() {
  const d = dialog.value
  if (!d || d.kind !== 'close' || busy.value || !validReason(d.reason)) return
  const ok = await run(() => calls.close(session.branchId, d.device, d.how, d.reason),
    d.how === 'BLOCK' ? `Se bloqueó ${d.device.displayName} y se cerraron sus sesiones.` : `Se retiró ${d.device.displayName} y se cerraron sus sesiones.`)
  if (ok) dialog.value = null
}

function time(iso) {
  return iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : 'Nunca'
}
function clock(iso) {
  return iso ? new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : ''
}
</script>

<template>
  <section>
    <header class="mod-head">
      <div>
        <h1>Dispositivos</h1>
        <p class="mod-lead">Teléfonos y tabletas dados de alta en {{ session.currentMembership?.branch?.name }}. Solo estos pueden usar la app.</p>
      </div>
      <button v-if="canEnroll" type="button" class="btn btn-primary" :disabled="busy" @click="newCode">Generar código de alta</button>
    </header>

    <ErrorNotice :error="loadError" @retry="load" />
    <p v-if="!loaded && !loadError" class="help" aria-live="polite">Cargando dispositivos…</p>

    <template v-if="loaded">
      <div class="toolbar">
        <label class="check"><input v-model="showClosed" type="checkbox" /> Mostrar bloqueados y retirados ({{ closed.length }})</label>
        <span class="count">{{ active.length }} {{ active.length === 1 ? 'activo' : 'activos' }}</span>
      </div>
      <p v-if="notice && !dialog" class="notice-ok" role="status">{{ notice }}</p>
      <p v-if="error && !dialog" class="form-error" role="alert">{{ error }}</p>

      <div class="box">
        <table class="data-table">
          <thead><tr><th scope="col">Dispositivo</th><th scope="col">Última conexión</th><th scope="col">Estado</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
          <tbody>
            <tr v-for="d in visible" :key="d.id">
              <td><span class="cell-main">{{ d.displayName }}</span><span class="cell-sub">Alta: {{ time(d.enrolledAt) }}</span></td>
              <td>{{ time(d.lastSeenAt) }}</td>
              <td><span class="pill" :class="DEVICE_STATUS[d.status]?.tone">{{ DEVICE_STATUS[d.status]?.label ?? d.status }}</span></td>
              <td class="actions">
                <template v-if="canManage && d.status === 'ACTIVE'">
                  <button type="button" class="btn" @click="openClose(d, 'RETIRE')">Retirar</button>
                  <button type="button" class="btn btn-danger" @click="openClose(d, 'BLOCK')">Bloquear</button>
                </template>
              </td>
            </tr>
            <tr v-if="!visible.length"><td colspan="4" class="empty-row">No hay dispositivos dados de alta.</td></tr>
          </tbody>
        </table>
      </div>
    </template>

    <ModalDialog v-if="dialog?.kind === 'code'" title="Código de alta" :busy="busy" @close="close">
      <div class="form">
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <p v-else-if="!dialog.code" class="help">Generando…</p>
        <template v-else>
          <p class="help">Escríbelo en el teléfono nuevo, en la pantalla "Registrar este dispositivo". Sirve una sola vez.</p>
          <p class="code" :aria-label="dialog.code.code.split('').join(' ')">{{ groupCode(dialog.code.code) }}</p>
          <p class="help">Vence a las {{ clock(dialog.code.expiresAt) }}</p>
        </template>
        <div class="form-buttons"><button type="button" class="btn btn-primary" @click="close">Listo</button></div>
      </div>
    </ModalDialog>

    <ModalDialog v-if="dialog?.kind === 'close'" :title="dialog.how === 'BLOCK' ? `¿Bloquear ${dialog.device.displayName}?` : `¿Retirar ${dialog.device.displayName}?`" :busy="busy" @close="close">
      <form class="form" @submit.prevent="submit">
        <p v-if="dialog.how === 'BLOCK'" class="help">Para un equipo perdido o robado. Se cierran sus sesiones de inmediato y no podrá volver a entrar. No se puede deshacer: para usarlo otra vez hay que darlo de alta con un código nuevo.</p>
        <p v-else class="help">Para un equipo que ya no se usa en la sucursal. Se cierran sus sesiones y no podrá volver a entrar. No se puede deshacer: para usarlo otra vez hay que darlo de alta con un código nuevo.</p>
        <label>Motivo<textarea v-model="dialog.reason" class="field" rows="3" maxlength="500" /></label>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <div class="form-buttons">
          <button type="button" class="btn" :disabled="busy" @click="close">Volver</button>
          <button type="submit" class="btn" :class="dialog.how === 'BLOCK' ? 'btn-danger-solid' : 'btn-primary'" :disabled="busy || !validReason(dialog.reason)">
            {{ busy ? 'Guardando…' : dialog.how === 'BLOCK' ? 'Bloquear' : 'Retirar' }}
          </button>
        </div>
      </form>
    </ModalDialog>
  </section>
</template>

<style scoped>
.code { margin: 6px 0; font-family: ui-monospace, monospace; font-size: 2rem; font-weight: 700; letter-spacing: .12em; text-align: center; }
</style>
