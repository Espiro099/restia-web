import { api as defaultApi } from './client.js'
import { catalogErrorText } from './catalog.js'

// Datos de la sucursal (B-3 en restia-api): nombre, contacto, dirección y horario de reservas. Solo ADMIN
// (branches.update). Sin horario de reservas, la app no deja reservar ("Fuera del horario de reservas").

export const DAYS = [
  { day: 1, label: 'Lunes' }, { day: 2, label: 'Martes' }, { day: 3, label: 'Miércoles' }, { day: 4, label: 'Jueves' },
  { day: 5, label: 'Viernes' }, { day: 6, label: 'Sábado' }, { day: 7, label: 'Domingo' },
]

/** La API acepta hasta 3 horarios por día (21 en total). */
export const MAX_RANGES_PER_DAY = 3
const HOUR = /^([01]\d|2[0-3]):[0-5]\d$/

/** Lista de la API → un renglón por día, de lunes a domingo, con sus horarios en orden. */
export function daysFromHours(hours) {
  return DAYS.map(({ day, label }) => ({
    day,
    label,
    ranges: (hours ?? []).filter((h) => h.dayOfWeek === day)
      .map((h) => ({ opensAt: h.opensAt, closesAt: h.closesAt }))
      .sort((a, b) => a.opensAt.localeCompare(b.opensAt)),
  }))
}

/** Renglones → lista de la API. Un día sin horarios queda cerrado para reservas. */
export function hoursFromDays(days) {
  return days.flatMap((d) => d.ranges.map((r) => ({ dayOfWeek: d.day, opensAt: r.opensAt, closesAt: r.closesAt })))
}

/** Un horario que cierra a la misma hora o antes de abrir termina al día siguiente (así lo lee la API). */
export function crossesMidnight(range) {
  return HOUR.test(range.opensAt) && HOUR.test(range.closesAt) && range.closesAt <= range.opensAt
}

export function hoursProblem(days) {
  for (const d of days) {
    if (d.ranges.length > MAX_RANGES_PER_DAY) return `${d.label}: hasta ${MAX_RANGES_PER_DAY} horarios.`
    for (const r of d.ranges) {
      if (!HOUR.test(r.opensAt) || !HOUR.test(r.closesAt)) return `${d.label}: escribe las horas como 13:00.`
    }
  }
  return ''
}

export function toleranceProblem(text) {
  const n = Number(text)
  return /^\d{1,3}$/.test(String(text).trim()) && n <= 240 ? '' : 'La tolerancia va de 0 a 240 minutos.'
}

const ADDRESS_FIELDS = ['line1', 'line2', 'city', 'state', 'postalCode', 'country']

export function emptyAddress() {
  return { line1: '', line2: '', city: '', state: '', postalCode: '', country: 'MX' }
}

/** Formulario de datos generales a partir de la sucursal. */
export function generalForm(branch) {
  const a = branch.address ?? {}
  return {
    name: branch.name ?? '',
    phone: branch.phone ?? '',
    address: Object.fromEntries(ADDRESS_FIELDS.map((k) => [k, a[k] ?? emptyAddress()[k]])),
  }
}

export function generalProblem(form) {
  if (!form.name.trim()) return 'Falta el nombre de la sucursal.'
  const a = form.address
  const filled = ['line1', 'city', 'state', 'postalCode'].filter((k) => a[k].trim())
  if (filled.length && filled.length < 4) return 'La dirección necesita calle, ciudad, estado y código postal.'
  if (filled.length && !/^[A-Z]{2}$/.test(a.country.trim().toUpperCase())) return 'El país va con dos letras, por ejemplo MX.'
  return ''
}

/** Solo lo que cambió, como lo pide el PATCH. Una dirección vacía no se manda: la API no la borra. */
export function generalChanges(branch, form) {
  const out = {}
  if (form.name.trim() !== (branch.name ?? '')) out.name = form.name.trim()
  const phone = form.phone.trim() || null
  if (phone !== (branch.phone ?? null)) out.phone = phone
  const a = form.address
  if (a.line1.trim()) {
    const address = {
      line1: a.line1.trim(), line2: a.line2.trim() || null, city: a.city.trim(), state: a.state.trim(),
      postalCode: a.postalCode.trim(), country: a.country.trim().toUpperCase(),
    }
    const before = branch.address ?? {}
    if (ADDRESS_FIELDS.some((k) => (address[k] ?? null) !== (before[k] ?? null))) out.address = address
  }
  return out
}

export function reservationChanges(branch, days, tolerance) {
  const out = {}
  const hours = hoursFromDays(days)
  const key = (list) => JSON.stringify([...list].map((h) => [h.dayOfWeek, h.opensAt, h.closesAt]).sort())
  if (key(hours) !== key(branch.reservationHours ?? [])) out.reservationHours = hours
  if (Number(tolerance) !== branch.reservationNoShowToleranceMinutes) out.reservationNoShowToleranceMinutes = Number(tolerance)
  return out
}

const MESSAGES = {
  BRANCH_HAS_ACTIVE_OPERATIONS: 'Hay mesas o turnos abiertos; ese dato solo cambia sin operación activa.',
  VERSION_CONFLICT: 'Alguien más cambió la sucursal mientras la editabas. Se recargó; intenta de nuevo.',
}

export function branchErrorText(error) {
  return MESSAGES[error?.code] ?? catalogErrorText(error)
}

export function branchApi(api = defaultApi) {
  const at = (b) => `/branches/${encodeURIComponent(b)}`
  return {
    get: async (b) => (await api.get(at(b))).data,
    // La versión va del cuerpo: el ETag puede llegar con el sufijo de compresión del servidor ("4-br").
    update: (b, branch, changes) => api.patch(at(b), changes, { headers: { 'If-Match': `"${branch.version}"` } }),
  }
}
