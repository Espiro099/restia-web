<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { moduleByKey } from '../modules.js'

const route = useRoute()
const module = computed(() => moduleByKey(route.meta.module))
</script>

<template>
  <section v-if="module">
    <h1>{{ module.title }}</h1>
    <p class="lead">{{ module.description }}</p>
    <div class="pending" role="status">
      <h2>En construcción</h2>
      <p>Este módulo se construye en la fase {{ module.phase }} del plan de seguimiento.</p>
    </div>
  </section>
</template>

<style scoped>
h1 { margin: 0 0 4px; font-size: 1.6rem; }
.lead { margin: 0 0 24px; color: var(--muted); }
.pending { background: var(--surface); border: 1px dashed var(--line); border-radius: 14px; padding: 20px; max-width: 60ch; }
.pending h2 { margin: 0 0 6px; font-size: 1rem; }
.pending p { margin: 0; color: var(--muted); }
</style>
