<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSession } from '../stores/session.js'
import { GROUPS, MODULES, ROLE_NAMES } from '../modules.js'

const session = useSession()
const router = useRouter()
const route = useRoute()
const menuOpen = ref(false)
const leaving = ref(false)

const visible = computed(() => MODULES.filter((m) => session.canOpen(m.permission)))
const groups = computed(() =>
  GROUPS.map((g) => ({ name: g, modules: visible.value.filter((m) => m.group === g) })).filter((g) => g.modules.length),
)
const role = computed(() => ROLE_NAMES[session.currentMembership?.role] ?? session.currentMembership?.role ?? '')

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
        <RouterLink :to="{ name: 'inicio' }" class="brand"><span class="brand-mark" aria-hidden="true">R</span> Restia</RouterLink>
        <button class="menu-toggle" type="button" :aria-expanded="menuOpen" aria-controls="panel-nav" @click="menuOpen = !menuOpen">
          {{ menuOpen ? 'Cerrar' : 'Menú' }}
        </button>
      </div>
      <nav id="panel-nav" aria-label="Módulos">
        <RouterLink :to="{ name: 'inicio' }" class="nav-link" exact-active-class="active">Inicio</RouterLink>
        <section v-for="g in groups" :key="g.name">
          <h2>{{ g.name }}</h2>
          <RouterLink v-for="m in g.modules" :key="m.key" :to="{ name: m.key }" class="nav-link" active-class="active">
            {{ m.title }}
          </RouterLink>
        </section>
      </nav>
    </aside>

    <div class="main">
      <header class="bar">
        <label v-if="session.branches.length > 1" class="branch">
          <span>Sucursal</span>
          <select :value="session.branchId" @change="changeBranch">
            <option v-for="b in session.branches" :key="b.id" :value="b.id">{{ b.name }}</option>
          </select>
        </label>
        <p v-else class="branch-name">{{ session.currentMembership?.branch?.name }}</p>
        <div class="who">
          <span class="name">{{ session.user?.name }}</span>
          <span class="role">{{ role }}</span>
        </div>
        <button type="button" class="logout" :disabled="leaving" @click="logout">{{ leaving ? 'Saliendo…' : 'Salir' }}</button>
      </header>
      <main class="content">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.shell { display: grid; grid-template-columns: 240px 1fr; min-height: 100vh; }
.side { background: var(--surface); border-right: 1px solid var(--line); padding: 18px 14px; position: sticky; top: 0; height: 100vh; overflow-y: auto; }
.side-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 1.15rem; color: var(--text); text-decoration: none; }
.brand-mark { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; background: var(--accent); color: #fff; font-weight: 800; }
.menu-toggle { display: none; }
nav { display: grid; gap: 2px; }
nav h2 { font-size: .72rem; text-transform: uppercase; letter-spacing: .6px; color: var(--muted); margin: 16px 10px 6px; }
.nav-link { display: block; padding: 8px 10px; border-radius: 8px; color: var(--text); text-decoration: none; font-size: .95rem; }
.nav-link:hover { background: var(--bg); }
.nav-link.active { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.nav-link:focus-visible, button:focus-visible, select:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.main { min-width: 0; display: flex; flex-direction: column; }
.bar { display: flex; align-items: center; gap: 16px; padding: 12px 24px; background: var(--surface); border-bottom: 1px solid var(--line); }
.branch { display: flex; align-items: center; gap: 8px; font-size: .85rem; color: var(--muted); }
.branch select { font: inherit; color: var(--text); padding: 6px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); }
.branch-name { margin: 0; font-weight: 600; }
.who { margin-left: auto; display: grid; text-align: right; line-height: 1.2; }
.who .name { font-weight: 600; font-size: .9rem; }
.who .role { color: var(--muted); font-size: .8rem; }
.logout { font: inherit; font-size: .9rem; padding: 7px 14px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--text); cursor: pointer; }
.logout:disabled { opacity: .5; cursor: progress; }
.content { padding: 24px; max-width: 1180px; width: 100%; }

@media (max-width: 860px) {
  .shell { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
  .side { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--line); padding: 12px 16px; }
  .side-top { margin-bottom: 0; }
  .menu-toggle { display: inline-block; font: inherit; font-size: .9rem; padding: 6px 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--text); cursor: pointer; }
  nav { display: none; margin-top: 10px; }
  .shell.open nav { display: grid; }
  .bar { flex-wrap: wrap; padding: 10px 16px; gap: 10px; }
  .content { padding: 16px; }
}
</style>
