<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useSession } from '../stores/session.js'
import { isoDate, money } from '../lib/reports.js'
import { clock } from '../lib/dashboard.js'
import { CHECK_STATUS, matchesSale, salesApi, salesTotals } from '../lib/sales.js'
import { errorText } from '../lib/errors.js'

// Ventas (Figma "Restia web", 02 · Panel → Ventas): las cuentas de un día con mesa, total y estado. Para
// periodos más largos y comparaciones está Reportes.
const props = defineProps({ api: { type: Object, default: null } })
const calls = props.api ?? salesApi()
const session = useSession()

const today = isoDate(new Date())
const date = ref(today)
const rows = ref(null)
const error = ref('')
const query = ref('')

const visible = computed(() => (rows.value ?? []).filter((r) => matchesSale(r, query.value)))
const totals = computed(() => salesTotals(rows.value ?? []))

async function load() {
  const b = session.branchId
  if (!b || !/^\d{4}-\d{2}-\d{2}$/.test(date.value)) return
  rows.value = null
  error.value = ''
  try {
    rows.value = await calls.day(b, date.value)
  } catch (e) {
    error.value = errorText(e)
  }
}

onMounted(load)
watch([date, () => session.branchId], load)
</script>

<template>
  <section>
    <div class="mod-head"><h1>Ventas</h1></div>
    <div class="top">
      <label class="search">
        <span class="sr-only">Buscar ventas</span>
        <input v-model="query" class="field" type="search" placeholder="Buscar ventas por cuenta o mesa…" />
      </label>
      <label class="date">
        <span>Día</span>
        <input v-model="date" class="field" type="date" :max="today" />
      </label>
      <RouterLink v-if="session.canOpen('reports.read')" :to="{ name: 'reportes' }" class="btn btn-primary">Consultar periodo</RouterLink>
    </div>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <p v-if="rows" class="summary" aria-live="polite">
      Cobrado {{ money(totals.paid) }} · {{ totals.paidCount }} {{ totals.paidCount === 1 ? 'cuenta pagada' : 'cuentas pagadas' }}<template v-if="totals.open"> · {{ totals.open }} sin terminar de cobrar</template>
    </p>
    <div class="box">
      <table class="data-table">
        <thead><tr><th scope="col">Cuenta</th><th scope="col">Mesa</th><th scope="col">Hora</th><th scope="col" class="num">Total</th><th scope="col">Estado</th></tr></thead>
        <tbody>
          <tr v-for="r in visible" :key="r.id">
            <td><b>{{ r.code }}</b></td>
            <td>{{ r.tables.length ? `Mesa ${r.tables.join(', ')}` : '—' }}</td>
            <td>{{ clock(r.at) }}</td>
            <td class="num">{{ money(r.total, '') }}</td>
            <td><span class="pill" :class="CHECK_STATUS[r.status]?.tone">{{ CHECK_STATUS[r.status]?.text ?? r.status }}</span></td>
          </tr>
          <tr v-if="rows && !visible.length"><td colspan="5" class="empty-row">{{ query ? 'Ninguna cuenta coincide.' : 'No hay cuentas en este día.' }}</td></tr>
          <tr v-if="!rows && !error"><td colspan="5" class="empty-row">Cargando…</td></tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.top { display: flex; gap: 16px; align-items: flex-end; margin-bottom: 14px; flex-wrap: wrap; }
.search { flex: 1; min-width: 220px; max-width: 520px; }
.search .field { width: 100%; }
.date { display: grid; gap: 4px; font-size: .8rem; color: var(--muted); }
.top a.btn { margin-left: auto; text-decoration: none; }
.summary { margin: 0 0 10px; color: var(--muted); font-size: .85rem; }
</style>
