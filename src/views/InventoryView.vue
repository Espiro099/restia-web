<script setup>
import { computed, provide, ref, watch } from 'vue'
import { useSession } from '../stores/session.js'
import { inventoryApi } from '../lib/inventory.js'
import ErrorNotice from '../components/ErrorNotice.vue'
import InvIngredients from './inventory/InvIngredients.vue'
import InvMovements from './inventory/InvMovements.vue'
import InvReceipts from './inventory/InvReceipts.vue'
import InvCounts from './inventory/InvCounts.vue'
import InvRecipes from './inventory/InvRecipes.vue'

const props = defineProps({ api: { type: Object, default: null } })
const calls = props.api ?? inventoryApi()
const session = useSession()

const perms = computed(() => Object.fromEntries(
  ['manage', 'adjust', 'record_waste', 'receive', 'count', 'apply_count', 'food_safety'].map((p) => [p, session.canHere(`inventory.${p}`)])
    .concat([['recipesRead', session.canHere('recipes.read')], ['recipesManage', session.canHere('recipes.manage')]]),
))
const TABS = computed(() => [
  { key: 'insumos', label: 'Insumos' },
  { key: 'movimientos', label: 'Movimientos' },
  { key: 'entradas', label: 'Entradas' },
  { key: 'conteos', label: 'Conteos' },
  ...(perms.value.recipesRead ? [{ key: 'recetas', label: 'Recetas' }] : []),
])
const tab = ref('insumos')

// Los insumos los usan todas las pestañas (nombres, unidades, selección).
const ingredients = ref([])
const loaded = ref(false)
const error = ref(null)
async function loadIngredients() {
  error.value = null
  try {
    ingredients.value = await calls.ingredients(session.branchId)
    loaded.value = true
  } catch (e) {
    error.value = e
  }
}
watch(() => session.branchId, () => {
  loaded.value = false
  loadIngredients()
}, { immediate: true })

const byId = computed(() => new Map(ingredients.value.map((i) => [i.id, i])))
provide('inventory', { calls, branchId: () => session.branchId, perms, ingredients, byId, reloadIngredients: loadIngredients })
</script>

<template>
  <section>
    <header class="mod-head">
      <div>
        <h1>Inventario</h1>
        <p class="mod-lead">Insumos de {{ session.currentMembership?.branch?.name }}. Las existencias bajan solas cuando cocina prepara un platillo con receta; aquí se registran entradas, mermas, ajustes y conteos.</p>
      </div>
    </header>

    <div class="tabs" role="tablist" aria-label="Partes del inventario">
      <button v-for="t in TABS" :id="`tab-${t.key}`" :key="t.key" type="button" role="tab" :aria-selected="tab === t.key" aria-controls="panel-inventario" @click="tab = t.key">{{ t.label }}</button>
    </div>

    <ErrorNotice :error="error" @retry="loadIngredients" />
    <p v-if="!loaded && !error" class="help" aria-live="polite">Cargando insumos…</p>

    <div v-if="loaded && !error" id="panel-inventario" role="tabpanel" :aria-labelledby="`tab-${tab}`">
      <InvIngredients v-if="tab === 'insumos'" />
      <InvMovements v-else-if="tab === 'movimientos'" />
      <InvReceipts v-else-if="tab === 'entradas'" />
      <InvCounts v-else-if="tab === 'conteos'" />
      <InvRecipes v-else />
    </div>
  </section>
</template>
