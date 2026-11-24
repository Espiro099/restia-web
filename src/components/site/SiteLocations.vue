<script setup>
import { computed } from 'vue'
import BranchMap from '../BranchMap.vue'
import { distanceText, hoursText, telHref } from '../../lib/site.js'

// Sucursales de La Mesa (SITE-1): minimapa y lista. Con la ubicación de la persona, la más cercana va
// primero y queda marcada; la ubicación no sale del navegador.
const props = defineProps({
  /** Ya ordenadas (byDistance), con distanceKm. */
  branches: { type: Array, required: true },
  selected: { type: String, default: '' },
  user: { type: Object, default: null },
  /** idle | asking | denied | unavailable */
  locating: { type: String, default: 'idle' },
})
const emit = defineEmits(['select', 'locate', 'reserve'])

const points = computed(() => props.branches.filter((b) => b.location).map((b) => ({ key: b.code, label: b.name, ...b.location })))
const nearest = computed(() => (props.user ? props.branches.find((b) => b.distanceKm != null) : null))
const LOCATE_TEXT = {
  asking: 'Buscando tu ubicación…',
  denied: 'No tenemos permiso para ver tu ubicación. Puedes elegir la sucursal en el mapa o en la lista.',
  unavailable: 'No pudimos obtener tu ubicación. Elige la sucursal en el mapa o en la lista.',
}
</script>

<template>
  <div class="loc">
    <div class="loc-bar">
      <button v-if="!user" type="button" class="loc-locate" :disabled="locating === 'asking'" @click="emit('locate')">
        <span aria-hidden="true">◎</span> Encontrar la más cercana
      </button>
      <p v-else-if="nearest" class="loc-nearest" role="status">
        La más cercana: <strong>{{ nearest.name }}</strong>, {{ distanceText(nearest.distanceKm) }}.
      </p>
      <p v-if="LOCATE_TEXT[locating]" class="loc-note" aria-live="polite">{{ LOCATE_TEXT[locating] }}</p>
    </div>

    <div class="loc-grid">
      <BranchMap class="loc-map" :points="points" :selected="selected" :user="user" label="Mapa de las sucursales de La Mesa" @select="emit('select', $event)" />

      <ul class="loc-list" aria-label="Sucursales">
        <li v-for="b in branches" :key="b.code">
          <article class="loc-card" :class="{ on: b.code === selected }" :aria-current="b.code === selected ? 'true' : undefined">
            <button type="button" class="loc-name" @click="emit('select', b.code)">
              <span>{{ b.name }}</span>
              <small v-if="b.distanceKm != null">{{ distanceText(b.distanceKm) }}</small>
            </button>
            <p v-if="b.addressText" class="loc-line">{{ b.addressText }}</p>
            <p v-if="hoursText(b.hours)" class="loc-line muted">{{ hoursText(b.hours) }}</p>
            <div class="loc-actions">
              <a v-if="b.mapsUrl" :href="b.mapsUrl" target="_blank" rel="noopener noreferrer">Cómo llegar <span aria-hidden="true">↗</span></a>
              <a v-if="telHref(b.phone)" :href="telHref(b.phone)">Llamar</a>
              <button v-if="b.reservations" type="button" class="loc-reserve" @click="emit('reserve', b.code)">Reservar aquí</button>
            </div>
          </article>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.loc-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 18px; margin: 28px 0 18px; min-height: 46px; }
.loc-locate {
  display: inline-flex; align-items: center; gap: 8px; min-height: 46px; padding: 0 18px; border-radius: 10px;
  border: 1.5px solid var(--clay); background: transparent; color: var(--clay); font: inherit; font-weight: 700; font-size: 14px; cursor: pointer;
}
.loc-locate:hover { background: rgba(199, 65, 21, .08); }
.loc-locate:disabled { opacity: .6; cursor: default; }
.loc-nearest { margin: 0; font-size: 16px; }
.loc-note { margin: 0; font-size: 14px; color: var(--gray); }
.loc-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 24px; align-items: stretch; }
.loc-map { min-height: 440px; height: 100%; }
.loc-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; max-height: 520px; overflow-y: auto; }
.loc-card { background: var(--paper); border: 1.5px solid transparent; border-radius: 14px; padding: 16px 18px; }
.loc-card.on { border-color: var(--clay); }
.loc-name {
  display: flex; justify-content: space-between; align-items: baseline; gap: 12px; width: 100%; padding: 0; border: 0; background: none;
  font-family: 'Lora', Georgia, serif; font-size: 20px; font-weight: 700; color: var(--ink); text-align: left; cursor: pointer;
}
.loc-name small { font-family: 'Manrope', system-ui, sans-serif; font-size: 13px; color: var(--clay); white-space: nowrap; }
.loc-line { margin: 6px 0 0; font-size: 14px; line-height: 1.4; }
.muted { color: var(--gray); }
.loc-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; margin-top: 12px; font-size: 14px; font-weight: 700; }
.loc-actions a { color: var(--clay); text-decoration: none; }
.loc-actions a:hover { text-decoration: underline; }
.loc-reserve { margin-left: auto; min-height: 38px; padding: 0 14px; border-radius: 9px; border: 0; background: var(--clay); color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
.loc-reserve:hover { background: var(--clay-dark); }
button:focus-visible { outline: 2px solid var(--clay); outline-offset: 3px; }

@media (max-width: 900px) {
  .loc-grid { grid-template-columns: 1fr; }
  .loc-map { min-height: 300px; height: 300px; }
  .loc-list { max-height: none; }
}
</style>
