<script setup>
import { computed, inject, reactive, ref, watch } from 'vue'
import ErrorNotice from '../../components/ErrorNotice.vue'
import ModalDialog from '../../components/ModalDialog.vue'
import { JOB_STATUS, JOB_TYPES, jobActions, printingErrorText } from '../../lib/printing.js'
import { validReason } from '../../lib/personal.js'
import { useAction } from '../../lib/useAction.js'

const props = defineProps({ printers: { type: Array, required: true } })
const { calls, branchId, perms } = inject('printing')

const rows = ref([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const loadError = ref(null)
const filters = reactive({ status: '', type: '' })
const printerName = computed(() => new Map(props.printers.map((p) => [p.id, p.name])))
const pages = computed(() => Math.max(1, Math.ceil(total.value / 50)))

let seq = 0
async function load() {
  const mine = ++seq
  loading.value = true
  loadError.value = null
  try {
    const r = await calls.jobs(branchId(), { ...filters, page: page.value })
    if (mine !== seq) return
    rows.value = r.data
    total.value = r.meta?.pagination?.total ?? r.data.length
  } catch (e) {
    if (mine === seq) loadError.value = e
  } finally {
    if (mine === seq) loading.value = false
  }
}
watch(() => [filters.status, filters.type], () => {
  page.value = 1
  load()
})
watch(page, load, { immediate: true })

const { busy, error, notice, run } = useAction(load, printingErrorText)

const dialog = ref(null)
function open(kind, job) {
  notice.value = ''
  error.value = ''
  dialog.value = { kind, job, outcome: 'PRINTED', reason: '' }
}
function close() {
  if (!busy.value) dialog.value = null
}

const TITLES = { resolve: '¿Salió impreso?', cancel: 'Cancelar trabajo', reprint: 'Reimprimir' }

async function retry(job) {
  notice.value = ''
  await run(() => calls.retry(branchId(), job), `${JOB_TYPES[job.type]} vuelve a la cola.`)
}

async function submit() {
  const d = dialog.value
  if (!d || busy.value || !validReason(d.reason)) return
  const b = branchId()
  const ok = await run(() => {
    if (d.kind === 'resolve') return calls.resolve(b, d.job, d.outcome, d.reason)
    if (d.kind === 'cancel') return calls.cancel(b, d.job, d.reason)
    return calls.reprint(b, d.job, d.reason)
  }, () => ({
    resolve: d.outcome === 'PRINTED' ? 'Se marcó como impreso.' : 'Se marcó como no impreso; ya se puede reintentar.',
    cancel: 'Se canceló el trabajo.',
    reprint: 'Se mandó una copia a la impresora.',
  })[d.kind])
  if (ok) dialog.value = null
}

function time(iso) {
  return iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : ''
}
</script>

<template>
  <div>
    <div class="toolbar">
      <label>Estado
        <select v-model="filters.status" class="field">
          <option value="">Todos</option>
          <option v-for="(s, key) in JOB_STATUS" :key="key" :value="key">{{ s.label }}</option>
        </select>
      </label>
      <label>Documento
        <select v-model="filters.type" class="field">
          <option value="">Todos</option>
          <option v-for="(label, key) in JOB_TYPES" :key="key" :value="key">{{ label }}</option>
        </select>
      </label>
      <span class="count" aria-live="polite">{{ loading ? 'Cargando…' : `${total} trabajos` }}</span>
      <button type="button" class="btn" :disabled="loading" @click="load">Actualizar</button>
    </div>
    <p v-if="notice && !dialog" class="notice-ok" role="status">{{ notice }}</p>
    <p v-if="error && !dialog" class="form-error" role="alert">{{ error }}</p>
    <ErrorNotice :error="loadError" @retry="load" />

    <div v-if="!loadError" class="box">
      <table class="data-table">
        <thead><tr><th scope="col">Documento</th><th scope="col">Impresora</th><th scope="col">Estado</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
        <tbody>
          <tr v-for="j in rows" :key="j.id">
            <td>
              <span class="cell-main">{{ JOB_TYPES[j.type] ?? j.type }}<template v-if="j.originalJobId"> (copia)</template></span>
              <span class="cell-sub">{{ time(j.createdAt) }}<template v-if="j.attempts"> · {{ j.attempts }} {{ j.attempts === 1 ? 'intento' : 'intentos' }}</template></span>
            </td>
            <td>{{ printerName.get(j.printerId) ?? '—' }}</td>
            <td>
              <span class="pill" :class="JOB_STATUS[j.status]?.tone">{{ JOB_STATUS[j.status]?.label ?? j.status }}</span>
              <span v-if="j.lastError && j.status !== 'PRINTED'" class="cell-sub">{{ j.lastError.message }}</span>
            </td>
            <td class="actions">
              <button v-if="jobActions(j, perms).retry" type="button" class="btn" :disabled="busy" @click="retry(j)">Reintentar</button>
              <button v-if="jobActions(j, perms).resolve" type="button" class="btn" @click="open('resolve', j)">¿Salió?</button>
              <button v-if="jobActions(j, perms).reprint" type="button" class="btn" @click="open('reprint', j)">Reimprimir</button>
              <button v-if="jobActions(j, perms).cancel" type="button" class="btn btn-danger" @click="open('cancel', j)">Cancelar</button>
            </td>
          </tr>
          <tr v-if="!loading && !rows.length"><td colspan="4" class="empty-row">No hay trabajos con estos filtros.</td></tr>
        </tbody>
      </table>
    </div>

    <nav v-if="pages > 1" class="pager" aria-label="Páginas">
      <button type="button" class="btn" :disabled="page === 1 || loading" @click="page--">Anterior</button>
      <span>Página {{ page }} de {{ pages }}</span>
      <button type="button" class="btn" :disabled="page === pages || loading" @click="page++">Siguiente</button>
    </nav>

    <ModalDialog v-if="dialog" :title="TITLES[dialog.kind]" :busy="busy" @close="close">
      <form class="form" @submit.prevent="submit">
        <template v-if="dialog.kind === 'resolve'">
          <p class="help">El agente no pudo confirmar si la {{ JOB_TYPES[dialog.job.type].toLowerCase() }} salió de la impresora. Revisa el papel y elige.</p>
          <label class="check"><input v-model="dialog.outcome" type="radio" value="PRINTED" /> Sí salió</label>
          <label class="check"><input v-model="dialog.outcome" type="radio" value="NOT_PRINTED" /> No salió</label>
        </template>
        <p v-else-if="dialog.kind === 'cancel'" class="help">El trabajo no se imprimirá. Si después hace falta, se puede pedir otra vez desde donde se generó.</p>
        <p v-else class="help">Se imprime una copia de la {{ JOB_TYPES[dialog.job.type].toLowerCase() }}, marcada como copia.</p>
        <label>Motivo<textarea v-model="dialog.reason" class="field" rows="3" maxlength="500" required /></label>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <div class="form-buttons">
          <button type="button" class="btn" :disabled="busy" @click="close">Volver</button>
          <button type="submit" class="btn" :class="dialog.kind === 'cancel' ? 'btn-danger-solid' : 'btn-primary'" :disabled="busy || !validReason(dialog.reason)">
            {{ busy ? 'Guardando…' : 'Confirmar' }}
          </button>
        </div>
      </form>
    </ModalDialog>
  </div>
</template>

<style scoped>
.pager { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 14px; color: var(--muted); font-size: .9rem; }
</style>
