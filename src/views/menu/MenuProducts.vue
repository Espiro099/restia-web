<script setup>
import { computed, inject, ref } from 'vue'
import ModalDialog from '../../components/ModalDialog.vue'
import {
  CODE_PATTERN, FISCAL_DEFAULTS, byCategory, catalogErrorText, hasActiveRoute, money, normalizeCode,
} from '../../lib/catalog.js'
import { formatMoney } from '../../lib/money.js'
import { validReason } from '../../lib/personal.js'
import { useAction } from '../../lib/useAction.js'

const props = defineProps({
  products: { type: Array, required: true },
  stations: { type: Array, required: true },
  modifiers: { type: Array, required: true },
})
const { calls, reload, branchId, canManage, canSetAvailability } = inject('menu')
const { busy, error, notice, run } = useAction(reload, catalogErrorText)

const search = ref('')
const status = ref('')
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return props.products.filter((p) =>
    (!status.value || p.status === status.value) &&
    (!q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)))
})
const groups = computed(() => byCategory(filtered.value))
const categories = computed(() => [...new Set(props.products.map((p) => p.category))].sort())
const stationName = computed(() => new Map(props.stations.map((s) => [s.id, s.name])))
const activeStations = computed(() => props.stations.filter((s) => s.status === 'ACTIVE'))

// ---------------------------------------------------------------- Diálogos
const dialog = ref(null)

function open(kind, product = null) {
  notice.value = ''
  error.value = ''
  const p = product
  dialog.value = {
    kind,
    product: p,
    code: '',
    name: p?.name ?? '',
    category: p?.category ?? '',
    price: p?.price?.amount ?? '',
    displayOrder: p?.displayOrder ?? 0,
    description: p?.description ?? '',
    imageUrl: p?.imageUrl ?? '',
    modifierIds: [...(p?.modifierIds ?? [])],
    fiscal: { ...FISCAL_DEFAULTS, ...(p?.fiscal ?? {}) },
    // Rutas: estación elegida → prioridad. Las inactivas que ya tenía se muestran para poder quitarlas.
    routes: Object.fromEntries((p?.routes ?? []).map((r) => [r.stationId, r.priority])),
    reason: '',
  }
}
function close() {
  if (!busy.value) dialog.value = null
}

const TITLES = { add: 'Nuevo producto', edit: 'Editar producto', routes: 'Estaciones que lo preparan', on: 'Activar producto', off: 'Desactivar producto' }

// Modificadores que se ofrecen en la ficha: los activos y los que el producto ya tenga.
const modifierChoices = computed(() => {
  const d = dialog.value
  return props.modifiers.filter((m) => m.status === 'ACTIVE' || d?.modifierIds.includes(m.id))
})
const routeChoices = computed(() => {
  const d = dialog.value
  return props.stations.filter((s) => s.status === 'ACTIVE' || (d && s.id in d.routes))
})

function toggleRoute(stationId, checked) {
  const routes = dialog.value.routes
  if (checked) routes[stationId] = Math.max(0, ...Object.values(routes)) + 1
  else delete routes[stationId]
}

const formProblem = computed(() => {
  const d = dialog.value
  if (!d || !['add', 'edit'].includes(d.kind)) return ''
  if (d.kind === 'add' && !CODE_PATTERN.test(normalizeCode(d.code))) return 'El código lleva de 2 a 32 letras mayúsculas, números o guiones.'
  if (!d.name.trim()) return 'Falta el nombre.'
  if (!d.category.trim()) return 'Falta la categoría.'
  if (!money(d.price)) return 'Revisa el precio: hasta dos decimales.'
  if (!Number.isInteger(Number(d.displayOrder)) || Number(d.displayOrder) < 0) return 'El orden es un número entero desde 0.'
  if (d.imageUrl.trim() && !/^https:\/\/\S+$/.test(d.imageUrl.trim())) return 'La imagen debe ser una dirección https://.'
  if (!/^[0-9]{8}$/.test(d.fiscal.satProductCode)) return 'La clave de producto del SAT lleva 8 dígitos.'
  if (!/^[A-Z0-9]{2,3}$/.test(d.fiscal.satUnitCode)) return 'La clave de unidad del SAT lleva 2 o 3 caracteres.'
  if (!/^[0-9]{2}$/.test(d.fiscal.taxObject)) return 'El objeto de impuesto lleva 2 dígitos.'
  if (!/^0(\.\d{1,6})?$/.test(d.fiscal.taxRate)) return 'La tasa de IVA va como 0.160000.'
  return ''
})

