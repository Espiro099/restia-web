<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import '@fontsource/lora/latin-700.css'
import '@fontsource/manrope/latin-400.css'
import '@fontsource/manrope/latin-700.css'
import { menuSections, priceText, publicErrorText, publicMenuApi, recommendedOf, tokenFromHash } from '../lib/publicMenu.js'
import { imageSrc } from '../lib/productImage.js'
import logo from '../assets/marca/lamesa-logo.png'
import cover from '../assets/sitio/portada.webp'
import room from '../assets/sitio/salon.webp'

// Menú del QR de la mesa (Figma "Restia web", 01 · Clientes → Inicio móvil, adaptado): solo el menú, la
// recomendación del día y el detalle de cada platillo con su foto y descripción. Solo lectura, sin cuenta ni
// cookies; para pedir, el cliente llama a su mesero (QR-1).
const props = defineProps({ api: { type: Object, default: null } })
const calls = props.api ?? publicMenuApi()

const token = ref('')
const context = ref(null)
const menu = ref(null)
const error = ref('')
const loading = ref(true)
const selected = ref(null)
const closeButton = ref(null)
let opener = null

const sections = computed(() => menuSections(menu.value))
const picks = computed(() => recommendedOf(menu.value))
/** Foto de portada de cada categoría: la del primer platillo que tenga, o una del restaurante. */
const sectionCover = (s, i) => imageSrc(s.items.find((p) => imageSrc(p.imageUrl))?.imageUrl) ?? (i % 2 ? room : cover)

async function load() {
  token.value = tokenFromHash(window.location.hash)
  error.value = ''
  if (!token.value) {
    error.value = 'Este enlace no es válido. Escanea de nuevo el código de tu mesa.'
    loading.value = false
    return
  }
  loading.value = true
  try {
    const [c, m] = await Promise.all([calls.context(token.value), calls.menu(token.value)])
    context.value = c.data
    menu.value = m.data
    calls.presence(token.value)
  } catch (e) {
    error.value = publicErrorText(e)
  } finally {
    loading.value = false
  }
}

async function show(product, event) {
  opener = event?.currentTarget ?? null
  selected.value = product
  await nextTick()
  closeButton.value?.focus()
}
function hide() {
  selected.value = null
  opener?.focus?.()
}
function onKey(event) {
  if (event.key === 'Escape' && selected.value) hide()
}

let previousTitle = ''
onMounted(() => {
  previousTitle = document.title
  window.addEventListener('hashchange', load)
  document.addEventListener('keydown', onKey)
  load()
})
onBeforeUnmount(() => {
  window.removeEventListener('hashchange', load)
  document.removeEventListener('keydown', onKey)
  document.title = previousTitle
})

// El título de la pestaña sigue al restaurante.
watch(context, (c) => { if (c) document.title = `${c.restaurantName} · Menú` })

/** Salta a una categoría sin cambiar el #token de la URL. */
function jump(anchor) {
  document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth' })
}

/** "elige 1" / "de 1 a 3" */
function rule(m) {
  if (m.minSelections <= 0) return 'opcional'
  return m.minSelections === m.maxSelections ? `elige ${m.minSelections}` : `elige de ${m.minSelections} a ${m.maxSelections}`
}
</script>

