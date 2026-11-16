<script setup>
import { ref, computed } from 'vue'

const email = ref('')
const password = ref('')
const canSubmit = computed(() => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim()) && password.value.length > 0)
</script>

<template>
  <form class="login" @submit.prevent>
    <h2>Acceso al panel</h2>
    <label>
      Correo
      <input v-model="email" type="email" autocomplete="username" required />
    </label>
    <label>
      Contraseña
      <input v-model="password" type="password" autocomplete="current-password" required />
    </label>
    <button type="submit" :disabled="!canSubmit">Entrar</button>
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
</style>
