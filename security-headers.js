// Cabeceras de seguridad del panel (Actividad 3.2). Las mismas que pone el proxy TLS de producción
// (restia-api/deploy/apache/restia-tls.conf); aquí las usa `vite preview`.
export const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    // Botón de Google Identity Services (inicio de sesión con Google): su script, estilo, marco y conexiones.
    "script-src 'self' https://accounts.google.com/gsi/client",
    "style-src 'self' https://accounts.google.com/gsi/style",
    "img-src 'self' data: blob: https://tile.openstreetmap.org",
    "font-src 'self'",
    "connect-src 'self' https://accounts.google.com/gsi/",
    "frame-src https://accounts.google.com/gsi/",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self), payment=()',
}
