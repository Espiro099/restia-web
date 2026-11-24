<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import AssistantChat from '../components/AssistantChat.vue'
import SiteHeader from '../components/site/SiteHeader.vue'
import SiteFooter from '../components/site/SiteFooter.vue'
import SiteLocations from '../components/site/SiteLocations.vue'
import SiteReservation from '../components/site/SiteReservation.vue'
import { hoursText, siteApi } from '../lib/site.js'
import { featuredDishes, siteEmail } from '../lib/siteEditorial.js'
import { useSiteBranches } from '../lib/useSiteBranches.js'
import '@fontsource/lora/latin-700.css'
import '../site.css'
import cover from '../assets/sitio/portada.webp'
import room from '../assets/sitio/salon.webp'
import terrace from '../assets/sitio/terraza.webp'
import team from '../assets/sitio/equipo.webp'

const props = defineProps({
  api: { type: Object, default: null },
  geolocation: { type: Object, default: () => globalThis.navigator?.geolocation ?? null },
})
const calls = props.api ?? siteApi()
const route = useRoute()
const { branches, state, assistant, user, locating, selected, locate, loadBranches } = useSiteBranches(calls, () => props.geolocation)
const manualReservation = ref('')
const reserveCode = computed(() => manualReservation.value || (typeof route.query.sucursal === 'string' ? route.query.sucursal : ''))
const proposal = ref(null)
const opening = computed(() => branches.value.filter((b) => b.hours?.length))
const contacts = computed(() => branches.value.filter((b) => b.phone))

function goReserve() {
  document.getElementById('reservar')?.scrollIntoView?.({ block: 'start', behavior: window.matchMedia?.('(prefers-reduced-motion: no-preference)').matches ? 'smooth' : 'instant' })
}

function reserveAt(code) {
  selected.value = code
  manualReservation.value = code
  goReserve()
}

function onDraft(draft) {
  proposal.value = { draft, n: (proposal.value?.n ?? 0) + 1 }
  if (draft.branchCode) selected.value = draft.branchCode
  goReserve()
}

const previousTitle = document.title
onMounted(() => { document.title = 'La Mesa · Restaurante' })
onBeforeUnmount(() => { document.title = previousTitle })
</script>

