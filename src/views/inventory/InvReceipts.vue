<script setup>
import { computed, inject, reactive, ref, watch } from 'vue'
import ErrorNotice from '../../components/ErrorNotice.vue'
import ModalDialog from '../../components/ModalDialog.vue'
import { UNITS, inventoryErrorText, qtyText, quantity } from '../../lib/inventory.js'
import { formatMoney } from '../../lib/money.js'
import { useAction } from '../../lib/useAction.js'

// Entradas de mercancía: lo que llega del proveedor, con cantidad y costo unitario. Suben la existencia.
const { calls, branchId, perms, ingredients, byId, reloadIngredients } = inject('inventory')

const rows = ref([])
const loading = ref(false)
const error = ref(null)
async function load() {
  loading.value = true
  error.value = null
  try {
    rows.value = (await calls.receipts(branchId())).data
  } catch (e) {
    error.value = e
  } finally {
    loading.value = false
  }
}
watch(() => branchId(), load, { immediate: true })
const { busy, error: actionError, notice, run } = useAction(async () => { await Promise.all([load(), reloadIngredients()]) }, inventoryErrorText)

const active = computed(() => ingredients.value.filter((i) => i.status === 'ACTIVE'))
const open = ref(false)
const form = reactive({ supplier: '', reference: '', date: '', lines: [] })
const newLine = () => ({ ingredientId: active.value[0]?.id ?? '', qty: '', cost: '' })
function start() {
  notice.value = ''
  actionError.value = ''
  const t = new Date()
  form.supplier = ''
  form.reference = ''
  form.date = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}T${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
  form.lines = [newLine()]
  open.value = true
}
function close() {
  if (!busy.value) open.value = false
}
const cost = (text) => (/^\d{1,12}(\.\d{1,4})?$/.test(String(text).trim().replace(',', '.')) ? String(text).trim().replace(',', '.') : '')
const totalCost = computed(() => form.lines.reduce((s, l) => s + (Number(quantity(l.qty)) || 0) * (Number(cost(l.cost)) || 0), 0))

const problem = computed(() => {
  if (!form.supplier.trim()) return 'Falta el proveedor.'
  if (!form.date) return 'Falta la fecha.'
  if (!form.lines.length) return 'Agrega al menos un insumo.'
  if (form.lines.some((l) => !l.ingredientId)) return 'Elige el insumo de cada renglón.'
  if (new Set(form.lines.map((l) => l.ingredientId)).size !== form.lines.length) return 'Un insumo aparece dos veces; suma las cantidades.'
  if (form.lines.some((l) => !quantity(l.qty) || Number(l.qty) === 0)) return 'Revisa las cantidades.'
  if (form.lines.some((l) => !cost(l.cost))) return 'Revisa los costos unitarios.'
  return ''
})

async function submit() {
  if (busy.value || problem.value) return
  const ok = await run(() => calls.createReceipt(branchId(), {
    supplierName: form.supplier.trim(),
    reference: form.reference.trim() || null,
    receivedAt: new Date(form.date).toISOString(),
    lines: form.lines.map((l) => ({ ingredientId: l.ingredientId, quantity: quantity(l.qty), unitCost: { amount: cost(l.cost), currency: 'MXN' } })),
  }), `Se registró la entrada de ${form.supplier.trim()}. Las existencias se actualizan en unos segundos.`)
  if (ok) open.value = false
}

function time(iso) {
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
}
</script>

<template>
  <div>
    <div class="toolbar">
      <p class="help">Lo que llega del proveedor. Al registrarlo se suma, en unos segundos, a la existencia de cada insumo.</p>
      <button v-if="perms.receive" type="button" class="btn btn-primary" :disabled="!active.length" @click="start">Registrar entrada</button>
    </div>
    <p v-if="notice && !open" class="notice-ok" role="status">{{ notice }}</p>
    <ErrorNotice :error="error" @retry="load" />

    <div v-if="!error" class="box">
      <table class="data-table">
        <thead><tr><th scope="col">Entrada</th><th scope="col">Insumos</th></tr></thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id">
            <td><span class="cell-main">{{ r.supplierName }}</span><span class="cell-sub">{{ time(r.receivedAt) }}<template v-if="r.reference"> · {{ r.reference }}</template></span></td>
            <td>
              <span v-for="l in r.lines" :key="l.ingredientId" class="cell-sub">{{ byId.get(l.ingredientId)?.name ?? 'Insumo' }}: {{ qtyText(l.quantity, byId.get(l.ingredientId)?.baseUnit) }} a {{ formatMoney({ amount: l.unitCost.amount, currency: 'MXN' }) }}</span>
            </td>
          </tr>
          <tr v-if="!loading && !rows.length"><td colspan="2" class="empty-row">Todavía no hay entradas.</td></tr>
        </tbody>
      </table>
    </div>

    <ModalDialog v-if="open" title="Registrar entrada" :busy="busy" @close="close">
      <form class="form" @submit.prevent="submit">
        <div class="row">
          <label>Proveedor<input v-model="form.supplier" class="field" maxlength="120" autocomplete="off" /></label>
          <label>Factura o remisión (opcional)<input v-model="form.reference" class="field" maxlength="120" autocomplete="off" /></label>
        </div>
        <label>Llegó el<input v-model="form.date" class="field" type="datetime-local" /></label>
        <fieldset>
          <legend>Insumos</legend>
          <div v-for="(l, i) in form.lines" :key="i" class="line">
            <select v-model="l.ingredientId" class="field" :aria-label="`Insumo del renglón ${i + 1}`">
              <option v-for="ing in active" :key="ing.id" :value="ing.id">{{ ing.name }}</option>
            </select>
            <input v-model="l.qty" class="field" inputmode="decimal" :placeholder="UNITS[byId.get(l.ingredientId)?.baseUnit] ?? ''" :aria-label="`Cantidad del renglón ${i + 1}`" />
            <input v-model="l.cost" class="field" inputmode="decimal" placeholder="$ c/u" :aria-label="`Costo unitario del renglón ${i + 1}`" />
            <button type="button" class="btn" :aria-label="`Quitar el renglón ${i + 1}`" :disabled="form.lines.length === 1" @click="form.lines.splice(i, 1)">Quitar</button>
          </div>
          <button type="button" class="btn" @click="form.lines.push(newLine())">Agregar insumo</button>
        </fieldset>
        <p class="help">Costo total aproximado: {{ formatMoney({ amount: totalCost.toFixed(2), currency: 'MXN' }) }}</p>
        <p v-if="problem" class="help" aria-live="polite">{{ problem }}</p>
        <p v-if="actionError" class="form-error" role="alert">{{ actionError }}</p>
        <div class="form-buttons">
          <button type="button" class="btn" :disabled="busy" @click="close">Cancelar</button>
          <button type="submit" class="btn btn-primary" :disabled="busy || !!problem">{{ busy ? 'Guardando…' : 'Registrar' }}</button>
        </div>
      </form>
    </ModalDialog>
  </div>
</template>

<style scoped>
.line { display: grid; grid-template-columns: 1fr 90px 90px auto; gap: 6px; align-items: center; }
.cell-sub { display: block; }
</style>
