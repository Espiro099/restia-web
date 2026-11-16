<script setup>
import { ref, computed } from 'vue'
import { useSession } from '../stores/session.js'

const session = useSession()
const email = ref('')
const password = ref('')
const canSubmit = computed(
  () => !session.submitting && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim()) && password.value.length > 0,
)

async function submit() {
  if (!canSubmit.value) return
  const ok = await session.login(email.value, password.value)
  // La contraseña no se queda en memoria más de lo necesario.
  password.value = ''
  if (ok) email.value = ''
}
</script>

<template>
  <div v-if="session.signedIn" class="welcome">
    <h2>Hola, {{ session.user.name }}</h2>
    <p>Sesión iniciada. Los módulos del panel llegan en los siguientes sprints.</p>
  </div>
  <form v-else class="login" @submit.prevent="submit">
    <h2>Acceso al panel</h2>
    <label>
      Correo
      <input v-model="email" type="email" autocomplete="username" required />
    </label>
    <label>
      Contraseña
      <input v-model="password" type="password" autocomplete="current-password" required />
    </label>
    <p v-if="session.error" class="error" role="alert">{{ session.error }}</p>
    <button type="submit" :disabled="!canSubmit">{{ session.submitting ? 'Entrando…' : 'Entrar' }}</button>
    <p class="hint">Para administradores y gerentes. El personal de piso usa la app Android.</p>
  </form>
</template>

<style scoped>
.login { display: grid; gap: 14px; }
h2 { margin: 0 0 4px; font-size: 1.25rem; }
label { display: grid; gap: 6px; font-size: .9rem; color: var(--muted); }
input {
  font: inherit; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line);
  background: var(--surface); color: var(--text);
}
input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
button {
  font: inherit; font-weight: 600; padding: 11px; border: 0; border-radius: 10px;
  background: var(--accent); color: #fff; cursor: pointer;
}
button:disabled { opacity: .45; cursor: not-allowed; }
.hint { margin: 0; font-size: .8rem; color: var(--muted); }
.error { margin: 0; color: #b3261e; font-size: .9rem; }
.welcome p { color: var(--muted); margin: 0; }
</style>
