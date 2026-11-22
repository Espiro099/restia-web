<script setup>
import { computed, inject, ref } from 'vue'
import ModalDialog from '../../components/ModalDialog.vue'
import { CODE_PATTERN, normalizeCode } from '../../lib/catalog.js'
import { JOB_TYPES, STATION_JOB_TYPES, printingErrorText } from '../../lib/printing.js'
import { validReason } from '../../lib/personal.js'
import { useAction } from '../../lib/useAction.js'

// Rutas (print stations en la API): qué documentos imprime cada impresora. Las comandas y avisos de
// cancelación van atados a una estación de preparación, que no se cambia después de crear la ruta.
const props = defineProps({
  routes: { type: Array, required: true },
  printers: { type: Array, required: true },
  stations: { type: Array, required: true },
})
const { calls, reload, branchId, perms } = inject('printing')
const { busy, error, notice, run } = useAction(reload, printingErrorText)

const printerName = computed(() => new Map(props.printers.map((p) => [p.id, p.name])))
const stationName = computed(() => new Map(props.stations.map((s) => [s.id, s.name])))
const activePrinters = computed(() => props.printers.filter((p) => p.status === 'ACTIVE'))
const activeStations = computed(() => props.stations.filter((s) => s.status === 'ACTIVE'))

const dialog = ref(null)
function open(kind, r = null) {
  notice.value = ''
  error.value = ''
  dialog.value = {
    kind,
    route: r,
    code: '',
    name: r?.name ?? '',
    printerId: r?.printerId ?? activePrinters.value[0]?.id ?? '',
    stationId: r?.stationId ?? '',
    jobTypes: [...(r?.jobTypes ?? ['KITCHEN_TICKET', 'VOID_NOTICE'])],
    reason: '',
  }
}
function close() {
  if (!busy.value) dialog.value = null
}
const TITLES = { add: 'Nueva ruta', edit: 'Editar ruta', on: 'Activar ruta', off: 'Desactivar ruta' }

const needsStation = computed(() => dialog.value?.jobTypes.some((t) => STATION_JOB_TYPES.includes(t)))

