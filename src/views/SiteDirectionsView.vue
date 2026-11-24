<script setup>
import PublicInfoLayout from './PublicInfoLayout.vue'
import SiteLocations from '../components/site/SiteLocations.vue'
import { useSiteBranches } from '../lib/useSiteBranches.js'
import { siteApi } from '../lib/site.js'
import { useRouter } from 'vue-router'

const router = useRouter()
const { branches, state, selected, user, locating, locate, loadBranches } = useSiteBranches(siteApi(), () => globalThis.navigator?.geolocation)
function reserveAt(code) {
  router.push({ name: 'sitio', query: { sucursal: code }, hash: '#reservar' })
}
</script>

<template>
  <PublicInfoLayout title="Cómo llegar">
    <p class="site-copy">Encuentra La Mesa Centro en Guadalajara y La Mesa Norte en Zapopan. Las direcciones y los puntos del mapa son de demostración.</p>
    <p v-if="state === 'loading'" role="status">Cargando sucursales…</p>
    <p v-else-if="state === 'error'">No pudimos cargar las sucursales. <button type="button" @click="loadBranches">Reintentar</button></p>
    <p v-else-if="!branches.length">Por el momento no hay sucursales disponibles.</p>
    <SiteLocations v-else :branches="branches" :selected="selected" :user="user" :locating="locating"
      @select="selected = $event" @locate="locate" @reserve="reserveAt" />
    <div class="directions-tips">
      <article>
        <h2>En transporte público</h2>
        <p class="site-copy">Para Centro, consulta las conexiones de Mi Tren en el corredor Juárez. Para Norte, revisa la conexión hacia tu destino en Zapopan en el mapa de rutas.</p>
        <a class="site-text-link" href="https://www.siteur.gob.mx/index.php/sistemas-de-transporte/mi-tren" target="_blank" rel="noopener noreferrer">Consultar la red de Mi Tren <span aria-hidden="true">↗</span></a>
      </article>
      <article>
        <h2>En auto</h2>
        <p class="site-copy">Abre «Cómo llegar» en la sucursal elegida y busca estacionamientos públicos cerca del punto en el mapa. Consulta los accesos y horarios de cada estacionamiento.</p>
      </article>
    </div>
  </PublicInfoLayout>
</template>

<style scoped>
.directions-tips { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px; margin-top: 36px; border-top: 1px solid var(--line); padding-top: 32px; }
.directions-tips h2 { font-size: clamp(1.35rem, 2.6vw, 2rem); }
@media (max-width: 680px) { .directions-tips { grid-template-columns: minmax(0, 1fr); } }
</style>
