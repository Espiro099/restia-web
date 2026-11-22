<script setup>
import { computed, inject, reactive, ref, watch } from 'vue'
import ErrorNotice from '../../components/ErrorNotice.vue'
import ModalDialog from '../../components/ModalDialog.vue'
import {
  CANCEL_REASONS, CFDI_USES, INVOICE_STATUS, TAX_REGIMES, invoiceActions, invoicesErrorText, receiverProblem,
} from '../../lib/invoices.js'
import { formatMoney } from '../../lib/money.js'
import { isoDate } from '../../lib/reports.js'
import { validReason } from '../../lib/personal.js'
import { useAction } from '../../lib/useAction.js'

const { calls, branchId, perms, today } = inject('invoices')

const rows = ref([])
const total = ref(0)
const page = ref(1)
const filters = reactive({ status: '', scope: '' })
const loading = ref(false)
const error = ref(null)
const pages = computed(() => Math.max(1, Math.ceil(total.value / 25)))

let seq = 0
async function load() {
  const mine = ++seq
  loading.value = true
  error.value = null
  try {
    const r = await calls.list(branchId(), { ...filters, page: page.value })
    if (mine !== seq) return
    rows.value = r.data
    total.value = r.meta?.pagination?.total ?? r.data.length
  } catch (e) {
    if (mine === seq) error.value = e
  } finally {
    if (mine === seq) loading.value = false
  }
}
watch(() => `${branchId()}|${filters.status}|${filters.scope}`, () => {
  page.value = 1
  load()
}, { immediate: true })
watch(page, load)

const { busy, error: actionError, notice, run } = useAction(load, invoicesErrorText)

function time(iso) {
  return iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : ''
}
function clock(iso) {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}
const emptyReceiver = () => ({ rfc: '', legalName: '', taxRegime: '616', postalCode: '', cfdiUse: 'G03' })

// ---------------------------------------------------------------- Diálogos
const dialog = ref(null)
function open(kind, inv = null) {
  notice.value = ''
  actionError.value = ''
  dialog.value = {
    kind,
    invoice: inv,
    receiver: inv?.receiver ? { ...inv.receiver } : emptyReceiver(),
    date: isoDate(today()),
    checks: [],
    checksLoading: false,
    checkId: '',
    reasonCode: '02',
    reason: '',
    replacementId: '',
  }
  if (kind === 'new') loadChecks()
}
function close() {
  if (!busy.value) dialog.value = null
}
async function loadChecks() {
  const d = dialog.value
  d.checksLoading = true
  try {
    d.checks = await calls.payableChecks(branchId(), d.date)
    d.checkId = d.checks[0]?.id ?? ''
  } catch (e) {
    actionError.value = invoicesErrorText(e)
  } finally {
    d.checksLoading = false
  }
}
const TITLES = { new: 'Facturar una cuenta', edit: 'Corregir datos del cliente', discard: 'Descartar borrador', stamp: 'Timbrar factura', cancel: 'Cancelar factura', detail: 'Factura' }

function normalizeReceiver(r) {
  return { rfc: r.rfc.trim().toUpperCase(), legalName: r.legalName.trim().toUpperCase(), taxRegime: r.taxRegime, postalCode: r.postalCode.trim(), cfdiUse: r.cfdiUse }
}
const formProblem = computed(() => {
  const d = dialog.value
  if (!d) return ''
  if (d.kind === 'new' && !d.checkId) return 'Elige la cuenta a facturar.'
  if (['new', 'edit'].includes(d.kind)) return receiverProblem(normalizeReceiver(d.receiver))
  if (d.kind === 'cancel' && d.reasonCode === '01' && !/^[0-9a-f-]{36}$/i.test(d.replacementId.trim())) return 'El motivo 01 necesita el id de la factura que la sustituye.'
  return ''
})
const canSubmit = computed(() => {
  const d = dialog.value
  if (!d || busy.value || d.kind === 'detail') return false
  if (d.kind === 'discard') return validReason(d.reason)
  if (d.kind === 'cancel') return validReason(d.reason) && !formProblem.value
  if (d.kind === 'stamp') return true
  return !formProblem.value
})

