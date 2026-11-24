<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AssistantChat from '../components/AssistantChat.vue'
import SiteLocations from '../components/site/SiteLocations.vue'
import SiteReservation from '../components/site/SiteReservation.vue'
import { MAX_CHARS, byDistance, siteApi, siteAssistantErrorText } from '../lib/site.js'
import '@fontsource/lora/latin-700.css'
import '@fontsource/manrope/latin-400.css'
import '@fontsource/manrope/latin-700.css'
import logo from '../assets/marca/lamesa-logo.png'
import logoWhite from '../assets/marca/lamesa-logo-blanco.png'
import cover from '../assets/sitio/portada.webp'
import room from '../assets/sitio/salon.webp'

// Sitio público de La Mesa (Figma "Restia web", página 01 · Clientes, V2). Lo ve cualquier persona sin
// sesión; el personal entra al panel desde el pie de página. La carta con precios se consulta con el QR de
// cada mesa (/m#token), porque depende de la sucursal. Sucursales en el mapa, solicitudes de reserva y
// asistente: Decisiones_Public_Site en restia-api.
const props = defineProps({
  api: { type: Object, default: null },
  /** navigator.geolocation; inyectable para las pruebas. */
  geolocation: { type: Object, default: () => globalThis.navigator?.geolocation ?? null },
})
const calls = props.api ?? siteApi()

const branchList = ref([])
const loadFailed = ref(false)
const assistant = ref(false)
const user = ref(null)
const locating = ref('idle')
const selected = ref('')
const reserveCode = ref('')
const proposal = ref(null)

const branches = computed(() => byDistance(branchList.value, user.value))

async function loadBranches() {
  loadFailed.value = false
  try {
    const r = await calls.branches()
    branchList.value = r.branches
    assistant.value = r.assistant
  } catch {
    loadFailed.value = true
  }
}

/** La ubicación solo se usa aquí para ordenar las sucursales; no se manda a la API. */
function locate() {
  if (!props.geolocation) {
    locating.value = 'unavailable'
    return
  }
  locating.value = 'asking'
  props.geolocation.getCurrentPosition((pos) => {
    user.value = { lat: pos.coords.latitude, lng: pos.coords.longitude }
    locating.value = 'idle'
    const nearest = branches.value.find((b) => b.distanceKm != null)
    if (nearest) selected.value = nearest.code
  }, (err) => {
    locating.value = err?.code === 1 ? 'denied' : 'unavailable'
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 })
}

function goReserve() {
  document.getElementById('reservar')?.scrollIntoView?.({ block: 'start' })
}

function reserveAt(code) {
  selected.value = code
  reserveCode.value = code
  goReserve()
}

function onDraft(draft) {
  proposal.value = { draft, n: (proposal.value?.n ?? 0) + 1 }
  if (draft.branchCode) selected.value = draft.branchCode
  goReserve()
}

const SUGGESTIONS = ['¿Cuál es la sucursal más cercana?', '¿Qué me recomiendas?', 'Quiero reservar una mesa']

let previousTitle = ''
onMounted(async () => {
  previousTitle = document.title
  document.title = 'La Mesa · Restaurante'
  await loadBranches()
  // Si la persona ya dio permiso antes, se ubica sola; si no, espera a que toque el botón.
  try {
    const status = await globalThis.navigator?.permissions?.query({ name: 'geolocation' })
    if (status?.state === 'granted') locate()
  } catch {
    // Sin Permissions API: espera al botón.
  }
})
onBeforeUnmount(() => { document.title = previousTitle })
</script>

