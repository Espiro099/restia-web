<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSession } from '../stores/session.js'
import { MODULES, ROLE_NAMES, modulesIn } from '../modules.js'
import NoticeBell from '../components/NoticeBell.vue'

const session = useSession()
const router = useRouter()
const route = useRoute()
const menuOpen = ref(false)
const leaving = ref(false)

const mainNav = computed(() => modulesIn('main', session.canOpen))
// Las pantallas de Configuración (sucursal, impresión…) marcan "Configuración" en el menú.
const inSettings = computed(() => MODULES.find((m) => m.key === route.meta.module)?.nav === 'config')
const role = computed(() => ROLE_NAMES[session.currentMembership?.role] ?? session.currentMembership?.role ?? '')
// Título del encabezado (Figma 02 · Panel): el del módulo abierto o "Inicio".
const pageTitle = computed(() => MODULES.find((m) => m.key === route.meta.module)?.title ?? 'Inicio')
const today = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date()).replace('.', '')

// En pantallas angostas el menú se cierra al navegar.
watch(() => route.fullPath, () => { menuOpen.value = false })

function changeBranch(event) {
  session.selectBranch(event.target.value)
  // Con otro rol en la otra sucursal, el módulo abierto puede quedar sin permiso. Los módulos que sí se
  // quedan vuelven a cargar sus datos porque observan session.branchId.
  if (route.meta.permission && !session.canOpen(route.meta.permission)) router.replace({ name: 'inicio' })
}

async function logout() {
  if (leaving.value) return
  leaving.value = true
  await session.logout()
  leaving.value = false
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="shell" :class="{ open: menuOpen }">
    <aside class="side">
      <div class="side-top">
        <RouterLink :to="{ name: 'inicio' }" class="brand"><img src="../assets/marca/restia-logo-blanco.png" alt="Restia" width="130" height="48" /></RouterLink>
        <button class="menu-toggle" type="button" :aria-expanded="menuOpen" aria-controls="panel-nav" @click="menuOpen = !menuOpen">
          {{ menuOpen ? 'Cerrar' : 'Menú' }}
        </button>
      </div>
      <nav id="panel-nav" aria-label="Módulos">
        <RouterLink :to="{ name: 'inicio' }" class="nav-link" exact-active-class="active">Inicio</RouterLink>
        <RouterLink
          v-for="m in mainNav"
          :key="m.key"
          :to="{ name: m.key }"
          class="nav-link"
          :class="{ active: m.key === 'configuracion' && inSettings }"
          active-class="active"
        >
          {{ m.title }}
        </RouterLink>
      </nav>
      <div class="who">
        <span class="name">{{ session.user?.name }}</span>
        <span class="role">{{ role }}<template v-if="session.currentMembership"> · {{ session.currentMembership.branch.name }}</template></span>
      </div>
    </aside>

    <div class="main">
      <header class="bar">
        <!-- El título visible; cada pantalla conserva su propio h1 para el lector de pantalla. -->
        <p class="page-title" aria-hidden="true">{{ pageTitle }}</p>
        <div class="bar-end">
          <label v-if="session.branches.length > 1" class="branch">
            <span class="sr-only">Sucursal</span>
            <select :value="session.branchId" @change="changeBranch">
              <option v-for="b in session.branches" :key="b.id" :value="b.id">{{ b.name }}</option>
            </select>
          </label>
          <p v-else class="branch-name">{{ session.currentMembership?.branch?.name }}</p>
          <span class="dot" aria-hidden="true">·</span>
          <p class="date">{{ today }}</p>
          <NoticeBell v-if="session.panelAccess" :key="session.user?.id" />
          <button type="button" class="logout" :disabled="leaving" @click="logout">{{ leaving ? 'Saliendo…' : 'Salir' }}</button>
        </div>
      </header>
      <main class="content">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.shell { display: grid; grid-template-columns: 210px minmax(0, 1fr); min-height: 100vh; }
.side { background: var(--side); color: #fff; padding: 19px 11px 22px; position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column; overflow-y: auto; }
.side-top { display: flex; align-items: center; justify-content: space-between; padding: 0 8px; margin-bottom: 18px; }
.brand { display: block; }
.brand img { display: block; height: 46px; width: auto; }
.menu-toggle { display: none; }
nav { display: grid; gap: 4px; }
.nav-link { display: block; padding: 9px 12px; border-radius: 6px; color: #fff; text-decoration: none; font-size: .82rem; font-weight: 700; transition: background-color .15s ease; }
.nav-link:hover { background: rgba(255, 255, 255, .07); }
.nav-link.active { background: var(--accent); }
.nav-link:focus-visible, .menu-toggle:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.who { margin-top: auto; padding: 22px 12px 0; display: grid; gap: 3px; line-height: 1.25; }
.who .name { font-weight: 700; font-size: .875rem; }
.who .role { color: var(--side-text); font-size: .7rem; }

.main { min-width: 0; display: flex; flex-direction: column; }
.bar { display: flex; align-items: center; gap: 16px; min-height: 79px; padding: 12px 30px; background: var(--surface); border-bottom: 1px solid var(--line); }
.page-title { margin: 0; font-size: 1.55rem; font-weight: 700; color: var(--text); letter-spacing: -.01em; }
.bar-end { margin-left: auto; display: flex; align-items: center; gap: 12px; font-size: .78rem; color: var(--muted); }
.bar-end p { margin: 0; }
.dot { color: var(--muted); }
.branch select { font: inherit; font-size: .8rem; color: var(--text); padding: 6px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); }
.branch-name { color: var(--muted); }
.logout { font: inherit; font-size: .8rem; font-weight: 700; padding: 8px 14px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--text); cursor: pointer; }
.logout:hover:not(:disabled) { border-color: #d9c9b8; }
.logout:disabled { opacity: .5; cursor: progress; }
.bar :is(button, select):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.content { padding: 30px; max-width: 1240px; width: 100%; }
/* El título va en el encabezado: el h1 de cada módulo queda solo para el lector de pantalla. */
.content :deep(.mod-head h1) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

@media (max-width: 860px) {
  .shell { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
  .side { position: static; height: auto; padding: 12px 14px; }
  .side-top { margin-bottom: 0; padding: 0; }
  .brand img { height: 36px; }
  .menu-toggle { display: inline-block; font: inherit; font-size: .85rem; font-weight: 700; padding: 6px 12px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, .3); background: transparent; color: #fff; cursor: pointer; }
  nav, .who { display: none; }
  .shell.open nav { display: grid; margin-top: 10px; }
  .shell.open .who { display: grid; padding-top: 14px; }
  .bar { flex-wrap: wrap; padding: 12px 16px; min-height: 0; gap: 10px; }
  .page-title { font-size: 1.25rem; }
  .bar-end { margin-left: 0; width: 100%; flex-wrap: wrap; gap: 8px; }
  .content { padding: 16px; }
}
</style>
