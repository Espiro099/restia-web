<script setup>
import { computed, inject, ref } from 'vue'
import ModalDialog from '../../components/ModalDialog.vue'
import { CODE_PATTERN, normalizeCode } from '../../lib/catalog.js'
import { agentOnline, connectionText, printingErrorText } from '../../lib/printing.js'
import { validReason } from '../../lib/personal.js'
import { useAction } from '../../lib/useAction.js'

const props = defineProps({
  printers: { type: Array, required: true },
  agents: { type: Array, required: true },
  routes: { type: Array, required: true },
})
const { calls, reload, branchId, perms } = inject('printing')
const { busy, error, notice, run } = useAction(reload, printingErrorText)

const agentById = computed(() => new Map(props.agents.map((a) => [a.id, a])))
const routeCount = computed(() => {
  const n = new Map()
  for (const r of props.routes) if (r.status === 'ACTIVE') n.set(r.printerId, (n.get(r.printerId) ?? 0) + 1)
  return n
})
const activeAgents = computed(() => props.agents.filter((a) => a.status === 'ACTIVE'))

const dialog = ref(null)
function open(kind, p = null) {
  notice.value = ''
  error.value = ''
  dialog.value = {
    kind,
    printer: p,
    code: '',
    name: p?.name ?? '',
    agentId: p?.agentId ?? activeAgents.value[0]?.id ?? '',
    type: p?.connection?.type ?? 'NETWORK',
    host: p?.connection?.host ?? '',
    port: p?.connection?.port ?? 9100,
    localName: p?.connection?.localName ?? '',
    paperWidth: p?.paperWidth ?? 80,
    reason: '',
  }
}
function close() {
  if (!busy.value) dialog.value = null
}
const TITLES = { add: 'Nueva impresora', edit: 'Editar impresora', on: 'Activar impresora', off: 'Desactivar impresora' }

function connection(d) {
  return d.type === 'NETWORK'
    ? { type: 'NETWORK', host: d.host.trim(), port: Number(d.port) }
    : { type: 'USB', localName: d.localName.trim() }
}

const formProblem = computed(() => {
  const d = dialog.value
  if (!d || !['add', 'edit'].includes(d.kind)) return ''
  if (d.kind === 'add' && !CODE_PATTERN.test(normalizeCode(d.code))) return 'El código lleva de 2 a 32 letras mayúsculas, números o guiones.'
  if (!d.name.trim()) return 'Falta el nombre.'
  if (!d.agentId) return 'Elige el agente que la maneja.'
  if (d.type === 'NETWORK' && !/^[A-Za-z0-9.:[\]-]+$/.test(d.host.trim())) return 'Escribe la IP o el nombre de la impresora en la red, sin espacios.'
  if (d.type === 'NETWORK' && !(Number.isInteger(Number(d.port)) && d.port >= 1 && d.port <= 65535)) return 'El puerto va de 1 a 65535 (casi siempre 9100).'
  if (d.type === 'USB' && !d.localName.trim()) return 'Escribe el nombre con que la ve la computadora del agente.'
  return ''
})

const canSubmit = computed(() => {
  const d = dialog.value
  if (!d || busy.value) return false
  if (d.kind === 'on' || d.kind === 'off') return validReason(d.reason)
  return !formProblem.value
})

async function submit() {
  if (!canSubmit.value) return
  const d = dialog.value
  const b = branchId()
  const body = { agentId: d.agentId, name: d.name.trim(), connection: connection(d), paperWidth: Number(d.paperWidth) }
  const ok = await run(() => {
    if (d.kind === 'add') return calls.createPrinter(b, { code: normalizeCode(d.code), ...body })
    if (d.kind === 'edit') {
      const p = d.printer
      const diff = {}
      if (body.agentId !== p.agentId) diff.agentId = body.agentId
      if (body.name !== p.name) diff.name = body.name
      if (JSON.stringify(body.connection) !== JSON.stringify(p.connection)) diff.connection = body.connection
      if (body.paperWidth !== p.paperWidth) diff.paperWidth = body.paperWidth
      return Object.keys(diff).length ? calls.updatePrinter(b, p, diff) : null
    }
    return calls.printerStatus(b, d.printer, d.kind === 'on' ? 'ACTIVE' : 'INACTIVE', d.reason)
  }, () => ({
    add: `Se agregó ${body.name}. Imprime una prueba para confirmar que el agente la alcanza.`,
    edit: `Se guardó ${body.name}.`,
    on: `${d.printer?.name} está activa.`,
    off: `${d.printer?.name} está inactiva: sus rutas dejan de imprimir.`,
  })[d.kind])
  if (ok) dialog.value = null
}

async function testPrint(p) {
  notice.value = ''
  await run(() => calls.testPrint(branchId(), p), `Se mandó una hoja de prueba a ${p.name}. Revisa en Trabajos si salió.`)
}
</script>

