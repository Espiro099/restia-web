<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { menuSections, priceText, publicErrorText, publicMenuApi, tokenFromHash } from '../lib/publicMenu.js'
import { imageSrc } from '../lib/productImage.js'

// Página que abre el cliente al escanear el QR de su mesa: solo lectura, sin cuenta ni cookies.
const props = defineProps({ api: { type: Object, default: null } })
const calls = props.api ?? publicMenuApi()

const token = ref('')
const context = ref(null)
const menu = ref(null)
const error = ref('')
const loading = ref(true)

const sections = computed(() => menuSections(menu.value))

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

let previousTitle = ''
onMounted(() => {
  previousTitle = document.title
  window.addEventListener('hashchange', load)
  load()
})
onBeforeUnmount(() => {
  window.removeEventListener('hashchange', load)
  document.title = previousTitle
})

// El título de la pestaña sigue al restaurante.
watch(context, (c) => { if (c) document.title = `${c.restaurantName} · Menú` })

/** Salta a una categoría sin cambiar el #token de la URL. */
function jump(anchor) {
  document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth' })
}
</script>

<template>
  <div class="public">
    <header class="pm-top">
      <div class="inner">
        <img src="../assets/marca/lamesa-logo.png" alt="La Mesa" class="logo" width="146" height="80" />
        <p class="eyebrow">{{ context ? `Mesa ${context.tableNumber}` : 'Menú' }}</p>
        <h1>{{ context?.restaurantName ?? 'La Mesa' }}</h1>
      </div>
      <nav v-if="sections.length > 1" class="cats" aria-label="Categorías">
        <a v-for="s in sections" :key="s.anchor" :href="`#${token}`" @click.prevent="jump(s.anchor)">{{ s.category }}</a>
      </nav>
    </header>

    <main class="inner">
      <p v-if="loading" class="state" aria-live="polite">Cargando el menú…</p>
      <div v-else-if="error" class="state" role="alert">
        <p>{{ error }}</p>
        <button v-if="token" type="button" @click="load">Intentar de nuevo</button>
      </div>
      <template v-else>
        <p v-if="!sections.length" class="state">Por ahora no hay platillos disponibles.</p>
        <section v-for="s in sections" :id="s.anchor" :key="s.anchor" class="section">
          <h2>{{ s.category }}</h2>
          <article v-for="p in s.items" :key="p.id" class="dish" :class="{ out: p.availability === 'SOLD_OUT', 'with-photo': imageSrc(p.imageUrl) }">
            <!-- Decorativa: el nombre del platillo va justo al lado. -->
            <img v-if="imageSrc(p.imageUrl)" :src="imageSrc(p.imageUrl)" alt="" class="dish-photo" width="88" height="88" loading="lazy" />
            <div class="dish-head">
              <h3>{{ p.name }}</h3>
              <span class="price">{{ priceText(p.price) }}</span>
            </div>
            <p v-if="p.availability === 'SOLD_OUT'" class="sold">Agotado por hoy</p>
            <div v-for="m in p.modifiers" :key="m.id" class="mod">
              <span class="mod-name">{{ m.name }}<template v-if="m.minSelections > 0"> (elige {{ m.minSelections === m.maxSelections ? m.minSelections : `de ${m.minSelections} a ${m.maxSelections}` }})</template>:</span>
              <span v-for="(o, i) in m.options" :key="o.id" class="opt">{{ o.name }}<template v-if="Number(o.priceDelta.amount) > 0"> +{{ priceText(o.priceDelta) }}</template><template v-if="i < m.options.length - 1">, </template></span>
            </div>
          </article>
        </section>
        <p class="note">Precios en {{ context?.currency ?? 'MXN' }} con IVA incluido. Para ordenar, llama a tu mesero.</p>
      </template>
    </main>
  </div>
</template>

<style scoped>
.public { min-height: 100vh; background: var(--bg); color: var(--text); }
.inner { max-width: 680px; margin: 0 auto; padding: 0 16px; }
.pm-top { background: var(--surface); border-bottom: 1px solid var(--line); position: sticky; top: 0; z-index: 5; }
.pm-top .inner { padding-top: 18px; padding-bottom: 10px; }
.logo { display: block; height: 56px; width: auto; margin-bottom: 6px; }
.eyebrow { margin: 0; font-size: .8rem; font-weight: 700; text-transform: uppercase; letter-spacing: .6px; color: var(--accent); }
h1 { margin: 2px 0 0; font-size: 1.5rem; }
.cats { display: flex; gap: 8px; overflow-x: auto; padding: 4px 16px 12px; max-width: 680px; margin: 0 auto; scrollbar-width: none; }
.cats a { flex: none; padding: 6px 12px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font-size: .88rem; font-weight: 600; text-decoration: none; }
.cats a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.section { padding-top: 22px; scroll-margin-top: 120px; }
h2 { margin: 0 0 10px; font-size: 1.1rem; }
.dish { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; margin-bottom: 10px; }
.dish.out { opacity: .6; }
.dish.with-photo { display: grid; grid-template-columns: 88px minmax(0, 1fr); column-gap: 14px; }
.dish.with-photo > :not(.dish-photo) { grid-column: 2; }
.dish-photo { grid-row: 1 / span 4; width: 88px; height: 88px; border-radius: 10px; object-fit: cover; background: var(--accent-soft); }
.dish.out .dish-photo { filter: grayscale(1); }
.dish-head { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
h3 { margin: 0; font-size: 1rem; }
.price { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.sold { margin: 4px 0 0; color: var(--danger); font-size: .85rem; font-weight: 600; }
.mod { margin-top: 6px; color: var(--muted); font-size: .88rem; line-height: 1.4; }
.mod-name { font-weight: 600; margin-right: 4px; }
.state { text-align: center; padding: 48px 8px; color: var(--muted); }
.state button { font: inherit; margin-top: 10px; padding: 9px 16px; border-radius: 10px; border: 0; background: var(--accent); color: #fff; font-weight: 600; cursor: pointer; }
.note { color: var(--muted); font-size: .82rem; text-align: center; padding: 18px 0 32px; }
</style>
