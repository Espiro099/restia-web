// Texto para la persona a partir de un ApiError del contrato. Cada módulo puede afinar mensajes propios;
// estos son los que valen para todo el panel.

export function errorText(error) {
  if (!error) return ''
  if (error.code === 'NETWORK') return 'No hay conexión con el servidor. Revisa tu red e intenta de nuevo.'
  if (error.status === 401) return 'Tu sesión terminó. Vuelve a entrar.'
  if (error.status === 403) return 'Tu rol no tiene permiso para esto en esta sucursal.'
  if (error.status === 404) return 'Ya no existe o no pertenece a esta sucursal.'
  if (error.status === 409) return 'Alguien más lo cambió mientras lo veías. Vuelve a cargar e intenta de nuevo.'
  if (error.status === 429) return 'Demasiadas solicitudes seguidas. Espera un momento.'
  if (error.status >= 500) return 'El servidor tuvo un problema. Intenta de nuevo en un momento.'
  return error.message || 'No se pudo completar la operación.'
}
