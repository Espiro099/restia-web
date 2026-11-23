<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useSession } from '../stores/session.js'
import ErrorNotice from '../components/ErrorNotice.vue'
import { ENTITY_LABELS, MAX_DAYS, actionText, auditApi, changeLines } from '../lib/audit.js'
import { daysBetween, isoDate } from '../lib/reports.js'

// Bitácora de cambios de la sucursal: quién hizo qué y cuándo. Solo lectura.
const props = defineProps({
  api: { type: Object, default: null },
  today: { type: Function, default: () => new Date() },
})
const calls = props.api ?? auditApi()
const session = useSession()

const t = props.today()
const weekAgo = new Date(t.getFullYear(), t.getMonth(), t.getDate() - 6)
const filters = reactive({ from: isoDate(weekAgo), to: isoDate(t), entityType: '', actorId: '' })
const rows = ref([])
const total = ref(0)
const page = ref(1)
const people = ref([])
const loading = ref(false)
const error = ref(null)
const open = ref(null)
const pages = computed(() => Math.max(1, Math.ceil(total.value / 50)))
const names = computed(() => new Map(people.value.map((p) => [p.id, p.name])))
const entityOptions = computed(() => Object.entries(ENTITY_LABELS).sort((a, b) => a[1].localeCompare(b[1], 'es')))

const problem = computed(() => {
  if (!filters.from || !filters.to) return 'Elige las dos fechas.'
  if (filters.from > filters.to) return 'La fecha inicial va antes de la final.'
  if (daysBetween(filters.from, filters.to) > MAX_DAYS) return `Se pueden ver hasta ${MAX_DAYS} días a la vez.`
  return ''
})

function range() {
  const [fy, fm, fd] = filters.from.split('-').map(Number)
  const [ty, tm, td] = filters.to.split('-').map(Number)
  return { from: new Date(fy, fm - 1, fd).toISOString(), to: new Date(ty, tm - 1, td, 23, 59, 59).toISOString() }
}

let seq = 0
async function load() {
  if (problem.value) return
  const mine = ++seq
  loading.value = true
  error.value = null
  try {
    const r = await calls.search(session.branchId, { ...range(), entityType: filters.entityType, actorId: filters.actorId, page: page.value })
    if (mine !== seq) return
    rows.value = r.data
    total.value = r.meta?.pagination?.total ?? r.data.length
  } catch (e) {
    if (mine === seq) error.value = e
  } finally {
    if (mine === seq) loading.value = false
  }
}
watch(() => `${session.branchId}|${filters.from}|${filters.to}|${filters.entityType}|${filters.actorId}`, () => {
  page.value = 1
  open.value = null
  load()
}, { immediate: true })
watch(page, load)
watch(() => session.branchId, async () => { people.value = await calls.people(session.branchId) }, { immediate: true })

function who(r) {
  if (r.actorType === 'SYSTEM') return 'Sistema'
  if (r.actorType === 'SERVICE') return 'Servicio automático'
  return names.value.get(r.actorId) ?? 'Alguien del personal'
}
function time(iso) {
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'medium' })
}
</script>

<template>
  <section>
    <header class="mod-head">
      <div>
        <h1>Auditoría</h1>
        <p class="mod-lead">Quién hizo qué y cuándo en {{ session.currentMembership?.branch?.name }}. Solo lectura.</p>
      </div>
    </header>

    <div class="toolbar">
      <label>Desde<input v-model="filters.from" class="field" type="date" :max="isoDate(today())" /></label>
      <label>Hasta<input v-model="filters.to" class="field" type="date" :max="isoDate(today())" /></label>
      <label>Qué
        <select v-model="filters.entityType" class="field">
          <option value="">Todo</option>
          <option v-for="[key, label] in entityOptions" :key="key" :value="key">{{ label }}</option>
        </select>
      </label>
      <label v-if="people.length">Quién
        <select v-model="filters.actorId" class="field">
          <option value="">Todos</option>
          <option v-for="p in people" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </label>
      <span class="count" aria-live="polite">{{ loading ? 'Cargando…' : `${total} registros` }}</span>
    </div>
    <p v-if="problem" class="form-error" role="alert">{{ problem }}</p>
    <ErrorNotice :error="error" @retry="load" />

    <div v-if="!error && !problem" class="box">
      <table class="data-table">
        <thead><tr><th scope="col">Cuándo</th><th scope="col">Quién</th><th scope="col">Qué</th><th scope="col"><span class="sr-only">Detalle</span></th></tr></thead>
        <tbody>
          <template v-for="r in rows" :key="r.id">
            <tr>
              <td>{{ time(r.createdAt) }}</td>
              <td>{{ who(r) }}</td>
              <td><span class="cell-main">{{ actionText(r.action) }}</span><span v-if="r.reason" class="cell-sub">Motivo: {{ r.reason }}</span></td>
              <td class="actions">
                <button v-if="changeLines(r.changes).length || r.requestId" type="button" class="btn" :aria-expanded="open === r.id" @click="open = open === r.id ? null : r.id">
                  {{ open === r.id ? 'Ocultar' : 'Ver cambios' }}
                </button>
              </td>
            </tr>
            <tr v-if="open === r.id" class="detail">
              <td colspan="4">
                <dl>
                  <template v-for="c in changeLines(r.changes)" :key="c.field"><dt>{{ c.field }}</dt><dd>{{ c.text }}</dd></template>
                  <template v-if="r.requestId"><dt>Referencia</dt><dd>{{ r.requestId }}</dd></template>
                </dl>
              </td>
            </tr>
          </template>
          <tr v-if="!loading && !rows.length"><td colspan="4" class="empty-row">No hay registros con estos filtros.</td></tr>
        </tbody>
      </table>
    </div>

    <nav v-if="pages > 1" class="pager" aria-label="Páginas">
      <button type="button" class="btn" :disabled="page === 1 || loading" @click="page--">Anterior</button>
      <span>Página {{ page }} de {{ pages }}</span>
      <button type="button" class="btn" :disabled="page === pages || loading" @click="page++">Siguiente</button>
    </nav>
  </section>
</template>

<style scoped>
.pager { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 14px; color: var(--muted); font-size: .9rem; }
.detail td { background: var(--bg); }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 14px; margin: 0; font-size: .85rem; }
dt { color: var(--muted); }
dd { margin: 0; font-family: ui-monospace, monospace; overflow-wrap: anywhere; }
</style>
