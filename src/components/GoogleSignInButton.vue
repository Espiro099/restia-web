<script setup>
import { nextTick, onMounted, ref } from 'vue'
import { api as defaultApi } from '../lib/client.js'
import { googleConfig, loadGoogleIdentity } from '../lib/google.js'

// Botón «Continuar con Google». Solo aparece si la API tiene GOOGLE_CLIENT_ID y el script de Google cargó;
// si falla la carga con Google habilitado, se puede reintentar.
const props = defineProps({
  api: { type: Object, default: null },
  /** Inyectable en pruebas: () => Promise<google.accounts.id> */
  load: { type: Function, default: loadGoogleIdentity },
})
const emit = defineEmits(['credential'])

const slot = ref(null)
const ready = ref(false)
const failed = ref(false)
const loading = ref(false)

async function renderGoogle(config) {
  if (loading.value) return
  loading.value = true
  failed.value = false
  let gsi
  try {
    gsi = await props.load()
  } catch {
    failed.value = true
    return
  } finally {
    loading.value = false
  }
  gsi.initialize({
    client_id: config.clientId,
    callback: (response) => { if (response?.credential) emit('credential', response.credential) },
    ux_mode: 'popup',
    auto_select: false,
    cancel_on_tap_outside: true,
  })
  ready.value = true
  // Google mide el contenedor para dibujar el botón: primero se muestra.
  await nextTick()
  if (slot.value) {
    const width = Math.min(320, Math.floor(slot.value.clientWidth) || 320)
    gsi.renderButton(slot.value, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', locale: 'es-419', width })
  }
}

let config
onMounted(async () => {
  config = await googleConfig(props.api ?? defaultApi)
  if (config.enabled && slot.value) await renderGoogle(config)
})
</script>

<template>
  <div v-show="ready" class="google">
    <p class="or" aria-hidden="true"><span>o</span></p>
    <div ref="slot" class="google-slot" />
  </div>
  <p v-if="failed" class="google-error" role="status">
    No se pudo cargar el acceso con Google.
    <button type="button" @click="renderGoogle(config)">Reintentar</button>
  </p>
</template>

<style scoped>
.google { display: grid; gap: 12px; justify-items: center; }
.or { display: flex; align-items: center; gap: 10px; width: 100%; margin: 0; color: var(--muted); font-size: .8rem; }
.or::before, .or::after { content: ''; flex: 1; border-top: 1px solid var(--line); }
.google-slot { width: min(100%, 320px); min-height: 44px; display: grid; justify-items: center; }
.google-error { margin: 0; font-size: .82rem; color: var(--muted); }
.google-error button { font: inherit; color: var(--accent-strong); background: none; border: 0; text-decoration: underline; cursor: pointer; }
</style>
