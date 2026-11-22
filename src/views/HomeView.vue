<script setup>
import { computed } from 'vue'
import { useSession } from '../stores/session.js'
import { MODULES, ROLE_NAMES } from '../modules.js'

const session = useSession()
const modules = computed(() => MODULES.filter((m) => session.canOpen(m.permission)))
const role = computed(() => ROLE_NAMES[session.currentMembership?.role] ?? '')
const firstName = computed(() => (session.user?.name ?? '').split(' ')[0])
</script>

<template>
  <section>
    <h1>Hola, {{ firstName }}</h1>
    <p class="lead" v-if="session.currentMembership">
      {{ role }} en <b>{{ session.currentMembership.branch.name }}</b>.
    </p>

    <p v-if="!session.memberships.length" class="empty">
      Tu usuario no tiene ninguna sucursal activa. Pide a un administrador que te dé acceso.
    </p>
    <p v-else-if="!modules.length" class="empty">
      Con tu rol no hay módulos del panel en esta sucursal. El trabajo de piso se hace en la app Android.
    </p>

    <div v-else class="tiles">
      <RouterLink v-for="m in modules" :key="m.key" :to="{ name: m.key }" class="tile">
        <span class="group">{{ m.group }}</span>
        <h2>{{ m.title }}</h2>
        <p>{{ m.description }}</p>
      </RouterLink>
    </div>
  </section>
</template>

<style scoped>
h1 { margin: 0 0 4px; font-size: 1.6rem; }
.lead { margin: 0 0 24px; color: var(--muted); }
.lead b { color: var(--text); }
.empty { padding: 16px; border: 1px dashed var(--line); border-radius: 12px; color: var(--muted); max-width: 60ch; }
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 14px; }
.tile { display: block; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 16px; color: var(--text); text-decoration: none; transition: border-color .15s ease; }
.tile:hover { border-color: var(--accent); }
.tile:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.tile h2 { margin: 6px 0; font-size: 1.05rem; }
.tile p { margin: 0; color: var(--muted); font-size: .9rem; line-height: 1.45; }
.group { font-size: .7rem; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: var(--accent); }
</style>
