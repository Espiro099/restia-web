<script setup>
import { computed, inject, reactive, ref, watch } from 'vue'
import ErrorNotice from '../../components/ErrorNotice.vue'
import { MOVEMENT_TYPES, qtyText } from '../../lib/inventory.js'

// Movimientos de inventario: solo lectura. Los consumos salen solos al preparar; el resto se registra en
// Insumos, Entradas y Conteos.
const { calls, branchId, ingredients, byId } = inject('inventory')

const rows = ref([])
const total = ref(0)
const page = ref(1)
const filters = reactive({ ingredientId: '', type: '' })
const loading = ref(false)
const error = ref(null)
const pages = computed(() => Math.max(1, Math.ceil(total.value / 50)))

let seq = 0
async function load() {
  const mine = ++seq
  loading.value = true
  error.value = null
  try {
    const r = await calls.movements(branchId(), { ...filters, page: page.value })
    if (mine !== seq) return
    rows.value = r.data
    total.value = r.meta?.pagination?.total ?? r.data.length
  } catch (e) {
    if (mine === seq) error.value = e
  } finally {
    if (mine === seq) loading.value = false
  }
}
watch(() => `${filters.ingredientId}|${filters.type}`, () => {
  page.value = 1
  load()
}, { immediate: true })
watch(page, load)

function time(iso) {
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
}
</script>

<template>
  <div>
    <div class="toolbar">
      <label>Insumo
        <select v-model="filters.ingredientId" class="field">
          <option value="">Todos</option>
          <option v-for="i in ingredients" :key="i.id" :value="i.id">{{ i.name }}</option>
        </select>
      </label>
      <label>Tipo
        <select v-model="filters.type" class="field">
          <option value="">Todos</option>
          <option v-for="(l, k) in MOVEMENT_TYPES" :key="k" :value="k">{{ l }}</option>
        </select>
      </label>
      <span class="count" aria-live="polite">{{ loading ? 'Cargando…' : `${total} movimientos` }}</span>
    </div>
    <ErrorNotice :error="error" @retry="load" />

    <div v-if="!error" class="box">
      <table class="data-table">
        <thead><tr><th scope="col">Cuándo</th><th scope="col">Insumo</th><th scope="col">Tipo</th><th scope="col" class="num">Cantidad</th></tr></thead>
        <tbody>
          <tr v-for="m in rows" :key="m.id">
            <td>{{ time(m.createdAt) }}</td>
            <td><span class="cell-main">{{ byId.get(m.ingredientId)?.name ?? 'Insumo' }}</span><span v-if="m.reason" class="cell-sub">{{ m.reason }}</span></td>
            <td>{{ MOVEMENT_TYPES[m.type] ?? m.type }}<span v-if="m.recipeVersion" class="cell-sub">Receta v{{ m.recipeVersion }}</span></td>
            <td class="num" :class="Number(m.quantity) < 0 ? 'out' : 'in'">{{ Number(m.quantity) > 0 ? '+' : '' }}{{ qtyText(m.quantity, byId.get(m.ingredientId)?.baseUnit) }}</td>
          </tr>
          <tr v-if="!loading && !rows.length"><td colspan="4" class="empty-row">No hay movimientos con estos filtros.</td></tr>
        </tbody>
      </table>
    </div>
    <nav v-if="pages > 1" class="pager" aria-label="Páginas">
      <button type="button" class="btn" :disabled="page === 1 || loading" @click="page--">Anterior</button>
      <span>Página {{ page }} de {{ pages }}</span>
      <button type="button" class="btn" :disabled="page === pages || loading" @click="page++">Siguiente</button>
    </nav>
  </div>
</template>

<style scoped>
.pager { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 14px; color: var(--muted); font-size: .9rem; }
.in { color: var(--ok); }
.out { color: var(--text); }
</style>