<template>
  <div class="qr">
    <header class="bar">
      <img :src="logo" alt="La Mesa" class="logo" width="88" height="48" />
      <p v-if="context" class="table">Mesa {{ context.tableNumber }}</p>
    </header>

    <section class="qr-hero" aria-labelledby="qr-title">
      <img :src="cover" alt="" class="qr-hero-photo" width="1792" height="768" />
      <div class="veil" aria-hidden="true" />
      <div class="qr-hero-text">
        <p class="eyebrow">{{ context ? context.restaurantName : 'Bienvenido a La Mesa' }}</p>
        <h1 id="qr-title">Nuestro menú</h1>
        <p class="qr-lead">Toca un platillo para ver su foto y lo que lleva.</p>
      </div>
    </section>

    <main class="inner">
      <p v-if="loading" class="state" aria-live="polite">Cargando el menú…</p>
      <div v-else-if="error" class="state" role="alert">
        <p>{{ error }}</p>
        <button v-if="token" type="button" class="cta" @click="load">Intentar de nuevo</button>
      </div>
      <template v-else>
        <section v-if="picks.length" class="picks" aria-labelledby="picks-title">
          <p class="kicker">Hoy en la cocina</p>
          <h2 id="picks-title">Recomendación del día</h2>
          <button v-for="p in picks" :key="p.id" type="button" class="pick" :class="{ out: p.availability === 'SOLD_OUT' }" @click="show(p, $event)">
            <img v-if="imageSrc(p.imageUrl)" :src="imageSrc(p.imageUrl)" alt="" class="pick-photo" width="640" height="400" loading="lazy" />
            <span v-else class="pick-photo pick-empty" aria-hidden="true">{{ p.name.charAt(0) }}</span>
            <span class="pick-body">
              <span class="pick-name">{{ p.name }}</span>
              <span v-if="p.description" class="pick-desc">{{ p.description }}</span>
              <span class="pick-foot">
                <span class="price">{{ priceText(p.price) }}</span>
                <span v-if="p.availability === 'SOLD_OUT'" class="sold">Agotado por hoy</span>
                <span v-else class="more">Ver platillo <span aria-hidden="true">→</span></span>
              </span>
            </span>
          </button>
        </section>

        <p v-if="!sections.length" class="state">Por ahora no hay platillos disponibles.</p>

        <nav v-if="sections.length > 1" class="cats" aria-label="Categorías">
          <a v-for="(s, i) in sections" :key="s.anchor" :href="`#${token}`" class="cat" @click.prevent="jump(s.anchor)">
            <img :src="sectionCover(s, i)" alt="" class="cat-photo" width="300" height="200" loading="lazy" />
            <span class="cat-veil" aria-hidden="true" />
            <span class="cat-name">{{ s.category }}</span>
            <span class="cat-count">{{ s.items.length }} {{ s.items.length === 1 ? 'platillo' : 'platillos' }}</span>
            <span class="cat-go" aria-hidden="true">→</span>
          </a>
        </nav>

        <section v-for="s in sections" :id="s.anchor" :key="s.anchor" class="section">
          <h2>{{ s.category }}</h2>
          <ul class="dishes">
            <li v-for="p in s.items" :key="p.id">
              <button type="button" class="dish" :class="{ out: p.availability === 'SOLD_OUT' }" @click="show(p, $event)">
                <img v-if="imageSrc(p.imageUrl)" :src="imageSrc(p.imageUrl)" alt="" class="dish-photo" width="72" height="72" loading="lazy" />
                <span v-else class="dish-photo dish-empty" aria-hidden="true">{{ p.name.charAt(0) }}</span>
                <span class="dish-text">
                  <span class="dish-name">{{ p.name }}<span v-if="p.recommended" class="tag">Recomendado</span></span>
                  <span v-if="p.description" class="dish-desc">{{ p.description }}</span>
                  <span v-if="p.availability === 'SOLD_OUT'" class="sold">Agotado por hoy</span>
                </span>
                <span class="price">{{ priceText(p.price) }}</span>
              </button>
            </li>
          </ul>
        </section>
        <p class="note">Precios en {{ context?.currency ?? 'MXN' }} con IVA incluido. Para ordenar, llama a tu mesero.</p>
      </template>
    </main>

    <div v-if="selected" class="sheet-backdrop" @click.self="hide">
      <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="dish-title">
        <button ref="closeButton" type="button" class="close" aria-label="Cerrar" @click="hide">×</button>
        <img v-if="imageSrc(selected.imageUrl)" :src="imageSrc(selected.imageUrl)" :alt="selected.name" class="sheet-photo" width="1200" height="800" />
        <div class="sheet-body">
          <p v-if="selected.recommended" class="kicker">Recomendación del día</p>
          <div class="sheet-head">
            <h2 id="dish-title">{{ selected.name }}</h2>
            <span class="price">{{ priceText(selected.price) }}</span>
          </div>
          <p class="sheet-cat">{{ selected.category }}</p>
          <p v-if="selected.availability === 'SOLD_OUT'" class="sold">Agotado por hoy</p>
          <p v-if="selected.description" class="sheet-desc">{{ selected.description }}</p>
          <div v-for="m in selected.modifiers" :key="m.id" class="mod">
            <p class="mod-name">{{ m.name }} <span>({{ rule(m) }})</span></p>
            <p class="mod-opts">
              <span v-for="(o, i) in m.options" :key="o.id">{{ o.name }}<template v-if="Number(o.priceDelta.amount) > 0"> +{{ priceText(o.priceDelta) }}</template><template v-if="i < m.options.length - 1">, </template></span>
            </p>
          </div>
          <p class="sheet-note">Para pedirlo, avísale a tu mesero.</p>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.qr {
  --cream: #faf0e5; --ink: #382014; --clay: #c74115; --clay-dark: #a5360f; --gray: #5d6466; --gold: #f8b651; --paper: #fffaf4; --line: #ead9c6;
  min-height: 100vh; background: var(--cream); color: var(--ink); font-family: 'Manrope', system-ui, sans-serif;
}
.bar { display: flex; align-items: center; justify-content: space-between; padding: 10px 18px; background: var(--cream); position: sticky; top: 0; z-index: 10; }
.logo { display: block; height: 40px; width: auto; }
.table { margin: 0; font-weight: 700; color: var(--clay); font-size: .95rem; }

