<script setup>
import { computed, inject, ref, watch } from 'vue'
import ErrorNotice from '../../components/ErrorNotice.vue'
import ModalDialog from '../../components/ModalDialog.vue'
import { COUNT_STATUS, UNITS, inventoryErrorText, qtyText, quantity } from '../../lib/inventory.js'
import { validReason } from '../../lib/personal.js'
import { useAction } from '../../lib/useAction.js'

// Conteo físico: se abre, se captura lo que hay en la bodega (se puede guardar a medias) y al aplicarlo la
// existencia de cada insumo contado queda igual a lo contado. Solo puede haber uno abierto.
const { calls, branchId, perms, ingredients, byId, reloadIngredients } = inject('inventory')

const counts = ref([])
const loading = ref(false)
const error = ref(null)
const counted = ref({})
async function load() {
  loading.value = true
  error.value = null
  try {
    counts.value = await calls.counts(branchId())
    const open = counts.value.find((c) => c.status === 'OPEN')
    counted.value = Object.fromEntries((open?.lines ?? []).map((l) => [l.ingredientId, String(Number(l.counted))]))
  } catch (e) {
    error.value = e
  } finally {
    loading.value = false
  }
}
watch(() => branchId(), load, { immediate: true })
const { busy, error: actionError, notice, run } = useAction(async () => { await Promise.all([load(), reloadIngredients()]) }, inventoryErrorText)

const openCount = computed(() => counts.value.find((c) => c.status === 'OPEN') ?? null)
const history = computed(() => counts.value.filter((c) => c.status !== 'OPEN'))
const active = computed(() => ingredients.value.filter((i) => i.status === 'ACTIVE'))
const filled = computed(() => Object.entries(counted.value).filter(([, v]) => String(v).trim() !== ''))
const invalid = computed(() => filled.value.some(([, v]) => !quantity(v)))
const lineOf = computed(() => new Map((openCount.value?.lines ?? []).map((l) => [l.ingredientId, l])))

async function start() {
  notice.value = ''
  await run(() => calls.openCount(branchId()), 'Se abrió el conteo. Captura lo que hay y guarda; puedes hacerlo en varias vueltas.')
}
async function save() {
  if (invalid.value || !openCount.value) return
  const now = new Date().toISOString()
  // La API reemplaza todas las líneas: se mandan todas las capturadas, conservando la hora de las que no cambiaron.
  const lines = filled.value.map(([ingredientId, v]) => {
    const prev = lineOf.value.get(ingredientId)
    const same = prev && Number(prev.counted) === Number(v)
    return { ingredientId, counted: quantity(v), countedAt: same ? prev.countedAt : now }
  })
  await run(() => calls.saveCountLines(branchId(), openCount.value, lines), `Se guardaron ${lines.length} insumos contados.`)
}

const dialog = ref(null)
function confirm(kind) {
  notice.value = ''
  actionError.value = ''
  dialog.value = { kind, reason: '' }
}
async function submit() {
  const d = dialog.value
  if (!d || busy.value) return
  if (d.kind === 'cancel' && !validReason(d.reason)) return
  const ok = await run(() => (d.kind === 'apply' ? calls.applyCount(branchId(), openCount.value) : calls.cancelCount(branchId(), openCount.value, d.reason)),
    d.kind === 'apply' ? 'Se aplicó el conteo: en unos segundos la existencia de cada insumo contado queda igual a lo contado.' : 'Se canceló el conteo.')
  if (ok) dialog.value = null
}
const differences = computed(() => (openCount.value?.lines ?? []).filter((l) => Number(l.difference) !== 0))

function time(iso) {
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
}
</script>

