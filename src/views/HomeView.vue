<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useSession } from '../stores/session.js'
import { MODULES } from '../modules.js'
import { money } from '../lib/reports.js'
import { activeOrders, changeText, clock, dashboardApi, salesSummary, STAGE_TEXT, stockLevel } from '../lib/dashboard.js'
import BarChart from '../components/BarChart.vue'
import DonutChart from '../components/DonutChart.vue'

// Inicio (Figma "Restia web", 02 · Panel → Inicio): el estado del restaurante de un vistazo. Cada tarjeta
// sale de la API con su permiso; si una falla, las demás se muestran igual. Se actualiza cada minuto.
const props = defineProps({ api: { type: Object, default: null } })
const calls = props.api ?? dashboardApi()
const session = useSession()

const modules = computed(() => MODULES.filter((m) => session.canOpen(m.permission)))
const firstName = computed(() => (session.user?.name ?? '').split(' ')[0])
const can = (p) => session.canOpen(p)
const showSales = computed(() => can('reports.read'))
const showOrders = computed(() => can('orders.read'))
const showStock = computed(() => can('inventory.read'))
const anyCard = computed(() => showSales.value || showOrders.value || showStock.value)

const sales = ref(null)
const orders = ref(null)
const stock = ref(null)
const failed = ref({})

// Colores fijos por método (orden de la leyenda), del sistema del Figma.
const METHOD_COLORS = { CASH: '#c74115', CARD_CREDIT: '#e99c38', CARD_DEBIT: '#40764b', TRANSFER: '#d5bea4' }
const methods = computed(() => (sales.value?.methods ?? []).map((m) => ({ ...m, key: m.method, color: METHOD_COLORS[m.method] })))
const week = computed(() => (sales.value?.week ?? []).map((d) => ({ ...d, tooltip: `${d.longLabel}: ${money(Math.round(d.value * 100))}` })))
const pct = (share) => `${Math.round(share * 100)} %`
const short = (c) => money(c, '').replace('.00', '')

async function load() {
  const b = session.branchId
  if (!b) return
  const tasks = []
  if (showSales.value) tasks.push(calls.sales(b).then((r) => { sales.value = salesSummary(r); failed.value.sales = false }).catch(() => { failed.value.sales = true }))
  if (showOrders.value) tasks.push(calls.units(b).then((r) => { orders.value = activeOrders(r); failed.value.orders = false }).catch(() => { failed.value.orders = true }))
  if (showStock.value) tasks.push(calls.lowStock(b).then((r) => { stock.value = r; failed.value.stock = false }).catch(() => { failed.value.stock = true }))
  await Promise.all(tasks)
}

let timer = null
onMounted(() => {
  load()
  timer = setInterval(() => { if (document.visibilityState === 'visible') load() }, 60_000)
})
onBeforeUnmount(() => clearInterval(timer))
watch(() => session.branchId, () => {
  sales.value = orders.value = stock.value = null
  load()
})
</script>