<template>
  <div class="site">
    <a class="sr-only site-skip" href="#contenido">Saltar al contenido</a>
    <SiteHeader />

    <main id="contenido" tabindex="-1">
      <section id="inicio" class="wrap site-hero" aria-labelledby="hero-title">
        <div class="hero-copy">
          <p class="site-kicker">Cocina mexicana · Guadalajara y Zapopan</p>
          <h1 id="hero-title">El sabor de compartir.</h1>
          <p class="hero-lead">Platos al centro, una buena conversación y tiempo para la sobremesa.</p>
          <div class="hero-actions">
            <RouterLink :to="{ path: '/', hash: '#reservar' }" class="site-action">Reserva tu mesa <span aria-hidden="true">↗</span></RouterLink>
            <RouterLink :to="{ path: '/', hash: '#menu' }" class="site-text-link">Descubre la carta <span aria-hidden="true">↓</span></RouterLink>
          </div>
          <div class="hero-hours">
            <h2>Horario de apertura · demostración</h2>
            <ul v-if="opening.length">
              <li v-for="branch in opening" :key="branch.code">
                <strong>{{ branch.name }}</strong><span>{{ hoursText(branch.hours) }}</span>
              </li>
            </ul>
            <a v-else href="#sucursales">Consulta los horarios de reserva</a>
          </div>
        </div>
        <div class="site-photo hero-image">
          <img :src="cover" alt="Corte a la parrilla y verduras asadas en una mesa de luz cálida" width="1792" height="768" fetchpriority="high" />
        </div>
      </section>

      <section id="menu" class="section-band" aria-labelledby="menu-title">
        <div class="wrap section-space">
          <div class="section-heading site-reveal">
            <div><p class="site-kicker">Carta</p><h2 id="menu-title">Al centro de la mesa.</h2></div>
            <p class="site-copy">Una selección de nuestra carta, del primer bocado al postre. En cada mesa encontrarás el menú completo de la sucursal por QR.</p>
          </div>
          <div class="dish-grid">
            <article v-for="dish in featuredDishes" :key="dish.name" class="dish-preview site-reveal">
              <div class="site-photo"><img :src="dish.image" alt="" width="640" height="640" loading="lazy" /></div>
              <div class="dish-copy">
                <p>{{ dish.course }}</p>
                <h3>{{ dish.name }}</h3>
                <p>{{ dish.description }}</p>
                <strong>${{ dish.price }} <small>MXN</small></strong>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section id="instalaciones" class="wrap section-space" aria-labelledby="spaces-title">
        <div class="section-heading site-reveal">
          <div><p class="site-kicker">Instalaciones</p><h2 id="spaces-title">¿Salón o terraza?</h2></div>
          <p class="site-copy">Sillas de madera, luz baja en el salón y mesas al aire libre en la terraza. En La Mesa Norte, las mesas de terraza se pueden juntar para grupos.</p>
        </div>
        <div class="spaces-grid">
          <div class="space-photo site-photo site-reveal">
            <img :src="room" alt="Salón con mesas de madera y lámparas de luz cálida" width="604" height="482" loading="lazy" />
          </div>
          <div class="space-photo terrace-photo site-photo site-reveal">
            <img :src="terrace" alt="Terraza ilustrativa con mesas al aire libre, plantas y muros de terracota" width="1200" height="800" loading="lazy" />
          </div>
        </div>
      </section>

      <section id="reservar" class="section-band reservation-band" aria-labelledby="visit-title">
        <div class="wrap section-space visit">
          <div class="site-reveal">
            <p class="site-kicker">Reservas en línea</p>
            <h2 id="visit-title">Nos vemos en La Mesa.</h2>
            <p class="site-copy">Elige sucursal, día y hora. Recibirás un folio para consultar el estado mientras la sucursal revisa tu solicitud.</p>
            <p class="reservation-note">Usa datos de prueba. <RouterLink to="/privacidad">Política de privacidad</RouterLink></p>
          </div>
          <SiteReservation :api="calls" :branches="branches" :branch-code="reserveCode" :proposal="proposal" />
        </div>
      </section>

      <section id="novedades" class="wrap section-space" aria-labelledby="news-title">
        <div class="section-heading site-reveal">
          <div><p class="site-kicker">Novedades</p><h2 id="news-title">Notas de La Mesa.</h2></div>
        </div>
        <div class="news-grid">
          <details class="news-story site-reveal">
            <summary><span class="news-title">Churros para la sobremesa</span><span class="story-toggle" aria-hidden="true">+</span></summary>
            <p>Los servimos con canela y una taza de chocolate caliente para mojar. Pídelos al centro y acompáñalos con un café de olla.</p>
            <a href="#menu" class="site-text-link">Ver selección de la carta <span aria-hidden="true">→</span></a>
          </details>
          <details class="news-story site-reveal">
            <summary><span class="news-title">Una mesa larga en la terraza</span><span class="story-toggle" aria-hidden="true">+</span></summary>
            <p>En Norte, las mesas de terraza se pueden juntar. Si vienen en grupo, elige el número de personas al solicitar la reserva.</p>
            <a href="#reservar" class="site-text-link">Ver horarios disponibles <span aria-hidden="true">→</span></a>
          </details>
        </div>
      </section>

      <section id="nosotros" class="section-band" aria-labelledby="about-title">
        <div class="wrap section-space about-grid">
          <div class="site-photo team-photo site-reveal">
            <img :src="team" alt="Retrato ilustrativo de tres integrantes del equipo de cocina y salón" width="1200" height="800" loading="lazy" />
          </div>
          <div class="site-reveal">
            <p class="site-kicker">Sobre nosotros</p>
            <h2 id="about-title">Quienes ponen la mesa.</h2>
            <p class="site-copy">La Mesa nació como un proyecto estudiantil inspirado en las sobremesas mexicanas. Imaginamos dos sucursales y un equipo que trabaja de cerca, desde quien prepara el primer plato hasta quien te recibe en el salón.</p>
            <p class="site-copy">La cocina, la barra y el servicio tienen algo en común: hacer que todos encuentren su lugar alrededor de la mesa.</p>
          </div>
        </div>
      </section>

      <section id="sucursales" class="wrap section-space" aria-labelledby="branches-title">
        <div class="section-heading site-reveal">
          <div><p class="site-kicker">Sucursales</p><h2 id="branches-title">Encuentra tu La Mesa.</h2></div>
          <RouterLink to="/como-llegar" class="site-text-link">Ver direcciones y transporte <span aria-hidden="true">→</span></RouterLink>
        </div>
        <p v-if="state === 'loading'" role="status">Cargando sucursales…</p>
        <p v-else-if="state === 'error'">No pudimos cargar las sucursales. <button type="button" class="site-retry" @click="loadBranches">Reintentar</button></p>
        <p v-else-if="!branches.length">Por el momento no hay sucursales disponibles.</p>
        <SiteLocations v-else :branches="branches" :selected="selected" :user="user" :locating="locating"
          @select="selected = $event" @locate="locate" @reserve="reserveAt" />
      </section>

      <section id="contacto" class="section-band" aria-labelledby="contact-title">
        <div class="wrap section-space section-heading site-reveal">
          <div><p class="site-kicker">Contacto</p><h2 id="contact-title">Hablemos.</h2></div>
          <div class="contact-details">
            <dl v-if="contacts.length">
              <div v-for="branch in contacts" :key="branch.code"><dt>{{ branch.name }}</dt><dd>{{ branch.phone }}</dd></div>
            </dl>
            <p v-if="siteEmail">Correo <a :href="'mailto:' + siteEmail">{{ siteEmail }}</a></p>
            <p v-else>Correo de ejemplo <span>hola@lamesa.example</span></p>
            <p class="site-copy">Los números de las sucursales son de demostración.</p>
          </div>
        </div>
      </section>
    </main>

    <AssistantChat v-if="assistant" :ask="calls.ask" restaurant="La Mesa" @draft="onDraft" />
    <SiteFooter />
  </div>
