<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSession } from '../stores/session.js'
import { safeReturn } from '../lib/navigation.js'
import GoogleSignInButton from '../components/GoogleSignInButton.vue'

const session = useSession()
const router = useRouter()
const route = useRoute()
const email = ref('')
const password = ref('')
const showPassword = ref(false)
const canSubmit = computed(
  () => !session.submitting && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim()) && password.value.length > 0,
)

async function submit() {
  if (!canSubmit.value) return
  const ok = await session.login(email.value, password.value)
  // La contraseña no se queda en memoria más de lo necesario.
  password.value = ''
  showPassword.value = false
  if (ok) {
    email.value = ''
    await router.push(safeReturn(route.query.volver))
  }
}

async function withGoogle(credential) {
  if (await session.loginWithGoogle(credential)) await router.push(safeReturn(route.query.volver))
}
</script>

<template>
  <form class="login" @submit.prevent="submit">
    <h2>Acceso al panel</h2>
    <p v-if="session.expired" class="notice" role="status">Tu sesión terminó por inactividad. Vuelve a entrar.</p>
    <label>
      Correo
      <input v-model="email" type="email" autocomplete="username" required />
    </label>
    <div class="password-field">
      <label for="staff-password">Contraseña</label>
      <div class="password-row">
        <input id="staff-password" v-model="password" :type="showPassword ? 'text' : 'password'" autocomplete="current-password" required />
        <button class="password-toggle" type="button" aria-controls="staff-password" @click="showPassword = !showPassword">
          {{ showPassword ? 'Ocultar' : 'Mostrar' }}<span class="sr-only"> contraseña</span>
        </button>
      </div>
    </div>
    <p v-if="session.error" class="error" role="alert">{{ session.error }}</p>
    <button class="login-submit" type="submit" :disabled="!canSubmit">{{ session.submitting ? 'Entrando…' : 'Entrar' }}</button>
    <GoogleSignInButton @credential="withGoogle" />
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
.login-submit {
  font: inherit; font-weight: 600; padding: 11px; border: 0; border-radius: 10px;
  background: var(--accent); color: #fff; cursor: pointer;
}
.login-submit:disabled { background: #9a6957; cursor: not-allowed; }
.login-submit:hover:not(:disabled) { background: var(--accent-strong); }
.password-field { display: grid; gap: 6px; }
.password-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; }
.password-toggle {
  padding-inline: 10px; border: 1px solid var(--line); border-radius: 10px;
  background: var(--surface); color: var(--accent-strong); font: inherit; font-size: .8rem; font-weight: 700; cursor: pointer;
}
.password-toggle:hover { background: var(--accent-soft); }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (prefers-reduced-motion: no-preference) {
  button { transition: background-color 150ms ease, transform 150ms ease-out; }
  button:active:not(:disabled) { transform: scale(.98); }
}
.hint { margin: 0; font-size: .8rem; color: var(--muted); }
.error { margin: 0; color: var(--danger); font-size: .9rem; }
.notice { margin: 0; padding: 10px 12px; border-radius: 10px; background: var(--accent-soft); color: var(--accent); font-size: .9rem; }
</style>
