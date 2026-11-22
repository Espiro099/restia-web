<script setup>
import { computed, ref, watch } from 'vue'
import { useSession } from '../stores/session.js'
import ErrorNotice from '../components/ErrorNotice.vue'
import ModalDialog from '../components/ModalDialog.vue'
import { customersApi, customersErrorText, normalizePhone, phoneText, searchQuery, splitPreferences } from '../lib/customers.js'
import { validReason } from '../lib/personal.js'
import { useAction } from '../lib/useAction.js'

// Clientes: la API no lista a todos (son datos personales); se buscan por teléfono o nombre.
const props = defineProps({ api: { type: Object, default: null } })
const calls = props.api ?? customersApi()
const session = useSession()

const canCreate = computed(() => session.canHere('customers.create'))
const canUpdate = computed(() => session.canHere('customers.update'))
const canAnonymize = computed(() => session.canHere('customers.anonymize'))

const text = ref('')
const lastQuery = ref(null)
const rows = ref([])
const total = ref(0)
const page = ref(1)
const searching = ref(false)
const error = ref(null)
const pages = computed(() => Math.max(1, Math.ceil(total.value / 25)))
const query = computed(() => searchQuery(text.value))

async function search(p = 1) {
  if (!query.value) return
  searching.value = true
  error.value = null
  page.value = p
  lastQuery.value = query.value
  try {
    const r = await calls.search(session.branchId, query.value, p)
    rows.value = r.data
    total.value = r.meta?.pagination?.total ?? r.data.length
  } catch (e) {
    error.value = e
  } finally {
    searching.value = false
  }
}
async function reload() {
  if (lastQuery.value) {
    const r = await calls.search(session.branchId, lastQuery.value, page.value)
    rows.value = r.data
    total.value = r.meta?.pagination?.total ?? r.data.length
  }
}
watch(() => session.branchId, () => {
  rows.value = []
  lastQuery.value = null
  text.value = ''
})

const { busy, error: actionError, notice, run } = useAction(reload, customersErrorText)

const dialog = ref(null)
function open(kind, c = null) {
  notice.value = ''
  actionError.value = ''
  dialog.value = {
    kind,
    customer: c,
    name: c?.name ?? (kind === 'add' && query.value?.name ? query.value.name : ''),
    phone: c ? phoneText(c.phone) : (query.value?.phone ? phoneText(query.value.phone) : ''),
    email: c?.email ?? '',
    notes: c?.profile?.notes ?? '',
    preferences: (c?.profile?.preferences ?? []).join(', '),
    reason: '',
  }
}
function close() {
  if (!busy.value) dialog.value = null
}
const TITLES = { add: 'Registrar cliente', edit: 'Editar cliente', anonymize: 'Anonimizar cliente' }

const formProblem = computed(() => {
  const d = dialog.value
  if (!d || d.kind === 'anonymize') return ''
  if (!d.name.trim()) return 'Falta el nombre.'
  if (!normalizePhone(d.phone)) return 'Escribe el teléfono a 10 dígitos, o con + y lada de país.'
  if (d.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email.trim())) return 'Revisa el correo.'
  return ''
})
const canSubmit = computed(() => {
  const d = dialog.value
  if (!d || busy.value) return false
  if (d.kind === 'anonymize') return validReason(d.reason)
  return !formProblem.value
})

function fields(d) {
  return {
    name: d.name.trim(),
    phone: normalizePhone(d.phone),
    ...(d.email.trim() ? { email: d.email.trim() } : {}),
    notes: d.notes.trim() || null,
    preferences: splitPreferences(d.preferences),
  }
}

async function submit() {
  if (!canSubmit.value) return
  const d = dialog.value
  const b = session.branchId
  let created = null
  const ok = await run(async () => {
    if (d.kind === 'add') {
      created = (await calls.create(b, fields(d))).data
    } else if (d.kind === 'edit') {
      const c = d.customer
      const next = fields(d)
      const diff = {}
      if (next.name !== c.name) diff.name = next.name
      if (next.phone !== c.phone) diff.phone = next.phone
      if ((next.email ?? null) !== (c.email ?? null) && next.email) diff.email = next.email
      if (next.notes !== (c.profile?.notes ?? null)) diff.notes = next.notes
      if (JSON.stringify(next.preferences) !== JSON.stringify(c.profile?.preferences ?? [])) diff.preferences = next.preferences
      if (Object.keys(diff).length) await calls.update(b, c, diff)
    } else {
      await calls.anonymize(b, d.customer, d.reason)
    }
  }, () => ({
    add: `Se registró a ${d.name.trim()}.`,
    edit: `Se guardó a ${d.name.trim()}.`,
    anonymize: 'Se borraron los datos personales del cliente. Sus visitas quedan en los reportes sin nombre.',
  })[d.kind])
  if (!ok) return
  dialog.value = null
  // Recién registrado: se muestra como resultado para poder seguir con él.
  if (created) {
    rows.value = [created]
    total.value = 1
    lastQuery.value = { phone: created.phone }
  }
}

function date(iso) {
  return iso ? new Date(iso).toLocaleDateString('es-MX', { dateStyle: 'medium' }) : 'Sin visitas'
}
</script>

