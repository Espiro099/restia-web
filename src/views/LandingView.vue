<script setup>
import '@fontsource/lora/latin-700.css'
import LoginView from './LoginView.vue'
import room from '../assets/sitio/salon.webp'
</script>

<template>
  <div class="access-page">
    <header class="access-header">
      <img src="../assets/marca/restia-logo.png" alt="Restia" width="130" height="48" />
      <RouterLink :to="{ name: 'sitio' }" class="access-back">
        <span aria-hidden="true">←</span> Volver a La Mesa
      </RouterLink>
    </header>

    <main class="access-main">
      <div class="access-story">
        <img :src="room" alt="" width="604" height="482" fetchpriority="high" />
        <div class="access-caption">
          <p>Restia para La Mesa</p>
          <h1>Acceso del personal</h1>
        </div>
      </div>
      <div class="access-form">
        <LoginView />
      </div>
    </main>
  </div>
</template>

<style scoped>
.access-page {
  min-height: 100svh;
  background: #f8f1e7;
  color: #382014;
}
.access-header, .access-main {
  width: min(1180px, calc(100% - 64px));
  margin-inline: auto;
}
.access-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-height: 88px;
  border-bottom: 1px solid #e1d2c2;
}
.access-header img { width: auto; height: 46px; }
.access-back {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding-block: 10px;
  color: #693c28;
  font-weight: 700;
  font-size: .86rem;
  text-decoration: underline;
  text-decoration-color: transparent;
  text-underline-offset: .25em;
}
.access-back:hover, .access-back:focus-visible { text-decoration-color: currentColor; }
.access-main {
  display: grid;
  grid-template-columns: minmax(0, 1.22fr) minmax(0, 1fr);
  align-items: stretch;
  min-height: min(620px, calc(100svh - 160px));
  margin-block: 34px;
  border: 1px solid #e1d2c2;
  border-radius: 22px;
  overflow: hidden;
  background: #fffaf4;
  box-shadow: 0 18px 50px -32px #693c28;
}
.access-story { position: relative; display: grid; align-items: end; isolation: isolate; min-height: 340px; background: #382014; }
.access-story img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.access-story::after { content: ''; position: absolute; inset: 0; background: linear-gradient(0deg, #28160ff5, #28160f33 65%); }
.access-caption { position: relative; z-index: 1; padding: clamp(24px, 5vw, 60px); color: #fffaf4; }
.access-caption p { margin: 0 0 10px; color: #f9cf9b; font-size: .78rem; font-weight: 700; letter-spacing: .13em; text-transform: uppercase; }
.access-caption h1 { margin: 0; font: 700 clamp(2rem, 4.6vw, 4.3rem)/1.05 'Lora', Georgia, serif; max-width: 9em; }
.access-form { align-self: center; width: min(100%, 450px); margin-inline: auto; padding: clamp(25px, 4.8vw, 52px); min-width: 0; }
@media (prefers-reduced-motion: no-preference) {
  .access-caption, .access-form { animation: access-enter 340ms cubic-bezier(.16, 1, .3, 1) both; }
  .access-form { animation-delay: 65ms; }
  @keyframes access-enter { from { opacity: 0; transform: translateY(9px); } }
}
@media (max-width: 760px) {
  .access-header, .access-main { width: calc(100% - 32px); }
  .access-header { min-height: 66px; }
  .access-header img { height: 36px; }
  .access-main { grid-template-columns: minmax(0, 1fr); margin-block: 16px 28px; border-radius: 16px; }
  .access-story { min-height: 174px; }
  .access-caption { padding: 22px; }
  .access-form { padding: 25px 18px 30px; }
}
</style>
