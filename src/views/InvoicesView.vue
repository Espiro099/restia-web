<script setup>
import { computed, provide, ref } from 'vue'
import { useSession } from '../stores/session.js'
import { invoicesApi } from '../lib/invoices.js'
import InvoiceList from './invoices/InvoiceList.vue'
import GlobalInvoices from './invoices/GlobalInvoices.vue'
import IssuerList from './invoices/IssuerList.vue'

const props = defineProps({
  api: { type: Object, default: null },
  today: { type: Function, default: () => new Date() },
})
const calls = props.api ?? invoicesApi()
const session = useSession()

const perms = computed(() => ({
  create: session.canHere('invoices.create'),
  stamp: session.canHere('invoices.stamp'),
  cancel: session.canHere('invoices.cancel'),
  reconcile: session.canHere('invoices.reconcile'),
  global: session.canHere('invoices.global'),
  issuers: session.canHere('fiscal.manage_issuers'),
}))
const tabs = computed(() => [
  { key: 'facturas', label: 'Facturas' },
  ...(perms.value.global ? [{ key: 'global', label: 'Factura global' }] : []),
  ...(perms.value.issuers ? [{ key: 'emisores', label: 'Emisores' }] : []),
])
const tab = ref('facturas')

provide('invoices', { calls, branchId: () => session.branchId, perms, today: props.today })
</script>

<template>
  <section>
    <header class="mod-head">
      <div>
        <h1>Facturación</h1>
        <p class="mod-lead">Facturas CFDI 4.0 de {{ session.currentMembership?.branch?.name }}: se crean desde una cuenta pagada, se timbran con el PAC y se cancelan con un motivo del SAT.</p>
      </div>
    </header>

    <div v-if="tabs.length > 1" class="tabs" role="tablist" aria-label="Partes de facturación">
      <button v-for="t in tabs" :id="`tab-${t.key}`" :key="t.key" type="button" role="tab" :aria-selected="tab === t.key" aria-controls="panel-facturacion" @click="tab = t.key">{{ t.label }}</button>
    </div>

    <div id="panel-facturacion" :role="tabs.length > 1 ? 'tabpanel' : undefined" :aria-labelledby="tabs.length > 1 ? `tab-${tab}` : undefined">
      <InvoiceList v-if="tab === 'facturas'" />
      <GlobalInvoices v-else-if="tab === 'global'" />
      <IssuerList v-else />
    </div>
  </section>
</template>