.qr-hero { position: relative; min-height: 260px; display: flex; align-items: flex-end; overflow: hidden; color: var(--paper); }
.qr-hero-photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.veil { position: absolute; inset: 0; background: linear-gradient(0deg, rgba(38, 25, 15, .82) 0%, rgba(38, 25, 15, .35) 70%, rgba(38, 25, 15, .15) 100%); }
.qr-hero-text { position: relative; padding: 28px 18px 24px; max-width: 680px; width: 100%; margin: 0 auto; }
.eyebrow { margin: 0 0 8px; font-size: 12px; font-weight: 700; letter-spacing: .28em; text-transform: uppercase; color: var(--gold); }
h1, h2 { font-family: 'Lora', Georgia, serif; font-weight: 700; margin: 0; }
h1 { font-size: clamp(2rem, 8vw, 2.8rem); line-height: 1.1; }
.qr-lead { margin: 8px 0 0; font-size: .98rem; }

.inner { max-width: 680px; margin: 0 auto; padding: 0 18px 32px; }
.kicker { margin: 0 0 6px; font-size: 11px; font-weight: 700; letter-spacing: .28em; text-transform: uppercase; color: var(--clay); }
.picks { padding-top: 26px; }
.picks h2 { font-size: 1.6rem; margin-bottom: 14px; }
.pick { display: block; width: 100%; padding: 0; margin: 0 0 14px; border: 0; border-radius: 16px; overflow: hidden; background: var(--paper); color: var(--ink); text-align: left; font: inherit; cursor: pointer; box-shadow: 0 6px 20px rgba(56, 32, 20, .1); }
.pick-photo { display: block; width: 100%; height: auto; aspect-ratio: 16 / 10; object-fit: cover; }
.pick-empty, .dish-empty { display: grid; place-items: center; background: #f2e3d3; color: var(--clay); font-family: 'Lora', serif; font-weight: 700; font-size: 2.4rem; }
.pick-body { display: grid; gap: 6px; padding: 14px 16px 16px; }
.pick-name { font-family: 'Lora', serif; font-weight: 700; font-size: 1.25rem; }
.pick-desc { color: var(--gray); font-size: .92rem; line-height: 1.4; }
.pick-foot { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 4px; }
.more { color: var(--clay); font-weight: 700; font-size: .88rem; }

.cats { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding-top: 22px; }
.cat { position: relative; display: flex; flex-direction: column; justify-content: flex-end; min-height: 118px; padding: 12px; border-radius: 14px; overflow: hidden; color: #fff; text-decoration: none; }
.cat-photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.cat-veil { position: absolute; inset: 0; background: linear-gradient(0deg, rgba(38, 25, 15, .85) 0%, rgba(38, 25, 15, .35) 100%); }
.cat-name, .cat-count, .cat-go { position: relative; }
.cat-name { font-weight: 700; font-size: 1.05rem; line-height: 1.2; }
.cat-count { font-size: .78rem; opacity: .9; }
.cat-go { position: absolute; top: 12px; right: 12px; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; background: var(--clay); font-weight: 700; font-size: .85rem; }

.section { padding-top: 26px; scroll-margin-top: 70px; }
.section h2 { font-size: 1.35rem; margin-bottom: 10px; }
.dishes { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.dish { display: grid; grid-template-columns: 72px minmax(0, 1fr) auto; gap: 12px; align-items: center; width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 14px; background: var(--paper); color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
.dish-photo { display: block; width: 72px; height: 72px; border-radius: 10px; object-fit: cover; }
.dish-photo.dish-empty { display: grid; font-size: 1.6rem; }
.dish-text { display: grid; gap: 3px; min-width: 0; }
.dish-name { font-weight: 700; }
.dish-desc { color: var(--gray); font-size: .84rem; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.tag { margin-left: 6px; padding: 2px 8px; border-radius: 999px; background: #fbe9d2; color: var(--clay-dark); font-size: .7rem; font-weight: 700; vertical-align: 2px; }
.price { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.sold { color: #b3261e; font-size: .82rem; font-weight: 700; }
.out { opacity: .65; }
.out :is(.dish-photo, .pick-photo) { filter: grayscale(1); }
.pick:focus-visible, .dish:focus-visible, .cat:focus-visible, .close:focus-visible, .cta:focus-visible { outline: 3px solid var(--clay); outline-offset: 2px; }

.state { text-align: center; padding: 48px 8px; color: var(--gray); }
.cta { font: inherit; margin-top: 10px; padding: 10px 18px; border-radius: 10px; border: 0; background: var(--clay); color: #fff; font-weight: 700; cursor: pointer; }
.note { color: var(--gray); font-size: .82rem; text-align: center; padding: 22px 0 0; }

.sheet-backdrop { position: fixed; inset: 0; z-index: 40; background: rgba(38, 25, 15, .55); display: flex; align-items: flex-end; justify-content: center; }
.sheet { position: relative; width: 100%; max-width: 680px; max-height: 92vh; overflow-y: auto; background: var(--paper); border-radius: 20px 20px 0 0; }
.sheet-photo { display: block; width: 100%; height: auto; aspect-ratio: 3 / 2; object-fit: cover; }
.close { position: absolute; top: 10px; right: 10px; z-index: 1; width: 38px; height: 38px; border-radius: 50%; border: 0; background: rgba(255, 250, 244, .92); color: var(--ink); font: inherit; font-size: 1.5rem; line-height: 1; cursor: pointer; }
.sheet-body { padding: 18px 18px 28px; }
.sheet-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.sheet-head h2 { font-size: 1.5rem; padding-right: 40px; }
.sheet-cat { margin: 4px 0 0; color: var(--gray); font-size: .88rem; }
.sheet-desc { margin: 14px 0 0; line-height: 1.5; }
.mod { margin-top: 14px; }
.mod-name { margin: 0; font-weight: 700; font-size: .92rem; }
.mod-name span { font-weight: 400; color: var(--gray); }
.mod-opts { margin: 4px 0 0; color: var(--gray); font-size: .9rem; }
.sheet-note { margin: 18px 0 0; padding: 10px 12px; border-radius: 10px; background: #fbe9d2; color: var(--clay-dark); font-weight: 700; font-size: .88rem; }

@media (min-width: 720px) {
  .qr-hero { min-height: 320px; }
  .cats { grid-template-columns: repeat(3, 1fr); }
  .sheet-backdrop { align-items: center; }
  .sheet { border-radius: 20px; }
}
@media (prefers-reduced-motion: no-preference) {
  .sheet { animation: rise .22s ease-out; }
  @keyframes rise { from { transform: translateY(24px); opacity: 0; } to { transform: none; opacity: 1; } }
}
</style>
