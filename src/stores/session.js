import { defineStore } from 'pinia'
import { api as defaultApi } from '../lib/client.js'
import { PANEL_ROLES } from '../modules.js'

/** Mensaje para la persona según el error; el código exacto queda para soporte. */
export function loginErrorText(error) {
  if (error?.code === 'NETWORK') return 'No hay conexión con el servidor.'
  if (error?.code === 'AUTHENTICATION_INVALID') return 'Correo o contraseña incorrectos.'
  if (error?.status === 429) return 'Demasiados intentos. Espera un momento.'
  if (error?.status >= 500) return 'El servidor tuvo un problema. Intenta de nuevo.'
  return error?.message ?? 'No se pudo iniciar sesión.'
}

// La sucursal elegida se recuerda por usuario en este navegador. Es solo una comodidad: si el almacenamiento
// no está disponible o la sucursal ya no es suya, se toma la primera.
const BRANCH_KEY = 'restia.branch.'

function rememberedBranch(userId) {
  try {
    return localStorage.getItem(BRANCH_KEY + userId)
  } catch {
    return null
  }
}

function rememberBranch(userId, branchId) {
  try {
    localStorage.setItem(BRANCH_KEY + userId, branchId)
  } catch {
    // Sin almacenamiento, la elección dura lo que dure la pestaña.
  }
}

/** Sesión del panel (cookie de POST /auth/login): usuario, membresías con permisos y sucursal elegida. */
export const useSession = defineStore('session', {
  state: () => ({
    user: null,
    memberships: [],
    branchId: null,
    /** Ya se preguntó a /auth/me si hay una sesión abierta (una vez por carga de la página). */
    restored: false,
    submitting: false,
    error: null,
    /** La sesión venció mientras se usaba el panel: la pantalla de acceso lo explica. */
    expired: false,
  }),
  getters: {
    signedIn: (s) => s.user !== null,
    branches: (s) => s.memberships.map((m) => m.branch),
    currentMembership: (s) => s.memberships.find((m) => m.branch?.id === s.branchId) ?? null,
    /** ¿Tiene el permiso en esa sucursal? */
    can: (s) => (branchId, permission) =>
      s.memberships.some((m) => m.branch?.id === branchId && (m.permissions ?? []).includes(permission)),
    /** ¿Tiene el permiso en la sucursal elegida? */
    canHere() {
      return (permission) => this.can(this.branchId, permission)
    },
    /** ¿Usa el panel en la sucursal elegida? Solo administración y gerencia (modules.js, PANEL_ROLES). */
    panelAccess() {
      return PANEL_ROLES.includes(this.currentMembership?.role)
    },
    /** ¿Ve el módulo con ese permiso en la sucursal elegida? */
    canOpen() {
      // Un módulo sin permiso propio (null) basta con tener acceso al panel.
      return (permission) => this.panelAccess && (permission === null || this.canHere(permission))
    },
  },
  actions: {
    adopt(data) {
      this.user = data.user
      this.memberships = data.memberships ?? []
      const remembered = rememberedBranch(this.user.id)
      const ids = this.memberships.map((m) => m.branch?.id)
      this.branchId = ids.includes(remembered) ? remembered : (ids[0] ?? null)
      this.expired = false
    },

    reset() {
      this.user = null
      this.memberships = []
      this.branchId = null
    },

    async login(email, password, api = defaultApi) {
      if (this.submitting) return false
      this.submitting = true
      this.error = null
      try {
        const { data } = await api.post('/auth/login', { email: email.trim(), password })
        this.adopt(data)
        return true
      } catch (e) {
        this.error = loginErrorText(e)
        return false
      } finally {
        this.submitting = false
      }
    },

    /** Recupera la sesión de la cookie al cargar la página. Sin sesión (401) simplemente no hay usuario. */
    async restore(api = defaultApi) {
      if (this.restored) return this.signedIn
      try {
        const { data } = await api.get('/auth/me')
        this.adopt(data)
      } catch {
        this.reset()
      } finally {
        this.restored = true
      }
      return this.signedIn
    },

    async logout(api = defaultApi) {
      try {
        await api.post('/auth/logout')
      } catch {
        // Si ya había vencido, el resultado es el mismo: fuera.
      }
      this.reset()
    },

    /** Una petición respondió 401: la cookie venció o la sesión se cerró desde otro lado. */
    expire() {
      if (!this.signedIn) return
      this.reset()
      this.expired = true
    },

    selectBranch(branchId) {
      if (!this.memberships.some((m) => m.branch?.id === branchId)) return
      this.branchId = branchId
      rememberBranch(this.user.id, branchId)
    },
  },
})
