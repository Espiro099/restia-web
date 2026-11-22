<script setup>
import { computed, inject, ref } from 'vue'
import ErrorNotice from '../../components/ErrorNotice.vue'
import ModalDialog from '../../components/ModalDialog.vue'
import { PERIODICITIES, RFC_PATTERN, TAX_REGIMES, invoicesErrorText } from '../../lib/invoices.js'
import { validReason } from '../../lib/personal.js'
import { useAction } from '../../lib/useAction.js'

// Emisores fiscales (F-12, F-13): catálogo global de la empresa, solo administración. El CSD (certificado,
// llave y su contraseña) va directo a la API, que lo guarda cifrado; aquí no se conserva nada.
const { calls, branchId } = inject('invoices')

const issuers = ref([])
const loaded = ref(false)
const error = ref(null)
async function load() {
  error.value = null
  try {
    issuers.value = await calls.issuers()
    loaded.value = true
  } catch (e) {
    error.value = e
  }
}
load()

const { busy, error: actionError, notice, run } = useAction(load, invoicesErrorText)

const dialog = ref(null)
function open(kind, iss = null) {
  notice.value = ''
  actionError.value = ''
  dialog.value = {
    kind,
    issuer: iss,
    rfc: iss?.rfc ?? '',
    legalName: iss?.legalName ?? '',
    taxRegime: iss?.taxRegime ?? '601',
    postalCode: iss?.postalCode ?? '',
    globalPeriodicity: iss?.globalPeriodicity ?? 'MONTHLY',
    certificate: null,
    privateKey: null,
    password: '',
    reason: '',
  }
}
function close() {
  if (busy.value) return
  // La contraseña del CSD no se queda en memoria.
  if (dialog.value) dialog.value.password = ''
  dialog.value = null
}
const TITLES = { add: 'Nuevo emisor', edit: 'Editar emisor', csd: 'Subir el CSD', on: 'Activar emisor', off: 'Desactivar emisor', assign: 'Usar en esta sucursal' }

const formProblem = computed(() => {
  const d = dialog.value
  if (!d) return ''
  if (d.kind === 'add' && !RFC_PATTERN.test(d.rfc.trim().toUpperCase())) return 'Revisa el RFC: 12 o 13 caracteres.'
  if (['add', 'edit'].includes(d.kind)) {
    if (!d.legalName.trim()) return 'Falta la razón social, tal como aparece en la constancia fiscal.'
    if (!/^[0-9]{5}$/.test(d.postalCode.trim())) return 'El código postal fiscal lleva 5 dígitos.'
  }
  if (d.kind === 'csd') {
    if (!d.certificate || !/\.cer$/i.test(d.certificate.name)) return 'Elige el archivo .cer del CSD.'
    if (!d.privateKey || !/\.key$/i.test(d.privateKey.name)) return 'Elige el archivo .key del CSD.'
    if (!d.password) return 'Escribe la contraseña de la llave.'
  }
  return ''
})
const canSubmit = computed(() => {
  const d = dialog.value
  if (!d || busy.value) return false
  if (d.kind === 'on' || d.kind === 'off') return validReason(d.reason)
  return !formProblem.value
})

async function submit() {
  if (!canSubmit.value) return
  const d = dialog.value
  const fields = { legalName: d.legalName.trim().toUpperCase(), taxRegime: d.taxRegime, postalCode: d.postalCode.trim(), globalPeriodicity: d.globalPeriodicity }
  const ok = await run(async () => {
    if (d.kind === 'add') await calls.createIssuer({ rfc: d.rfc.trim().toUpperCase(), ...fields })
    else if (d.kind === 'edit') {
      const diff = Object.fromEntries(Object.entries(fields).filter(([k, v]) => d.issuer[k] !== v))
      if (Object.keys(diff).length) await calls.updateIssuer(d.issuer, diff)
    } else if (d.kind === 'csd') {
      try {
        await calls.uploadCsd(d.issuer, d.certificate, d.privateKey, d.password)
      } finally {
        d.password = ''
      }
    } else if (d.kind === 'assign') await calls.assignToBranch(branchId(), d.issuer.id)
    else await calls.issuerStatus(d.issuer, d.kind === 'on' ? 'ACTIVE' : 'INACTIVE', d.reason)
  }, () => ({
    add: 'Se creó el emisor. Sube su CSD para poder timbrar.',
    edit: 'Se guardó el emisor.',
    csd: 'Se guardó el CSD. Ya se puede timbrar con este emisor.',
    assign: `Las facturas de esta sucursal saldrán a nombre de ${d.issuer?.legalName}.`,
    on: `${d.issuer?.legalName} está activo.`,
    off: `${d.issuer?.legalName} está inactivo: no se puede timbrar con él.`,
  })[d.kind])
  if (ok) dialog.value = null
}

function pick(field, event) {
  dialog.value[field] = event.target.files?.[0] ?? null
}
function date(iso) {
  return iso ? new Date(iso).toLocaleDateString('es-MX', { dateStyle: 'medium' }) : ''
}
</script>