<template>
  <div>
    <div class="toolbar">
      <p class="help">Cada impresora la maneja un agente: el programa de Restia instalado en una computadora del local, en la misma red o conectada por USB.</p>
      <button v-if="perms.manage" type="button" class="btn btn-primary" :disabled="!activeAgents.length" @click="open('add')">Nueva impresora</button>
    </div>
    <p v-if="perms.manage && !activeAgents.length" class="help">Primero conecta un agente en la pestaña Agentes.</p>
    <p v-if="notice && !dialog" class="notice-ok" role="status">{{ notice }}</p>
    <p v-if="error && !dialog" class="form-error" role="alert">{{ error }}</p>

    <div class="box">
      <table class="data-table">
        <thead><tr><th scope="col">Impresora</th><th scope="col">Conexión</th><th scope="col">Agente</th><th scope="col">Estado</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
        <tbody>
          <tr v-for="p in printers" :key="p.id">
            <td><span class="cell-main">{{ p.name }}</span><span class="cell-sub">{{ p.code }} · papel de {{ p.paperWidth }} mm · {{ routeCount.get(p.id) ?? 0 }} {{ routeCount.get(p.id) === 1 ? 'ruta' : 'rutas' }}</span></td>
            <td>{{ connectionText(p.connection) }}</td>
            <td>
              <template v-if="agentById.get(p.agentId)">
                {{ agentById.get(p.agentId).name }}
                <span class="pill" :class="agentOnline(agentById.get(p.agentId)) ? '' : 'warn'">{{ agentOnline(agentById.get(p.agentId)) ? 'En línea' : 'Sin conexión' }}</span>
              </template>
              <span v-else class="cell-sub">—</span>
            </td>
            <td><span class="pill" :class="{ muted: p.status !== 'ACTIVE' }">{{ p.status === 'ACTIVE' ? 'Activa' : 'Inactiva' }}</span></td>
            <td class="actions">
              <template v-if="perms.manage">
                <button v-if="p.status === 'ACTIVE'" type="button" class="btn" :disabled="busy" @click="testPrint(p)">Imprimir prueba</button>
                <button type="button" class="btn" @click="open('edit', p)">Editar</button>
                <button v-if="p.status === 'ACTIVE'" type="button" class="btn btn-danger" @click="open('off', p)">Desactivar</button>
                <button v-else type="button" class="btn" @click="open('on', p)">Activar</button>
              </template>
            </td>
          </tr>
          <tr v-if="!printers.length"><td colspan="5" class="empty-row">Todavía no hay impresoras.</td></tr>
        </tbody>
      </table>
    </div>

    <ModalDialog v-if="dialog" :title="TITLES[dialog.kind]" :busy="busy" @close="close">
      <form class="form" @submit.prevent="submit">
        <template v-if="dialog.kind === 'add' || dialog.kind === 'edit'">
          <div class="row">
            <label v-if="dialog.kind === 'add'">Código<input v-model="dialog.code" class="field" maxlength="32" placeholder="COCINA-1" autocomplete="off" /></label>
            <label>Nombre<input v-model="dialog.name" class="field" maxlength="120" placeholder="Térmica de cocina" autocomplete="off" /></label>
          </div>
          <label>Agente que la maneja
            <select v-model="dialog.agentId" class="field">
              <option v-for="a in agents.filter((a) => a.status === 'ACTIVE' || a.id === dialog.agentId)" :key="a.id" :value="a.id">{{ a.name }}</option>
            </select>
          </label>
          <fieldset>
            <legend>Conexión</legend>
            <label class="check"><input v-model="dialog.type" type="radio" value="NETWORK" /> Red (IP)</label>
            <label class="check"><input v-model="dialog.type" type="radio" value="USB" /> USB en la computadora del agente</label>
            <div v-if="dialog.type === 'NETWORK'" class="row">
              <label>IP o nombre<input v-model="dialog.host" class="field" maxlength="255" placeholder="192.168.1.50" autocomplete="off" /></label>
              <label>Puerto<input v-model.number="dialog.port" class="field" type="number" min="1" max="65535" /></label>
            </div>
            <label v-else>Nombre de la impresora en esa computadora<input v-model="dialog.localName" class="field" maxlength="120" autocomplete="off" /></label>
          </fieldset>
          <label>Ancho del papel
            <select v-model.number="dialog.paperWidth" class="field">
              <option :value="80">80 mm</option>
              <option :value="58">58 mm</option>
            </select>
          </label>
          <p v-if="formProblem" class="help" aria-live="polite">{{ formProblem }}</p>
        </template>
        <template v-else>
          <p v-if="dialog.kind === 'off'" class="help">{{ dialog.printer.name }} dejará de imprimir. Si tiene trabajos en curso, no se podrá desactivar hasta que terminen.</p>
          <p v-else class="help">{{ dialog.printer.name }} volverá a imprimir lo de sus rutas.</p>
          <label>Motivo<textarea v-model="dialog.reason" class="field" rows="3" maxlength="500" /></label>
        </template>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <div class="form-buttons">
          <button type="button" class="btn" :disabled="busy" @click="close">Cancelar</button>
          <button type="submit" class="btn" :class="dialog.kind === 'off' ? 'btn-danger-solid' : 'btn-primary'" :disabled="!canSubmit">{{ busy ? 'Guardando…' : 'Guardar' }}</button>
        </div>
      </form>
    </ModalDialog>
  </div>
</template>
