<script setup>
import { computed } from 'vue'

// Dona de partes de un total (Figma Inicio, "Ventas por…"): segmentos en orden fijo de color, separados por
// 2px del fondo, con el total al centro. La leyenda de al lado lleva nombre y porcentaje, así que el color
// nunca es la única pista; los segmentos sin valor no se dibujan.
const props = defineProps({
  /** [{ key, label, share (0..1), color }] */
  items: { type: Array, required: true },
  center: { type: String, default: '' },
  label: { type: String, required: true },
  size: { type: Number, default: 150 },
})

const R = 60
const STROKE = 26
const C = 2 * Math.PI * R
// 2px de separación medidos sobre el arco.
const GAP = 2

const arcs = computed(() => {
  let offset = 0
  return props.items
    .filter((i) => i.share > 0)
    .map((i) => {
      const len = i.share * C
      const arc = { key: i.key, color: i.color, dash: `${Math.max(0, len - (props.items.filter((x) => x.share > 0).length > 1 ? GAP : 0))} ${C}`, offset: -offset }
      offset += len
      return arc
    })
})
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 150 150" role="img" :aria-label="label">
    <circle cx="75" cy="75" :r="R" fill="none" stroke="var(--divider)" :stroke-width="STROKE" />
    <circle
      v-for="a in arcs"
      :key="a.key"
      cx="75"
      cy="75"
      :r="R"
      fill="none"
      :stroke="a.color"
      :stroke-width="STROKE"
      :stroke-dasharray="a.dash"
      :stroke-dashoffset="a.offset"
      transform="rotate(-90 75 75)"
    />
    <text x="75" y="80" text-anchor="middle" class="center">{{ center }}</text>
  </svg>
</template>

<style scoped>
svg { display: block; flex: none; }
.center { font: 700 13px 'Manrope', system-ui, sans-serif; fill: #382014; }
</style>