async function submit() {
  if (!canSubmit.value) return
  const d = dialog.value
  const b = branchId()
  let created = null
  const ok = await run(async () => {
    if (d.kind === 'new') created = (await calls.create(b, d.checkId, normalizeReceiver(d.receiver))).data
    else if (d.kind === 'edit') await calls.update(b, d.invoice, normalizeReceiver(d.receiver))
    else if (d.kind === 'discard') await calls.discard(b, d.invoice, d.reason)
    else if (d.kind === 'stamp') await calls.stamp(b, d.invoice)
    else await calls.cancel(b, d.invoice, d.reasonCode, d.reason, d.reasonCode === '01' ? d.replacementId.trim() : null)
  }, () => ({
    new: 'Se creó el borrador. Revísalo y timbra la factura.',
    edit: 'Se corrigieron los datos del cliente.',
    discard: 'Se descartó el borrador.',
    stamp: 'Se mandó a timbrar. En unos segundos aparece como timbrada; si el PAC la rechaza, verás el motivo.',
    cancel: 'Se solicitó la cancelación al SAT. El estado se actualiza cuando responda.',
  })[d.kind])
  if (!ok) return
  if (created) {
    // Recién creado: lo siguiente es timbrarlo.
    open('stamp', created)
    notice.value = 'Se creó el borrador. Revísalo y timbra la factura.'
  } else {
    dialog.value = null
  }
}

async function reconcile(inv) {
  notice.value = ''
  await run(() => calls.reconcile(branchId(), inv), 'Se pidió al PAC el estado real de la factura. Actualiza la lista en unos segundos.')
}

const fileUrl = (inv, kind) => calls.fileUrl(branchId(), inv, kind)
</script>

