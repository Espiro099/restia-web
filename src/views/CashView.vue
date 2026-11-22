<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useSession } from '../stores/session.js'
import ErrorNotice from '../components/ErrorNotice.vue'
import ModalDialog from '../components/ModalDialog.vue'
import { CODE_PATTERN, money as toMoney, normalizeCode } from '../lib/catalog.js'
import { METHOD_NAMES, MOVEMENT_TYPES, SHIFT_STATUS, cashApi, cashErrorText, differenceText, unresolvedCount } from '../lib/cash.js'
import { formatMoney } from '../lib/money.js'
import { validReason } from '../lib/personal.js'
import { useAction } from '../lib/useAction.js'

const props = defineProps({ api: { type: Object, default: null } })
const calls = props.api ?? cashApi()
const session = useSession()

const tab = ref('turnos')
const canManage = computed(() => session.canHere('cash.manage_registers'))
const canAmounts = computed(() => session.canHere('cash.read'))

const registers = ref([])
const people = ref(new Map())
const shifts = ref([])
const total = ref(0)
const page = ref(1)
const filters = reactive({ cashRegisterId: '', status: '', businessDate: '', reviewRequired: false })
const loading = ref(false)
const error = ref(null)
const registerName = computed(() => new Map(registers.value.map((r) => [r.id, r.name])))
const pages = computed(() => Math.max(1, Math.ceil(total.value / 25)))

let seq = 0
async function loadShifts() {
  const mine = ++seq
  loading.value = true
  error.value = null
  try {
    const r = await calls.shifts(session.branchId, { ...filters, page: page.value })
    if (mine !== seq) return
    shifts.value = r.data
    total.value = r.meta?.pagination?.total ?? r.data.length
  } catch (e) {
    if (mine === seq) error.value = e
  } finally {
    if (mine === seq) loading.value = false
  }
}
async function loadRegisters() {
  registers.value = await calls.registers(session.branchId)
}
async function loadAll() {
  try {
    const [, p] = await Promise.all([loadRegisters(), calls.people(session.branchId)])
    people.value = p
  } catch (e) {
    error.value = e
    return
  }
  await loadShifts()
}

watch(() => session.branchId, () => {
  page.value = 1
  Object.assign(filters, { cashRegisterId: '', status: '', businessDate: '', reviewRequired: false })
  loadAll()
}, { immediate: true })
watch(() => `${filters.cashRegisterId}|${filters.status}|${filters.businessDate}|${filters.reviewRequired}`, () => {
  page.value = 1
  loadShifts()
})
watch(page, loadShifts)

const { busy, error: actionError, notice, run } = useAction(loadRegisters, cashErrorText)

function time(iso) {
  return iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : ''
}
const who = (id) => (id ? people.value.get(id) ?? 'Alguien del personal' : '')

// ---------------------------------------------------------------- Detalle del turno
const detail = ref(null)
async function openDetail(s) {
  detail.value = { shift: s, summary: null, movements: [], error: '' }
  try {
    const [summary, movements] = await Promise.all([calls.summary(session.branchId, s), calls.movements(session.branchId, s)])
    if (detail.value?.shift !== s) return
    detail.value.summary = summary
    detail.value.movements = movements
  } catch (e) {
    if (detail.value?.shift === s) detail.value.error = cashErrorText(e)
  }
}

// ---------------------------------------------------------------- Cajas
const dialog = ref(null)
function open(kind, r = null) {
  notice.value = ''
  actionError.value = ''
  dialog.value = { kind, register: r, code: '', name: r?.name ?? '', tolerance: r?.differenceTolerance?.amount ?? '0.00', reason: '' }
}
function close() {
  if (!busy.value) dialog.value = null
}
const TITLES = { add: 'Nueva caja', edit: 'Editar caja', on: 'Activar caja', off: 'Desactivar caja' }

