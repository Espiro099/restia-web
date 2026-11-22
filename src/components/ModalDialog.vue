<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

// Diálogo modal: Esc o clic fuera lo cierran (si no está ocupado) y el foco entra al primer campo.
const props = defineProps({ title: { type: String, required: true }, busy: { type: Boolean, default: false } })
const emit = defineEmits(['close'])
const panel = ref(null)
let previous = null

function close() {
  if (!props.busy) emit('close')
}

function onKey(event) {
  if (event.key === 'Escape') close()
}

onMounted(async () => {
  previous = document.activeElement
  document.addEventListener('keydown', onKey)
  await nextTick()
  panel.value?.querySelector('input, select, textarea, button')?.focus()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  previous?.focus?.()
})
</script>

<template>
  <div class="backdrop" @click.self="close">
    <div ref="panel" class="dialog" role="dialog" aria-modal="true" :aria-label="title">
      <h2>{{ title }}</h2>
      <slot />
    </div>
  </div>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; background: rgba(29, 27, 38, .45); display: grid; place-items: center; padding: 16px; z-index: 20; }
.dialog { background: var(--surface); border-radius: 16px; padding: 22px; width: min(460px, 100%); max-height: calc(100vh - 32px); overflow-y: auto; box-shadow: 0 24px 60px -20px rgba(29, 27, 38, .5); }
h2 { margin: 0 0 14px; font-size: 1.15rem; }
</style>
