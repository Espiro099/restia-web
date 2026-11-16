import { createRouter, createWebHistory } from 'vue-router'
import LoginView from './views/LoginView.vue'

// Los módulos del panel (personal, catálogo, mesas, inventario, caja, facturación, reportes…) se agregan
// aquí como rutas hijas protegidas por permiso conforme avanzan los sprints.
export const routes = [
  { path: '/', name: 'login', component: LoginView },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export function makeRouter(history = createWebHistory()) {
  return createRouter({ history, routes })
}
