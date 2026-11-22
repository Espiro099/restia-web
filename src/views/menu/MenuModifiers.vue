<script setup>
import { computed, inject, ref } from 'vue'
import ModalDialog from '../../components/ModalDialog.vue'
import { CODE_PATTERN, CURRENCY, catalogErrorText, formatDelta, normalizeCode, selectionRule } from '../../lib/catalog.js'
import { parseAmount } from '../../lib/money.js'
import { validReason } from '../../lib/personal.js'
import { useAction } from '../../lib/useAction.js'

// Modificadores: grupos de opciones que el mesero elige al pedir (término de la carne, extras…).
// Las opciones existentes no se borran: se desactivan, porque hay pedidos que las usaron.
const props = defineProps({ modifiers: { type: Array, required: true }, products: { type: Array, required: true } })
const { calls, reload, branchId, canManage } = inject('menu')
const { busy, error, notice, run } = useAction(reload, catalogErrorText)

const usage = computed(() => {
  const count = new Map()
  for (const p of props.products) for (const id of p.modifierIds ?? []) count.set(id, (count.get(id) ?? 0) + 1)
  return count
})

const dialog = ref(null)
function open(kind, modifier = null) {
  notice.value = ''
  error.value = ''
  dialog.value = {
    kind,
    modifier,
    code: '',
    name: modifier?.name ?? '',
    min: modifier?.minSelections ?? 0,
    max: modifier?.maxSelections ?? 1,
    // Cada opción conserva su id y sus ajustes de ingredientes: la API borra los que no se manden.
    options: modifier
      ? modifier.options.map((o) => ({ ...o, price: o.priceDelta.amount, isNew: false }))
      : [{ name: '', price: '0.00', active: true, isNew: true, ingredientAdjustments: [] }],
    reason: '',
  }
}
function close() {
  if (!busy.value) dialog.value = null
}
function addOption() {
  dialog.value.options.push({ name: '', price: '0.00', active: true, isNew: true, ingredientAdjustments: [] })
}
function removeOption(i) {
  dialog.value.options.splice(i, 1)
}

const TITLES = { add: 'Nuevo modificador', edit: 'Editar modificador', off: 'Desactivar modificador', on: 'Activar modificador' }

/** Precio extra: puede ser negativo (descuento). */
function delta(text) {
  const clean = String(text ?? '').trim()
  const negative = clean.startsWith('-')
  const amount = parseAmount(negative ? clean.slice(1) : clean)
  return amount === null ? null : { amount: negative && Number(amount) !== 0 ? `-${amount}` : amount, currency: CURRENCY }
}

const formProblem = computed(() => {
  const d = dialog.value
  if (!d || ['on', 'off'].includes(d.kind)) return ''
  if (d.kind === 'add' && !CODE_PATTERN.test(normalizeCode(d.code))) return 'El código lleva de 2 a 32 letras mayúsculas, números o guiones.'
  if (!d.name.trim()) return 'Falta el nombre.'
  if (!d.options.length) return 'Agrega al menos una opción.'
  if (d.options.some((o) => !o.name.trim())) return 'Cada opción necesita nombre.'
  if (d.options.some((o) => delta(o.price) === null)) return 'Revisa los precios: hasta dos decimales.'
  const names = d.options.map((o) => o.name.trim().toLowerCase())
  if (new Set(names).size !== names.length) return 'Hay dos opciones con el mismo nombre.'
  const min = Number(d.min)
  const max = Number(d.max)
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < 1) return 'Revisa el mínimo y el máximo.'
  if (min > max) return 'El mínimo no puede ser mayor que el máximo.'
  if (min > d.options.filter((o) => o.active).length) return 'Hay menos opciones activas que el mínimo a elegir.'
  return ''
})

const canSubmit = computed(() => {
  const d = dialog.value
  if (!d || busy.value) return false
  if (['on', 'off'].includes(d.kind)) return validReason(d.reason)
  return !formProblem.value
})

function body(d) {
  return {
    name: d.name.trim(),
    minSelections: Number(d.min),
    maxSelections: Number(d.max),
    options: d.options.map((o) => ({
      ...(o.isNew ? {} : { id: o.id }),
      name: o.name.trim(),
      priceDelta: delta(o.price),
      active: o.active,
      ingredientAdjustments: o.ingredientAdjustments ?? [],
    })),
  }
}

async function submit() {
  if (!canSubmit.value) return
  const d = dialog.value
  const b = branchId()
  const ok = await run(() => {
    if (d.kind === 'add') return calls.createModifier(b, { code: normalizeCode(d.code), ...body(d) })
    if (d.kind === 'edit') return calls.updateModifier(b, d.modifier, body(d))
    return calls.modifierStatus(b, d.modifier, d.kind === 'on' ? 'ACTIVE' : 'INACTIVE', d.reason)
  }, () => ({
    add: `Se creó ${d.name.trim()}.`,
    edit: `Se guardó ${d.name.trim()}.`,
    on: `${d.modifier?.name} está activo.`,
    off: `${d.modifier?.name} está inactivo: ya no se ofrece al pedir.`,
  })[d.kind])
  if (ok) dialog.value = null
}
</script>

