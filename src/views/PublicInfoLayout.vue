<script setup>
import { onBeforeUnmount, onMounted } from 'vue'
import SiteHeader from '../components/site/SiteHeader.vue'
import SiteFooter from '../components/site/SiteFooter.vue'
import '@fontsource/lora/latin-700.css'
import '../site.css'

const props = defineProps({ title: { type: String, required: true } })
const previousTitle = document.title
onMounted(() => { document.title = props.title + ' · La Mesa' })
onBeforeUnmount(() => { document.title = previousTitle })
</script>

<template>
  <div class="site">
    <SiteHeader />
    <main class="wrap info-main">
      <h1>{{ title }}</h1>
      <slot />
    </main>
    <SiteFooter />
  </div>
</template>

<style scoped>
.info-main { padding-block: clamp(38px, 7vw, 90px); min-height: 60vh; }
.info-main h1 { font-size: clamp(2.65rem, 6.8vw, 5.7rem); }
</style>
