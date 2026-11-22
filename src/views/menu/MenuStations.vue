<script setup>
import { computed, inject, ref } from 'vue'
import ModalDialog from '../../components/ModalDialog.vue'
import { CODE_PATTERN, catalogErrorText, normalizeCode } from '../../lib/catalog.js'
import { validReason } from '../../lib/personal.js'
import { useAction } from '../../lib/useAction.js'

// Estaciones de preparación (cocina, barra…): a dónde va cada producto al mandarse a preparar.
const props = defineProps({ stations: { type: Array, required: true }, products: { type: Array, required: true } })
const { calls, reload, branchId, canManage } = inject('menu')
const { busy, error, notice, run } = useAction(reload, catalogErrorText)

const usage = computed(() => {
  const count = new Map()
  for (const p of props.products) for (const r of p.routes ?? []) count.set(r.stationId, (count.get(r.stationId) ?? 0) + 1)
  return count
})

const dialog = ref(null)
function open(kind, station = null) {
  notice.value = ''
  error.value = ''
  dialog.value = { kind, station, code: '', name: station?.name ?? '', reason: '' }
}
function close() {
  if (!busy.value) dialog.value = null
}

const TITLES = { add: 'Nueva estación', edit: 'Cambiar nombre', off: 'Desactivar estación', on: 'Activar estación' }

const canSubmit = computed(() => {
  const d = dialog.value
  if (!d || busy.value) return false
  if (d.kind === 'add') return CODE_PATTERN.test(normalizeCode(d.code)) && d.name.trim().length > 0
  if (d.kind === 'edit') return d.name.trim().length > 0 && d.name.trim() !== d.station.name
  return validReason(d.reason)
})

async function submit() {
  if (!canSubmit.value) return
  const d = dialog.value
  const b = branchId()
  const ok = await run(() => {
    if (d.kind === 'add') return calls.createStation(b, { code: normalizeCode(d.code), name: d.name.trim() })
    if (d.kind === 'edit') return calls.updateStation(b, d.station, { name: d.name.trim() })
    return calls.stationStatus(b, d.station, d.kind === 'on' ? 'ACTIVE' : 'INACTIVE', d.reason)
  }, () => ({
    add: `Se creó la estación ${d.name.trim()}.`,
    edit: 'Se cambió el nombre.',
    on: `${d.station?.name} está activa.`,
    off: `${d.station?.name} está inactiva: ya no recibe pedidos nuevos.`,
  })[d.kind])
  if (ok) dialog.value = null
}
</script>

<template>
  <div>
    <div class="toolbar">
      <p class="help">Cada producto se manda a preparar a una o más estaciones. Una estación inactiva no recibe pedidos nuevos.</p>
      <button v-if="canManage" type="button" class="btn btn-primary" @click="open('add')">Nueva estación</button>
    </div>
    <p v-if="notice" class="notice-ok" role="status">{{ notice }}</p>

    <div class="box">
      <table class="data-table">
        <thead><tr><th scope="col">Estación</th><th scope="col">Productos</th><th scope="col">Estado</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
        <tbody>
          <tr v-for="s in stations" :key="s.id">
            <td><span class="cell-main">{{ s.name }}</span><span class="cell-sub">{{ s.code }}</span></td>
            <td>{{ usage.get(s.id) ?? 0 }}</td>
            <td><span class="pill" :class="{ muted: s.status !== 'ACTIVE' }">{{ s.status === 'ACTIVE' ? 'Activa' : 'Inactiva' }}</span></td>
            <td class="actions">
              <template v-if="canManage">
                <button type="button" class="btn" @click="open('edit', s)">Cambiar nombre</button>
                <button v-if="s.status === 'ACTIVE'" type="button" class="btn btn-danger" @click="open('off', s)">Desactivar</button>
                <button v-else type="button" class="btn" @click="open('on', s)">Activar</button>
              </template>
            </td>
          </tr>
          <tr v-if="!stations.length"><td colspan="4" class="empty-row">Todavía no hay estaciones. Crea al menos una (por ejemplo, Cocina) antes de activar productos.</td></tr>
        </tbody>
      </table>
    </div>

    <ModalDialog v-if="dialog" :title="TITLES[dialog.kind]" :busy="busy" @close="close">
      <form class="form" @submit.prevent="submit">
        <template v-if="dialog.kind === 'add'">
          <label>Código<input v-model="dialog.code" class="field" maxlength="32" autocomplete="off" placeholder="COCINA" required /></label>
          <p class="help">De 2 a 32 letras mayúsculas, números, guiones. No se puede cambiar después.</p>
          <label>Nombre<input v-model="dialog.name" class="field" maxlength="120" autocomplete="off" placeholder="Cocina caliente" required /></label>
        </template>
        <label v-else-if="dialog.kind === 'edit'">Nombre<input v-model="dialog.name" class="field" maxlength="120" autocomplete="off" required /></label>
        <template v-else>
          <p class="help" v-if="dialog.kind === 'off'">{{ dialog.station.name }} dejará de recibir pedidos nuevos. Si es la única estación de algún producto o tiene pedidos pendientes, no se podrá desactivar.</p>
          <p class="help" v-else>{{ dialog.station.name }} volverá a recibir pedidos.</p>
          <label>Motivo<textarea v-model="dialog.reason" class="field" rows="3" maxlength="500" required /></label>
        </template>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <div class="form-buttons">
          <button type="button" class="btn" :disabled="busy" @click="close">Cancelar</button>
          <button type="submit" class="btn" :class="dialog.kind === 'off' ? 'btn-danger-solid' : 'btn-primary'" :disabled="!canSubmit">{{ busy ? 'Guardando…' : 'Guardar' }}</button>
        </div>
      </form>
    </ModalDialog>
  </div>
</template>
