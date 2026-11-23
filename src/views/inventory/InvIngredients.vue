<script setup>
import { computed, inject, ref } from 'vue'
import ModalDialog from '../../components/ModalDialog.vue'
import { CODE_PATTERN, normalizeCode } from '../../lib/catalog.js'
import { UNIT_NAMES, belowMinimum, inventoryErrorText, qtyText, quantity, stockPending } from '../../lib/inventory.js'
import { validReason } from '../../lib/personal.js'
import { useAction } from '../../lib/useAction.js'

const { calls, branchId, perms, ingredients, reloadIngredients } = inject('inventory')
const { busy, error, notice, run } = useAction(reloadIngredients, inventoryErrorText)

const filter = ref('')
const search = ref('')
const visible = computed(() => {
  const q = search.value.trim().toLowerCase()
  return ingredients.value.filter((i) =>
    (!q || i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q)) &&
    (filter.value !== 'low' || (i.status === 'ACTIVE' && belowMinimum(i))) &&
    (filter.value !== 'blocked' || i.foodSafetyBlock) &&
    (filter.value !== 'inactive' || i.status !== 'ACTIVE') &&
    (filter.value === 'inactive' || i.status === 'ACTIVE' || filter.value === 'all'))
})
const lowCount = computed(() => ingredients.value.filter((i) => i.status === 'ACTIVE' && belowMinimum(i)).length)

const dialog = ref(null)
function open(kind, i = null) {
  notice.value = ''
  error.value = ''
  dialog.value = { kind, ingredient: i, code: '', name: i?.name ?? '', unit: i?.baseUnit ?? 'KG', minStock: i ? String(Number(i.minStock)) : '0', qty: '', reason: '' }
}
function close() {
  if (!busy.value) dialog.value = null
}
const TITLES = { add: 'Nuevo insumo', edit: 'Editar insumo', waste: 'Registrar merma', adjust: 'Ajustar existencia', on: 'Activar insumo', off: 'Desactivar insumo', block: 'Bloquear por seguridad alimentaria', unblock: 'Quitar el bloqueo' }

const formProblem = computed(() => {
  const d = dialog.value
  if (!d) return ''
  if (d.kind === 'add' && !CODE_PATTERN.test(normalizeCode(d.code))) return 'El código lleva de 2 a 32 letras mayúsculas, números o guiones.'
  if (['add', 'edit'].includes(d.kind)) {
    if (!d.name.trim()) return 'Falta el nombre.'
    if (!quantity(d.minStock)) return 'El mínimo es una cantidad con hasta 4 decimales.'
  }
  if (d.kind === 'waste' && (!quantity(d.qty) || Number(d.qty) === 0)) return 'Escribe cuánto se perdió.'
  if (d.kind === 'adjust' && (!quantity(d.qty, { signed: true }) || Number(d.qty) === 0)) return 'Escribe cuánto sumar (o restar con un signo menos).'
  return ''
})
const canSubmit = computed(() => {
  const d = dialog.value
  if (!d || busy.value || formProblem.value) return false
  if (['add', 'edit'].includes(d.kind)) return true
  return validReason(d.reason)
})

async function submit() {
  if (!canSubmit.value) return
  const d = dialog.value
  const b = branchId()
  const i = d.ingredient
  const ok = await run(() => {
    if (d.kind === 'add') return calls.createIngredient(b, { code: normalizeCode(d.code), name: d.name.trim(), baseUnit: d.unit, minStock: quantity(d.minStock) })
    if (d.kind === 'edit') {
      const diff = {}
      if (d.name.trim() !== i.name) diff.name = d.name.trim()
      if (Number(d.minStock) !== Number(i.minStock)) diff.minStock = quantity(d.minStock)
      return Object.keys(diff).length ? calls.updateIngredient(b, i, diff) : null
    }
    // Merma: se manda positiva y la API la guarda como salida.
    if (d.kind === 'waste') return calls.createMovement(b, { ingredientId: i.id, type: 'WASTE', quantity: quantity(d.qty), reason: d.reason.trim() })
    if (d.kind === 'adjust') return calls.createMovement(b, { ingredientId: i.id, type: 'ADJUSTMENT', quantity: quantity(d.qty, { signed: true }), reason: d.reason.trim() })
    if (d.kind === 'block' || d.kind === 'unblock') return calls.foodSafety(b, i, d.kind === 'block', d.reason)
    return calls.ingredientStatus(b, i, d.kind === 'on' ? 'ACTIVE' : 'INACTIVE', d.reason)
  }, () => ({
    add: `Se creó ${d.name.trim()}.`,
    edit: `Se guardó ${d.name.trim()}.`,
    waste: `Se registró la merma de ${i?.name}. La existencia se actualiza en unos segundos.`,
    adjust: `Se registró el ajuste de ${i?.name}. La existencia se actualiza en unos segundos.`,
    block: `${i?.name} quedó bloqueado: no se usará al preparar.`,
    unblock: `${i?.name} se puede volver a usar.`,
    on: `${i?.name} está activo.`,
    off: `${i?.name} está inactivo.`,
  })[d.kind])
  if (ok) dialog.value = null
}
</script>

