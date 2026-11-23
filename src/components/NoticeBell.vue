<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useSession } from '../stores/session.js'
import { badgeText, noticeAge, noticeTarget, notificationsApi, POLL_MS } from '../lib/notifications.js'

// Campana de la barra superior: avisos del usuario en la sucursal elegida. Pregunta cada 30 s mientras la
// pestaña está a la vista; al abrirla, la lista se actualiza. Un error de red no se muestra: se reintenta.
const props = defineProps({ api: { type: Object, default: null } })
const calls = props.api ?? notificationsApi()
const session = useSession()
const router = useRouter()

const open = ref(false)
const items = ref([])
const unread = ref(0)
const failed = ref(false)
const root = ref(null)
let timer = null

const badge = computed(() => badgeText(unread.value))
const label = computed(() => (unread.value ? `Avisos, ${unread.value} sin leer` : 'Avisos'))

async function refresh() {
  const branchId = session.branchId
  if (!branchId) return
  try {
    const r = await calls.latest(branchId)
    if (branchId !== session.branchId) return
    items.value = r.items
    unread.value = r.unread
    failed.value = false
  } catch {
    failed.value = true
  }
}

function start() {
  stop()
  timer = setInterval(() => { if (document.visibilityState === 'visible') refresh() }, POLL_MS)
}
function stop() {
  if (timer) clearInterval(timer)
  timer = null
}

function onVisible() {
  if (document.visibilityState === 'visible') refresh()
}
function onOutside(event) {
  if (open.value && root.value && !root.value.contains(event.target)) open.value = false
}
function onKey(event) {
  if (event.key === 'Escape' && open.value) {
    open.value = false
    root.value?.querySelector('.bell')?.focus()
  }
}

function toggle() {
  open.value = !open.value
  if (open.value) refresh()
}

async function choose(notice) {
  const branchId = session.branchId
  if (!notice.readAt) {
    notice.readAt = new Date().toISOString()
    unread.value = Math.max(0, unread.value - 1)
    calls.read(branchId, notice.id).catch(() => refresh())
  }
  const target = noticeTarget(notice, (p) => session.canOpen(p))
  open.value = false
  if (target) router.push({ name: target })
}

async function readAll() {
  if (!unread.value) return
  const branchId = session.branchId
  items.value = items.value.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() }))
  unread.value = 0
  try {
    await calls.readAll(branchId)
  } catch {
    refresh()
  }
}

onMounted(() => {
  refresh()
  start()
  document.addEventListener('visibilitychange', onVisible)
  document.addEventListener('click', onOutside)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  stop()
  document.removeEventListener('visibilitychange', onVisible)
  document.removeEventListener('click', onOutside)
  document.removeEventListener('keydown', onKey)
})
// Otra sucursal, otros avisos.
watch(() => session.branchId, () => {
  items.value = []
  unread.value = 0
  refresh()
})
</script>

<template>
  <div ref="root" class="notices">
    <button type="button" class="bell" :aria-label="label" :aria-expanded="open" aria-controls="notice-list" @click="toggle">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M12 3a6 6 0 0 0-6 6v3.6l-1.6 2.7A1 1 0 0 0 5.3 17h13.4a1 1 0 0 0 .9-1.7L18 12.6V9a6 6 0 0 0-6-6Zm0 18a2.5 2.5 0 0 0 2.4-2h-4.8A2.5 2.5 0 0 0 12 21Z" fill="currentColor" />
      </svg>
      <span v-if="badge" class="badge" aria-hidden="true">{{ badge }}</span>
    </button>
    <div v-if="open" id="notice-list" class="panel" role="region" aria-label="Avisos">
      <div class="head">
        <h2>Avisos</h2>
        <button v-if="unread" type="button" class="link" @click="readAll">Marcar todo como leído</button>
      </div>
      <p v-if="failed && !items.length" class="empty">No se pudieron cargar los avisos. Se reintentará en un momento.</p>
      <p v-else-if="!items.length" class="empty">No tienes avisos.</p>
      <ul v-else>
        <li v-for="n in items" :key="n.id">
          <button type="button" class="item" :class="{ unread: !n.readAt }" @click="choose(n)">
            <span class="dot" aria-hidden="true" />
            <span class="text">
              <span class="title">{{ n.title }}<span v-if="!n.readAt" class="sr-only"> (sin leer)</span></span>
              <span class="body">{{ n.body }}</span>
            </span>
            <span class="age">{{ noticeAge(n.updatedAt ?? n.createdAt) }}</span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.notices { position: relative; }
.bell { position: relative; display: grid; place-items: center; width: 38px; height: 38px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface); color: var(--text); cursor: pointer; }
.bell:hover { background: var(--bg); }
.bell:focus-visible, .item:focus-visible, .link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.badge { position: absolute; top: -6px; right: -6px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; background: var(--accent); color: #fff; font-size: .7rem; font-weight: 700; line-height: 18px; text-align: center; }
.panel { position: absolute; right: 0; top: calc(100% + 8px); width: min(360px, calc(100vw - 32px)); max-height: 70vh; overflow-y: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 12px 32px rgba(43, 24, 16, .14); z-index: 20; }
.head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 14px; border-bottom: 1px solid var(--line); }
.head h2 { margin: 0; font-size: 1rem; }
.link { font: inherit; font-size: .82rem; color: var(--accent); background: none; border: 0; padding: 4px; cursor: pointer; font-weight: 600; }
.empty { margin: 0; padding: 20px 14px; color: var(--muted); font-size: .9rem; text-align: center; }
ul { list-style: none; margin: 0; padding: 4px 0; }
.item { display: grid; grid-template-columns: 10px 1fr auto; gap: 10px; align-items: start; width: 100%; padding: 10px 14px; border: 0; background: none; text-align: left; font: inherit; color: var(--text); cursor: pointer; }
.item:hover { background: var(--bg); }
.dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; background: transparent; }
.unread .dot { background: var(--accent); }
.text { display: grid; gap: 2px; min-width: 0; }
.title { font-size: .9rem; font-weight: 500; }
.unread .title { font-weight: 700; }
.body { font-size: .84rem; color: var(--muted); }
.age { font-size: .75rem; color: var(--muted); white-space: nowrap; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
