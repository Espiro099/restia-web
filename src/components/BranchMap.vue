<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

// Minimapa de sucursales con Leaflet y teselas de OpenStreetMap (gratis, sin llave; SITE-1 en restia-api).
// Leaflet se carga al montar el mapa, así no pesa en el resto del panel. Los marcadores son HTML propio
// (sin imágenes de Leaflet) y se pueden enfocar con el teclado.
const props = defineProps({
  /** [{ key, lat, lng, label }] */
  points: { type: Array, default: () => [] },
  selected: { type: String, default: '' },
  /** Punto de la persona, si compartió su ubicación: { lat, lng } */
  user: { type: Object, default: null },
  /** El panel deja tocar el mapa para mover el punto de la sucursal. */
  pickable: { type: Boolean, default: false },
  label: { type: String, default: 'Mapa de sucursales' },
})
const emit = defineEmits(['select', 'pick'])

const el = ref(null)
const failed = ref(false)
let L = null
let map = null
let layer = null

function pinIcon(point) {
  const on = point.key === props.selected
  return L.divIcon({
    className: 'lm-pin' + (on ? ' lm-pin-on' : ''),
    html: '<span class="lm-pin-dot"></span>',
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  })
}

function draw(fit) {
  if (!map) return
  layer.clearLayers()
  const bounds = []
  for (const p of props.points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue
    const marker = L.marker([p.lat, p.lng], { icon: pinIcon(p), title: p.label, alt: p.label, keyboard: true, riseOnHover: true })
    marker.on('click', () => emit('select', p.key))
    marker.addTo(layer)
    bounds.push([p.lat, p.lng])
  }
  if (props.user) {
    L.circleMarker([props.user.lat, props.user.lng], { radius: 7, weight: 3, color: '#fff', fillColor: '#2563eb', fillOpacity: 1 })
      .bindTooltip('Tú estás aquí').addTo(layer)
  }
  if (!fit) return
  const chosen = props.points.find((p) => p.key === props.selected)
  if (chosen && props.user) {
    map.fitBounds([[chosen.lat, chosen.lng], [props.user.lat, props.user.lng]], { padding: [40, 40], maxZoom: 15 })
  } else if (chosen) {
    map.setView([chosen.lat, chosen.lng], 15)
  } else if (bounds.length) {
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 })
  } else {
    map.setView([23.6345, -102.5528], 4) // México completo
  }
}

onMounted(async () => {
  try {
    L = (await import('leaflet')).default
    await import('leaflet/dist/leaflet.css')
  } catch {
    failed.value = true
    return
  }
  if (!el.value) return
  map = L.map(el.value, { scrollWheelZoom: false, zoomControl: true, attributionControl: true })
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map)
  layer = L.layerGroup().addTo(map)
  if (props.pickable) map.on('click', (e) => emit('pick', { lat: e.latlng.lat, lng: e.latlng.lng }))
  draw(true)
})

watch(() => [props.points, props.user], () => draw(true), { deep: true })
watch(() => props.selected, () => draw(true))

onBeforeUnmount(() => {
  map?.remove()
  map = null
})
</script>

<template>
  <div class="lm-map" role="region" :aria-label="label">
    <div ref="el" class="lm-map-canvas" />
    <p v-if="failed" class="lm-map-failed">No se pudo cargar el mapa.</p>
  </div>
</template>

<style>
/* Sin "scoped": Leaflet crea estos elementos fuera de la plantilla. */
.lm-map { position: relative; border-radius: 14px; overflow: hidden; background: #e9e2d8; }
.lm-map-canvas { width: 100%; height: 100%; min-height: 260px; }
.lm-map-failed { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; color: #5d6466; font-size: 14px; }
.lm-map .leaflet-container { font: inherit; }
.lm-pin { background: none; border: 0; }
.lm-pin-dot {
  display: block; width: 22px; height: 22px; margin: 0 auto; border-radius: 50% 50% 50% 0; transform: rotate(-45deg);
  background: #7a6a5c; border: 3px solid #fff; box-shadow: 0 2px 6px rgba(0, 0, 0, .3);
}
.lm-pin-on .lm-pin-dot { background: #c74115; width: 26px; height: 26px; }
.lm-pin:focus-visible { outline: 3px solid #c74115; outline-offset: 2px; border-radius: 50%; }
</style>
