<script setup>
import LoginView from './LoginView.vue'
import { MODULES } from '../modules.js'
</script>

<template>
  <div class="page">
    <header class="top">
      <div class="brand"><img src="../assets/marca/restia-logo.png" alt="Restia" width="130" height="48" /></div>
    </header>

    <main>
      <section class="hero">
        <div>
          <h1>La operación del restaurante, <em>en un solo panel</em>.</h1>
          <p>
            Restia une el piso, la cocina y la caja. Meseros y cocina trabajan en la app Android; administradores y
            gerentes configuran la sucursal y supervisan la operación desde este panel web. Ambos usan la misma API.
          </p>
          <ul class="facts">
            <li><b>199</b> operaciones de la API para la web</li>
            <li><b>{{ MODULES.length }}</b> módulos del panel</li>
            <li><b>4</b> roles: administrador, gerente, mesero y cocina</li>
          </ul>
        </div>
        <div class="card">
          <LoginView />
        </div>
      </section>

      <section class="block">
        <h2>Módulos del panel</h2>
        <p>Lo que administra cada sucursal. Cada módulo respeta los permisos del rol que inicia sesión.</p>
        <div class="grid">
          <article v-for="m in MODULES" :key="m.key" class="module">
            <h3>{{ m.title }}</h3>
            <p>{{ m.description }}</p>
          </article>
        </div>
      </section>

      <section class="block">
        <h2>Cómo encaja</h2>
        <p>Un solo backend y dos clientes; ningún cliente guarda reglas de negocio propias.</p>
        <div class="flow">
          <div class="module"><h3>Panel web (este repositorio)</h3><p>Vue 3 + Vite. Sesión con cookie y CSRF.</p><small>restia-web</small></div>
          <div class="module"><h3>API</h3><p>Laravel 13 + MongoDB, monolito modular con contrato OpenAPI.</p><small>restia-api</small></div>
          <div class="module"><h3>App de piso</h3><p>Android (Kotlin, Jetpack Compose) para meseros y cocina.</p><small>restia-mobile</small></div>
        </div>
      </section>
    </main>

    <footer>
      Restia · Proyecto integrador, Desarrollo WEB Integral · Universidad Tecnológica de Jalisco, 2026.
    </footer>
  </div>
</template>