<template>
  <section>
    <header class="mod-head">
      <div>
        <h1>Clientes</h1>
        <p class="mod-lead">Busca a un cliente por teléfono o por nombre. Sus visitas y preferencias son de {{ session.currentMembership?.branch?.name }}.</p>
      </div>
      <button v-if="canCreate" type="button" class="btn btn-primary" @click="open('add')">Registrar cliente</button>
    </header>

    <form class="toolbar" role="search" @submit.prevent="search(1)">
      <label class="grow">Teléfono o nombre<input v-model="text" class="field" type="search" placeholder="33 1234 5678 o Ana López" autocomplete="off" /></label>
      <button type="submit" class="btn btn-primary" :disabled="!query || searching">{{ searching ? 'Buscando…' : 'Buscar' }}</button>
    </form>
    <p v-if="notice && !dialog" class="notice-ok" role="status">{{ notice }}</p>
    <ErrorNotice :error="error" @retry="search(page)" />

    <div v-if="lastQuery && !error" class="box">
      <table class="data-table">
        <thead><tr><th scope="col">Cliente</th><th scope="col">Visitas</th><th scope="col">Preferencias</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
        <tbody>
          <tr v-for="c in rows" :key="c.id">
            <td>
              <span class="cell-main">{{ c.anonymized ? 'Cliente anonimizado' : c.name }}</span>
              <span v-if="!c.anonymized" class="cell-sub">{{ phoneText(c.phone) }}<template v-if="c.email"> · {{ c.email }}</template></span>
            </td>
            <td><span class="cell-main">{{ c.profile?.visitCount ?? 0 }} {{ (c.profile?.visitCount ?? 0) === 1 ? 'visita' : 'visitas' }}</span><span class="cell-sub">Última: {{ date(c.profile?.lastVisitAt) }}</span></td>
            <td>
              <span v-for="p in c.profile?.preferences ?? []" :key="p" class="pill accent">{{ p }}</span>
              <span v-if="c.profile?.notes" class="cell-sub">{{ c.profile.notes }}</span>
            </td>
            <td class="actions">
              <template v-if="!c.anonymized">
                <button v-if="canUpdate" type="button" class="btn" @click="open('edit', c)">Editar</button>
                <button v-if="canAnonymize" type="button" class="btn btn-danger" @click="open('anonymize', c)">Anonimizar</button>
              </template>
            </td>
          </tr>
          <tr v-if="!searching && !rows.length">
            <td colspan="4" class="empty-row">
              No hay clientes con esa búsqueda.
              <button v-if="canCreate" type="button" class="btn" @click="open('add')">Registrarlo</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else-if="!error" class="help">Los datos de los clientes no se listan completos: escribe al menos dos letras del nombre o el teléfono.</p>

    <nav v-if="pages > 1" class="pager" aria-label="Páginas">
      <button type="button" class="btn" :disabled="page === 1 || searching" @click="search(page - 1)">Anterior</button>
      <span>Página {{ page }} de {{ pages }}</span>
      <button type="button" class="btn" :disabled="page === pages || searching" @click="search(page + 1)">Siguiente</button>
    </nav>

    <ModalDialog v-if="dialog" :title="TITLES[dialog.kind]" :busy="busy" @close="close">
      <form class="form" @submit.prevent="submit">
        <template v-if="dialog.kind !== 'anonymize'">
          <label>Nombre<input v-model="dialog.name" class="field" maxlength="120" autocomplete="off" /></label>
          <div class="row">
            <label>Teléfono<input v-model="dialog.phone" class="field" type="tel" placeholder="33 1234 5678" autocomplete="off" /></label>
            <label>Correo (opcional)<input v-model="dialog.email" class="field" type="email" maxlength="254" autocomplete="off" /></label>
          </div>
          <label>Preferencias (separadas por coma)<input v-model="dialog.preferences" class="field" placeholder="mesa junto a la ventana, sin cebolla" autocomplete="off" /></label>
          <label>Notas<textarea v-model="dialog.notes" class="field" rows="2" maxlength="500" /></label>
          <p v-if="formProblem" class="help" aria-live="polite">{{ formProblem }}</p>
        </template>
        <template v-else>
          <p class="help">Se borran para siempre el nombre, el teléfono, el correo, las notas y las preferencias de {{ dialog.customer.name }}. Sus visitas y consumos quedan en los reportes sin datos personales. <b>No se puede deshacer.</b></p>
          <label>Motivo<textarea v-model="dialog.reason" class="field" rows="3" maxlength="500" placeholder="El cliente pidió borrar sus datos" /></label>
        </template>
        <p v-if="actionError" class="form-error" role="alert">{{ actionError }}</p>
        <div class="form-buttons">
          <button type="button" class="btn" :disabled="busy" @click="close">Cancelar</button>
          <button type="submit" class="btn" :class="dialog.kind === 'anonymize' ? 'btn-danger-solid' : 'btn-primary'" :disabled="!canSubmit">
            {{ busy ? 'Guardando…' : dialog.kind === 'anonymize' ? 'Borrar sus datos' : 'Guardar' }}
          </button>
        </div>
      </form>
    </ModalDialog>
  </section>
</template>

<style scoped>
.grow { flex: 1; min-width: 220px; }
.pager { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 14px; color: var(--muted); font-size: .9rem; }
.empty-row .btn { margin-left: 8px; }
</style>
