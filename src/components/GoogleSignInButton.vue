<script setup>
import { nextTick, onMounted, ref } from 'vue'
import { api as defaultApi } from '../lib/client.js'
import { googleConfig, loadGoogleIdentity } from '../lib/google.js'

// Botón «Continuar con Google». Solo aparece si la API tiene GOOGLE_CLIENT_ID y el script de Google cargó;
// si no, el panel se queda con correo y contraseña sin avisar nada.
const props = defineProps({
  api: { type: Object, default: null },
  /** Inyectable en pruebas: () => Promise<google.accounts.id> */
  load: { type: Function, default: loadGoogleIdentity },
})
const emit = defineEmits(['credential'])

const slot = ref(null)
const ready = ref(false)

onMounted(async () => {
  const config = await googleConfig(props.api ?? defaultApi)
  if (!config.enabled) return
  let gsi
  try {
    gsi = await props.load()
  } catch {
    return
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
    gsi.renderButton(slot.value, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', locale: 'es-419', width: 320 })
  }
})
</script>

<template>
  <div v-show="ready" class="google">
    <p class="or" aria-hidden="true"><span>o</span></p>
    <div ref="slot" class="google-slot" />
  </div>
</template>

<style scoped>
.google { display: grid; gap: 12px; justify-items: center; }
.or { display: flex; align-items: center; gap: 10px; width: 100%; margin: 0; color: var(--muted); font-size: .8rem; }
.or::before, .or::after { content: ''; flex: 1; border-top: 1px solid var(--line); }
.google-slot { min-height: 44px; }
</style>
