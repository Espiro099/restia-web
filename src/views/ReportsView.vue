<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useSession } from '../stores/session.js'
import ErrorNotice from '../components/ErrorNotice.vue'
import BarChart from '../components/BarChart.vue'
import { useVisibleRefresh } from '../lib/useVisibleRefresh.js'
import {
  METHODS, PERIODS, change, isoDate, money, periodRange, previousRange, rangeProblem, reportsApi, shortDate, summarize, toCsv,
} from '../lib/reports.js'

const props = defineProps({
  api: { type: Object, default: null },
  /** Para las pruebas: fecha de "hoy". */
  today: { type: Function, default: () => new Date() },
})
const calls = props.api ?? reportsApi()
const session = useSession()

const period = ref('week')
const custom = reactive({ from: '', to: '' })
const range = computed(() => periodRange(period.value, props.today(), { ...custom }))
const problem = computed(() => (period.value === 'custom' ? rangeProblem(range.value, props.today()) : ''))

const summary = ref(null)
const previous = ref(null)
const loading = ref(false)
const error = ref(null)

let seq = 0
let refreshing = false
async function load({ background = false } = {}) {
  const b = session.branchId
  if (problem.value || !b) return
  const mine = ++seq
  const r = range.value
  const prev = previousRange(r)
  refreshing = true
  loading.value = !background
  if (!background) error.value = null
  try {
    const [daily, hourly, prevDaily] = await Promise.all([
      calls.dailySales(b, r), calls.hourlyOccupancy(b, r), calls.dailySales(b, prev).catch(() => null),
    ])
    if (mine !== seq) return
    error.value = null
    summary.value = summarize(daily, hourly, r.from, r.to)
    previous.value = prevDaily ? summarize(prevDaily, [], prev.from, prev.to) : null
  } catch (e) {
    if (mine === seq) error.value = e
  } finally {
    if (mine === seq) {
      refreshing = false
      loading.value = false
    }
  }
}

function choose(key) {
  if (key === 'custom' && !custom.from) {
    const r = periodRange(period.value, props.today())
    custom.from = r.from
    custom.to = r.to
  }
  period.value = key
}

// Una clave de texto: pasar a "Fechas" con el mismo rango no vuelve a pedir los datos.
watch(() => `${session.branchId}|${range.value.from}|${range.value.to}`, () => {
  seq++
  refreshing = false
  loading.value = false
  summary.value = null
  previous.value = null
  error.value = null
  load()
}, { immediate: true })
useVisibleRefresh(() => {
  if (!refreshing) load({ background: true })
}, 15_000)
onBeforeUnmount(() => { seq++ })

const s = computed(() => summary.value)
const p = computed(() => previous.value)
const tiles = computed(() => {
  if (!s.value) return []
  const prev = p.value
  return [
    { label: 'Venta neta', value: money(s.value.net), change: change(s.value.net, prev?.net) },
    { label: 'Cuentas cobradas', value: s.value.checks.toLocaleString('es-MX'), change: change(s.value.checks, prev?.checks) },
    { label: 'Ticket promedio', value: money(s.value.averageTicket), change: change(s.value.averageTicket, prev?.averageTicket) },
    { label: 'Personas', value: s.value.guests.toLocaleString('es-MX'), change: change(s.value.guests, prev?.guests) },
    { label: 'Propinas', value: money(s.value.tips), change: change(s.value.tips, prev?.tips) },
  ]
})

const dayItems = computed(() => (s.value?.series ?? []).map((d) => ({
  key: d.date,
  label: s.value.days > 14 ? d.date.slice(8) : shortDate(d.date).split(' ').slice(0, 2).join(' '),
  value: d.net / 100,
  tooltip: `${shortDate(d.date)}: ${money(d.net)} · ${d.checks} ${d.checks === 1 ? 'cuenta' : 'cuentas'}`,
})))
const hourItems = computed(() => (s.value?.hours ?? []).map((h) => ({
  key: h.hour,
  label: `${h.hour} h`,
  value: h.tables,
  tooltip: `${h.hour}:00 h: ${h.tables.toFixed(1)} mesas ocupadas${s.value.days > 1 ? ' en promedio' : ''} · ${h.guests} personas`,
})))
const moneyTick = (v) => (v >= 1000 ? `$${(v / 1000).toLocaleString('es-MX', { maximumFractionDigits: 1 })}k` : `$${Math.round(v)}`)
const tableTick = (v) => v.toLocaleString('es-MX', { maximumFractionDigits: 1 })

const periodText = computed(() => {
  const r = range.value
  return r.from === r.to ? shortDate(r.from) : `${shortDate(r.from)} al ${shortDate(r.to)}`
})

