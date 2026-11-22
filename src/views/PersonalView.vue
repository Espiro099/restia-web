<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useSession } from '../stores/session.js'
import { ROLE_NAMES } from '../modules.js'
import ErrorNotice from '../components/ErrorNotice.vue'
import ModalDialog from '../components/ModalDialog.vue'
import {
  REASON_MAX, assignableRoles, canManageMember, memberStatus, personalApi, personalErrorText, validReason,
} from '../lib/personal.js'

const props = defineProps({ api: { type: Object, default: null } })
const calls = props.api ?? personalApi()
const session = useSession()

const PER_PAGE = 50
const rows = ref([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const error = ref(null)
const filters = reactive({ role: '', status: 'active' })
const notice = ref('')

const actorRole = computed(() => session.currentMembership?.role)
const canManage = computed(() => session.canHere('members.manage'))
const canManageUsers = computed(() => session.canHere('users.manage'))
const canRevokeSessions = computed(() => session.canHere('users.sessions.revoke'))
const roles = computed(() => assignableRoles(actorRole.value))
const pages = computed(() => Math.max(1, Math.ceil(total.value / PER_PAGE)))

let requestSeq = 0
async function load() {
  const seq = ++requestSeq
  loading.value = true
  error.value = null
  try {
    const active = filters.status === 'all' ? null : filters.status === 'active'
    const r = await calls.list(session.branchId, { role: filters.role || undefined, active, page: page.value, perPage: PER_PAGE })
    if (seq !== requestSeq) return
    rows.value = r.data
    total.value = r.meta?.pagination?.total ?? r.data.length
  } catch (e) {
    if (seq === requestSeq) error.value = e
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

watch(() => [session.branchId, filters.role, filters.status], () => {
  page.value = 1
  notice.value = ''
  load()
}, { immediate: true })
watch(page, load)

// --- Diálogos ---
const dialog = ref(null)
const busy = ref(false)
const dialogError = ref('')

function open(kind, member = null) {
  notice.value = ''
  dialogError.value = ''
  dialog.value = {
    kind,
    member,
    name: '',
    email: '',
    role: kind === 'role' ? member.role : (roles.value.includes('WAITER') ? 'WAITER' : roles.value[0]),
    reason: '',
    link: null,
  }
}

function close() {
  if (!busy.value) dialog.value = null
}

const TITLES = {
  add: 'Agregar empleado',
  role: 'Cambiar rol',
  revoke: 'Dar de baja de la sucursal',
  deactivate: 'Desactivar usuario',
  activate: 'Activar usuario',
  sessions: 'Cerrar sus sesiones',
  linkRequest: 'Generar enlace de contraseña',
  link: 'Enlace para definir contraseña',
}

const canSubmit = computed(() => {
  const d = dialog.value
  if (!d || busy.value) return false
  if (d.kind === 'add') return d.name.trim().length > 0 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email.trim()) && roles.value.includes(d.role)
  if (d.kind === 'role') return d.role !== d.member.role
  if (['revoke', 'deactivate', 'sessions'].includes(d.kind)) return validReason(d.reason)
  return true
})

async function submit() {
  if (!canSubmit.value) return
  const d = dialog.value
  const branchId = session.branchId
  busy.value = true
  dialogError.value = ''
  try {
    let message = ''
    if (d.kind === 'add') {
      const { data } = await calls.add(branchId, d)
      if (data.setupUrl) {
        // El enlace solo se muestra esta vez: el diálogo pasa a mostrarlo.
        d.kind = 'link'
        d.link = { url: data.setupUrl, expiresAt: data.setupExpiresAt, name: data.member.user.name }
      } else {
        message = `${data.member.user.name} ya tenía cuenta: se agregó a la sucursal con su contraseña actual.`
      }
    } else if (d.kind === 'role') {
      await calls.changeRole(branchId, d.member, d.role)
      message = `${d.member.user.name} ahora es ${ROLE_NAMES[d.role]}.`
    } else if (d.kind === 'revoke') {
      await calls.revoke(branchId, d.member, d.reason)
      message = `${d.member.user.name} ya no trabaja en esta sucursal. Sus sesiones se cerraron.`
    } else if (d.kind === 'deactivate') {
      await calls.deactivate(d.member.user, d.reason)
      message = `Se desactivó a ${d.member.user.name} en todas sus sucursales y se cerraron sus sesiones.`
    } else if (d.kind === 'activate') {
      await calls.activate(d.member.user)
      message = `${d.member.user.name} puede volver a entrar.`
    } else if (d.kind === 'sessions') {
      await calls.revokeSessions(d.member.user, d.reason)
      message = `Se cerraron las sesiones de ${d.member.user.name}.`
    } else if (d.kind === 'linkRequest') {
      const { data } = await calls.setupLink(d.member.user)
      d.kind = 'link'
      d.link = { url: data.setupUrl, expiresAt: data.expiresAt, name: d.member.user.name }
    }
    if (d.kind !== 'link') {
      dialog.value = null
      notice.value = message
    }
    await load()
  } catch (e) {
    dialogError.value = personalErrorText(e)
    if (e?.code === 'VERSION_CONFLICT') await load()
  } finally {
    busy.value = false
  }
}

const copied = ref(false)
async function copyLink() {
  try {
    await navigator.clipboard.writeText(dialog.value.link.url)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    copied.value = false
  }
}

function time(iso) {
  return iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : ''
}
</script>

<template>
  <section>
    <header class="head">
      <div>
        <h1>Personal</h1>
        <p class="lead">Quién trabaja en {{ session.currentMembership?.branch?.name }} y con qué rol.</p>
      </div>
      <button v-if="canManage && roles.length" type="button" class="primary" @click="open('add')">Agregar empleado</button>
    </header>

    <div class="filters">
      <label>
        Rol
        <select v-model="filters.role">
          <option value="">Todos</option>
          <option v-for="r in ['ADMIN', 'MANAGER', 'WAITER', 'KITCHEN']" :key="r" :value="r">{{ ROLE_NAMES[r] }}</option>
        </select>
      </label>
      <label>
        Estado
        <select v-model="filters.status">
          <option value="active">En la sucursal</option>
          <option value="revoked">Dados de baja</option>
          <option value="all">Todos</option>
        </select>
      </label>
      <span class="count" aria-live="polite">{{ loading ? 'Cargando…' : `${total} ${total === 1 ? 'persona' : 'personas'}` }}</span>
    </div>

    <p v-if="notice" class="ok" role="status">{{ notice }}</p>
    <ErrorNotice :error="error" @retry="load" />

    <div v-if="!error" class="table-wrap">
      <table>
        <thead>
          <tr><th scope="col">Nombre</th><th scope="col">Rol</th><th scope="col">Estado</th><th scope="col"><span class="sr">Acciones</span></th></tr>
        </thead>
        <tbody>
          <tr v-for="m in rows" :key="m.user.id">
            <td>
              <span class="name">{{ m.user.name }}<small v-if="m.user.id === session.user?.id"> (tú)</small></span>
              <span class="email">{{ m.user.email }}</span>
            </td>
            <td>{{ ROLE_NAMES[m.role] ?? m.role }}</td>
            <td><span class="pill" :class="memberStatus(m).key">{{ memberStatus(m).label }}</span></td>
            <td class="actions">
              <template v-if="canManageMember(actorRole, m, session.user?.id)">
                <button type="button" @click="open('role', m)">Cambiar rol</button>
                <button type="button" class="danger" @click="open('revoke', m)">Dar de baja</button>
              </template>
              <template v-if="canManageUsers && m.active && m.user.id !== session.user?.id">
                <button v-if="m.user.status !== 'INACTIVE'" type="button" @click="open('linkRequest', m)">Enlace de contraseña</button>
                <button v-if="m.user.status === 'INACTIVE'" type="button" @click="open('activate', m)">Activar</button>
                <button v-else type="button" class="danger" @click="open('deactivate', m)">Desactivar</button>
              </template>
              <button v-if="canRevokeSessions && m.active && m.user.id !== session.user?.id && m.user.status === 'ACTIVE'" type="button" @click="open('sessions', m)">Cerrar sesiones</button>
            </td>
          </tr>
          <tr v-if="!loading && !rows.length">
            <td colspan="4" class="empty">No hay personas con estos filtros.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <nav v-if="pages > 1" class="pager" aria-label="Páginas">
      <button type="button" :disabled="page === 1 || loading" @click="page--">Anterior</button>
      <span>Página {{ page }} de {{ pages }}</span>
      <button type="button" :disabled="page === pages || loading" @click="page++">Siguiente</button>
    </nav>

    <ModalDialog v-if="dialog" :title="TITLES[dialog.kind]" :busy="busy" @close="close">
      <form v-if="dialog.kind !== 'link'" class="form" @submit.prevent="submit">
        <template v-if="dialog.kind === 'add'">
          <label>Nombre<input v-model="dialog.name" maxlength="120" autocomplete="off" required /></label>
          <label>Correo<input v-model="dialog.email" type="email" maxlength="254" autocomplete="off" required /></label>
          <label>Rol
            <select v-model="dialog.role">
              <option v-for="r in roles" :key="r" :value="r">{{ ROLE_NAMES[r] }}</option>
            </select>
          </label>
          <p class="help">Si el correo es nuevo, verás un enlace para que defina su contraseña. Si ya tiene cuenta, entra con la que tiene.</p>
        </template>

        <template v-else-if="dialog.kind === 'role'">
          <p class="help">{{ dialog.member.user.name }} es {{ ROLE_NAMES[dialog.member.role] }}.<template v-if="dialog.role === 'ADMIN' || dialog.member.role === 'ADMIN'"> Cambiar a o desde administrador cierra sus sesiones.</template></p>
          <label>Nuevo rol
            <select v-model="dialog.role">
              <option v-for="r in roles" :key="r" :value="r">{{ ROLE_NAMES[r] }}</option>
            </select>
          </label>
        </template>

        <template v-else-if="dialog.kind === 'activate'">
          <p class="help">{{ dialog.member.user.name }} podrá volver a entrar en todas sus sucursales.</p>
        </template>

        <template v-else-if="dialog.kind === 'linkRequest'">
          <p class="help">Sirve para que {{ dialog.member.user.name }} defina una contraseña nueva. Al generarlo se cierran todas sus sesiones, en la app y en el panel, y cualquier enlace anterior deja de servir.</p>
        </template>

        <template v-else>
          <p class="help" v-if="dialog.kind === 'revoke'">{{ dialog.member.user.name }} dejará de trabajar en esta sucursal y se cerrarán sus sesiones. Sus registros se conservan; puedes volver a agregarlo después.</p>
          <p class="help" v-if="dialog.kind === 'deactivate'">{{ dialog.member.user.name }} no podrá entrar en ninguna sucursal y se cerrarán todas sus sesiones. Se puede volver a activar.</p>
          <p class="help" v-if="dialog.kind === 'sessions'">{{ dialog.member.user.name }} tendrá que volver a entrar en la app y en el panel.</p>
          <label>Motivo<textarea v-model="dialog.reason" rows="3" :maxlength="REASON_MAX" required /></label>
        </template>

        <p v-if="dialogError" class="error" role="alert">{{ dialogError }}</p>
        <div class="buttons">
          <button type="button" :disabled="busy" @click="close">Cancelar</button>
          <button type="submit" :class="['revoke', 'deactivate'].includes(dialog.kind) ? 'danger-solid' : 'primary'" :disabled="!canSubmit">
            {{ busy ? 'Guardando…' : 'Confirmar' }}
          </button>
        </div>
      </form>

      <div v-else class="form">
        <p class="help">Compártelo con {{ dialog.link.name }} por un canal privado. Sirve una sola vez (vence el {{ time(dialog.link.expiresAt) }}). Por seguridad no se vuelve a mostrar: si se pierde, genera otro.</p>
        <input class="link" :value="dialog.link.url" readonly aria-label="Enlace para definir contraseña" @focus="$event.target.select()" />
        <div class="buttons">
          <button type="button" @click="copyLink">{{ copied ? 'Copiado' : 'Copiar enlace' }}</button>
          <button type="button" class="primary" @click="close">Listo</button>
        </div>
      </div>
    </ModalDialog>
  </section>
</template>

<style scoped>
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
h1 { margin: 0 0 4px; font-size: 1.6rem; }
.lead { margin: 0 0 18px; color: var(--muted); }
.filters { display: flex; align-items: end; gap: 14px; flex-wrap: wrap; margin-bottom: 14px; }
.filters label, .form label { display: grid; gap: 6px; font-size: .85rem; color: var(--muted); }
select, input, textarea { font: inherit; color: var(--text); padding: 8px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); }
textarea { resize: vertical; }
select:focus-visible, input:focus-visible, textarea:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.count { color: var(--muted); font-size: .85rem; margin-left: auto; }
.ok { background: #e6f4ea; color: var(--ok); padding: 10px 14px; border-radius: 10px; margin: 0 0 14px; }
.table-wrap { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: .92rem; }
th { text-align: left; font-size: .75rem; text-transform: uppercase; letter-spacing: .5px; color: var(--muted); padding: 12px 14px; border-bottom: 1px solid var(--line); }
td { padding: 12px 14px; border-bottom: 1px solid var(--line); vertical-align: top; }
tr:last-child td { border-bottom: 0; }
.name { display: block; font-weight: 600; }
.name small { color: var(--muted); font-weight: 400; }
.email { display: block; color: var(--muted); font-size: .85rem; overflow-wrap: anywhere; }
.pill { display: inline-block; font-size: .78rem; font-weight: 600; padding: 3px 9px; border-radius: 999px; background: #e6f4ea; color: var(--ok); white-space: nowrap; }
.pill.invited { background: var(--accent-soft); color: var(--accent); }
.pill.inactive, .pill.revoked { background: var(--bg); color: var(--muted); }
.actions { text-align: right; }
.actions button { margin: 0 0 6px 6px; }
.empty { text-align: center; color: var(--muted); padding: 28px; }
button { font: inherit; font-size: .85rem; padding: 6px 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--text); cursor: pointer; white-space: nowrap; }
button:disabled { opacity: .5; cursor: not-allowed; }
button.primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; padding: 9px 16px; }
button.danger { color: var(--danger); }
button.danger-solid { background: var(--danger); border-color: var(--danger); color: #fff; font-weight: 600; padding: 9px 16px; }
.pager { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 14px; color: var(--muted); font-size: .9rem; }
.form { display: grid; gap: 12px; }
.help { margin: 0; color: var(--muted); font-size: .9rem; line-height: 1.45; }
.error { margin: 0; color: var(--danger); font-size: .9rem; }
.buttons { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.link { width: 100%; font-family: ui-monospace, monospace; font-size: .82rem; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

@media (max-width: 640px) {
  thead { display: none; }
  table, tbody, tr, td { display: block; width: 100%; }
  tr { border-bottom: 1px solid var(--line); padding: 8px 0; }
  td { border: 0; padding: 4px 14px; }
  .actions { text-align: left; }
  .actions button { margin: 4px 6px 0 0; }
}
</style>
