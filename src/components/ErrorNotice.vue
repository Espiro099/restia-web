<script setup>
import { computed } from 'vue'
import { errorText } from '../lib/errors.js'

// Error de la API para la persona. El requestId va aparte para que soporte encuentre la petición en los registros.
const props = defineProps({ error: { type: Object, default: null } })
const emit = defineEmits(['retry'])
const text = computed(() => errorText(props.error))
</script>

<template>
  <div v-if="error" class="notice" role="alert">
    <p>{{ text }}</p>
    <small v-if="error.requestId">Referencia: {{ error.requestId }}</small>
    <button type="button" @click="emit('retry')">Reintentar</button>
  </div>
</template>

<style scoped>
.notice { display: grid; gap: 6px; justify-items: start; background: var(--danger-soft); color: var(--danger); border-radius: 12px; padding: 14px 16px; }
.notice p { margin: 0; }
.notice small { color: var(--muted); font-size: .78rem; }
button { font: inherit; font-size: .85rem; padding: 6px 12px; border-radius: 8px; border: 1px solid currentColor; background: transparent; color: inherit; cursor: pointer; }
</style>
