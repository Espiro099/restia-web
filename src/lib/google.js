// Inicio de sesión con Google (Decisiones_Google_Login en restia-api). Google Identity Services dibuja su
// propio botón y devuelve un ID token; el panel solo lo manda a POST /auth/google. El script se carga la
// primera vez que se necesita, y solo si la API dice que está encendido.

export const GSI_SRC = 'https://accounts.google.com/gsi/client'

let loading = null

/** Carga el script de Google una sola vez; resuelve con `google.accounts.id`. */
export function loadGoogleIdentity(doc = globalThis.document, win = globalThis.window) {
  if (win?.google?.accounts?.id) return Promise.resolve(win.google.accounts.id)
  loading ??= new Promise((resolve, reject) => {
    const script = doc.createElement('script')
    script.src = GSI_SRC
    script.async = true
    script.onload = () => (win.google?.accounts?.id ? resolve(win.google.accounts.id) : reject(new Error('gsi')))
    script.onerror = () => {
      loading = null
      reject(new Error('gsi'))
    }
    doc.head.appendChild(script)
  })
  return loading
}

/** { enabled, clientId } de GET /auth/google; apagado si la API no responde. */
export async function googleConfig(api) {
  try {
    const { data } = await api.get('/auth/google')
    return data?.enabled && data.clientId ? { enabled: true, clientId: data.clientId } : { enabled: false, clientId: null }
  } catch {
    return { enabled: false, clientId: null }
  }
}
