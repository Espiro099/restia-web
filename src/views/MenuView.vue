<script setup>
import { computed, provide, ref, watch } from 'vue'
import { useSession } from '../stores/session.js'
import { catalogApi } from '../lib/catalog.js'
import ErrorNotice from '../components/ErrorNotice.vue'
import MenuProducts from './menu/MenuProducts.vue'
import MenuStations from './menu/MenuStations.vue'
import MenuModifiers from './menu/MenuModifiers.vue'

const props = defineProps({ api: { type: Object, default: null } })
const calls = props.api ?? catalogApi()
const session = useSession()

const TABS = [
  { key: 'productos', label: 'Productos' },
  { key: 'estaciones', label: 'Estaciones' },
  { key: 'modificadores', label: 'Modificadores' },
]
const tab = ref('productos')
const products = ref([])
const stations = ref([])
const modifiers = ref([])
const loading = ref(false)
/** Hubo una carga completa de esta sucursal: antes de eso no se dice "no hay productos". */
const loaded = ref(false)
const error = ref(null)
const canManage = computed(() => session.canHere('menu.manage'))
const canSetAvailability = computed(() => session.canHere('menu.set_availability'))

let seq = 0
async function load() {
  const mine = ++seq
  const branchId = session.branchId
  loading.value = true
  error.value = null
  try {
    const [p, s, m] = await Promise.all([calls.products(branchId), calls.stations(branchId), calls.modifiers(branchId)])
    if (mine !== seq) return
    products.value = p
    stations.value = s
    modifiers.value = m
    loaded.value = true
  } catch (e) {
    if (mine === seq) error.value = e
  } finally {
    if (mine === seq) loading.value = false
  }
}

watch(() => session.branchId, () => {
  loaded.value = false
  load()
}, { immediate: true })

// Las tres pestañas comparten llamadas, sucursal y recarga.
provide('menu', { calls, reload: load, branchId: () => session.branchId, canManage, canSetAvailability })
</script>

<template>
  <section>
    <header class="mod-head">
      <div>
        <h1>Menú</h1>
        <p class="mod-lead">Lo que se vende en {{ session.currentMembership?.branch?.name }}, quién lo prepara y con qué opciones. La app de piso toma los pedidos de aquí.</p>
      </div>
    </header>

    <div class="tabs" role="tablist" aria-label="Partes del menú">
      <button v-for="t in TABS" :id="`tab-${t.key}`" :key="t.key" type="button" role="tab" :aria-selected="tab === t.key"
              :aria-controls="`panel-${t.key}`" @click="tab = t.key">{{ t.label }}</button>
    </div>

    <ErrorNotice :error="error" @retry="load" />
    <p v-if="!loaded && !error" class="help" aria-live="polite">Cargando el menú…</p>

    <div v-if="loaded && !error" :id="`panel-${tab}`" role="tabpanel" :aria-labelledby="`tab-${tab}`">
      <MenuProducts v-if="tab === 'productos'" :products="products" :stations="stations" :modifiers="modifiers" />
      <MenuStations v-else-if="tab === 'estaciones'" :stations="stations" :products="products" />
      <MenuModifiers v-else :modifiers="modifiers" :products="products" />
    </div>
  </section>
</template>