<template>
  <div>
    <ErrorNotice :error="error" @retry="load" />
    <p v-if="notice && !dialog" class="notice-ok" role="status">{{ notice }}</p>
    <p v-if="actionError && !dialog" class="form-error" role="alert">{{ actionError }}</p>

    <template v-if="!error && !loading || counts.length">
      <div v-if="!openCount" class="toolbar">
        <p class="help">Un conteo físico corrige la existencia con lo que de verdad hay en la bodega.</p>
        <button v-if="perms.count" type="button" class="btn btn-primary" :disabled="busy" @click="start">Empezar conteo</button>
      </div>

      <div v-else class="box panel">
        <div class="head">
          <h2>Conteo abierto desde el {{ time(openCount.createdAt) }}</h2>
          <span class="help">{{ filled.length }} de {{ active.length }} insumos contados</span>
        </div>
        <table class="data-table">
          <thead><tr><th scope="col">Insumo</th><th scope="col" class="num">Sistema</th><th scope="col">Contado</th><th scope="col" class="num">Diferencia</th></tr></thead>
          <tbody>
            <tr v-for="i in active" :key="i.id">
              <td><span class="cell-main">{{ i.name }}</span></td>
              <td class="num">{{ qtyText(lineOf.get(i.id)?.expected ?? i.stock, i.baseUnit) }}</td>
              <td><input v-model="counted[i.id]" class="field qty" inputmode="decimal" :placeholder="UNITS[i.baseUnit]" :disabled="!perms.count" :aria-label="`Contado de ${i.name}`" /></td>
              <td class="num">{{ lineOf.get(i.id) ? qtyText(lineOf.get(i.id).difference, i.baseUnit) : '' }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="invalid" class="help">Revisa las cantidades: hasta 4 decimales, sin signo.</p>
        <div class="form-buttons">
          <button v-if="perms.apply_count" type="button" class="btn btn-danger" :disabled="busy" @click="confirm('cancel')">Cancelar conteo</button>
          <button v-if="perms.count" type="button" class="btn" :disabled="busy || invalid || !filled.length" @click="save">Guardar lo contado</button>
          <button v-if="perms.apply_count" type="button" class="btn btn-primary" :disabled="busy || !openCount.lines.length" @click="confirm('apply')">Aplicar</button>
        </div>
      </div>

      <h3 v-if="history.length" class="sub">Conteos anteriores</h3>
      <div v-if="history.length" class="box">
        <table class="data-table">
          <tbody>
            <tr v-for="c in history" :key="c.id">
              <td><span class="cell-main">{{ time(c.createdAt) }}</span><span class="cell-sub">{{ c.lines.length }} {{ c.lines.length === 1 ? 'insumo contado' : 'insumos contados' }}</span></td>
              <td><span class="pill" :class="COUNT_STATUS[c.status]?.tone">{{ COUNT_STATUS[c.status]?.label }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <ModalDialog v-if="dialog" :title="dialog.kind === 'apply' ? 'Aplicar el conteo' : 'Cancelar el conteo'" :busy="busy" @close="dialog = null">
      <form class="form" @submit.prevent="submit">
        <template v-if="dialog.kind === 'apply'">
          <p class="help">Se usa lo último guardado. La existencia de {{ openCount.lines.length }} {{ openCount.lines.length === 1 ? 'insumo' : 'insumos' }} queda igual a lo contado; los no contados no cambian.</p>
          <ul v-if="differences.length" class="diffs">
            <li v-for="l in differences" :key="l.ingredientId">{{ byId.get(l.ingredientId)?.name }}: {{ Number(l.difference) > 0 ? '+' : '' }}{{ qtyText(l.difference, byId.get(l.ingredientId)?.baseUnit) }}</li>
          </ul>
          <p v-else class="help">No hay diferencias contra el sistema.</p>
        </template>
        <template v-else>
          <p class="help">Lo capturado se descarta y la existencia no cambia.</p>
          <label>Motivo<textarea v-model="dialog.reason" class="field" rows="2" maxlength="500" /></label>
        </template>
        <p v-if="actionError" class="form-error" role="alert">{{ actionError }}</p>
        <div class="form-buttons">
          <button type="button" class="btn" :disabled="busy" @click="dialog = null">Volver</button>
          <button type="submit" class="btn" :class="dialog.kind === 'cancel' ? 'btn-danger-solid' : 'btn-primary'" :disabled="busy || (dialog.kind === 'cancel' && !validReason(dialog.reason))">{{ busy ? 'Guardando…' : 'Confirmar' }}</button>
        </div>
      </form>
    </ModalDialog>
  </div>
</template>

<style scoped>
.panel { padding: 14px 16px; overflow: visible; }
.head { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; flex-wrap: wrap; margin-bottom: 8px; }
.head h2 { margin: 0; padding: 0; border: 0; font-size: 1rem; text-transform: none; letter-spacing: 0; color: var(--text); }
.qty { width: 110px; }
.sub { margin: 18px 0 8px; font-size: .95rem; }
.diffs { margin: 0; padding-left: 18px; font-size: .9rem; }
</style>
