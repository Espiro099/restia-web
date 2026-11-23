<script setup>
import { computed, inject, reactive, ref, watch } from 'vue'
import ErrorNotice from '../../components/ErrorNotice.vue'
import ModalDialog from '../../components/ModalDialog.vue'
import { INVOICE_STATUS, checksText, globalPeriods, invoiceActions, invoicesErrorText } from '../../lib/invoices.js'
import { formatMoney } from '../../lib/money.js'
import { validReason } from '../../lib/personal.js'
import { useAction } from '../../lib/useAction.js'

// Factura global (F-6, F-7): junta las cuentas pagadas sin factura de un periodo en una factura al público en
// general. El periodo debe corresponder a la periodicidad del emisor; la API lo valida.
const { calls, branchId, perms, today } = inject('invoices')

const batches = ref([])
const invoices = ref(new Map())
const loading = ref(false)
const error = ref(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    const [b, inv] = await Promise.all([calls.batches(branchId()), calls.globalInvoices(branchId())])
    batches.value = b.data
    invoices.value = inv
  } catch (e) {
    error.value = e
  } finally {
    loading.value = false
  }
}
watch(() => branchId(), load, { immediate: true })

const { busy, error: actionError, notice, run } = useAction(load, invoicesErrorText)
const periods = computed(() => globalPeriods(today()))

function periodText(b) {
  const f = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
  return b.periodFrom === b.periodTo ? f(b.periodFrom) : `${f(b.periodFrom)} al ${f(b.periodTo)}`
}

// ---------------------------------------------------------------- Diálogos
const dialog = ref(null)
const form = reactive({ from: '', to: '' })
function openNew() {
  notice.value = ''
  actionError.value = ''
  const p = periods.value[2]
  form.from = p.from
  form.to = p.to
  dialog.value = { kind: 'new' }
}
function openStamp(batch) {
  notice.value = ''
  actionError.value = ''
  dialog.value = { kind: 'stamp', batch, invoice: invoices.value.get(batch.invoiceId) }
}
async function openExclude(batch) {
  notice.value = ''
  actionError.value = ''
  dialog.value = { kind: 'exclude', batch, checks: null, selected: [], reason: '' }
  const d = dialog.value
  try {
    d.checks = await calls.batchChecks(branchId(), batch)
  } catch (e) {
    actionError.value = invoicesErrorText(e)
    d.checks = []
  }
}
function close() {
  if (!busy.value) dialog.value = null
}

const canSubmit = computed(() => {
  const d = dialog.value
  if (!d || busy.value) return false
  if (d.kind === 'new') return /^\d{4}-\d{2}-\d{2}$/.test(form.from) && /^\d{4}-\d{2}-\d{2}$/.test(form.to) && form.from <= form.to
  if (d.kind === 'exclude') return d.selected.length > 0 && d.selected.length <= 50 && validReason(d.reason)
  return !!d.invoice
})

async function submit() {
  if (!canSubmit.value) return
  const d = dialog.value
  const b = branchId()
  let created = null
  const ok = await run(async () => {
    if (d.kind === 'new') created = (await calls.createBatch(b, form.from, form.to)).data
    else if (d.kind === 'stamp') await calls.stamp(b, d.invoice)
    else await calls.excludeChecks(b, d.batch, d.selected, d.reason)
  }, () => ({
    new: 'Se armó la factura global. Revísala y tímbrala.',
    stamp: 'Se mandó a timbrar la factura global.',
    exclude: 'Se pidió sacar esas cuentas: la factura global se cancela y se hace otra sin ellas. Así esas cuentas se pueden facturar a nombre de cada cliente.',
  })[d.kind])
  if (!ok) return
  if (created) {
    // Recién armada: lo siguiente es timbrarla.
    const batch = batches.value.find((x) => x.id === created.id) ?? created
    openStamp(batch)
    notice.value = `Se armó la factura global con ${checksText(batch.checkIds.length)}. Revísala y tímbrala.`
  } else {
    dialog.value = null
  }
}

function time(iso) {
  return iso ? new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : ''
}
</script>

