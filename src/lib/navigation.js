/** Después de entrar solo se vuelve a rutas del propio panel: un `volver` externo no redirige fuera. */
export function safeReturn(value) {
  return typeof value === 'string' && /^\/panel(\/[a-z-]+)?$/.test(value) ? value : '/panel'
}
