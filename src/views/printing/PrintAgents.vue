<script setup>
import { computed, inject, ref } from 'vue'
import ModalDialog from '../../components/ModalDialog.vue'
import { agentOnline, printingErrorText } from '../../lib/printing.js'
import { validReason } from '../../lib/personal.js'
import { useAction } from '../../lib/useAction.js'

// Agentes: el programa de Restia que corre en una computadora del local y manda los trabajos a las
// impresoras. Conectar uno crea su identidad de servicio (solo administración) y muestra su token una vez.
const props = defineProps({ agents: { type: Array, required: true }, printers: { type: Array, required: true } })
const { calls, reload, branchId, perms } = inject('printing')
const { busy, error, notice, run } = useAction(reload, printingErrorText)

const printerCount = computed(() => {
  const n = new Map()
  for (const p of props.printers) n.set(p.agentId, (n.get(p.agentId) ?? 0) + 1)
  return n
})

const dialog = ref(null)
function open(kind, agent = null) {
  notice.value = ''
  error.value = ''
  dialog.value = { kind, agent, name: '', reason: '', token: null, expiresAt: null }
}
function close() {
  if (!busy.value) dialog.value = null
}
const TITLES = { add: 'Conectar un agente', token: 'Token del agente', on: 'Activar agente', off: 'Desactivar agente' }

const canSubmit = computed(() => {
  const d = dialog.value
  if (!d || busy.value) return false
  if (d.kind === 'add') return d.name.trim().length > 0
  return validReason(d.reason)
})

async function submit() {
  if (!canSubmit.value) return
  const d = dialog.value
  const b = branchId()
  if (d.kind === 'add') {
    const name = d.name.trim()
    await run(async () => {
      const { data } = await calls.createIdentity(b, name)
      // El token solo existe en esta respuesta: se muestra aunque falle el alta del agente.
      d.token = data.token
      d.expiresAt = data.identity.tokenExpiresAt
      await calls.createAgent(b, data.identity.id, name)
      d.kind = 'token'
    }, `Se conectó el agente ${name}.`)
    if (d.token && d.kind !== 'token') d.kind = 'token'
    return
  }
  const ok = await run(() => calls.agentStatus(b, d.agent, d.kind === 'on' ? 'ACTIVE' : 'INACTIVE', d.reason),
    d.kind === 'on' ? `${d.agent.name} está activo.` : `${d.agent.name} está inactivo: sus impresoras dejan de recibir trabajos.`)
  if (ok) dialog.value = null
}

const copied = ref(false)
async function copy() {
  try {
    await navigator.clipboard.writeText(dialog.value.token)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    copied.value = false
  }
}

function time(iso) {
  return iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : 'Nunca'
}
</script>

<template>
  <div>
    <div class="toolbar">
      <p class="help">El agente es el programa de Restia que corre en una computadora del local y manda los trabajos a las impresoras. Debe estar encendido para que se imprima.</p>
      <button v-if="perms.identities" type="button" class="btn btn-primary" @click="open('add')">Conectar un agente</button>
    </div>
    <p v-if="!perms.identities" class="help">Conectar un agente nuevo lo hace un administrador.</p>
    <p v-if="notice && !dialog" class="notice-ok" role="status">{{ notice }}</p>

    <div class="box">
      <table class="data-table">
        <thead><tr><th scope="col">Agente</th><th scope="col">Última señal</th><th scope="col">Impresoras</th><th scope="col">Estado</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
        <tbody>
          <tr v-for="a in agents" :key="a.id">
            <td><span class="cell-main">{{ a.name }}</span><span v-if="a.agentVersion" class="cell-sub">Versión {{ a.agentVersion }}</span></td>
            <td>{{ time(a.lastSeenAt) }} <span v-if="a.status === 'ACTIVE'" class="pill" :class="agentOnline(a) ? '' : 'warn'">{{ agentOnline(a) ? 'En línea' : 'Sin conexión' }}</span></td>
            <td>{{ printerCount.get(a.id) ?? 0 }}</td>
            <td><span class="pill" :class="{ muted: a.status !== 'ACTIVE' }">{{ a.status === 'ACTIVE' ? 'Activo' : 'Inactivo' }}</span></td>
            <td class="actions">
              <button v-if="a.status === 'ACTIVE'" type="button" class="btn btn-danger" @click="open('off', a)">Desactivar</button>
              <button v-else type="button" class="btn" @click="open('on', a)">Activar</button>
            </td>
          </tr>
          <tr v-if="!agents.length"><td colspan="5" class="empty-row">Todavía no hay agentes conectados.</td></tr>
        </tbody>
      </table>
    </div>

    <ModalDialog v-if="dialog" :title="TITLES[dialog.kind]" :busy="busy" @close="close">
      <form class="form" @submit.prevent="submit">
        <template v-if="dialog.kind === 'add'">
          <label>Nombre<input v-model="dialog.name" class="field" maxlength="120" placeholder="Computadora de la caja" autocomplete="off" /></label>
          <p class="help">Al confirmar verás un token que se muestra una sola vez. Se escribe en la configuración del agente en esa computadora.</p>
        </template>
        <template v-else-if="dialog.kind === 'token'">
          <p class="help">Escríbelo en la configuración del agente. No se vuelve a mostrar: si se pierde, hay que conectar el agente otra vez. No lo mandes por chat ni correo.</p>
          <input class="field token" :value="dialog.token" readonly aria-label="Token del agente" @focus="$event.target.select()" />
          <p v-if="dialog.expiresAt" class="help">Vence el {{ time(dialog.expiresAt) }}.</p>
        </template>
        <template v-else>
          <p v-if="dialog.kind === 'off'" class="help">{{ dialog.agent.name }} dejará de recibir trabajos y sus impresoras no imprimirán.</p>
          <p v-else class="help">{{ dialog.agent.name }} volverá a recibir trabajos.</p>
          <label>Motivo<textarea v-model="dialog.reason" class="field" rows="3" maxlength="500" /></label>
        </template>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <div class="form-buttons">
          <template v-if="dialog.kind === 'token'">
            <button type="button" class="btn" @click="copy">{{ copied ? 'Copiado' : 'Copiar token' }}</button>
            <button type="button" class="btn btn-primary" @click="close">Listo</button>
          </template>
          <template v-else>
            <button type="button" class="btn" :disabled="busy" @click="close">Cancelar</button>
            <button type="submit" class="btn" :class="dialog.kind === 'off' ? 'btn-danger-solid' : 'btn-primary'" :disabled="!canSubmit">{{ busy ? 'Guardando…' : 'Confirmar' }}</button>
          </template>
        </div>
      </form>
    </ModalDialog>
  </div>
</template>

<style scoped>
.token { width: 100%; font-family: ui-monospace, monospace; font-size: .82rem; }
</style>