function exportCsv() {
  const blob = new Blob([toCsv(s.value)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ventas-${session.currentMembership?.branch?.name ?? 'sucursal'}-${range.value.from}-a-${range.value.to}.csv`.replace(/\s+/g, '-').toLowerCase()
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function asOfText(iso) {
  return iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : ''
}
const todayIso = computed(() => isoDate(props.today()))
</script>

<template>
  <section>
    <header class="mod-head">
      <div>
        <h1>Reportes</h1>
        <p class="mod-lead">Ventas y ocupación de {{ session.currentMembership?.branch?.name }}: {{ periodText }}.</p>
      </div>
      <button v-if="s && !s.empty" type="button" class="btn" @click="exportCsv">Exportar CSV</button>
    </header>

    <div class="toolbar">
      <div class="periods" role="group" aria-label="Periodo">
        <button v-for="o in PERIODS" :key="o.key" type="button" class="btn" :aria-pressed="period === o.key" @click="choose(o.key)">{{ o.label }}</button>
      </div>
      <template v-if="period === 'custom'">
        <label>Desde<input v-model="custom.from" class="field" type="date" :max="todayIso" /></label>
        <label>Hasta<input v-model="custom.to" class="field" type="date" :max="todayIso" /></label>
      </template>
      <span class="count" aria-live="polite">{{ loading ? 'Cargando…' : '' }}</span>
    </div>
    <p v-if="problem" class="form-error" role="alert">{{ problem }}</p>
    <ErrorNotice :error="error" @retry="load()" />

    <template v-if="s && !problem">
      <div class="tiles">
        <div v-for="t in tiles" :key="t.label" class="tile">
          <span class="tile-label">{{ t.label }}</span>
          <span class="tile-value">{{ t.value }}</span>
          <span v-if="t.change" class="tile-change" :class="t.change.dir">
            {{ t.change.dir === 'up' ? '▲' : t.change.dir === 'down' ? '▼' : '=' }} {{ Math.abs(t.change.pct) }} % vs. periodo anterior
          </span>
          <span v-else class="tile-change">Sin periodo anterior para comparar</span>
        </div>
      </div>
      <p class="help extras">Reembolsos {{ money(s.refunds) }} · Cortesías {{ money(s.courtesies) }}</p>

      <p v-if="s.empty" class="box empty-row">Sin ventas en este periodo. Los cobros aparecen aquí unos segundos después de confirmarse.</p>

      <template v-else>
        <div v-if="s.days > 1" class="box panel">
          <h2>Venta por día</h2>
          <p class="help">Mejor día: {{ shortDate(s.best.date) }} con {{ money(s.best.net) }}.</p>
          <BarChart :items="dayItems" :tick="moneyTick" :label="`Venta neta por día. Mejor día ${shortDate(s.best.date)} con ${money(s.best.net)}.`" />
        </div>

        <div class="grid2">
          <div class="box panel">
            <h2>Por método de pago</h2>
            <ul class="methods">
              <li v-for="m in s.byMethod" :key="m.method">
                <div class="method-head"><span>{{ METHODS[m.method] ?? m.method }}</span><span>{{ money(m.amount) }} · {{ Math.round(m.share * 100) }} %</span></div>
                <div class="track" aria-hidden="true"><div class="fill" :style="{ width: `${m.share * 100}%` }" /></div>
              </li>
            </ul>
          </div>
          <div class="box panel">
            <h2>Mesas ocupadas por hora</h2>
            <template v-if="hourItems.length">
              <p class="help">Hora más llena: {{ s.peak.hour }}:00 h, con {{ s.peak.tables.toFixed(1) }} mesas{{ s.days > 1 ? ' en promedio por día' : '' }}.</p>
              <BarChart :items="hourItems" :tick="tableTick" :height="180" :label="`Mesas ocupadas por hora. Hora más llena ${s.peak.hour} horas.`" />
            </template>
            <p v-else class="help">Sin mesas abiertas en este periodo.</p>
          </div>
        </div>

        <details class="box panel">
          <summary>Ver por día</summary>
          <table class="data-table">
            <thead><tr><th scope="col">Día</th><th scope="col" class="num">Venta neta</th><th scope="col" class="num">Cuentas</th><th scope="col" class="num">Personas</th><th scope="col" class="num">Ticket promedio</th></tr></thead>
            <tbody>
              <tr v-for="d in s.series" :key="d.date">
                <td>{{ shortDate(d.date) }}</td>
                <td class="num">{{ money(d.net) }}</td>
                <td class="num">{{ d.checks }}</td>
                <td class="num">{{ d.guests }}</td>
                <td class="num">{{ d.checks ? money(Math.round(d.net / d.checks)) : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </details>
      </template>
      <p v-if="s.asOf" class="help">Calculado al {{ asOfText(s.asOf) }}; se actualiza unos segundos después de cada cobro.</p>
    </template>
  </section>
</template>

<style scoped>
.periods { display: flex; gap: 6px; flex-wrap: wrap; }
.periods .btn[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent); border-color: var(--accent); font-weight: 600; }
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; margin-bottom: 8px; }
.tile { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; display: grid; gap: 4px; }
.tile-label { font-size: .8rem; color: var(--muted); }
.tile-value { font-size: 1.35rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.tile-change { font-size: .78rem; color: var(--muted); }
.tile-change.up { color: var(--ok); }
.tile-change.down { color: var(--danger); }
.extras { margin-bottom: 14px; }
.panel { padding: 14px 16px; margin-bottom: 14px; overflow: visible; }
.panel h2 { padding: 0; border: 0; margin: 0 0 4px; }
.panel > .help { margin-bottom: 10px; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.grid2 .panel { margin-bottom: 14px; }
.methods { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 12px; }
.method-head { display: flex; justify-content: space-between; gap: 8px; font-size: .9rem; margin-bottom: 4px; }
.method-head span:last-child { font-variant-numeric: tabular-nums; color: var(--muted); }
.track { height: 8px; background: var(--bg); border-radius: 4px; overflow: hidden; }
.fill { height: 100%; background: var(--accent); border-radius: 0 4px 4px 0; }
summary { cursor: pointer; font-weight: 600; }
details .data-table { margin-top: 10px; }
@media (max-width: 860px) { .grid2 { grid-template-columns: 1fr; } }
</style>