<template>
  <div>
    <div class="toolbar">
      <p class="help">Los emisores son las razones sociales a cuyo nombre se factura. Cada sucursal usa uno, con su certificado de sello digital (CSD) vigente.</p>
      <button type="button" class="btn btn-primary" @click="open('add')">Nuevo emisor</button>
    </div>
    <p v-if="notice && !dialog" class="notice-ok" role="status">{{ notice }}</p>
    <ErrorNotice :error="error" @retry="load" />
    <p v-if="!loaded && !error" class="help">Cargando emisores…</p>

    <div v-if="loaded" class="box">
      <table class="data-table">
        <thead><tr><th scope="col">Emisor</th><th scope="col">CSD</th><th scope="col">Estado</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
        <tbody>
          <tr v-for="iss in issuers" :key="iss.id">
            <td>
              <span class="cell-main">{{ iss.legalName }}</span>
              <span class="cell-sub">{{ iss.rfc }} · régimen {{ iss.taxRegime }} · CP {{ iss.postalCode }} · global {{ PERIODICITIES[iss.globalPeriodicity]?.toLowerCase() }}</span>
            </td>
            <td>
              <template v-if="iss.csd"><span class="cell-main">Vence {{ date(iss.csd.validUntil) }}</span><span class="cell-sub">Serie {{ iss.csd.serial }}</span></template>
              <span v-else class="pill warn">Sin CSD</span>
            </td>
            <td><span class="pill" :class="{ muted: iss.status !== 'ACTIVE' }">{{ iss.status === 'ACTIVE' ? 'Activo' : 'Inactivo' }}</span></td>
            <td class="actions">
              <button v-if="iss.status === 'ACTIVE' && iss.csd" type="button" class="btn" @click="open('assign', iss)">Usar en esta sucursal</button>
              <button type="button" class="btn" @click="open('csd', iss)">{{ iss.csd ? 'Cambiar CSD' : 'Subir CSD' }}</button>
              <button type="button" class="btn" @click="open('edit', iss)">Editar</button>
              <button v-if="iss.status === 'ACTIVE'" type="button" class="btn btn-danger" @click="open('off', iss)">Desactivar</button>
              <button v-else type="button" class="btn" @click="open('on', iss)">Activar</button>
            </td>
          </tr>
          <tr v-if="!issuers.length"><td colspan="4" class="empty-row">Todavía no hay emisores: sin uno no se puede facturar.</td></tr>
        </tbody>
      </table>
    </div>

    <ModalDialog v-if="dialog" :title="TITLES[dialog.kind]" :busy="busy" @close="close">
      <form class="form" autocomplete="off" @submit.prevent="submit">
        <template v-if="dialog.kind === 'add' || dialog.kind === 'edit'">
          <div class="row">
            <label v-if="dialog.kind === 'add'">RFC<input v-model="dialog.rfc" class="field" maxlength="13" /></label>
            <label>Código postal fiscal<input v-model="dialog.postalCode" class="field" maxlength="5" inputmode="numeric" /></label>
          </div>
          <label>Razón social<input v-model="dialog.legalName" class="field" maxlength="300" /></label>
          <div class="row">
            <label>Régimen fiscal
              <select v-model="dialog.taxRegime" class="field"><option v-for="(l, k) in TAX_REGIMES" :key="k" :value="String(k)">{{ k }} · {{ l }}</option></select>
            </label>
            <label>Factura global
              <select v-model="dialog.globalPeriodicity" class="field"><option v-for="(l, k) in PERIODICITIES" :key="k" :value="k">{{ l }}</option></select>
            </label>
          </div>
        </template>

        <template v-else-if="dialog.kind === 'csd'">
          <p class="help">El CSD de {{ dialog.issuer.legalName }} lo descarga el contribuyente del portal del SAT: un archivo .cer, uno .key y la contraseña de la llave. Se manda cifrado a la API y no se guarda en este navegador.</p>
          <label>Certificado (.cer)<input class="field" type="file" accept=".cer" @change="pick('certificate', $event)" /></label>
          <label>Llave privada (.key)<input class="field" type="file" accept=".key" @change="pick('privateKey', $event)" /></label>
          <label>Contraseña de la llave<input v-model="dialog.password" class="field" type="password" autocomplete="new-password" maxlength="256" /></label>
        </template>

        <p v-else-if="dialog.kind === 'assign'" class="help">Las facturas nuevas de esta sucursal saldrán a nombre de {{ dialog.issuer.legalName }} ({{ dialog.issuer.rfc }}). Las ya timbradas no cambian.</p>

        <template v-else>
          <p v-if="dialog.kind === 'off'" class="help">No se podrá timbrar con {{ dialog.issuer.legalName }} en ninguna sucursal que lo use.</p>
          <p v-else class="help">Se podrá volver a timbrar con {{ dialog.issuer.legalName }}.</p>
          <label>Motivo<textarea v-model="dialog.reason" class="field" rows="2" maxlength="500" /></label>
        </template>

        <p v-if="formProblem && dialog.kind !== 'assign'" class="help" aria-live="polite">{{ formProblem }}</p>
        <p v-if="actionError" class="form-error" role="alert">{{ actionError }}</p>
        <div class="form-buttons">
          <button type="button" class="btn" :disabled="busy" @click="close">Cancelar</button>
          <button type="submit" class="btn" :class="dialog.kind === 'off' ? 'btn-danger-solid' : 'btn-primary'" :disabled="!canSubmit">{{ busy ? 'Guardando…' : 'Guardar' }}</button>
        </div>
      </form>
    </ModalDialog>
  </div>
</template>
