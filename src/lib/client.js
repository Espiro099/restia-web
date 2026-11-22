import { createApi } from './api.js'

// Cliente compartido del panel. Cuando una petición con sesión responde 401, avisa una sola vez a quien
// se haya registrado (main.js: la sesión se marca vencida y se vuelve a la pantalla de acceso).

let onUnauthorized = () => {}

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler
}

const base = createApi()

// El login y /auth/me responden 401 sin que haya una sesión que "venza"; esos no disparan el aviso.
const SILENT = new Set(['/auth/login', '/auth/me', '/auth/logout'])

function guarded(call) {
  return async (path, ...rest) => {
    try {
      return await call(path, ...rest)
    } catch (e) {
      if (e?.status === 401 && !SILENT.has(path)) onUnauthorized(e)
      throw e
    }
  }
}

export const api = {
  get: guarded(base.get),
  post: guarded(base.post),
  patch: guarded(base.patch),
  put: guarded(base.put),
}