const canSubmit = computed(() => {
  const d = dialog.value
  if (!d || busy.value) return false
  if (d.kind === 'routes') return true
  if (d.kind === 'on' || d.kind === 'off') return validReason(d.reason) && (d.kind === 'off' || hasActiveRoute(d.product, props.stations))
  return !formProblem.value
})

function fields(d) {
  return {
    name: d.name.trim(),
    category: d.category.trim(),
    price: money(d.price),
    displayOrder: Number(d.displayOrder),
    description: d.description.trim() || null,
    imageUrl: d.imageUrl.trim() || null,
    modifierIds: d.modifierIds,
    fiscal: { ...d.fiscal },
  }
}

/** PATCH solo con lo que cambió: menos riesgo de pisar otro cambio y una bitácora más clara. */
function changes(p, next) {
  const out = {}
  const current = {
    name: p.name, category: p.category, price: p.price, displayOrder: p.displayOrder, description: p.description ?? null,
    imageUrl: p.imageUrl ?? null, modifierIds: p.modifierIds, fiscal: p.fiscal,
  }
  for (const [key, value] of Object.entries(next)) {
    const before = key === 'price' ? current.price?.amount : current[key]
    const after = key === 'price' ? value.amount : value
    if (JSON.stringify(before) !== JSON.stringify(after)) out[key] = value
  }
  return out
}

async function submit() {
  if (!canSubmit.value) return
  const d = dialog.value
  const b = branchId()
  let created = null
  const ok = await run(async () => {
    if (d.kind === 'add') {
      created = (await calls.createProduct(b, { code: normalizeCode(d.code), ...fields(d) })).data
    } else if (d.kind === 'edit') {
      const diff = changes(d.product, fields(d))
      if (Object.keys(diff).length) await calls.updateProduct(b, d.product, diff)
    } else if (d.kind === 'routes') {
      const routes = Object.entries(d.routes).sort((a, c) => a[1] - c[1]).map(([stationId], i) => ({ stationId, priority: i + 1 }))
      await calls.routes(b, d.product, routes)
    } else {
      await calls.productStatus(b, d.product, d.kind === 'on' ? 'ACTIVE' : 'INACTIVE', d.reason)
    }
  }, () => ({
    add: `Se creó ${d.name.trim()}. Queda inactivo: elige las estaciones que lo preparan y actívalo.`,
    edit: `Se guardó ${d.name.trim()}.`,
    routes: `Se guardaron las estaciones de ${d.product?.name}.`,
    on: `${d.product?.name} ya se puede pedir.`,
    off: `${d.product?.name} ya no aparece al pedir.`,
  })[d.kind])
  if (!ok) return
  // Recién creado, lo siguiente es elegir sus estaciones.
  if (created && activeStations.value.length) {
    open('routes', created)
    notice.value = `Se creó ${created.name}. Queda inactivo: elige las estaciones que lo preparan y actívalo.`
  } else {
    dialog.value = null
  }
}

async function toggleAvailability(p) {
  notice.value = ''
  const next = p.availability === 'SOLD_OUT' ? 'AVAILABLE' : 'SOLD_OUT'
  await run(() => calls.availability(branchId(), p, next),
    next === 'SOLD_OUT' ? `${p.name} quedó agotado.` : `${p.name} vuelve a estar disponible.`)
  if (error.value) notice.value = ''
}
</script>

