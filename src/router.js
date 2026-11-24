import { createRouter, createWebHistory } from 'vue-router'
import LandingView from './views/LandingView.vue'
import PanelLayout from './layouts/PanelLayout.vue'
import HomeView from './views/HomeView.vue'
import { MODULES } from './modules.js'
import { useSession } from './stores/session.js'

// Pantalla de cada módulo; se cargan bajo demanda.
const BUILT = {
  sucursal: () => import('./views/BranchView.vue'),
  personal: () => import('./views/PersonalView.vue'),
  menu: () => import('./views/MenuView.vue'),
  mesas: () => import('./views/TablesView.vue'),
  impresion: () => import('./views/PrintingView.vue'),
  reportes: () => import('./views/ReportsView.vue'),
  caja: () => import('./views/CashView.vue'),
  clientes: () => import('./views/CustomersView.vue'),
  reservaciones: () => import('./views/ReservationsView.vue'),
  dispositivos: () => import('./views/DevicesView.vue'),
  auditoria: () => import('./views/AuditView.vue'),
  facturacion: () => import('./views/InvoicesView.vue'),
  inventario: () => import('./views/InventoryView.vue'),
  ventas: () => import('./views/SalesView.vue'),
  comandas: () => import('./views/OrdersView.vue'),
  configuracion: () => import('./views/SettingsView.vue'),
  avisos: () => import('./views/NoticesView.vue'),
}

// Cada módulo es una ruta hija de /panel con su permiso de lectura.
const moduleRoutes = MODULES.map((m) => ({
  path: m.key,
  name: m.key,
  component: BUILT[m.key],
  meta: { permission: m.permission, module: m.key },
}))

export const routes = [
  // Sitio de La Mesa para clientes: sin sesión, como el menú del QR.
  { path: '/', name: 'sitio', component: () => import('./views/SiteView.vue'), meta: { anonymous: true } },
  { path: '/como-llegar', name: 'como-llegar', component: () => import('./views/SiteDirectionsView.vue'), meta: { anonymous: true } },
  { path: '/privacidad', name: 'privacidad', component: () => import('./views/SitePrivacyView.vue'), meta: { anonymous: true } },
  // Acceso directo del personal al panel.
  { path: '/acceso', name: 'login', component: LandingView, meta: { public: true } },
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
  // Los módulos sin permiso propio (Configuración, Avisos) piden igual acceso al panel.
  if ((to.meta.module || to.meta.permission) && !session.canOpen(to.meta.permission ?? null)) return { name: 'inicio' }
  return true
}

export function makeRouter(history = createWebHistory()) {
  const router = createRouter({
    history, routes,
    scrollBehavior(to, from, savedPosition) {
      if (!['sitio', 'como-llegar', 'privacidad'].includes(to.name)) return
      if (savedPosition) return savedPosition
      const target = to.name === 'sitio' && to.hash && document.getElementById(to.hash.slice(1))
      if (target) {
        const top = Number.parseFloat(getComputedStyle(target).scrollMarginTop) || 0
        const smooth = from.name === to.name && window.matchMedia?.('(prefers-reduced-motion: no-preference)').matches
        return { el: target, top, behavior: smooth ? 'smooth' : 'instant' }
      }
      return { top: 0, behavior: 'instant' }
    },
  })
  router.beforeEach((to) => guard(to, useSession()))
  return router
}
