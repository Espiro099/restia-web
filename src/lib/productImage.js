// Foto del producto (M-12 en restia-api). Se sube a la API, que la vuelve a codificar como JPEG de hasta
// 1200 px y la sirve en /api/v1/public/images/{id}. El panel la reduce antes de subirla para no mandar
// fotos de varios MB desde el teléfono o la cámara.

export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp'
export const IMAGE_MAX_SIDE = 1200
/** Lo que se acepta elegir; ya reducida pesa unos cientos de KB. */
export const IMAGE_MAX_INPUT_BYTES = 20 * 1024 * 1024
const IMAGE_TYPES = IMAGE_ACCEPT.split(',')
const PUBLIC_IMAGE = /^\/api\/v1\/public\/images\/[0-9a-f-]{36}$/i

/**
 * Dirección para el <img>. La API da una URL completa a su propio dominio; el panel y el menú QR la piden
 * por el mismo dominio del panel (que reenvía /api a la API), así la CSP sigue siendo `img-src 'self'`.
 * Cualquier otra dirección no se muestra.
 */
export function imageSrc(url) {
  if (!url) return null
  try {
    const path = new URL(url, 'https://panel.invalid').pathname
    return PUBLIC_IMAGE.test(path) ? path : null
  } catch {
    return null
  }
}

/** Por qué no se puede usar el archivo elegido, o '' si sirve. */
export function imageProblem(file) {
  if (!file) return 'Elige una foto.'
  if (!IMAGE_TYPES.includes(file.type)) return 'La foto debe ser JPG, PNG o WebP.'
  if (file.size > IMAGE_MAX_INPUT_BYTES) return 'La foto pesa más de 20 MB. Elige una más ligera.'
  return ''
}

/** Medidas para que el lado mayor no pase de `max`, sin agrandar. */
export function fitWithin(width, height, max = IMAGE_MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/**
 * Reduce la foto en el navegador y la devuelve como JPEG. Respeta la orientación de la cámara (EXIF) y
 * pone fondo blanco a lo transparente. `deps` permite probarla sin canvas.
 */
export async function shrinkImage(file, deps = {}) {
  const decode = deps.createImageBitmap ?? globalThis.createImageBitmap
  const makeCanvas = deps.createCanvas ?? (() => document.createElement('canvas'))
  let bitmap
  try {
    bitmap = await decode(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('No se pudo leer la foto. Prueba con otra.')
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height)
  const canvas = makeCanvas()
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  if (!blob) throw new Error('No se pudo preparar la foto. Prueba con otra.')
  return blob
}
