<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

// Barras verticales de una sola serie (guía dataviz): barra con esquinas de 4px arriba y apoyada en la base,
// 2px de separación, cuadrícula tenue, etiquetas del eje x espaciadas y tooltip por barra al pasar el mouse
// o con el teclado. La tabla del reporte es la vista accesible completa.
const props = defineProps({
  /** [{ key, label, value, tooltip }] */
  items: { type: Array, required: true },
  label: { type: String, required: true },
  /** Texto de una marca del eje y a partir de su valor. */
  tick: { type: Function, default: (v) => String(v) },
  height: { type: Number, default: 200 },
})

// El ancho es el del contenedor, medido: así el alto queda fijo en píxeles y el texto no crece ni se encoge.
const plot = ref(null)
const width = ref(640)
let observer = null
onMounted(() => {
  if (typeof ResizeObserver === 'undefined' || !plot.value) return
  observer = new ResizeObserver(([entry]) => { width.value = Math.max(240, Math.round(entry.contentRect.width)) })
  observer.observe(plot.value)
})
onBeforeUnmount(() => observer?.disconnect())

const W = computed(() => width.value)
const PAD = { top: 12, right: 8, bottom: 26, left: 56 }
const plotW = computed(() => W.value - PAD.left - PAD.right)
const plotH = computed(() => props.height - PAD.top - PAD.bottom)

/** Máximo redondeado a un número "bonito" para que las marcas del eje sean legibles. */
const max = computed(() => {
  const raw = Math.max(0, ...props.items.map((i) => i.value))
  if (raw === 0) return 1
  const p = 10 ** Math.floor(Math.log10(raw))
  const steps = [1, 2, 2.5, 5, 10]
  return steps.map((s) => s * p).find((s) => s >= raw) ?? 10 * p
})
const ticks = computed(() => [0, 0.5, 1].map((f) => ({ value: max.value * f, y: PAD.top + plotH.value * (1 - f) })))

const slot = computed(() => plotW.value / Math.max(1, props.items.length))
const barW = computed(() => Math.max(2, Math.min(28, slot.value - 2)))

function barPath(i, value) {
  const h = Math.max(value > 0 ? 2 : 0, (value / max.value) * plotH.value)
  const x = PAD.left + i * slot.value + (slot.value - barW.value) / 2
  const y = PAD.top + plotH.value - h
  const w = barW.value
  const r = Math.min(4, w / 2, h)
  if (h === 0) return ''
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

// Como mucho unas 8 etiquetas en el eje x, para que no se encimen.
const labelEvery = computed(() => Math.max(1, Math.ceil(props.items.length / 8)))

const active = ref(-1)
const tipStyle = computed(() => {
  if (active.value < 0) return {}
  const x = PAD.left + (active.value + 0.5) * slot.value
  return { left: `${x}px` }
})
</script>

<template>
  <figure class="chart">
    <div ref="plot" class="plot" @mouseleave="active = -1">
      <svg :viewBox="`0 0 ${W} ${height}`" :width="W" :height="height" role="img" :aria-label="label">
        <g aria-hidden="true">
          <line v-for="t in ticks" :key="t.value" :x1="PAD.left" :x2="W - PAD.right" :y1="t.y" :y2="t.y" class="grid" />
          <text v-for="t in ticks" :key="`l${t.value}`" :x="PAD.left - 6" :y="t.y + 4" class="axis" text-anchor="end">{{ tick(t.value) }}</text>
          <template v-for="(item, i) in items" :key="`x${item.key}`">
            <text v-if="i % labelEvery === 0" :x="PAD.left + (i + 0.5) * slot" :y="height - 8" class="axis" text-anchor="middle">{{ item.label }}</text>
          </template>
        </g>
        <g>
          <g v-for="(item, i) in items" :key="item.key" class="bar" :class="{ on: active === i }" tabindex="0" role="img" :aria-label="item.tooltip"
             @mouseenter="active = i" @focus="active = i" @blur="active = -1">
            <!-- Zona de clic más grande que la barra. -->
            <rect :x="PAD.left + i * slot" :y="PAD.top" :width="slot" :height="plotH" class="hit" />
            <path :d="barPath(i, item.value)" class="mark" />
          </g>
        </g>
      </svg>
      <div v-if="active >= 0" class="tip" :style="tipStyle" role="status">{{ items[active].tooltip }}</div>
    </div>
  </figure>
</template>

<style scoped>
.chart { margin: 0; }
.plot { position: relative; }
svg { width: 100%; display: block; overflow: visible; }
.grid { stroke: var(--line); stroke-width: 1; }
.axis { fill: var(--muted); font-size: 13px; }
.mark { fill: var(--accent); }
.bar .hit { fill: transparent; }
.bar.on .hit { fill: var(--accent-soft); opacity: .6; }
.bar:focus { outline: none; }
.bar:focus-visible .hit { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.5; }
.tip { position: absolute; top: -6px; transform: translate(-50%, -100%); background: var(--text); color: #fff; font-size: .8rem; padding: 6px 9px; border-radius: 8px; white-space: nowrap; pointer-events: none; z-index: 2; }
</style>
