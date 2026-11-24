<script setup>
import logo from '../../assets/marca/lamesa-logo-blanco.png'
</script>

<template>
  <footer class="site-footer">
    <div class="wrap site-footer-inner">
      <RouterLink to="/"><img :src="logo" alt="La Mesa · Inicio" width="96" height="53" /></RouterLink>
      <nav aria-label="Enlaces del pie">
        <RouterLink to="/como-llegar">Cómo llegar</RouterLink>
        <RouterLink :to="{ path: '/', hash: '#contacto' }">Contacto</RouterLink>
        <RouterLink to="/privacidad">Política de privacidad</RouterLink>
      </nav>
    </div>
  </footer>
</template>

<style scoped>
.site-footer { background: var(--ink); color: var(--paper); padding-block: 24px; }
.site-footer-inner { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px 28px; }
.site-footer nav { display: flex; flex-wrap: wrap; align-items: center; gap: 0 22px; }
.site-footer nav a { display: inline-flex; align-items: center; min-height: 44px; color: inherit; font-size: .9rem; text-underline-offset: .3em; }
.site-footer img { display: block; height: 48px; width: auto; }
@media (max-width: 850px) { .site-footer { padding-bottom: 72px; } }
</style>
