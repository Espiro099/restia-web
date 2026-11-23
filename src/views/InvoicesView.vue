<script setup>
import { computed, provide, ref } from 'vue'
import { useSession } from '../stores/session.js'
import { invoicesApi } from '../lib/invoices.js'
import InvoiceList from './invoices/InvoiceList.vue'
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
  issuers: session.canHere('fiscal.manage_issuers'),
}))
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

    <div v-if="perms.issuers" class="tabs" role="tablist" aria-label="Partes de facturación">
      <button id="tab-facturas" type="button" role="tab" :aria-selected="tab === 'facturas'" aria-controls="panel-facturacion" @click="tab = 'facturas'">Facturas</button>
      <button id="tab-emisores" type="button" role="tab" :aria-selected="tab === 'emisores'" aria-controls="panel-facturacion" @click="tab = 'emisores'">Emisores</button>
    </div>

    <div id="panel-facturacion" :role="perms.issuers ? 'tabpanel' : undefined" :aria-labelledby="perms.issuers ? `tab-${tab}` : undefined">
      <InvoiceList v-if="tab === 'facturas'" />
      <IssuerList v-else />
    </div>
  </section>
</template>