<template>
  <div>
    <div class="toolbar">
      <p class="help">Grupos de opciones que se eligen al pedir un producto, como el término de la carne o los extras. Se asignan a cada producto en su ficha.</p>
      <button v-if="canManage" type="button" class="btn btn-primary" @click="open('add')">Nuevo modificador</button>
    </div>
    <p v-if="notice" class="notice-ok" role="status">{{ notice }}</p>

    <div class="box">
      <table class="data-table">
        <thead><tr><th scope="col">Modificador</th><th scope="col">Opciones</th><th scope="col">Productos</th><th scope="col">Estado</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
        <tbody>
          <tr v-for="m in modifiers" :key="m.id">
            <td><span class="cell-main">{{ m.name }}</span><span class="cell-sub">{{ m.code }} · {{ selectionRule(m) }}</span></td>
            <td>
              <span v-for="o in m.options" :key="o.id" class="pill" :class="o.active ? 'accent' : 'muted'">
                {{ o.name }}<span v-if="formatDelta(o.priceDelta)" class="delta">{{ formatDelta(o.priceDelta) }}</span>
              </span>
            </td>
            <td>{{ usage.get(m.id) ?? 0 }}</td>
            <td><span class="pill" :class="{ muted: m.status !== 'ACTIVE' }">{{ m.status === 'ACTIVE' ? 'Activo' : 'Inactivo' }}</span></td>
            <td class="actions">
              <template v-if="canManage">
                <button type="button" class="btn" @click="open('edit', m)">Editar</button>
                <button v-if="m.status === 'ACTIVE'" type="button" class="btn btn-danger" @click="open('off', m)">Desactivar</button>
                <button v-else type="button" class="btn" @click="open('on', m)">Activar</button>
              </template>
            </td>
          </tr>
          <tr v-if="!modifiers.length"><td colspan="5" class="empty-row">Todavía no hay modificadores.</td></tr>
        </tbody>
      </table>
    </div>

    <ModalDialog v-if="dialog" :title="TITLES[dialog.kind]" :busy="busy" @close="close">
      <form class="form" @submit.prevent="submit">
        <template v-if="dialog.kind === 'add' || dialog.kind === 'edit'">
          <label v-if="dialog.kind === 'add'">Código<input v-model="dialog.code" class="field" maxlength="32" autocomplete="off" placeholder="TERMINO" required /></label>
          <label>Nombre<input v-model="dialog.name" class="field" maxlength="120" autocomplete="off" placeholder="Término de la carne" required /></label>
          <div class="row">
            <label>Mínimo a elegir<input v-model.number="dialog.min" class="field" type="number" min="0" max="100" /></label>
            <label>Máximo a elegir<input v-model.number="dialog.max" class="field" type="number" min="1" max="100" /></label>
          </div>
          <fieldset>
            <legend>Opciones</legend>
            <div v-for="(o, i) in dialog.options" :key="o.id ?? `nueva-${i}`" class="option">
              <input v-model="o.name" class="field" maxlength="120" :aria-label="`Nombre de la opción ${i + 1}`" placeholder="Nombre" />
              <input v-model="o.price" class="field price" inputmode="decimal" :aria-label="`Precio extra de la opción ${i + 1}`" placeholder="0.00" />
              <label v-if="!o.isNew" class="check"><input v-model="o.active" type="checkbox" /> Activa</label>
              <button v-else type="button" class="btn" :aria-label="`Quitar la opción ${i + 1}`" @click="removeOption(i)">Quitar</button>
            </div>
            <button type="button" class="btn" @click="addOption">Agregar opción</button>
            <p class="help">El precio extra se suma al del producto; usa un número negativo para un descuento. Las opciones guardadas no se borran: se desactivan.</p>
          </fieldset>
          <p v-if="formProblem" class="help" aria-live="polite">{{ formProblem }}</p>
        </template>
        <template v-else>
          <p class="help" v-if="dialog.kind === 'off'">{{ dialog.modifier.name }} dejará de ofrecerse al pedir, aunque siga asignado a productos.</p>
          <p class="help" v-else>{{ dialog.modifier.name }} volverá a ofrecerse al pedir.</p>
          <label>Motivo<textarea v-model="dialog.reason" class="field" rows="3" maxlength="500" required /></label>
        </template>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <div class="form-buttons">
          <button type="button" class="btn" :disabled="busy" @click="close">Cancelar</button>
          <button type="submit" class="btn" :class="dialog.kind === 'off' ? 'btn-danger-solid' : 'btn-primary'" :disabled="!canSubmit">{{ busy ? 'Guardando…' : 'Guardar' }}</button>
        </div>
      </form>
    </ModalDialog>
  </div>
</template>

<style scoped>
.option { display: grid; grid-template-columns: 1fr 96px auto; gap: 8px; align-items: center; }
.price { text-align: right; }
.delta { margin-left: .35em; font-weight: 500; }
</style>
