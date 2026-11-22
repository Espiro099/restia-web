import { api as defaultApi } from './client.js'
import { errorText } from './errors.js'

// Personal de la sucursal (U-1, U-4, U-5, A-10 en restia-api). Las reglas las aplica la API; aquí solo se
// decide qué ofrecer para no mostrar botones que siempre fallarían.

export const ROLES = ['ADMIN', 'MANAGER', 'WAITER', 'KITCHEN']
/** Un gerente solo da de alta, cambia y da de baja a meseros y cocina (Members::MANAGER_ROLES). */
const MANAGER_ROLES = ['WAITER', 'KITCHEN']

export const REASON_MIN = 3
export const REASON_MAX = 500

/** Roles que quien actúa puede asignar. */
export function assignableRoles(actorRole) {
  if (actorRole === 'ADMIN') return ROLES
  if (actorRole === 'MANAGER') return MANAGER_ROLES
  return []
}

/** ¿Puede cambiar el rol o dar de baja a este miembro? Nunca a sí mismo. */
export function canManageMember(actorRole, member, selfId) {
  if (!member.active || member.user.id === selfId) return false
  return assignableRoles(actorRole).includes(member.role)
}

/** Estado para mostrar: la baja es de esta sucursal; inactivo e invitado son del usuario en todas. */
export function memberStatus(member) {
  if (!member.active) return { key: 'revoked', label: 'Baja' }
  if (member.user.status === 'INACTIVE') return { key: 'inactive', label: 'Usuario desactivado' }
  if (member.user.status === 'INVITED') return { key: 'invited', label: 'Sin contraseña' }
  return { key: 'active', label: 'Activo' }
}

export function validReason(text) {
  const n = String(text ?? '').trim().length
  return n >= REASON_MIN && n <= REASON_MAX
}

const MESSAGES = {
  MEMBERSHIP_ALREADY_EXISTS: 'Esa persona ya trabaja en esta sucursal.',
  LAST_BRANCH_ADMIN: 'La sucursal debe conservar al menos un administrador.',
  USER_INACTIVE: 'El usuario está desactivado. Actívalo antes de cambiarle el rol.',
  BRANCH_INACTIVE: 'La sucursal está desactivada.',
  FORBIDDEN: 'Tu rol no puede hacer esto con esta persona.',
  VERSION_CONFLICT: 'Alguien más lo cambió mientras lo veías. Se recargó la lista; intenta de nuevo.',
}

export function personalErrorText(error) {
  return MESSAGES[error?.code] ?? errorText(error)
}

const ifMatch = (version) => ({ headers: { 'If-Match': `"${version}"` } })

/** Llamadas de Personal. `api` inyectable para las pruebas. */
export function personalApi(api = defaultApi) {
  const base = (branchId) => `/branches/${encodeURIComponent(branchId)}/members`
  return {
    async list(branchId, { role, active, page = 1, perPage = 50 } = {}) {
      const q = new URLSearchParams({ page: String(page), perPage: String(perPage) })
      if (role) q.set('role', role)
      if (active !== null && active !== undefined) q.set('active', active ? 'true' : 'false')
      return api.get(`${base(branchId)}?${q}`)
    },
    add: (branchId, { name, email, role }) => api.post(base(branchId), { name: name.trim(), email: email.trim(), role }),
    changeRole: (branchId, member, role) =>
      api.patch(`${base(branchId)}/${member.user.id}`, { role }, ifMatch(member.version)),
    revoke: (branchId, member, reason) =>
      api.post(`${base(branchId)}/${member.user.id}/revoke`, { reason: reason.trim() }, ifMatch(member.version)),
    setupLink: (user) => api.post(`/users/${user.id}/password-setup-link`, {}),
    deactivate: (user, reason) => api.post(`/users/${user.id}/deactivate`, { reason: reason.trim() }, ifMatch(user.version)),
    activate: (user) => api.post(`/users/${user.id}/activate`, {}, ifMatch(user.version)),
    revokeSessions: (user, reason) => api.post(`/users/${user.id}/sessions/revoke`, { reason: reason.trim() }),
  }
}