<template>
  <div class="site">
    <a class="skip" href="#menu">Saltar al contenido</a>
    <header class="site-top">
      <div class="wrap site-top-row">
        <a href="#inicio" class="logo"><img :src="logo" alt="La Mesa" width="102" height="56" /></a>
        <nav aria-label="Secciones">
          <a href="#menu">Menú</a>
          <a href="#sucursales">Sucursales</a>
          <a href="#reservar">Reservar</a>
        </nav>
        <a href="#reservar" class="cta site-cta-top">Reservar mesa <span aria-hidden="true">→</span></a>
      </div>
    </header>

    <main>
      <section id="inicio" class="site-hero" aria-labelledby="hero-title">
        <img :src="cover" alt="" class="site-hero-photo" width="1792" height="768" fetchpriority="high" />
        <div class="veil" aria-hidden="true" />
        <div class="wrap site-hero-text">
          <p class="eyebrow light">Bienvenido a La Mesa</p>
          <h1 id="hero-title">El mejor sabor,<br />en el lugar perfecto.</h1>
          <p class="lead">Una buena mesa, tiempo para conversar y el gusto de compartir algo recién preparado.</p>
          <a href="#menu" class="cta">Explorar el menú <span aria-hidden="true">→</span></a>
        </div>
      </section>

      <nav class="wrap shortcuts" aria-label="Atajos">
        <a href="#menu">Menú <span aria-hidden="true">→</span></a>
        <a href="#sucursales">Sucursales <span aria-hidden="true">→</span></a>
        <a href="#reservar">Reservar <span aria-hidden="true">→</span></a>
      </nav>

      <section id="menu" class="wrap split menu" aria-labelledby="menu-title">
        <div class="copy">
          <p class="eyebrow">En la mesa</p>
          <h2 id="menu-title">El menú de La Mesa</h2>
          <p class="body">Empieza con una entrada para compartir, sigue con el plato que más se te antoje y guarda espacio para el postre.</p>
          <p class="cats">Entradas <span aria-hidden="true">·</span> Platos fuertes <span aria-hidden="true">·</span> Bebidas y postres</p>
          <p class="note">Escanea el QR de tu mesa para consultar la carta de la sucursal.</p>
        </div>
        <img :src="cover" alt="Corte a la parrilla con verduras asadas, servido en la mesa" class="photo dish" width="604" height="482" loading="lazy" />
      </section>

      <section id="nosotros" class="band" aria-labelledby="about-title">
        <div class="wrap split about">
          <img :src="room" alt="Salón de La Mesa con luz cálida y mesas puestas" class="photo" width="604" height="482" loading="lazy" />
          <div class="copy">
            <p class="eyebrow">Nuestra esencia</p>
            <h2 id="about-title">Una mesa para<br />quedarse.</h2>
            <p class="body">La comida se disfruta a otro ritmo cuando hay buena compañía. En La Mesa, la mesa está puesta para una sobremesa larga o una cena que tenías ganas de celebrar.</p>
            <a href="#sucursales" class="link">Encuentra tu sucursal <span aria-hidden="true">→</span></a>
          </div>
        </div>
      </section>

      <section id="sucursales" class="wrap branches" aria-labelledby="branches-title">
        <p class="eyebrow">Sucursales</p>
        <h2 id="branches-title">Hay una La Mesa cerca de ti.</h2>
        <p v-if="loadFailed" class="body">No pudimos cargar las sucursales. <button type="button" class="retry" @click="loadBranches">Intentar de nuevo</button></p>
        <SiteLocations v-else :branches="branches" :selected="selected" :user="user" :locating="locating"
          @select="selected = $event" @locate="locate" @reserve="reserveAt" />
      </section>

      <section id="reservar" class="band visit-band" aria-labelledby="visit-title">
        <div class="wrap visit">
          <p class="eyebrow">Tu próxima visita</p>
          <h2 id="visit-title">Nos vemos en La Mesa.</h2>
          <p class="body">Pide tu mesa: elige sucursal, día y una hora con lugar. La sucursal te confirma por teléfono.</p>
          <SiteReservation :api="calls" :branches="branches" :branch-code="reserveCode" :proposal="proposal" />
        </div>
      </section>
    </main>

    <AssistantChat v-if="assistant" class="site-chat" :ask="calls.ask" restaurant="La Mesa"
      hint="Pregunta por la carta, las sucursales o los horarios. También te ayudo a pedir una reserva."
      :suggestions="SUGGESTIONS" fab-label="¿Te ayudo?" :error-text="siteAssistantErrorText" :max-chars="MAX_CHARS" @draft="onDraft" />

    <footer class="foot">
      <div class="wrap foot-row">
        <img :src="logoWhite" alt="La Mesa" width="96" height="53" />
        <RouterLink :to="{ name: 'login' }" class="staff">Acceso para el personal <span aria-hidden="true">→</span></RouterLink>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.site {
  --cream: #faf0e5;
  --sand: #f2e3d3;
  --ink: #382014;
  --clay: #c74115;
  --clay-dark: #a7350f;
  --gray: #5d6466;
  --gold: #f8b651;
  --paper: #fffaf4;
  /* Colores del chat (AssistantChat) con la marca del sitio. */
  --accent: var(--clay);
  --surface: var(--paper);
  --line: #e7d7c4;
  --muted: var(--gray);
  --bg: var(--sand);
  --text: var(--ink);
  --danger: #a3260b;
  min-height: 100vh;
  background: var(--cream);
  color: var(--ink);
  font-family: 'Manrope', system-ui, sans-serif;
}
.wrap { max-width: 1440px; margin: 0 auto; padding: 0 56px; }
.skip { position: absolute; left: -9999px; }
.skip:focus { left: 16px; top: 16px; z-index: 30; background: var(--paper); padding: 8px 12px; border-radius: 8px; }
a { color: inherit; }
a:focus-visible { outline: 2px solid var(--clay); outline-offset: 3px; border-radius: 4px; }

.site-top { position: sticky; top: 0; z-index: 20; background: var(--cream); }
.site-top-row { display: flex; align-items: center; justify-content: space-between; height: 82px; gap: 24px; }
.logo img { display: block; height: 56px; width: auto; }
nav a { text-decoration: none; font-weight: 700; }
.site-top nav { display: flex; gap: 48px; font-size: 15px; }
.site-top nav a:hover { color: var(--clay); }

.cta {
  display: inline-flex; align-items: center; gap: 10px; min-height: 48px; padding: 0 18px; border-radius: 10px;
  background: var(--clay); color: #fff; font-weight: 700; font-size: 14px; text-decoration: none;
  transition: background-color .15s ease;
}
.cta:hover { background: var(--clay-dark); }
.site-cta-top { min-height: 46px; }

