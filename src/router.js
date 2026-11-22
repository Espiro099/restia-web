import { createRouter, createWebHistory } from 'vue-router'
import LandingView from './views/LandingView.vue'
import PanelLayout from './layouts/PanelLayout.vue'
import HomeView from './views/HomeView.vue'
import ModulePendingView from './views/ModulePendingView.vue'
import { MODULES } from './modules.js'
import { useSession } from './stores/session.js'

// Pantalla de cada módulo terminado; los demás muestran ModulePendingView. Se cargan bajo demanda.
const BUILT = {
  personal: () => import('./views/PersonalView.vue'),
  menu: () => import('./views/MenuView.vue'),
  mesas: () => import('./views/TablesView.vue'),
  impresion: () => import('./views/PrintingView.vue'),
}

// Cada módulo es una ruta hija de /panel con su permiso de lectura.
const moduleRoutes = MODULES.map((m) => ({
  path: m.key,
  name: m.key,
  component: BUILT[m.key] ?? ModulePendingView,
  meta: { permission: m.permission, module: m.key },
}))

export const routes = [
  { path: '/', name: 'login', component: LandingView, meta: { public: true } },
  // Menú del QR de cada mesa (`/m#token`): para clientes, sin sesión. Es la URL que imprime la API.
  { path: '/m', name: 'menu-publico', component: () => import('./views/PublicMenuView.vue'), meta: { anonymous: true } },
  {
    path: '/panel',
    component: PanelLayout,
    children: [{ path: '', name: 'inicio', component: HomeView }, ...moduleRoutes],
  },
  { path: '/:pathMatch(.*)*', redirect: '/panel' },
]

/** Decide a dónde va una navegación según la sesión. Separada del router para probarla sola. */
export async function guard(to, session) {
  // El menú del QR no pregunta por sesión: el cliente no tiene una y no debe ver el panel.
  if (to.meta.anonymous) return true
  const signedIn = await session.restore()
  if (to.meta.public) return signedIn ? { name: 'inicio' } : true
  if (!signedIn) return { name: 'login', query: to.fullPath !== '/panel' ? { volver: to.fullPath } : {} }
  // Sin el permiso en la sucursal elegida (por ejemplo, al cambiar de sucursal), de vuelta al inicio.
  if (to.meta.permission && !session.canOpen(to.meta.permission)) return { name: 'inicio' }
  return true
}

export function makeRouter(history = createWebHistory()) {
  const router = createRouter({ history, routes })
  router.beforeEach((to) => guard(to, useSession()))
  return router
}
