<script setup>
import { nextTick, ref } from 'vue'
import { assistantErrorText, MAX_CHARS } from '../lib/publicMenu.js'

// Asistente del menú QR (QR-14 en restia-api): un botón flotante abre el chat. La conversación vive solo en
// esta página (no se guarda en ningún lado) y se manda completa con cada pregunta.
const props = defineProps({
  /** (messages) => Promise<string>: pregunta con la conversación y devuelve la respuesta. */
  ask: { type: Function, required: true },
  restaurant: { type: String, default: 'La Mesa' },
})

const SUGGESTIONS = ['¿Qué me recomiendas?', '¿Qué hay sin alcohol?', '¿Qué postres tienen?']

const open = ref(false)
const messages = ref([])
const draft = ref('')
const sending = ref(false)
const list = ref(null)
const input = ref(null)

async function scrollDown() {
  await nextTick()
  if (list.value) list.value.scrollTop = list.value.scrollHeight
}

async function toggle() {
  open.value = !open.value
  if (open.value) {
    await nextTick()
    input.value?.focus()
    scrollDown()
  }
}

async function send(text = draft.value) {
  const question = text.trim().slice(0, MAX_CHARS)
  if (!question || sending.value) return
  draft.value = ''
  messages.value.push({ role: 'user', content: question })
  sending.value = true
  scrollDown()
  try {
    const reply = await props.ask(messages.value)
    messages.value.push({ role: 'assistant', content: reply })
  } catch (e) {
    // El error se muestra en el chat pero no se manda en la siguiente pregunta; la pregunta sí se quita,
    // para que la conversación siga alternando cliente y asistente.
    messages.value.pop()
    messages.value.push({ role: 'assistant', content: assistantErrorText(e), error: true })
    draft.value = question
  } finally {
    sending.value = false
    scrollDown()
  }
}

function onKey(event) {
  if (event.key === 'Escape') open.value = false
}
</script>

<template>
  <!-- "chat" y no "assistant": esa clase la llevan las burbujas del asistente. -->
  <div class="chat" @keydown="onKey">
    <section v-if="open" id="assistant-panel" class="panel" role="dialog" aria-label="Asistente del menú">
      <header class="head">
        <div>
          <p class="title">Asistente de {{ restaurant }}</p>
          <p class="hint">Pregunta por platillos, precios o la sucursal. Para pedir, llama a tu mesero.</p>
        </div>
        <button type="button" class="close" aria-label="Cerrar el asistente" @click="open = false">×</button>
      </header>
      <div ref="list" class="list" aria-live="polite">
        <p v-if="!messages.length" class="empty">¡Hola! ¿En qué te ayudo?</p>
        <p v-for="(m, i) in messages" :key="i" class="msg" :class="[m.role, { error: m.error }]">
          <span class="sr-only">{{ m.role === 'user' ? 'Tú:' : 'Asistente:' }}</span>{{ m.content }}
        </p>
        <p v-if="sending" class="msg assistant typing">Escribiendo…</p>
      </div>
      <div v-if="!messages.length" class="chips">
        <button v-for="s in SUGGESTIONS" :key="s" type="button" @click="send(s)">{{ s }}</button>
      </div>
      <form class="compose" @submit.prevent="send()">
        <label class="sr-only" for="assistant-input">Tu pregunta</label>
        <input id="assistant-input" ref="input" v-model="draft" type="text" :maxlength="MAX_CHARS" placeholder="Escribe tu pregunta…" autocomplete="off" />
        <button type="submit" :disabled="sending || !draft.trim()">Enviar</button>
      </form>
      <p class="note">Respuestas generadas con IA; pueden equivocarse. No se guarda la conversación.</p>
    </section>
    <button type="button" class="fab" :aria-expanded="open" aria-controls="assistant-panel" @click="toggle">
      {{ open ? 'Cerrar' : '¿Dudas del menú?' }}
    </button>
  </div>
</template>

<style scoped>
.chat { position: fixed; right: 16px; bottom: 16px; z-index: 30; display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
.fab { font: inherit; font-weight: 700; padding: 12px 18px; border-radius: 999px; border: 0; background: var(--accent); color: #fff; box-shadow: 0 8px 24px rgba(43, 24, 16, .22); cursor: pointer; }
.fab:focus-visible, .close:focus-visible, .chips button:focus-visible, .compose :is(input, button):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.panel { width: min(380px, calc(100vw - 32px)); max-height: min(560px, calc(100vh - 100px)); display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; box-shadow: 0 16px 40px rgba(43, 24, 16, .2); overflow: hidden; }
.head { display: flex; justify-content: space-between; gap: 10px; padding: 14px 14px 10px; border-bottom: 1px solid var(--line); }
.title { margin: 0; font-weight: 700; }
.hint { margin: 2px 0 0; font-size: .8rem; color: var(--muted); }
.close { font: inherit; font-size: 1.4rem; line-height: 1; width: 32px; height: 32px; border-radius: 8px; border: 0; background: none; color: var(--muted); cursor: pointer; }
.list { flex: 1; overflow-y: auto; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; min-height: 120px; }
.empty { margin: 0; color: var(--muted); font-size: .9rem; }
.msg { margin: 0; padding: 9px 12px; border-radius: 14px; font-size: .92rem; line-height: 1.4; max-width: 85%; white-space: pre-wrap; overflow-wrap: anywhere; }
.msg.user { align-self: flex-end; background: var(--accent); color: #fff; border-bottom-right-radius: 4px; }
.msg.assistant { align-self: flex-start; background: var(--bg); border-bottom-left-radius: 4px; }
.msg.error { color: var(--danger); }
.typing { color: var(--muted); font-style: italic; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 14px 10px; }
.chips button { font: inherit; font-size: .82rem; padding: 6px 10px; border-radius: 999px; border: 1px solid var(--line); background: var(--surface); color: var(--text); cursor: pointer; }
.compose { display: flex; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--line); }
.compose input { flex: 1; min-width: 0; font: inherit; font-size: 16px; padding: 9px 12px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface); color: var(--text); }
.compose button { font: inherit; font-weight: 700; padding: 9px 14px; border-radius: 10px; border: 0; background: var(--accent); color: #fff; cursor: pointer; }
.compose button:disabled { opacity: .5; cursor: default; }
.note { margin: 0; padding: 0 14px 10px; font-size: .72rem; color: var(--muted); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