const formProblem = computed(() => {
  const d = dialog.value
  if (!d || !['add', 'edit'].includes(d.kind)) return ''
  if (d.kind === 'add' && !CODE_PATTERN.test(normalizeCode(d.code))) return 'El código lleva de 2 a 32 letras mayúsculas, números o guiones.'
  if (!d.name.trim()) return 'Falta el nombre.'
  if (!toMoney(d.tolerance)) return 'Revisa la tolerancia: un monto con hasta dos decimales.'
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
  const b = session.branchId
  const ok = await run(() => {
    if (d.kind === 'add') return calls.createRegister(b, { code: normalizeCode(d.code), name: d.name.trim(), differenceTolerance: toMoney(d.tolerance) })
    if (d.kind === 'edit') {
      const diff = {}
      if (d.name.trim() !== d.register.name) diff.name = d.name.trim()
      const tol = toMoney(d.tolerance)
      if (d.register.differenceTolerance && tol.amount !== Number(d.register.differenceTolerance.amount).toFixed(2)) diff.differenceTolerance = tol
      return Object.keys(diff).length ? calls.updateRegister(b, d.register, diff) : null
    }
    return calls.registerStatus(b, d.register, d.kind === 'on' ? 'ACTIVE' : 'INACTIVE', d.reason)
  }, () => ({
    add: `Se creó la caja ${d.name.trim()}.`,
    edit: `Se guardó ${d.name.trim()}.`,
    on: `${d.register?.name} está activa.`,
    off: `${d.register?.name} está inactiva: ya no se pueden abrir turnos en ella.`,
  })[d.kind])
  if (ok) dialog.value = null
}
</script>

<template>
  <section>
    <header class="mod-head">
      <div>
        <h1>Caja</h1>
        <p class="mod-lead">Turnos y cortes de {{ session.currentMembership?.branch?.name }}. Abrir, registrar entradas y salidas y cerrar se hace en la app, frente a la caja.</p>
      </div>
    </header>

    <div class="tabs" role="tablist" aria-label="Partes de caja">
      <button id="tab-turnos" type="button" role="tab" :aria-selected="tab === 'turnos'" aria-controls="panel-caja" @click="tab = 'turnos'">Turnos</button>
      <button id="tab-cajas" type="button" role="tab" :aria-selected="tab === 'cajas'" aria-controls="panel-caja" @click="tab = 'cajas'">Cajas</button>
    </div>

    <ErrorNotice :error="error" @retry="loadAll" />

    <div v-if="!error" id="panel-caja" role="tabpanel" :aria-labelledby="`tab-${tab}`">
      <template v-if="tab === 'turnos'">
        <div class="toolbar">
          <label>Caja
            <select v-model="filters.cashRegisterId" class="field">
              <option value="">Todas</option>
              <option v-for="r in registers" :key="r.id" :value="r.id">{{ r.name }}</option>
            </select>
          </label>
          <label>Estado
            <select v-model="filters.status" class="field">
              <option value="">Todos</option>
              <option v-for="(st, key) in SHIFT_STATUS" :key="key" :value="key">{{ st.label }}</option>
            </select>
          </label>
          <label>Día<input v-model="filters.businessDate" class="field" type="date" /></label>
          <label class="check"><input v-model="filters.reviewRequired" type="checkbox" /> Solo los que piden revisión</label>
          <span class="count" aria-live="polite">{{ loading ? 'Cargando…' : `${total} turnos` }}</span>
        </div>

        <div class="box">
          <table class="data-table">
            <thead><tr><th scope="col">Turno</th><th scope="col">Abrió</th><th scope="col">Cerró</th><th v-if="canAmounts" scope="col" class="num">Corte</th><th scope="col">Estado</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
            <tbody>
              <tr v-for="s in shifts" :key="s.id">
                <td><span class="cell-main">{{ registerName.get(s.cashRegisterId) ?? 'Caja' }}</span><span class="cell-sub">Día {{ s.businessDate }}</span></td>
                <td><span class="cell-main">{{ who(s.openedBy) }}</span><span class="cell-sub">{{ time(s.openedAt) }}</span></td>
                <td><template v-if="s.closedAt"><span class="cell-main">{{ who(s.closedBy) }}</span><span class="cell-sub">{{ time(s.closedAt) }}</span></template><span v-else class="cell-sub">—</span></td>
                <td v-if="canAmounts" class="num">
                  <template v-if="s.status === 'CLOSED'">
                    <span class="cell-main">{{ formatMoney(s.countedCash) }}</span>
                    <span class="cell-sub" :class="{ diff: s.difference && Number(s.difference.amount) !== 0 }">{{ differenceText(s.difference) }}</span>
                  </template>
                  <span v-else class="cell-sub">Fondo {{ formatMoney(s.openingAmount) }}</span>
                </td>
                <td>
                  <span class="pill" :class="SHIFT_STATUS[s.status]?.tone">{{ SHIFT_STATUS[s.status]?.label ?? s.status }}</span>
                  <span v-if="s.reviewRequired" class="pill warn">Revisar</span>
                </td>
                <td class="actions"><button v-if="canAmounts" type="button" class="btn" @click="openDetail(s)">Detalle</button></td>
              </tr>
              <tr v-if="!loading && !shifts.length"><td :colspan="canAmounts ? 6 : 5" class="empty-row">No hay turnos con estos filtros.</td></tr>
            </tbody>
          </table>
        </div>
        <nav v-if="pages > 1" class="pager" aria-label="Páginas">
          <button type="button" class="btn" :disabled="page === 1 || loading" @click="page--">Anterior</button>
          <span>Página {{ page }} de {{ pages }}</span>
          <button type="button" class="btn" :disabled="page === pages || loading" @click="page++">Siguiente</button>
        </nav>
      </template>

      <template v-else>
        <div class="toolbar">
          <p class="help">La tolerancia es la diferencia de efectivo que se acepta al cerrar sin marcar el turno para revisión.</p>
          <button v-if="canManage" type="button" class="btn btn-primary" @click="open('add')">Nueva caja</button>
        </div>
        <p v-if="notice && !dialog" class="notice-ok" role="status">{{ notice }}</p>
        <div class="box">
          <table class="data-table">
            <thead><tr><th scope="col">Caja</th><th v-if="canAmounts" scope="col" class="num">Tolerancia</th><th scope="col">Estado</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
            <tbody>
              <tr v-for="r in registers" :key="r.id">
                <td><span class="cell-main">{{ r.name }}</span><span class="cell-sub">{{ r.code }}</span></td>
                <td v-if="canAmounts" class="num">{{ r.differenceTolerance ? formatMoney(r.differenceTolerance) : '—' }}</td>
                <td><span class="pill" :class="{ muted: r.status !== 'ACTIVE' }">{{ r.status === 'ACTIVE' ? 'Activa' : 'Inactiva' }}</span></td>
                <td class="actions">
                  <template v-if="canManage">
                    <button type="button" class="btn" @click="open('edit', r)">Editar</button>
                    <button v-if="r.status === 'ACTIVE'" type="button" class="btn btn-danger" @click="open('off', r)">Desactivar</button>
                    <button v-else type="button" class="btn" @click="open('on', r)">Activar</button>
                  </template>
                </td>
              </tr>
              <tr v-if="!registers.length"><td colspan="4" class="empty-row">Todavía no hay cajas.</td></tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>

    <ModalDialog v-if="detail" :title="`${registerName.get(detail.shift.cashRegisterId) ?? 'Caja'} · día ${detail.shift.businessDate}`" @close="detail = null">
      <p v-if="detail.error" class="form-error" role="alert">{{ detail.error }}</p>
      <p v-else-if="!detail.summary" class="help">Cargando el turno…</p>
      <div v-else class="form">
        <p v-if="unresolvedCount(detail.summary)" class="pill warn">{{ unresolvedCount(detail.summary) }} cobros o reembolsos sin confirmar</p>
        <dl class="sum">
          <dt>Fondo inicial</dt><dd>{{ formatMoney(detail.summary.openingAmount) }}</dd>
          <dt>Entradas</dt><dd>{{ formatMoney(detail.summary.deposits) }}</dd>
          <dt>Salidas</dt><dd>{{ formatMoney(detail.summary.withdrawals) }}</dd>
          <dt>Efectivo esperado</dt><dd>{{ formatMoney(detail.summary.expectedCash) }}</dd>
          <template v-if="detail.summary.countedCash">
            <dt>Contado</dt><dd>{{ formatMoney(detail.summary.countedCash) }}</dd>
            <dt>Diferencia</dt><dd>{{ differenceText(detail.summary.difference) }}</dd>
          </template>
        </dl>
        <p v-if="detail.shift.differenceReason" class="help">Motivo de la diferencia: {{ detail.shift.differenceReason }}</p>
        <table class="data-table">
          <thead><tr><th scope="col">Método</th><th scope="col" class="num">Ventas</th><th scope="col" class="num">Propinas</th><th scope="col" class="num">Reembolsos</th></tr></thead>
          <tbody>
            <tr v-for="m in detail.summary.byMethod" :key="m.method">
              <td>{{ METHOD_NAMES[m.method] ?? m.method }}</td>
              <td class="num">{{ formatMoney(m.sales) }}</td>
              <td class="num">{{ formatMoney(m.tips) }}</td>
              <td class="num">{{ formatMoney(m.refunds) }}</td>
            </tr>
          </tbody>
        </table>
        <h3 class="sub">Entradas y salidas</h3>
        <ul v-if="detail.movements.length" class="moves">
          <li v-for="mv in detail.movements" :key="mv.id">
            <span>{{ MOVEMENT_TYPES[mv.type] ?? mv.type }} · {{ time(mv.createdAt) }}<span class="cell-sub">{{ mv.reason }} · {{ who(mv.createdBy) }}</span></span>
            <span class="num">{{ mv.type === 'WITHDRAWAL' ? '−' : '+' }}{{ formatMoney(mv.amount) }}</span>
          </li>
        </ul>
        <p v-else class="help">Sin entradas ni salidas de efectivo.</p>
      </div>
      <div class="form-buttons"><button type="button" class="btn btn-primary" @click="detail = null">Listo</button></div>
    </ModalDialog>

    <ModalDialog v-if="dialog" :title="TITLES[dialog.kind]" :busy="busy" @close="close">
      <form class="form" @submit.prevent="submit">
        <template v-if="dialog.kind === 'add' || dialog.kind === 'edit'">
          <div class="row">
            <label v-if="dialog.kind === 'add'">Código<input v-model="dialog.code" class="field" maxlength="32" placeholder="CAJA-1" autocomplete="off" /></label>
            <label>Nombre<input v-model="dialog.name" class="field" maxlength="120" placeholder="Caja principal" autocomplete="off" /></label>
          </div>
          <label>Tolerancia de diferencia (MXN)<input v-model="dialog.tolerance" class="field" inputmode="decimal" placeholder="0.00" /></label>
          <p class="help">Si al cerrar el efectivo contado difiere más que esto, el turno queda marcado para revisión.</p>
          <p v-if="formProblem" class="help" aria-live="polite">{{ formProblem }}</p>
        </template>
        <template v-else>
          <p v-if="dialog.kind === 'off'" class="help">En {{ dialog.register.name }} ya no se podrán abrir turnos. Si tiene uno abierto, primero hay que cerrarlo.</p>
          <p v-else class="help">{{ dialog.register.name }} volverá a aceptar turnos.</p>
          <label>Motivo<textarea v-model="dialog.reason" class="field" rows="3" maxlength="500" /></label>
        </template>
        <p v-if="actionError" class="form-error" role="alert">{{ actionError }}</p>
        <div class="form-buttons">
          <button type="button" class="btn" :disabled="busy" @click="close">Cancelar</button>
          <button type="submit" class="btn" :class="dialog.kind === 'off' ? 'btn-danger-solid' : 'btn-primary'" :disabled="!canSubmit">{{ busy ? 'Guardando…' : 'Guardar' }}</button>
        </div>
      </form>
    </ModalDialog>
  </section>
</template>

<style scoped>
.pager { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 14px; color: var(--muted); font-size: .9rem; }
.diff { color: var(--danger); font-weight: 600; }
.sum { display: grid; grid-template-columns: 1fr auto; gap: 6px 16px; margin: 0; font-size: .92rem; }
.sum dt { color: var(--muted); }
.sum dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
.sub { margin: 6px 0 0; font-size: .9rem; }
.moves { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; font-size: .9rem; }
.moves li { display: flex; justify-content: space-between; gap: 12px; }
.moves .cell-sub { display: block; }
</style>
