<script setup>
import { computed, inject, ref, watch } from 'vue'
import ErrorNotice from '../../components/ErrorNotice.vue'
import { UNITS, inventoryErrorText, qtyText, quantity } from '../../lib/inventory.js'
import { useAction } from '../../lib/useAction.js'

// Recetas: cuánto de cada insumo lleva un platillo. Cada cambio publica una versión nueva; los pedidos ya
// preparados se quedan con la versión con que salieron.
const { calls, branchId, perms, ingredients, byId } = inject('inventory')

const products = ref([])
const productId = ref('')
const onlyMissing = ref(false)
const missing = computed(() => products.value.filter((p) => p.status === 'ACTIVE' && !p.currentRecipeVersion))
const visible = computed(() => onlyMissing.value ? missing.value : products.value)
const product = computed(() => visible.value.find((p) => p.id === productId.value) ?? null)
const recipes = ref([])
const items = ref([])
const loading = ref(false)
const error = ref(null)

let productsRequest = 0
async function loadProducts() {
  const request = ++productsRequest
  error.value = null
  try {
    const rows = await calls.products(branchId())
    if (request === productsRequest) products.value = rows.filter((p) => p.status === 'ACTIVE' || p.currentRecipeVersion)
  } catch (e) {
    if (request === productsRequest) error.value = e
  }
}
let recipeRequest = 0
async function loadRecipe() {
  const selected = product.value
  const request = ++recipeRequest
  recipes.value = []
  items.value = []
  loading.value = !!selected
  if (!selected) return
  try {
    const rows = await calls.recipes(branchId(), selected)
    if (request !== recipeRequest) return
    recipes.value = rows
    items.value = (rows[0]?.items ?? []).map((i) => ({ ingredientId: i.ingredientId, qty: String(Number(i.quantity)) }))
  } catch (e) {
    if (request === recipeRequest) error.value = e
  } finally {
    if (request === recipeRequest) loading.value = false
  }
}
watch(() => branchId(), () => {
  products.value = []
  loadProducts()
}, { immediate: true })
watch(visible, (list) => {
  if (!list.some((p) => p.id === productId.value)) productId.value = list[0]?.id ?? ''
})
watch(productId, loadRecipe)

const { busy, error: actionError, notice, run } = useAction(async () => {
  const selected = productId.value
  await loadProducts()
  if (productId.value === selected) await loadRecipe()
}, inventoryErrorText)

const active = computed(() => ingredients.value.filter((i) => i.status === 'ACTIVE'))
const problem = computed(() => {
  if (!items.value.length) return 'Agrega al menos un insumo.'
  if (items.value.some((i) => !i.ingredientId)) return 'Elige el insumo de cada renglón.'
  if (new Set(items.value.map((i) => i.ingredientId)).size !== items.value.length) return 'Un insumo aparece dos veces; suma las cantidades.'
  if (items.value.some((i) => !quantity(i.qty) || Number(i.qty) === 0)) return 'Revisa las cantidades.'
  return ''
})
const changed = computed(() => {
  const cur = recipes.value[0]?.items ?? []
  const a = cur.map((i) => `${i.ingredientId}:${Number(i.quantity)}`).sort().join('|')
  const b = items.value.map((i) => `${i.ingredientId}:${Number(i.qty)}`).sort().join('|')
  return a !== b
})

async function publish() {
  if (busy.value || problem.value || !changed.value) return
  notice.value = ''
  await run(() => calls.publishRecipe(branchId(), product.value, items.value.map((i) => ({ ingredientId: i.ingredientId, quantity: quantity(i.qty) }))),
    `Se publicó la receta de ${product.value.name}. Desde ahora cocina descuenta con esta versión.`)
}
</script>

<template>
  <div>
    <ErrorNotice :error="error" @retry="loadProducts" />
    <p class="help">Cocina descuenta los insumos de la receta al iniciar cada platillo. Publica una receta por porción para que ese consumo se registre automáticamente.</p>
    <div class="toolbar">
      <label><input v-model="onlyMissing" type="checkbox" /> Sin receta publicada ({{ missing.length }})</label>
      <label v-if="visible.length" class="grow">Producto
        <select v-model="productId" class="field">
          <option v-for="p in visible" :key="p.id" :value="p.id">{{ p.name }}{{ p.currentRecipeVersion ? ` · receta v${p.currentRecipeVersion}` : ' · sin receta' }}</option>
        </select>
      </label>
    </div>
    <p v-if="onlyMissing && !missing.length && products.length" class="help">Todos los productos activos tienen receta publicada.</p>
    <p v-if="notice" class="notice-ok" role="status">{{ notice }}</p>

    <div v-if="product" class="box panel">
      <p class="help">{{ recipes.length ? `Versión ${recipes[0].recipeVersion} vigente.` : 'Este producto no tiene receta base publicada.' }} Las cantidades son por porción.</p>
      <p v-if="loading" class="help">Cargando la receta…</p>
      <template v-else>
        <div v-for="(it, i) in items" :key="i" class="line">
          <select v-model="it.ingredientId" class="field" :disabled="!perms.recipesManage" :aria-label="`Insumo ${i + 1}`">
            <option v-for="ing in active" :key="ing.id" :value="ing.id">{{ ing.name }}</option>
            <option v-if="it.ingredientId && !active.some((a) => a.id === it.ingredientId)" :value="it.ingredientId">{{ byId.get(it.ingredientId)?.name ?? 'Insumo inactivo' }}</option>
          </select>
          <input v-model="it.qty" class="field" inputmode="decimal" :disabled="!perms.recipesManage" :placeholder="UNITS[byId.get(it.ingredientId)?.baseUnit] ?? ''" :aria-label="`Cantidad del insumo ${i + 1}`" />
          <span class="unit">{{ UNITS[byId.get(it.ingredientId)?.baseUnit] ?? '' }}</span>
          <button v-if="perms.recipesManage" type="button" class="btn" :aria-label="`Quitar el insumo ${i + 1}`" @click="items.splice(i, 1)">Quitar</button>
        </div>
        <p v-if="!items.length && !perms.recipesManage" class="help">Sin insumos.</p>
        <template v-if="perms.recipesManage">
          <button type="button" class="btn" :disabled="!active.length" @click="items.push({ ingredientId: active[0]?.id ?? '', qty: '' })">Agregar insumo</button>
          <p v-if="changed && problem" class="help" aria-live="polite">{{ problem }}</p>
          <p v-if="actionError" class="form-error" role="alert">{{ actionError }}</p>
          <div class="form-buttons">
            <button type="button" class="btn btn-primary" :disabled="busy || loading || !!problem || !changed" @click="publish">{{ busy ? 'Publicando…' : 'Publicar versión nueva' }}</button>
          </div>
        </template>
        <p v-if="recipes.length > 1" class="help">Versiones anteriores: {{ recipes.slice(1).map((r) => `v${r.recipeVersion} (${r.items.map((x) => `${byId.get(x.ingredientId)?.name ?? '?'} ${qtyText(x.quantity, byId.get(x.ingredientId)?.baseUnit)}`).join(', ')})`).join(' · ') }}</p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.grow { flex: 1; min-width: 240px; }
.panel { padding: 14px 16px; overflow: visible; display: grid; gap: 10px; }
.line { display: grid; grid-template-columns: 1fr 100px 40px auto; gap: 6px; align-items: center; }
.unit { color: var(--muted); font-size: .85rem; }
</style>
