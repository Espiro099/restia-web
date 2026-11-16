// Importes de restia-api: { amount: "207.00", currency: "MXN" }, siempre como texto para no perder centavos.

/** Texto para mostrar: "$1,234.50 MXN". Un importe inválido se muestra tal cual. */
export function formatMoney(money) {
  if (!money || typeof money.amount !== 'string') return ''
  const value = Number(money.amount)
  if (!Number.isFinite(value)) return money.amount
  const sign = value < 0 ? '−' : ''
  const text = Math.abs(value).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${sign}$${text} ${money.currency}`
}

/** Importe escrito por el usuario: hasta 2 decimales, con punto o coma. null si no es válido. */
export function parseAmount(text) {
  const clean = String(text ?? '').trim()
  if (!/^\d{1,12}([.,]\d{1,2})?$/.test(clean)) return null
  return Number(clean.replace(',', '.')).toFixed(2)
}
