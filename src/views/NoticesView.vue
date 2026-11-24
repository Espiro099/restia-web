<script setup>
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useSession } from '../stores/session.js'
import { noticeAge, noticeTarget, notificationsApi } from '../lib/notifications.js'
import { errorText } from '../lib/errors.js'

// Centro de avisos (Figma "Restia web", 02 · Panel → Avisos): los avisos del usuario en la sucursal, con
// filtro de "solo sin leer" y "Marcar como leídos". La campana muestra los últimos; aquí está la lista.
const props = defineProps({ api: { type: Object, default: null } })
const calls = props.api ?? notificationsApi()
const session = useSession()
const router = useRouter()

const items = ref([])
const unread = ref(0)
const onlyUnread = ref(false)
const page = ref(1)
const lastPage = ref(1)
const loading = ref(true)
const error = ref('')

async function load(next = 1) {
  const b = session.branchId
  if (!b) return
  loading.value = true
  error.value = ''
  try {
    const r = await calls.page(b, { unread: onlyUnread.value, page: next })
    items.value = next === 1 ? r.items : [...items.value, ...r.items]
    unread.value = r.unread
    page.value = next
    lastPage.value = r.lastPage
  } catch (e) {
    error.value = errorText(e)
  } finally {
    loading.value = false
  }
}

async function open(n) {
  if (!n.readAt) {
    n.readAt = new Date().toISOString()
    unread.value = Math.max(0, unread.value - 1)
    calls.read(session.branchId, n.id).catch(() => load())
  }
  const target = noticeTarget(n, (p) => session.canOpen(p))
  if (target) router.push({ name: target })
}

async function readAll() {
  try {
    await calls.readAll(session.branchId)
    load()
  } catch (e) {
    error.value = errorText(e)
  }
}

onMounted(() => load())
watch([onlyUnread, () => session.branchId], () => load())
</script>

<template>
  <section>
    <div class="mod-head">
      <div>
        <h1>Avisos</h1>
        <h2 class="center">Centro de avisos</h2>
      </div>
      <button type="button" class="btn btn-primary" :disabled="!unread" @click="readAll">Marcar como leídos</button>
    </div>
    <label class="filter"><input v-model="onlyUnread" type="checkbox" /> Ver solo avisos sin leer <span class="count">({{ unread }})</span></label>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <div class="box">
      <ul class="list">
        <li v-for="n in items" :key="n.id">
          <button type="button" class="notice" :class="{ unread: !n.readAt }" @click="open(n)">
            <span class="dot" aria-hidden="true" />
            <span class="text">
              <span class="title">{{ n.title }}<span v-if="!n.readAt" class="sr-only"> (sin leer)</span></span>
              <span class="body">{{ n.body }}</span>
            </span>
            <span class="age">{{ noticeAge(n.updatedAt ?? n.createdAt) }}</span>
          </button>
        </li>
        <li v-if="!loading && !items.length" class="empty">{{ onlyUnread ? 'No tienes avisos sin leer.' : 'No tienes avisos.' }}</li>
        <li v-if="loading && !items.length" class="empty">Cargando…</li>
      </ul>
    </div>
    <button v-if="page < lastPage" type="button" class="btn more" :disabled="loading" @click="load(page + 1)">Ver más</button>
  </section>
</template>

<style scoped>
.center { margin: 4px 0 0; font-size: 1.25rem; font-weight: 700; }
.filter { display: inline-flex; align-items: center; gap: 8px; margin: 14px 0; font-size: .88rem; font-weight: 600; }
.count { color: var(--muted); font-weight: 400; }
.list { list-style: none; margin: 0; padding: 4px 14px; }
.list li { border-bottom: 1px solid var(--divider); }
.list li:last-child { border-bottom: 0; }
.notice { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; gap: 12px; align-items: start; width: 100%; padding: 14px 2px; border: 0; background: none; text-align: left; font: inherit; color: var(--text); cursor: pointer; }
.notice:hover .title { color: var(--accent-strong); }
.notice:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 6px; }
.dot { width: 8px; height: 8px; margin-top: 6px; border-radius: 50%; }
.unread .dot { background: var(--accent); }
.text { display: grid; gap: 3px; }
.title { font-size: .92rem; font-weight: 600; }
.unread .title { font-weight: 700; }
.body { color: var(--muted); font-size: .85rem; }
.age { color: var(--muted); font-size: .78rem; white-space: nowrap; }
.empty { padding: 28px 0; text-align: center; color: var(--muted); }
.more { margin-top: 12px; }
</style>
