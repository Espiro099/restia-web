<script setup>
import { computed } from 'vue'
import { useSession } from '../stores/session.js'
import { modulesIn } from '../modules.js'

// Configuración (Figma "Restia web", 02 · Panel → Configuración): la lista de pantallas de ajustes de la
// sucursal. Cada una aparece solo con su permiso.
const session = useSession()
const items = computed(() => modulesIn('config', session.canOpen))
</script>

<template>
  <section>
    <div class="mod-head"><h1>Configuración</h1></div>
    <nav class="box settings" aria-label="Configuración">
      <RouterLink v-for="m in items" :key="m.key" :to="{ name: m.key }" class="item">
        <span class="title">{{ m.title }}</span>
        <span class="desc">{{ m.description }}</span>
        <span class="go" aria-hidden="true">→</span>
      </RouterLink>
    </nav>
  </section>
</template>

<style scoped>
.settings { display: grid; padding: 8px 14px; }
.item { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: 'title go' 'desc go'; align-items: center; column-gap: 16px; row-gap: 2px; padding: 14px 4px; border-bottom: 1px solid var(--divider); color: var(--text); text-decoration: none; }
.item:last-child { border-bottom: 0; }
.item:hover .title { color: var(--accent-strong); }
.item:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 6px; }
.title { grid-area: title; font-weight: 700; font-size: .95rem; }
.desc { grid-area: desc; color: var(--muted); font-size: .84rem; }
.go { grid-area: go; color: var(--muted); font-weight: 700; }
</style>