<template>
  <div>
    <div class="toolbar">
      <label>Buscar<input v-model="search" class="field" type="search" placeholder="Nombre, código o categoría" /></label>
      <label>Estado
        <select v-model="status" class="field">
          <option value="">Todos</option>
          <option value="ACTIVE">Activos</option>
          <option value="INACTIVE">Inactivos</option>
        </select>
      </label>
      <span class="count">{{ filtered.length }} de {{ products.length }}</span>
      <button v-if="canManage" type="button" class="btn btn-primary" @click="open('add')">Nuevo producto</button>
    </div>
    <p v-if="notice && !dialog" class="notice-ok" role="status">{{ notice }}</p>
    <p v-if="error && !dialog" class="form-error" role="alert">{{ error }}</p>

    <div v-for="g in groups" :key="g.category" class="box">
      <h2>{{ g.category }}</h2>
      <table class="data-table">
        <thead><tr><th scope="col">Producto</th><th scope="col" class="num">Precio</th><th scope="col">Estaciones</th><th scope="col">Estado</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
        <tbody>
          <tr v-for="p in g.items" :key="p.id">
            <td><span class="cell-main">{{ p.name }}</span><span class="cell-sub">{{ p.code }}<template v-if="p.description"> · {{ p.description }}</template></span></td>
            <td class="num">{{ formatMoney(p.price) }}</td>
            <td>
              <span v-for="r in p.routes" :key="r.stationId" class="pill accent">{{ stationName.get(r.stationId) ?? 'Estación' }}</span>
              <span v-if="!hasActiveRoute(p, stations)" class="pill warn">Sin estación activa</span>
            </td>
            <td>
              <span class="pill" :class="{ muted: p.status !== 'ACTIVE' }">{{ p.status === 'ACTIVE' ? 'Activo' : 'Inactivo' }}</span>
              <span v-if="p.availability === 'SOLD_OUT'" class="pill warn">Agotado</span>
            </td>
            <td class="actions">
              <template v-if="canManage">
                <button type="button" class="btn" @click="open('edit', p)">Editar</button>
                <button type="button" class="btn" @click="open('routes', p)">Estaciones</button>
                <button v-if="p.status === 'ACTIVE'" type="button" class="btn btn-danger" @click="open('off', p)">Desactivar</button>
                <button v-else type="button" class="btn" @click="open('on', p)">Activar</button>
              </template>
              <button v-if="canSetAvailability && p.status === 'ACTIVE'" type="button" class="btn" :disabled="busy" @click="toggleAvailability(p)">
                {{ p.availability === 'SOLD_OUT' ? 'Hay de nuevo' : 'Agotado' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="!groups.length" class="box empty-row">{{ products.length ? 'Ningún producto coincide con la búsqueda.' : 'Todavía no hay productos.' }}</p>

    <ModalDialog v-if="dialog" :title="TITLES[dialog.kind]" :busy="busy" @close="close">
      <form class="form" @submit.prevent="submit">
        <p v-if="notice" class="notice-ok" role="status">{{ notice }}</p>

        <template v-if="dialog.kind === 'add' || dialog.kind === 'edit'">
          <div class="row">
            <label v-if="dialog.kind === 'add'">Código<input v-model="dialog.code" class="field" maxlength="32" autocomplete="off" placeholder="TACO-PASTOR" required /></label>
            <label>Nombre<input v-model="dialog.name" class="field" maxlength="120" autocomplete="off" required /></label>
          </div>
          <div class="row">
            <label>Categoría<input v-model="dialog.category" class="field" maxlength="60" list="menu-categories" autocomplete="off" required /></label>
            <label>Precio (IVA incluido)<input v-model="dialog.price" class="field" inputmode="decimal" placeholder="0.00" required /></label>
          </div>
          <datalist id="menu-categories"><option v-for="c in categories" :key="c" :value="c" /></datalist>
          <label>Descripción<textarea v-model="dialog.description" class="field" rows="2" maxlength="1000" /></label>
          <div class="row">
            <label>Orden en su categoría<input v-model.number="dialog.displayOrder" class="field" type="number" min="0" max="100000" /></label>
            <label>Imagen (https, opcional)<input v-model="dialog.imageUrl" class="field" type="url" maxlength="2048" /></label>
          </div>
          <fieldset v-if="modifierChoices.length">
            <legend>Modificadores</legend>
            <label v-for="m in modifierChoices" :key="m.id" class="check">
              <input v-model="dialog.modifierIds" type="checkbox" :value="m.id" /> {{ m.name }}<span v-if="m.status !== 'ACTIVE'" class="pill muted">Inactivo</span>
            </label>
          </fieldset>
          <details>
            <summary>Datos fiscales para facturar</summary>
            <div class="form fiscal">
              <div class="row">
                <label>Clave de producto SAT<input v-model="dialog.fiscal.satProductCode" class="field" maxlength="8" inputmode="numeric" /></label>
                <label>Clave de unidad SAT<input v-model="dialog.fiscal.satUnitCode" class="field" maxlength="3" /></label>
              </div>
              <div class="row">
                <label>Objeto de impuesto<input v-model="dialog.fiscal.taxObject" class="field" maxlength="2" inputmode="numeric" /></label>
                <label>Tasa de IVA<input v-model="dialog.fiscal.taxRate" class="field" maxlength="8" inputmode="decimal" /></label>
              </div>
              <p class="help">Por omisión, los de un platillo de restaurante: 90101501, E48, objeto 02 e IVA 16 %.</p>
            </div>
          </details>
          <p v-if="formProblem" class="help" aria-live="polite">{{ formProblem }}</p>
        </template>

        <template v-else-if="dialog.kind === 'routes'">
          <p class="help">Al mandar {{ dialog.product.name }} a preparar, va a estas estaciones en el orden en que las marques.</p>
          <fieldset>
            <legend>Estaciones</legend>
            <label v-for="s in routeChoices" :key="s.id" class="check">
              <input type="checkbox" :checked="s.id in dialog.routes" @change="toggleRoute(s.id, $event.target.checked)" />
              {{ s.name }}<span v-if="s.status !== 'ACTIVE'" class="pill muted">Inactiva</span>
            </label>
            <p v-if="!routeChoices.length" class="help">No hay estaciones activas. Créalas en la pestaña Estaciones.</p>
          </fieldset>
          <p v-if="!Object.keys(dialog.routes).length" class="help">Sin estaciones el producto no se puede activar.</p>
        </template>

        <template v-else>
          <p class="help" v-if="dialog.kind === 'off'">{{ dialog.product.name }} dejará de aparecer al tomar pedidos. Los pedidos que ya lo tienen no cambian.</p>
          <p class="help" v-else-if="hasActiveRoute(dialog.product, stations)">{{ dialog.product.name }} aparecerá al tomar pedidos.</p>
          <p class="form-error" v-else>Primero elige al menos una estación activa que lo prepare (botón Estaciones).</p>
          <label>Motivo<textarea v-model="dialog.reason" class="field" rows="3" maxlength="500" required /></label>
        </template>

        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <div class="form-buttons">
          <button type="button" class="btn" :disabled="busy" @click="close">{{ dialog.kind === 'routes' && notice ? 'Después' : 'Cancelar' }}</button>
          <button type="submit" class="btn" :class="dialog.kind === 'off' ? 'btn-danger-solid' : 'btn-primary'" :disabled="!canSubmit">{{ busy ? 'Guardando…' : 'Guardar' }}</button>
        </div>
      </form>
    </ModalDialog>
  </div>
</template>

<style scoped>
details { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; }
summary { cursor: pointer; font-size: .9rem; color: var(--muted); }
.fiscal { margin-top: 10px; }
</style>
