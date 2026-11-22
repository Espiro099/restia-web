import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { makeRouter } from './router.js'
import { setUnauthorizedHandler } from './lib/client.js'
import { useSession } from './stores/session.js'
import './style.css'
import './landing.css'

const app = createApp(App)
const pinia = createPinia()
const router = makeRouter()
app.use(pinia).use(router)

// Una petición con sesión respondió 401: la sesión venció (60 min sin uso) o se cerró desde otro lado.
setUnauthorizedHandler(() => {
  useSession(pinia).expire()
  router.push({ name: 'login' })
})

app.mount('#app')
