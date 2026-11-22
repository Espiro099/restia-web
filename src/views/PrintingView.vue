<script setup>
import { computed, provide, ref, watch } from 'vue'
import { useSession } from '../stores/session.js'
import { printingApi } from '../lib/printing.js'
import ErrorNotice from '../components/ErrorNotice.vue'
import PrintJobs from './printing/PrintJobs.vue'
import PrintPrinters from './printing/PrintPrinters.vue'
import PrintRoutes from './printing/PrintRoutes.vue'
import PrintAgents from './printing/PrintAgents.vue'

const props = defineProps({ api: { type: Object, default: null } })
const calls = props.api ?? printingApi()
const session = useSession()

const canManage = computed(() => session.canHere('printing.manage'))
const perms = computed(() => ({
  resolve: session.canHere('printing.resolve'),
  reprint: session.canHere('printing.reprint'),
  manage: canManage.value,
  identities: session.canHere('service_identities.manage'),
}))

const TABS = computed(() => [
  { key: 'trabajos', label: 'Trabajos' },
  { key: 'impresoras', label: 'Impresoras' },
  { key: 'rutas', label: 'Rutas' },
  ...(canManage.value ? [{ key: 'agentes', label: 'Agentes' }] : []),
])
const tab = ref('trabajos')

const printers = ref([])
const routes = ref([])
const agents = ref([])
const stations = ref([])
const loaded = ref(false)
const error = ref(null)

let seq = 0
async function load() {
  const mine = ++seq
  const b = session.branchId
  error.value = null
  try {
    const [p, r, a, s] = await Promise.all([
      calls.printers(b), calls.routes(b), canManage.value ? calls.agents(b) : Promise.resolve([]), calls.stations(b),
    ])
    if (mine !== seq) return
    printers.value = p
    routes.value = r
    agents.value = a
    stations.value = s
    loaded.value = true
  } catch (e) {
    if (mine === seq) error.value = e
  }
}
watch(() => session.branchId, () => {
  loaded.value = false
  if (!TABS.value.some((t) => t.key === tab.value)) tab.value = 'trabajos'
  load()
}, { immediate: true })

provide('printing', { calls, reload: load, branchId: () => session.branchId, perms })
</script>

<template>
  <section>
    <header class="mod-head">
      <div>
        <h1>Impresión</h1>
        <p class="mod-lead">Comandas, precuentas y recibos de {{ session.currentMembership?.branch?.name }}: qué impresora imprime cada cosa y qué pasó con cada trabajo.</p>
      </div>
    </header>

    <div class="tabs" role="tablist" aria-label="Partes de impresión">
      <button v-for="t in TABS" :id="`tab-${t.key}`" :key="t.key" type="button" role="tab" :aria-selected="tab === t.key"
              :aria-controls="`panel-${t.key}`" @click="tab = t.key">{{ t.label }}</button>
    </div>

    <ErrorNotice :error="error" @retry="load" />
    <p v-if="!loaded && !error" class="help" aria-live="polite">Cargando…</p>

    <div v-if="loaded && !error" :id="`panel-${tab}`" role="tabpanel" :aria-labelledby="`tab-${tab}`">
      <PrintJobs v-if="tab === 'trabajos'" :printers="printers" />
      <PrintPrinters v-else-if="tab === 'impresoras'" :printers="printers" :agents="agents" :routes="routes" />
      <PrintRoutes v-else-if="tab === 'rutas'" :routes="routes" :printers="printers" :stations="stations" />
      <PrintAgents v-else :agents="agents" :printers="printers" />
    </div>
  </section>
</template>