<template>
  <div>
    <div class="toolbar">
      <label>Estado
        <select v-model="filters.status" class="field">
          <option value="">Todas</option>
          <option v-for="(s, k) in INVOICE_STATUS" :key="k" :value="k">{{ s.label }}</option>
        </select>
      </label>
      <label>Tipo
        <select v-model="filters.scope" class="field">
          <option value="">Todas</option>
          <option value="NOMINATIVE">A un cliente</option>
          <option value="GLOBAL">Globales</option>
        </select>
      </label>
      <span class="count" aria-live="polite">{{ loading ? 'Cargando…' : `${total} facturas` }}</span>
      <button type="button" class="btn" :disabled="loading" @click="load">Actualizar</button>
      <button v-if="perms.create" type="button" class="btn btn-primary" @click="open('new')">Facturar una cuenta</button>
    </div>
    <p v-if="notice && !dialog" class="notice-ok" role="status">{{ notice }}</p>
    <p v-if="actionError && !dialog" class="form-error" role="alert">{{ actionError }}</p>
    <ErrorNotice :error="error" @retry="load" />

    <div v-if="!error" class="box">
      <table class="data-table">
        <thead><tr><th scope="col">Factura</th><th scope="col">Cliente</th><th scope="col" class="num">Total</th><th scope="col">Estado</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
        <tbody>
          <tr v-for="inv in rows" :key="inv.id">
            <td>
              <span class="cell-main">{{ inv.series || inv.folio ? `${inv.series ?? ''}${inv.folio ?? ''}` : 'Sin folio' }}<template v-if="inv.scope === 'GLOBAL'"> · global</template><template v-if="inv.type === 'EGRESO'"> · nota de crédito</template></span>
              <span class="cell-sub">{{ time(inv.stampedAt ?? inv.createdAt) }}</span>
            </td>
            <td><span class="cell-main">{{ inv.receiver?.legalName ?? 'Público en general' }}</span><span class="cell-sub">{{ inv.receiver?.rfc }}</span></td>
            <td class="num">{{ formatMoney(inv.total) }}</td>
            <td>
              <span class="pill" :class="INVOICE_STATUS[inv.status]?.tone">{{ INVOICE_STATUS[inv.status]?.label ?? inv.status }}</span>
              <span v-if="inv.creditNoteRequired" class="pill warn">Falta nota de crédito</span>
              <span v-if="inv.lastError && inv.status !== 'STAMPED'" class="cell-sub">{{ inv.lastError.message }}</span>
            </td>
            <td class="actions">
              <button type="button" class="btn" @click="open('detail', inv)">Ver</button>
              <button v-if="invoiceActions(inv, perms).stamp" type="button" class="btn" @click="open('stamp', inv)">Timbrar</button>
              <button v-if="invoiceActions(inv, perms).reconcile" type="button" class="btn" :disabled="busy" @click="reconcile(inv)">Consultar estado</button>
              <button v-if="invoiceActions(inv, perms).cancel" type="button" class="btn btn-danger" @click="open('cancel', inv)">Cancelar</button>
            </td>
          </tr>
          <tr v-if="!loading && !rows.length"><td colspan="5" class="empty-row">No hay facturas con estos filtros.</td></tr>
        </tbody>
      </table>
    </div>
    <nav v-if="pages > 1" class="pager" aria-label="Páginas">
      <button type="button" class="btn" :disabled="page === 1 || loading" @click="page--">Anterior</button>
      <span>Página {{ page }} de {{ pages }}</span>
      <button type="button" class="btn" :disabled="page === pages || loading" @click="page++">Siguiente</button>
    </nav>

    <ModalDialog v-if="dialog" :title="TITLES[dialog.kind]" :busy="busy" @close="close">
      <!-- Detalle -->
      <div v-if="dialog.kind === 'detail'" class="form">
        <dl class="sum">
          <dt>Estado</dt><dd>{{ INVOICE_STATUS[dialog.invoice.status]?.label }}</dd>
          <dt>Folio fiscal</dt><dd class="mono">{{ dialog.invoice.fiscalUuid ?? '—' }}</dd>
          <dt>Cliente</dt><dd>{{ dialog.invoice.receiver?.legalName ?? 'Público en general' }}</dd>
          <template v-if="dialog.invoice.receiver"><dt>RFC</dt><dd class="mono">{{ dialog.invoice.receiver.rfc }}</dd>
            <dt>Régimen</dt><dd>{{ dialog.invoice.receiver.taxRegime }} {{ TAX_REGIMES[dialog.invoice.receiver.taxRegime] ?? '' }}</dd>
            <dt>Uso</dt><dd>{{ dialog.invoice.receiver.cfdiUse }} {{ CFDI_USES[dialog.invoice.receiver.cfdiUse] ?? '' }}</dd></template>
          <dt>Forma de pago</dt><dd>{{ dialog.invoice.satPaymentForm ?? '—' }} · {{ dialog.invoice.satPaymentMethod }}</dd>
        </dl>
        <table class="data-table">
          <thead><tr><th scope="col">Concepto</th><th scope="col" class="num">Importe</th></tr></thead>
          <tbody>
            <tr v-for="(l, i) in dialog.invoice.lines" :key="i"><td>{{ l.quantity }} × {{ l.description }}</td><td class="num">{{ formatMoney(l.amount) }}</td></tr>
            <tr><td>Subtotal</td><td class="num">{{ formatMoney(dialog.invoice.subtotal) }}</td></tr>
            <tr><td>IVA</td><td class="num">{{ formatMoney(dialog.invoice.taxTotal) }}</td></tr>
            <tr><td><b>Total</b></td><td class="num"><b>{{ formatMoney(dialog.invoice.total) }}</b></td></tr>
          </tbody>
        </table>
        <p v-if="dialog.invoice.lastError" class="form-error">{{ dialog.invoice.lastError.message }}</p>
        <p v-if="dialog.invoice.cancellation" class="help">Cancelación: motivo {{ dialog.invoice.cancellation.reasonCode }} · {{ CANCEL_REASONS[dialog.invoice.cancellation.reasonCode] }}<template v-if="dialog.invoice.cancellation.satStatus"> · SAT: {{ dialog.invoice.cancellation.satStatus }}</template></p>
        <div class="form-buttons">
          <template v-if="invoiceActions(dialog.invoice, perms).files">
            <a class="btn" :href="fileUrl(dialog.invoice, 'pdf')" download>PDF</a>
            <a class="btn" :href="fileUrl(dialog.invoice, 'xml')" download>XML</a>
          </template>
          <button v-if="invoiceActions(dialog.invoice, perms).edit" type="button" class="btn" @click="open('edit', dialog.invoice)">Corregir cliente</button>
          <button v-if="invoiceActions(dialog.invoice, perms).discard" type="button" class="btn btn-danger" @click="open('discard', dialog.invoice)">Descartar</button>
          <button type="button" class="btn btn-primary" @click="close">Listo</button>
        </div>
      </div>

      <form v-else class="form" @submit.prevent="submit">
        <p v-if="notice" class="notice-ok" role="status">{{ notice }}</p>

        <template v-if="dialog.kind === 'new'">
          <div class="row">
            <label>Día de la cuenta<input v-model="dialog.date" class="field" type="date" :max="isoDate(today())" @change="loadChecks" /></label>
            <label>Cuenta pagada
              <select v-model="dialog.checkId" class="field" :disabled="dialog.checksLoading || !dialog.checks.length">
                <option v-for="c in dialog.checks" :key="c.id" :value="c.id">{{ c.paidAt ? `Pagada ${clock(c.paidAt)}` : `Cuenta ${c.number}` }} · {{ formatMoney(c.total) }}</option>
              </select>
            </label>
          </div>
          <p v-if="!dialog.checksLoading && !dialog.checks.length" class="help">No hay cuentas pagadas sin factura ese día.</p>
        </template>

        <template v-if="dialog.kind === 'new' || dialog.kind === 'edit'">
          <fieldset>
            <legend>Datos del cliente (de su constancia de situación fiscal)</legend>
            <div class="row">
              <label>RFC<input v-model="dialog.receiver.rfc" class="field mono" maxlength="13" autocomplete="off" /></label>
              <label>Código postal fiscal<input v-model="dialog.receiver.postalCode" class="field" maxlength="5" inputmode="numeric" autocomplete="off" /></label>
            </div>
            <label>Nombre o razón social<input v-model="dialog.receiver.legalName" class="field" maxlength="300" autocomplete="off" /></label>
            <div class="row">
              <label>Régimen fiscal
                <select v-model="dialog.receiver.taxRegime" class="field"><option v-for="(l, k) in TAX_REGIMES" :key="k" :value="String(k)">{{ k }} · {{ l }}</option></select>
              </label>
              <label>Uso del CFDI
                <select v-model="dialog.receiver.cfdiUse" class="field"><option v-for="(l, k) in CFDI_USES" :key="k" :value="k">{{ k }} · {{ l }}</option></select>
              </label>
            </div>
          </fieldset>
          <p v-if="formProblem" class="help" aria-live="polite">{{ formProblem }}</p>
        </template>

        <template v-else-if="dialog.kind === 'stamp'">
          <p class="help">Se manda al PAC para timbrar la factura de {{ dialog.invoice.receiver?.legalName }} por {{ formatMoney(dialog.invoice.total) }}. Ya timbrada no se puede editar: para corregirla hay que cancelarla y hacer otra.</p>
        </template>

        <template v-else-if="dialog.kind === 'discard'">
          <p class="help">El borrador se descarta y la cuenta queda libre para facturarse de nuevo.</p>
          <label>Motivo<textarea v-model="dialog.reason" class="field" rows="2" maxlength="500" /></label>
        </template>

        <template v-else-if="dialog.kind === 'cancel'">
          <p class="help">Se pide al SAT cancelar la factura {{ dialog.invoice.fiscalUuid }}. Si el cliente debe aceptarla, puede tardar.</p>
          <label>Motivo del SAT
            <select v-model="dialog.reasonCode" class="field"><option v-for="(l, k) in CANCEL_REASONS" :key="k" :value="k">{{ k }} · {{ l }}</option></select>
          </label>
          <label v-if="dialog.reasonCode === '01'">Id de la factura que la sustituye<input v-model="dialog.replacementId" class="field mono" autocomplete="off" /></label>
          <label>Explicación<textarea v-model="dialog.reason" class="field" rows="2" maxlength="500" /></label>
          <p v-if="formProblem" class="help" aria-live="polite">{{ formProblem }}</p>
        </template>

        <p v-if="actionError" class="form-error" role="alert">{{ actionError }}</p>
        <div class="form-buttons">
          <button type="button" class="btn" :disabled="busy" @click="close">{{ dialog.kind === 'stamp' && notice ? 'Después' : 'Volver' }}</button>
          <button type="submit" class="btn" :class="['cancel', 'discard'].includes(dialog.kind) ? 'btn-danger-solid' : 'btn-primary'" :disabled="!canSubmit">
            {{ busy ? 'Enviando…' : dialog.kind === 'stamp' ? 'Timbrar' : dialog.kind === 'new' ? 'Crear borrador' : 'Confirmar' }}
          </button>
        </div>
      </form>
    </ModalDialog>
  </div>
</template>

<style scoped>
.pager { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 14px; color: var(--muted); font-size: .9rem; }
.sum { display: grid; grid-template-columns: max-content 1fr; gap: 6px 14px; margin: 0; font-size: .9rem; }
.sum dt { color: var(--muted); }
.sum dd { margin: 0; overflow-wrap: anywhere; }
.mono { font-family: ui-monospace, monospace; }
a.btn { text-decoration: none; display: inline-flex; align-items: center; }
</style>