<template>
  <div>
    <div class="toolbar">
      <p class="help">La factura global junta las ventas al público en general (las cuentas pagadas que nadie pidió facturar) de un periodo. Se hace según la periodicidad del emisor: diaria, semanal, quincenal, mensual o bimestral.</p>
      <button v-if="perms.global" type="button" class="btn btn-primary" @click="openNew">Hacer factura global</button>
    </div>
    <p v-if="notice && !dialog" class="notice-ok" role="status">{{ notice }}</p>
    <ErrorNotice :error="error" @retry="load" />

    <div v-if="!error" class="box">
      <table class="data-table">
        <thead><tr><th scope="col">Periodo</th><th scope="col">Cuentas</th><th scope="col" class="num">Total</th><th scope="col">Estado</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
        <tbody>
          <tr v-for="b in batches" :key="b.id">
            <td><span class="cell-main">{{ periodText(b) }}</span><span v-if="b.status === 'SUPERSEDED'" class="cell-sub">Reemplazada por otra sin algunas cuentas</span></td>
            <td>{{ b.checkIds.length }}</td>
            <td class="num">{{ invoices.get(b.invoiceId) ? formatMoney(invoices.get(b.invoiceId).total) : '—' }}</td>
            <td>
              <span v-if="invoices.get(b.invoiceId)" class="pill" :class="INVOICE_STATUS[invoices.get(b.invoiceId).status]?.tone">{{ INVOICE_STATUS[invoices.get(b.invoiceId).status]?.label }}</span>
              <span v-if="b.status === 'SUPERSEDED'" class="pill muted">Reemplazada</span>
            </td>
            <td class="actions">
              <template v-if="b.status === 'ACTIVE' && invoices.get(b.invoiceId)">
                <button v-if="invoiceActions(invoices.get(b.invoiceId), perms).stamp" type="button" class="btn" @click="openStamp(b)">Timbrar</button>
                <button v-if="perms.global && invoiceActions(invoices.get(b.invoiceId), { ...perms, cancel: true }).cancel" type="button" class="btn" @click="openExclude(b)">Sacar cuentas</button>
              </template>
            </td>
          </tr>
          <tr v-if="!loading && !batches.length"><td colspan="5" class="empty-row">Todavía no hay facturas globales.</td></tr>
        </tbody>
      </table>
    </div>

    <ModalDialog v-if="dialog" :title="{ new: 'Hacer factura global', stamp: 'Timbrar factura global', exclude: 'Sacar cuentas de la factura global' }[dialog.kind]" :busy="busy" @close="close">
      <form class="form" @submit.prevent="submit">
        <p v-if="notice" class="notice-ok" role="status">{{ notice }}</p>

        <template v-if="dialog.kind === 'new'">
          <div class="quick" role="group" aria-label="Periodos sugeridos">
            <button v-for="p in periods" :key="p.key" type="button" class="btn" :aria-pressed="form.from === p.from && form.to === p.to" @click="form.from = p.from; form.to = p.to">{{ p.label }}</button>
          </div>
          <div class="row">
            <label>Desde<input v-model="form.from" class="field" type="date" /></label>
            <label>Hasta<input v-model="form.to" class="field" type="date" /></label>
          </div>
          <p class="help">Entran las cuentas pagadas en esas fechas que no tienen factura. Si el periodo no corresponde a la periodicidad del emisor, se explica al guardar.</p>
        </template>

        <template v-else-if="dialog.kind === 'stamp'">
          <p v-if="dialog.invoice" class="help">Se timbra la factura global de {{ periodText(dialog.batch) }} por {{ formatMoney(dialog.invoice.total) }}, con {{ checksText(dialog.batch.checkIds.length) }}. Ya timbrada, una cuenta solo se puede facturar aparte sacándola de la global.</p>
          <p v-else class="help">Cargando la factura…</p>
        </template>

        <template v-else>
          <p class="help">Para facturar una cuenta a nombre de un cliente cuando ya está en la global timbrada, hay que sacarla: la global se cancela y se hace otra sin esas cuentas.</p>
          <p v-if="dialog.checks === null" class="help">Buscando las cuentas del lote…</p>
          <fieldset v-else class="checks">
            <legend>Cuentas ({{ dialog.selected.length }} elegidas)</legend>
            <label v-for="c in dialog.checks" :key="c.id" class="check">
              <input v-model="dialog.selected" type="checkbox" :value="c.id" /> {{ c.businessDate }} · {{ time(c.paidAt) }} · {{ formatMoney(c.total) }}
            </label>
            <p v-if="!dialog.checks.length" class="help">No se encontraron las cuentas de este lote.</p>
          </fieldset>
          <label>Motivo<textarea v-model="dialog.reason" class="field" rows="2" maxlength="500" placeholder="El cliente pidió su factura" /></label>
        </template>

        <p v-if="actionError" class="form-error" role="alert">{{ actionError }}</p>
        <div class="form-buttons">
          <button type="button" class="btn" :disabled="busy" @click="close">{{ dialog.kind === 'stamp' && notice ? 'Después' : 'Volver' }}</button>
          <button type="submit" class="btn" :class="dialog.kind === 'exclude' ? 'btn-danger-solid' : 'btn-primary'" :disabled="!canSubmit">
            {{ busy ? 'Enviando…' : { new: 'Armar factura', stamp: 'Timbrar', exclude: 'Sacar cuentas' }[dialog.kind] }}
          </button>
        </div>
      </form>
    </ModalDialog>
  </div>
</template>

<style scoped>
.quick { display: flex; gap: 6px; flex-wrap: wrap; }
.quick .btn[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent); border-color: var(--accent); }
.checks { max-height: 260px; overflow-y: auto; }
</style>
