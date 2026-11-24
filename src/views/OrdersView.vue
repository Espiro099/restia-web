<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useSession } from '../stores/session.js'
import { activeOrders, clock, dashboardApi, STAGE_TEXT } from '../lib/dashboard.js'
import { errorText } from '../lib/errors.js'
import { useVisibleRefresh } from '../lib/useVisibleRefresh.js'

// Comandas (Figma "Restia web", 02 · Panel → Comandas): lo que sigue en curso en la sucursal, en el paso de
// su platillo más atrasado. La cocina y el mesero cambian el estado desde la app.
const props = defineProps({ api: { type: Object, default: null } })
const calls = props.api ?? dashboardApi()
const session = useSession()

const orders = ref(null)
const error = ref('')
const query = ref('')

const rows = computed(() => {
  const q = query.value.trim().toLowerCase().replace(/^#/, '')
  return (orders.value?.list ?? []).filter((o) => !q
    || o.orderId.toLowerCase().startsWith(q)
    || o.tables.some((t) => String(t) === q || `mesa ${t}` === q)
    || o.products.some((p) => p.toLowerCase().includes(q)))
})

let request = 0
let loading = false
async function load() {
  const b = session.branchId
  if (!b) return
  const current = ++request
  loading = true
  try {
    const units = await calls.units(b)
    if (current !== request) return
    orders.value = activeOrders(units)
    error.value = ''
  } catch (e) {
    if (current === request) error.value = errorText(e)
  } finally {
    if (current === request) loading = false
  }
}

watch(() => session.branchId, () => {
  request++
  orders.value = null
  error.value = ''
  load()
}, { immediate: true })
useVisibleRefresh(() => { if (!loading) load() }, 5_000)
onBeforeUnmount(() => { request++ })

/** "Pozole rojo, 2 × Agua de jamaica" */
function dishes(products) {
  const counts = new Map()
  for (const p of products) counts.set(p, (counts.get(p) ?? 0) + 1)
  return [...counts].map(([p, n]) => (n > 1 ? `${n} × ${p}` : p)).join(', ')
}
</script>

<template>
  <section>
    <div class="mod-head"><h1>Comandas</h1></div>
    <div class="top">
      <label class="search">
        <span class="sr-only">Buscar comandas</span>
        <input v-model="query" class="field" type="search" placeholder="Buscar comandas…" />
      </label>
      <RouterLink v-if="session.canOpen('tables.read')" :to="{ name: 'mesas' }" class="btn btn-primary">Ver salón</RouterLink>
    </div>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <p class="summary" aria-live="polite">
      <template v-if="orders">{{ orders.total }} en curso · {{ orders.preparing }} en preparación</template>
    </p>
    <div class="box">
      <table class="data-table">
        <thead><tr><th scope="col">Comanda</th><th scope="col">Mesa</th><th scope="col">Platillos</th><th scope="col">Hora</th><th scope="col">Estado</th></tr></thead>
        <tbody>
          <tr v-for="o in rows" :key="o.orderId">
            <td><b>#{{ o.orderId.slice(0, 6).toUpperCase() }}</b></td>
            <td>{{ o.tables.length ? `Mesa ${o.tables.join(', ')}` : '—' }}</td>
            <td class="dishes">{{ dishes(o.products) }}</td>
            <td>{{ clock(o.createdAt) }}</td>
            <td><span class="pill" :class="{ accent: o.stage < 2 }">{{ STAGE_TEXT[o.stage] }}</span></td>
          </tr>
          <tr v-if="orders && !rows.length"><td colspan="5" class="empty-row">{{ query ? 'Ninguna comanda coincide.' : 'No hay comandas en curso.' }}</td></tr>
          <tr v-if="!orders && !error"><td colspan="5" class="empty-row">Cargando…</td></tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.top { display: flex; gap: 16px; align-items: center; justify-content: space-between; margin-bottom: 14px; flex-wrap: wrap; }
.search { flex: 1; max-width: 520px; }
.search .field { width: 100%; }
a.btn { text-decoration: none; }
.summary { margin: 0 0 10px; color: var(--muted); font-size: .85rem; min-height: 1.2em; }
.dishes { color: var(--muted); max-width: 32ch; }
</style>