</template>

<style scoped>
.site-skip:focus { clip: auto; width: auto; height: auto; top: 12px; left: 12px; padding: 10px 14px; background: var(--paper); z-index: 30; }
.site-hero {
  display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); align-items: center;
  min-height: calc(100svh - var(--header-height)); gap: clamp(22px, 5vw, 76px); padding-block: clamp(32px, 5vw, 64px);
}
.hero-copy h1 { max-width: 8ch; font-size: clamp(3.5rem, 7.4vw, 7.8rem); line-height: .99; letter-spacing: -.062em; }
.hero-lead { max-width: 33ch; margin: 22px 0 24px; font-size: clamp(1.05rem, 1.55vw, 1.25rem); line-height: 1.55; color: var(--gray); }
.hero-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 20px; }
.hero-image { height: clamp(420px, 72svh, 740px); border-radius: 46% 46% 20px 20px / 28% 28% 20px 20px; }
.hero-image img { object-position: 76% center; }
.hero-hours { border-top: 1px solid var(--line); margin-top: 26px; padding-top: 16px; max-width: 525px; }
.hero-hours h2 { font: 700 .78rem/1.5 'Manrope', sans-serif; letter-spacing: .06em; text-transform: uppercase; margin-bottom: 9px; }
.hero-hours ul { list-style: none; display: flex; flex-wrap: wrap; gap: 10px 22px; margin: 0; padding: 0; }
.hero-hours li { display: grid; gap: 2px; font-size: .85rem; }
.hero-hours span, .hero-hours a { color: var(--gray); font-size: .85rem; }