<template>
  <section class="home">
    <h1>Hola, {{ firstName }}</h1>
    <p class="lead">Aquí tienes un resumen del estado actual del restaurante.</p>

    <p v-if="!session.memberships.length" class="empty">
      Tu usuario no tiene ninguna sucursal activa. Pide a un administrador que te dé acceso.
    </p>
    <p v-else-if="!modules.length" class="empty">
      Con tu rol no hay módulos del panel en esta sucursal. El trabajo de piso se hace en la app Android.
    </p>

    <template v-else-if="anyCard">
      <div class="kpis">
        <article v-if="showSales" class="card kpi">
          <h2>Ventas del día</h2>
          <p class="value">{{ sales ? short(sales.today) : '—' }}</p>
          <p class="hint" :class="{ ok: (sales?.salesChange ?? 0) >= 0, down: (sales?.salesChange ?? 0) < 0 }">
            {{ failed.sales ? 'No se pudo cargar' : sales ? changeText(sales.salesChange) : 'Cargando…' }}
          </p>
        </article>
        <article v-if="showOrders" class="card kpi">
          <h2>Comandas activas</h2>
          <p class="value">{{ orders ? orders.total : '—' }}</p>
          <p class="hint ok">{{ failed.orders ? 'No se pudo cargar' : orders ? `${orders.preparing} en preparación` : 'Cargando…' }}</p>
        </article>
        <article v-if="showSales" class="card kpi">
          <h2>Ticket promedio</h2>
          <p class="value">{{ sales ? short(sales.avgTicket) : '—' }}</p>
          <p class="hint" :class="{ ok: (sales?.ticketChange ?? 0) >= 0, down: (sales?.ticketChange ?? 0) < 0 }">
            {{ failed.sales ? 'No se pudo cargar' : sales ? (sales.checksToday ? changeText(sales.ticketChange) : 'Sin cuentas pagadas hoy') : 'Cargando…' }}
          </p>
        </article>
        <article v-if="showStock" class="card kpi">
          <h2>Stock bajo</h2>
          <p class="value">{{ stock ? stock.total : '—' }}</p>
          <RouterLink v-if="stock?.total" :to="{ name: 'inventario' }" class="hint warn">Revisar inventario</RouterLink>
          <p v-else class="hint ok">{{ failed.stock ? 'No se pudo cargar' : stock ? 'Todo arriba del mínimo' : 'Cargando…' }}</p>
        </article>
      </div>

      <div v-if="showSales" class="row wide-left">
        <article class="card">
          <h2>Ventas de los últimos 7 días</h2>
          <BarChart v-if="sales" :items="week" label="Venta neta por día de los últimos 7 días" :tick="(v) => `$${Math.round(v).toLocaleString('es-MX')}`" :height="190" highlight-last />
          <p v-else class="muted">{{ failed.sales ? 'No se pudieron cargar las ventas.' : 'Cargando…' }}</p>
        </article>
        <article class="card">
          <h2>Ventas por método de pago</h2>
          <div v-if="sales && sales.methodTotal" class="donut">
            <DonutChart :items="methods" :center="short(sales.weekTotal)" label="Ventas de los últimos 7 días por método de pago" />
            <ul class="legend">
              <li v-for="m in methods" :key="m.key">
                <span class="swatch" :class="`m-${m.key}`" aria-hidden="true" />
                <span class="name">{{ m.label }}</span>
                <b>{{ pct(m.share) }}</b>
              </li>
            </ul>
          </div>
          <p v-else class="muted">{{ failed.sales ? 'No se pudieron cargar las ventas.' : sales ? 'Sin ventas en los últimos 7 días.' : 'Cargando…' }}</p>
        </article>
      </div>

      <div class="row wide-left">
        <section v-if="showOrders" class="recent">
          <h2 class="section-title">Comandas recientes</h2>
          <div class="box">
            <table class="data-table">
              <thead><tr><th scope="col">Comanda</th><th scope="col">Mesa</th><th scope="col">Hora</th><th scope="col">Estado</th></tr></thead>
              <tbody>
                <tr v-for="o in (orders?.list ?? []).slice(0, 5)" :key="o.orderId">
                  <td><b>#{{ o.orderId.slice(0, 6).toUpperCase() }}</b></td>
                  <td>{{ o.tables.length ? `Mesa ${o.tables.join(', ')}` : '—' }}</td>
                  <td>{{ clock(o.createdAt) }}</td>
                  <td><span class="pill" :class="{ accent: o.stage < 2 }">{{ STAGE_TEXT[o.stage] }}</span></td>
                </tr>
                <tr v-if="orders && !orders.list.length"><td colspan="4" class="empty-row">No hay comandas en curso.</td></tr>
                <tr v-if="!orders"><td colspan="4" class="empty-row">{{ failed.orders ? 'No se pudieron cargar las comandas.' : 'Cargando…' }}</td></tr>
              </tbody>
            </table>
          </div>
        </section>
        <article v-if="showStock" class="card alerts">
          <h2>Alertas de inventario</h2>
          <ul v-if="stock?.items.length">
            <li v-for="i in stock.items" :key="i.id">
              <span class="name">{{ i.name }}</span>
              <span class="pill accent">{{ stockLevel(i) }}</span>
            </li>
          </ul>
          <p v-else class="muted">{{ failed.stock ? 'No se pudo cargar el inventario.' : stock ? 'Ningún insumo está bajo su mínimo.' : 'Cargando…' }}</p>
        </article>
      </div>
    </template>

    <div v-else class="tiles">
      <RouterLink v-for="m in modules" :key="m.key" :to="{ name: m.key }" class="tile">
        <h2>{{ m.title }}</h2>
        <p>{{ m.description }}</p>
      </RouterLink>
    </div>
  </section>
</template>

<style scoped>
h1 { margin: 0 0 6px; font-size: 1.8rem; font-weight: 700; letter-spacing: -.01em; }
.lead { margin: 0 0 22px; color: var(--muted); font-size: .9rem; }
.empty { padding: 16px; border: 1px dashed var(--line); border-radius: 10px; color: var(--muted); max-width: 60ch; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; min-width: 0; }
.card h2, .section-title { margin: 0 0 12px; font-size: .95rem; font-weight: 700; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; margin-bottom: 16px; }
.kpi h2 { font-size: .82rem; margin-bottom: 6px; }
.kpi .value { margin: 0; font-size: 1.7rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.hint { display: inline-block; margin: 6px 0 0; font-size: .72rem; font-weight: 700; color: var(--muted); text-decoration: none; }
.hint.ok { color: var(--ok); }
.hint.down, .hint.warn { color: var(--accent-strong); }
a.hint:hover { text-decoration: underline; }
.row { display: grid; gap: 20px; margin-bottom: 20px; }
.wide-left { grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); }
.muted { color: var(--muted); font-size: .88rem; margin: 8px 0; }
.donut { display: flex; align-items: center; gap: 22px; }
.legend { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; flex: 1; font-size: .82rem; }
.legend li { display: grid; grid-template-columns: 10px 1fr auto; align-items: center; gap: 10px; }
.swatch { width: 9px; height: 9px; border-radius: 5px; }
.m-CASH { background: #c74115; }
.m-CARD_CREDIT { background: #e99c38; }
.m-CARD_DEBIT { background: #40764b; }
.m-TRANSFER { background: #d5bea4; }
.recent .box { overflow: hidden; }
.alerts ul { list-style: none; margin: 0; padding: 0; display: grid; }
.alerts li { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--divider); font-size: .82rem; font-weight: 700; }
.alerts li:last-child { border-bottom: 0; }
.alerts .pill { margin: 0; min-width: 90px; }
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 14px; }
.tile { display: block; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 16px; color: var(--text); text-decoration: none; }
.tile:hover { border-color: var(--accent); }
.tile h2 { margin: 0 0 6px; font-size: 1rem; }
.tile p { margin: 0; color: var(--muted); font-size: .88rem; }
@media (max-width: 900px) {
  .wide-left { grid-template-columns: 1fr; }
  .donut { flex-wrap: wrap; }
}
</style>