<template>
  <div>
    <div class="toolbar">
      <label>Buscar<input v-model="search" class="field" type="search" placeholder="Nombre o código" /></label>
      <label>Mostrar
        <select v-model="filter" class="field">
          <option value="">Activos</option>
          <option value="low">Bajo el mínimo ({{ lowCount }})</option>
          <option value="blocked">Bloqueados</option>
          <option value="inactive">Inactivos</option>
          <option value="all">Todos</option>
        </select>
      </label>
      <span class="count">{{ visible.length }} {{ visible.length === 1 ? 'insumo' : 'insumos' }}</span>
      <button v-if="perms.manage" type="button" class="btn btn-primary" @click="open('add')">Nuevo insumo</button>
    </div>
    <p v-if="notice && !dialog" class="notice-ok" role="status">{{ notice }}</p>

    <div class="box">
      <table class="data-table">
        <thead><tr><th scope="col">Insumo</th><th scope="col" class="num">Existencia</th><th scope="col" class="num">Mínimo</th><th scope="col">Estado</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
        <tbody>
          <tr v-for="i in visible" :key="i.id">
            <td><span class="cell-main">{{ i.name }}</span><span class="cell-sub">{{ i.code }}</span></td>
            <td class="num"><span class="cell-main">{{ qtyText(i.stock, i.baseUnit) }}</span><span v-if="stockPending(i)" class="cell-sub">Actualizando</span></td>
            <td class="num">{{ qtyText(i.minStock, i.baseUnit) }}</td>
            <td>
              <span v-if="i.status !== 'ACTIVE'" class="pill muted">Inactivo</span>
              <span v-else-if="belowMinimum(i)" class="pill warn">Bajo el mínimo</span>
              <span v-else class="pill">Suficiente</span>
              <span v-if="i.foodSafetyBlock" class="pill warn">Bloqueado</span>
              <span v-if="i.foodSafetyBlock" class="cell-sub">{{ i.foodSafetyBlock.reason }}</span>
            </td>
            <td class="actions">
              <template v-if="i.status === 'ACTIVE'">
                <button v-if="perms.record_waste" type="button" class="btn" @click="open('waste', i)">Merma</button>
                <button v-if="perms.adjust" type="button" class="btn" @click="open('adjust', i)">Ajustar</button>
                <button v-if="perms.food_safety && !i.foodSafetyBlock" type="button" class="btn btn-danger" @click="open('block', i)">Bloquear</button>
                <button v-if="perms.food_safety && i.foodSafetyBlock" type="button" class="btn" @click="open('unblock', i)">Desbloquear</button>
              </template>
              <template v-if="perms.manage">
                <button type="button" class="btn" @click="open('edit', i)">Editar</button>
                <button v-if="i.status === 'ACTIVE'" type="button" class="btn btn-danger" @click="open('off', i)">Desactivar</button>
                <button v-else type="button" class="btn" @click="open('on', i)">Activar</button>
              </template>
            </td>
          </tr>
          <tr v-if="!visible.length"><td colspan="5" class="empty-row">No hay insumos con este filtro.</td></tr>
        </tbody>
      </table>
    </div>

    <ModalDialog v-if="dialog" :title="TITLES[dialog.kind]" :busy="busy" @close="close">
      <form class="form" @submit.prevent="submit">
        <template v-if="dialog.kind === 'add' || dialog.kind === 'edit'">
          <div class="row">
            <label v-if="dialog.kind === 'add'">Código<input v-model="dialog.code" class="field" maxlength="32" placeholder="CEBOLLA" autocomplete="off" /></label>
            <label>Nombre<input v-model="dialog.name" class="field" maxlength="120" autocomplete="off" /></label>
          </div>
          <div class="row">
            <label v-if="dialog.kind === 'add'">Unidad
              <select v-model="dialog.unit" class="field"><option v-for="(l, k) in UNIT_NAMES" :key="k" :value="k">{{ l }}</option></select>
            </label>
            <label>Mínimo ({{ UNIT_NAMES[dialog.unit]?.toLowerCase() }})<input v-model="dialog.minStock" class="field" inputmode="decimal" /></label>
          </div>
          <p v-if="dialog.kind === 'add'" class="help">La unidad no se cambia después: las recetas y las entradas usan esa misma unidad.</p>
        </template>
        <template v-else-if="dialog.kind === 'waste' || dialog.kind === 'adjust'">
          <p class="help">{{ dialog.ingredient.name }}: hay {{ qtyText(dialog.ingredient.stock, dialog.ingredient.baseUnit) }}.
            {{ dialog.kind === 'waste' ? 'La merma es lo que se echó a perder o se tiró.' : 'Un ajuste corrige la existencia; usa un signo menos para restar.' }}</p>
          <label>Cantidad ({{ UNIT_NAMES[dialog.ingredient.baseUnit]?.toLowerCase() }})<input v-model="dialog.qty" class="field" inputmode="decimal" /></label>
          <label>Motivo<textarea v-model="dialog.reason" class="field" rows="2" maxlength="500" /></label>
        </template>
        <template v-else>
          <p v-if="dialog.kind === 'block'" class="help">Mientras esté bloqueado, {{ dialog.ingredient.name }} no se descuenta ni se usa al preparar: los platillos que lo llevan avisan en cocina.</p>
          <p v-else-if="dialog.kind === 'unblock'" class="help">{{ dialog.ingredient.name }} se vuelve a usar al preparar.</p>
          <p v-else-if="dialog.kind === 'off'" class="help">{{ dialog.ingredient.name }} deja de aparecer en entradas, conteos y recetas nuevas.</p>
          <label>Motivo<textarea v-model="dialog.reason" class="field" rows="2" maxlength="500" /></label>
        </template>
        <p v-if="formProblem" class="help" aria-live="polite">{{ formProblem }}</p>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <div class="form-buttons">
          <button type="button" class="btn" :disabled="busy" @click="close">Cancelar</button>
          <button type="submit" class="btn" :class="['off', 'block'].includes(dialog.kind) ? 'btn-danger-solid' : 'btn-primary'" :disabled="!canSubmit">{{ busy ? 'Guardando…' : 'Guardar' }}</button>
        </div>
      </form>
    </ModalDialog>
  </div>
</template>