.section-space { padding-block: var(--section-space); }
.section-band { background: var(--sand); }
.section-heading { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, .6fr); align-items: end; gap: 16px 44px; margin-bottom: clamp(22px, 4vw, 48px); }
.section-heading > .site-copy { margin: 0; }
.dish-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: clamp(14px, 2vw, 24px); }
.dish-preview { background: var(--paper); border: 1px solid var(--line); min-width: 0; border-radius: 14px; overflow: hidden; }
.dish-preview .site-photo { aspect-ratio: 5 / 4; }
.dish-copy { padding: clamp(14px, 1.8vw, 23px); }
.dish-copy h3, .news-title { font-size: clamp(1.12rem, 1.75vw, 1.55rem); }
.news-title { font-family: 'Lora', Georgia, serif; font-weight: 700; }
.dish-copy p { margin: 8px 0; line-height: 1.5; font-size: .9rem; color: var(--gray); }
.dish-copy p:first-child { margin-top: 0; color: var(--clay-dark); font-size: .75rem; font-weight: 700; }
.dish-copy strong { display: block; margin-top: 12px; }
.dish-copy small { color: var(--gray); }

.spaces-grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, .85fr); gap: clamp(12px, 3vw, 36px); align-items: center; }
.space-photo { height: clamp(240px, 40vw, 560px); border-radius: 14px; }
.terrace-photo { height: clamp(200px, 34vw, 480px); }
.visit { display: grid; grid-template-columns: minmax(0, .72fr) minmax(0, 1.28fr); align-items: start; gap: clamp(20px, 5vw, 72px); }
.visit > :deep(.rsv) { margin-top: 0; width: 100%; min-width: 0; }
.reservation-note { font-size: .9rem; }
.reservation-note a { font-weight: 700; text-underline-offset: .3em; }
.news-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 24px; align-items: start; }
.news-story { border-block: 1px solid var(--line); padding: 6px 0; }
.news-story summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 56px; list-style: none; cursor: pointer; }
.news-story summary::-webkit-details-marker { display: none; }
.news-story summary:hover { color: var(--clay-dark); }
.story-toggle { font-size: 1.55rem; }
.news-story[open] .story-toggle { transform: rotate(45deg); }
.news-story p { line-height: 1.6; color: var(--gray); max-width: 55ch; }
.about-grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, .85fr); gap: clamp(20px, 6vw, 86px); align-items: center; }
.team-photo { aspect-ratio: 3 / 2; border-radius: 14px; }
.site-retry { border: 0; color: var(--clay-dark); background: transparent; font: inherit; text-decoration: underline; cursor: pointer; }
.contact-details dl { display: grid; gap: 10px; margin: 0; }
.contact-details dl > div { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 2px 12px; }
.contact-details dd { margin: 0; }
.contact-details dt { font-weight: 700; }
.contact-details a, .contact-details span { overflow-wrap: anywhere; }
#contacto .section-heading { margin-bottom: 0; }

@media (max-width: 1024px) {
  .dish-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 760px) {
  .site-hero, .section-heading, .visit, .about-grid, .news-grid { grid-template-columns: minmax(0, 1fr); }
  .site-hero { min-height: auto; }
  .hero-copy h1 { max-width: 10ch; font-size: clamp(3rem, 13vw, 5.25rem); }
  .hero-image { height: clamp(250px, 62vw, 420px); }
  .hero-hours { margin-top: 16px; }
  .about-grid .team-photo { grid-row: 2; }
  .space-photo, .terrace-photo { height: clamp(145px, 44vw, 280px); }
}
@media (max-width: 360px) {
  .dish-copy { padding: 11px; }
  .dish-copy p { font-size: .82rem; }
}
@media (prefers-reduced-motion: no-preference) {
  .hero-copy > *, .hero-image { animation: site-enter 620ms cubic-bezier(.16, 1, .3, 1) both; }
  .hero-copy h1 { animation-delay: 70ms; }
  .hero-copy .hero-lead { animation-delay: 120ms; }
  .hero-copy .hero-actions, .hero-copy .hero-hours { animation-delay: 180ms; }
  .hero-image { animation-delay: 90ms; }
  .story-toggle { transition: transform 180ms ease-out; }
  @supports (animation-timeline: view()) {
    .site-reveal {
      animation: site-enter linear both;
      animation-timeline: view();
      animation-range: entry 4% entry 65%;
    }
    .site-reveal:focus-within { animation: none; }
  }
  @keyframes site-enter { from { opacity: .45; transform: translateY(24px); } }
}
</style>