const formProblem = computed(() => {
  const d = dialog.value
  if (!d || !['add', 'edit'].includes(d.kind)) return ''
  if (d.kind === 'add' && !CODE_PATTERN.test(normalizeCode(d.code))) return 'El código lleva de 2 a 32 letras mayúsculas, números o guiones.'
  if (!d.name.trim()) return 'Falta el nombre.'
  if (!d.printerId) return 'Elige la impresora.'
  if (!d.jobTypes.length) return 'Elige al menos un documento.'
  if (d.kind === 'add' && needsStation.value && !d.stationId) return 'Las comandas y los avisos de cancelación necesitan la estación que los prepara.'
  if (d.kind === 'edit' && needsStation.value && !d.route.stationId) return 'Esta ruta no tiene estación: para comandas crea otra ruta con su estación.'
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
  const ok = await run(() => {
    if (d.kind === 'add') {
      return calls.createRoute(b, {
        code: normalizeCode(d.code), name: d.name.trim(), printerId: d.printerId, jobTypes: d.jobTypes,
        ...(d.stationId ? { stationId: d.stationId } : {}),
      })
    }
    if (d.kind === 'edit') {
      const r = d.route
      const diff = {}
      if (d.name.trim() !== r.name) diff.name = d.name.trim()
      if (d.printerId !== r.printerId) diff.printerId = d.printerId
      if ([...d.jobTypes].sort().join() !== [...r.jobTypes].sort().join()) diff.jobTypes = d.jobTypes
      return Object.keys(diff).length ? calls.updateRoute(b, r, diff) : null
    }
    return calls.routeStatus(b, d.route, d.kind === 'on' ? 'ACTIVE' : 'INACTIVE', d.reason)
  }, () => ({
    add: `Se creó la ruta ${d.name.trim()}.`,
    edit: `Se guardó la ruta ${d.name.trim()}.`,
    on: `La ruta ${d.route?.name} está activa.`,
    off: `La ruta ${d.route?.name} está inactiva: sus documentos ya no se imprimen ahí.`,
  })[d.kind])
  if (ok) dialog.value = null
}
</script>

<template>
  <div>
    <div class="toolbar">
      <p class="help">Una ruta dice qué documentos imprime una impresora. Las comandas salen en la impresora de la estación que prepara cada producto.</p>
      <button v-if="perms.manage" type="button" class="btn btn-primary" :disabled="!activePrinters.length" @click="open('add')">Nueva ruta</button>
    </div>
    <p v-if="notice && !dialog" class="notice-ok" role="status">{{ notice }}</p>

    <div class="box">
      <table class="data-table">
        <thead><tr><th scope="col">Ruta</th><th scope="col">Documentos</th><th scope="col">Impresora</th><th scope="col">Estado</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
        <tbody>
          <tr v-for="r in routes" :key="r.id">
            <td><span class="cell-main">{{ r.name }}</span><span class="cell-sub">{{ r.code }}<template v-if="r.stationId"> · {{ stationName.get(r.stationId) ?? 'Estación' }}</template></span></td>
            <td><span v-for="t in r.jobTypes" :key="t" class="pill accent">{{ JOB_TYPES[t] ?? t }}</span></td>
            <td>{{ printerName.get(r.printerId) ?? '—' }}</td>
            <td><span class="pill" :class="{ muted: r.status !== 'ACTIVE' }">{{ r.status === 'ACTIVE' ? 'Activa' : 'Inactiva' }}</span></td>
            <td class="actions">
              <template v-if="perms.manage">
                <button type="button" class="btn" @click="open('edit', r)">Editar</button>
                <button v-if="r.status === 'ACTIVE'" type="button" class="btn btn-danger" @click="open('off', r)">Desactivar</button>
                <button v-else type="button" class="btn" @click="open('on', r)">Activar</button>
              </template>
            </td>
          </tr>
          <tr v-if="!routes.length"><td colspan="5" class="empty-row">Todavía no hay rutas: sin ellas no se imprime nada automáticamente.</td></tr>
        </tbody>
      </table>
    </div>

    <ModalDialog v-if="dialog" :title="TITLES[dialog.kind]" :busy="busy" @close="close">
      <form class="form" @submit.prevent="submit">
        <template v-if="dialog.kind === 'add' || dialog.kind === 'edit'">
          <div class="row">
            <label v-if="dialog.kind === 'add'">Código<input v-model="dialog.code" class="field" maxlength="32" placeholder="COMANDAS-COCINA" autocomplete="off" /></label>
            <label>Nombre<input v-model="dialog.name" class="field" maxlength="120" placeholder="Comandas de cocina" autocomplete="off" /></label>
          </div>
          <label>Impresora
            <select v-model="dialog.printerId" class="field">
              <option v-for="p in printers.filter((p) => p.status === 'ACTIVE' || p.id === dialog.printerId)" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </label>
          <fieldset>
            <legend>Documentos</legend>
            <label v-for="(label, key) in JOB_TYPES" v-show="key !== 'TEST'" :key="key" class="check">
              <input v-model="dialog.jobTypes" type="checkbox" :value="key" /> {{ label }}
            </label>
          </fieldset>
          <label v-if="dialog.kind === 'add'">Estación que prepara {{ needsStation ? '' : '(opcional)' }}
            <select v-model="dialog.stationId" class="field">
              <option value="">Ninguna</option>
              <option v-for="s in activeStations" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </label>
          <p v-else-if="dialog.route.stationId" class="help">Estación: {{ stationName.get(dialog.route.stationId) }}. No se puede cambiar; para otra estación crea otra ruta.</p>
          <p v-if="formProblem" class="help" aria-live="polite">{{ formProblem }}</p>
        </template>
        <template v-else>
          <p v-if="dialog.kind === 'off'" class="help">Los documentos de la ruta {{ dialog.route.name }} dejarán de imprimirse en {{ printerName.get(dialog.route.printerId) }}.</p>
          <p v-else class="help">La ruta {{ dialog.route.name }} volverá a imprimir.</p>
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
