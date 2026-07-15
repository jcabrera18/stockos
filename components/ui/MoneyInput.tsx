'use client'
import { cn } from '@/lib/utils'
import { forwardRef, useRef } from 'react'
import type { InputHTMLAttributes } from 'react'

// ── Helpers de formateo es-AR para montos ──────────────────────────────────
// El valor "crudo" que se almacena/emite es siempre parseable por Number():
// dígitos con "." como separador decimal y SIN separador de miles ("10000000",
// "1500.5"). Lo que se muestra usa "." de miles y "," decimal ("10.000.000").

// Crudo → display es-AR. Preserva coma final para poder seguir tipeando decimales.
export function formatMoneyInput(rawValue: string | number): string {
  if (rawValue == null || rawValue === '') return ''
  const raw = String(rawValue)
  const negative = raw.trim().startsWith('-')
  const [intPart, decPart] = raw.replace('-', '').split('.')
  const intClean = intPart.replace(/\D/g, '')
  if (intClean === '' && decPart === undefined) return ''
  const intFmt = intClean === '' ? '0' : Number(intClean).toLocaleString('es-AR')
  let out = intFmt
  if (decPart !== undefined) out += ',' + decPart.replace(/\D/g, '')
  return (negative ? '-' : '') + out
}

// Lo que el usuario tipeó (con "." de miles y "," decimal) → crudo Number()-safe.
export function parseMoneyInput(text: string): string {
  const negative = text.trim().startsWith('-')
  let cleaned = text.replace(/[^\d,]/g, '') // fuera puntos de miles y todo lo demás
  const firstComma = cleaned.indexOf(',')
  if (firstComma !== -1) {
    const intp = cleaned.slice(0, firstComma).replace(/,/g, '')
    const decp = cleaned.slice(firstComma + 1).replace(/,/g, '')
    cleaned = intp + '.' + decp
  }
  if (cleaned === '' || cleaned === '.') return ''
  return (negative ? '-' : '') + cleaned
}

interface MoneyInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  label?: string
  error?: string
  hint?: string
  value: string | number
  onChange: (raw: string) => void
  /** Omite los estilos base del input. Para celdas inline que aportan su propio
   *  className completo (borde, fondo, padding, etc.). */
  unstyled?: boolean
}

export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(
function MoneyInput({
  label, error, hint, className, id, value, onChange, unstyled, ...props
}, forwardedRef) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
  const ref = useRef<HTMLInputElement>(null)
  const setRefs = (node: HTMLInputElement | null) => {
    ref.current = node
    if (typeof forwardedRef === 'function') forwardedRef(node)
    else if (forwardedRef) forwardedRef.current = node
  }
  const display = formatMoneyInput(value)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.target
    const cursor = el.selectionStart ?? el.value.length
    // cantidad de dígitos/coma a la izquierda del cursor (invariante al reformateo)
    const tokensLeft = el.value.slice(0, cursor).replace(/[^\d,]/g, '').length
    const raw = parseMoneyInput(el.value)
    onChange(raw)
    // recolocar el cursor tras el reformateo, contando dígitos/coma
    const next = formatMoneyInput(raw)
    requestAnimationFrame(() => {
      const node = ref.current
      if (!node) return
      let count = 0
      let pos = 0
      while (pos < next.length && count < tokensLeft) {
        if (/[\d,]/.test(next[pos])) count++
        pos++
      }
      node.setSelectionRange(pos, pos)
    })
  }

  // El wrapper (label/error/hint) se renderiza solo si hay alguno de esos props.
  // Los estilos base del input, en cambio, se aplican SIEMPRE salvo `unstyled`,
  // que se usa en celdas inline que aportan su propio className completo.
  const hasWrapper = !!label || !!error || !!hint

  const inputEl = (
    <input
      ref={setRefs}
      id={inputId}
      type="text"
      inputMode="decimal"
      value={display}
      onChange={handleChange}
      className={cn(
        !unstyled && [
          'w-full px-3 py-2 text-sm rounded-md',
          'bg-[var(--surface)] border border-[var(--border)]',
          'text-[var(--text)] placeholder:text-[var(--text3)]',
          'focus:outline-none focus:border-[var(--accent)]',
          'transition-colors',
        ],
        error && 'border-[var(--danger)]',
        className
      )}
      {...props}
    />
  )

  if (!hasWrapper) return inputEl

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-[var(--text2)]">
          {label}
        </label>
      )}
      {inputEl}
      {error && <span className="text-xs text-[var(--danger)]">{error}</span>}
      {hint && !error && <span className="text-xs text-[var(--text3)]">{hint}</span>}
    </div>
  )
})
