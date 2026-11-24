<script setup>
import { useRoute } from 'vue-router'
import logo from '../../assets/marca/lamesa-logo.png'

const route = useRoute()
const sections = [
  { label: 'Carta', hash: '#menu' },
  { label: 'Instalaciones', hash: '#instalaciones' },
  { label: 'Novedades', hash: '#novedades' },
  { label: 'Nosotros', hash: '#nosotros' },
]
</script>

<template>
  <header class="site-header">
    <div class="wrap site-header-inner">
      <RouterLink to="/" class="site-brand">
        <img :src="logo" alt="La Mesa · Inicio" width="102" height="56" />
      </RouterLink>
      <nav class="site-navigation" aria-label="Navegación de La Mesa">
        <RouterLink v-for="section in sections" :key="section.hash" :to="{ path: '/', hash: section.hash }" custom v-slot="{ href, navigate }">
          <a :href="href" :aria-current="route.path === '/' && route.hash === section.hash ? 'location' : undefined" @click="navigate">{{ section.label }}</a>
        </RouterLink>
        <RouterLink to="/como-llegar" :aria-current="route.name === 'como-llegar' ? 'page' : undefined">Cómo llegar</RouterLink>
      </nav>
      <RouterLink :to="{ path: '/', hash: '#reservar' }" class="site-action site-book">Reservar <span aria-hidden="true">↗</span></RouterLink>
    </div>
  </header>
</template>

<style scoped>
.site-header { position: sticky; top: 0; z-index: 20; background: var(--cream); border-bottom: 1px solid var(--line); }
.site-header-inner { display: grid; grid-template-columns: auto 1fr auto; align-items: center; min-height: var(--header-height); gap: clamp(14px, 3vw, 36px); }
.site-brand img { display: block; width: auto; height: 49px; }
.site-navigation { display: flex; justify-content: center; align-items: center; gap: clamp(10px, 2.4vw, 34px); }
.site-navigation a { display: inline-flex; align-items: center; min-height: 44px; font-size: .88rem; font-weight: 700; white-space: nowrap; text-decoration: none; }
.site-navigation a:hover, .site-navigation a[aria-current] { color: var(--clay-dark); text-decoration: underline; text-underline-offset: .35em; }
@media (max-width: 850px) {
  .site-header-inner { grid-template-columns: 1fr auto; gap: 0 12px; padding-top: 7px; }
  .site-brand img { height: 39px; }
  .site-navigation { grid-column: 1 / -1; grid-row: 2; justify-content: space-between; column-gap: 10px; min-width: 0; overflow-x: auto; }
  .site-navigation a { min-height: 39px; font-size: clamp(.7rem, 3.1vw, .85rem); }
  .site-book { min-height: 40px; }
}
</style>
