import { defineStore } from 'pinia'
import { createApi } from '../lib/api.js'

/** Mensaje para la persona según el error; el código exacto queda para soporte. */
export function loginErrorText(error) {
  if (error?.code === 'NETWORK') return 'No hay conexión con el servidor.'
  if (error?.code === 'AUTHENTICATION_INVALID') return 'Correo o contraseña incorrectos.'
  if (error?.status === 429) return 'Demasiados intentos. Espera un momento.'
  if (error?.status >= 500) return 'El servidor tuvo un problema. Intenta de nuevo.'
  return error?.message ?? 'No se pudo iniciar sesión.'
}

/** Sesión del panel (POST /auth/login): usuario y membresías con sus permisos por sucursal. */
export const useSession = defineStore('session', {
  state: () => ({ user: null, memberships: [], submitting: false, error: null }),
  getters: {
    signedIn: (s) => s.user !== null,
    /** ¿Tiene el permiso en esa sucursal? */
    can: (s) => (branchId, permission) =>
      s.memberships.some((m) => m.branch?.id === branchId && (m.permissions ?? []).includes(permission)),
  },
  actions: {
    async login(email, password, api = createApi()) {
      if (this.submitting) return false
      this.submitting = true
      this.error = null
      try {
        const { data } = await api.post('/auth/login', { email: email.trim(), password })
        this.user = data.user
        this.memberships = data.memberships ?? []
        return true
      } catch (e) {
        this.error = loginErrorText(e)
        return false
      } finally {
        this.submitting = false
      }
    },
  },
})