.eyebrow { margin: 0 0 18px; font-size: 12px; font-weight: 700; letter-spacing: .32em; text-transform: uppercase; color: var(--clay); }
.eyebrow.light { color: var(--gold); font-size: 13px; }
h1, h2 { font-family: 'Lora', Georgia, serif; font-weight: 700; margin: 0; letter-spacing: -.01em; }

.site-hero { position: relative; min-height: 630px; display: flex; align-items: center; overflow: hidden; color: var(--paper); }
.site-hero-photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
/* El velo del diseño (12 %) más un degradado a la izquierda, para que el titular se lea sobre cualquier zona de la foto. */
.veil { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(38, 25, 15, .72) 0%, rgba(38, 25, 15, .35) 45%, rgba(38, 25, 15, .12) 70%); }
.site-hero-text { position: relative; width: 100%; padding-top: 72px; padding-bottom: 72px; }
h1 { font-size: clamp(2.6rem, 5.6vw, 5rem); line-height: 1.1; }
.lead { max-width: 30em; margin: 20px 0 32px; font-size: clamp(1rem, 1.4vw, 1.2rem); line-height: 1.45; }

.shortcuts { display: grid; grid-template-columns: repeat(3, 1fr); min-height: 79px; align-items: center; }
.shortcuts a { padding: 0 12px; font-size: 17px; font-weight: 700; text-decoration: none; }
.shortcuts a:hover { color: var(--clay); }

.split { display: grid; grid-template-columns: 1fr 604px; gap: 120px; align-items: center; }
.menu { padding-top: 87px; padding-bottom: 81px; }
h2 { font-size: clamp(2.3rem, 4.3vw, 4rem); line-height: 1.15; }
.body { max-width: 30em; margin: 14px 0 0; font-size: 17px; line-height: 1.4; color: var(--gray); }
.cats { margin: 26px 0 0; font-size: 15px; font-weight: 700; }
.cats span { margin: 0 8px; }
.note { margin: 32px 0 0; font-size: 15px; color: var(--gray); }
.photo { display: block; width: 100%; height: auto; aspect-ratio: 604 / 482; object-fit: cover; border-radius: 16px; }

.band { background: var(--sand); padding: 84px 0; }
.about { grid-template-columns: 604px 1fr; }
.link { display: inline-block; margin-top: 12px; font-size: 14px; font-weight: 700; color: var(--clay); text-decoration: none; }
.link:hover { text-decoration: underline; }

.branches { padding-top: 96px; padding-bottom: 96px; }
.retry { font: inherit; font-weight: 700; color: var(--clay); background: none; border: 0; padding: 0; text-decoration: underline; cursor: pointer; }
.visit-band { padding: 0; }
.visit { padding-top: 96px; padding-bottom: 96px; text-align: center; display: flex; flex-direction: column; align-items: center; }
.site-chat { font-family: 'Manrope', system-ui, sans-serif; }
.visit h2 { font-size: clamp(2.5rem, 4.6vw, 4.1rem); }

.foot { background: var(--ink); color: var(--paper); padding: 0; border: 0; font-size: inherit; }
.foot-row { display: flex; align-items: center; justify-content: space-between; min-height: 108px; gap: 16px; }
.foot img { display: block; height: 52px; width: auto; }
.staff { font-size: 14px; font-weight: 700; text-decoration: none; }
.staff:hover { text-decoration: underline; }

@media (max-width: 1100px) {
  .split, .about { grid-template-columns: 1fr 1fr; gap: 56px; }
}

@media (max-width: 760px) {
  .wrap { padding: 0 18px; }
  .site-top-row { height: 64px; }
  .logo img { height: 40px; }
  .site-top nav { gap: 14px; font-size: 13px; }
  .site-cta-top { display: none; }
  .site-hero { min-height: 640px; align-items: flex-end; }
  .veil { background: linear-gradient(0deg, rgba(38, 25, 15, .78) 0%, rgba(38, 25, 15, .4) 55%, rgba(38, 25, 15, .12) 100%); }
  .site-hero-text { padding-bottom: 40px; }
  .shortcuts { min-height: 66px; }
  .shortcuts a { font-size: 15px; padding: 0; }
  .split, .about { grid-template-columns: 1fr; gap: 28px; }
  .menu { padding-top: 56px; padding-bottom: 38px; }
  .band { padding: 62px 0 40px; }
  /* En móvil la foto del salón va después del texto, como en el diseño. */
  .about .photo { order: 2; }
  .body { font-size: 15px; }
  .branches { padding-top: 56px; padding-bottom: 56px; }
  .visit { padding-top: 56px; padding-bottom: 56px; }
  /* Espacio para el botón flotante del asistente, que si no tapa el acceso del personal. */
  .foot { padding-bottom: 64px; }
  .foot-row { min-height: 88px; }
  .foot img { height: 39px; }
  .staff { font-size: 12px; }
}

@media (prefers-reduced-motion: no-preference) {
  :global(html) { scroll-behavior: smooth; }
}
</style>
