import { describe, expect, it } from 'vitest'
import { formatMoney, parseAmount } from '../src/lib/money.js'

describe('formatMoney', () => {
  it('muestra el importe con separador de miles y moneda', () => {
    expect(formatMoney({ amount: '1234.5', currency: 'MXN' })).toBe('$1,234.50 MXN')
  })

  it('pone el signo antes del símbolo en importes negativos', () => {
    expect(formatMoney({ amount: '-14.00', currency: 'MXN' })).toBe('−$14.00 MXN')
  })

  it('no inventa un importe cuando falta', () => {
    expect(formatMoney(null)).toBe('')
  })
})

describe('parseAmount', () => {
  it('acepta hasta dos decimales con punto o coma', () => {
    expect(parseAmount('12')).toBe('12.00')
    expect(parseAmount(' 12,5 ')).toBe('12.50')
  })

  it('rechaza lo que el backend no aceptaría', () => {
    expect(parseAmount('12.345')).toBeNull()
    expect(parseAmount('-1')).toBeNull()
    expect(parseAmount('doce')).toBeNull()
  })
})
