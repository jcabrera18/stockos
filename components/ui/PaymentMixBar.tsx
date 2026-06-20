import { formatCurrency } from '@/lib/utils'

export interface PaymentMix {
  efectivo: number
  debito: number
  credito: number
  transferencia: number
  qr: number
  cuenta_corriente: number
}

const SEGMENTS: { key: keyof PaymentMix; label: string; color: string }[] = [
  { key: 'efectivo', label: 'Efectivo', color: '#10b981' },
  { key: 'debito', label: 'Débito', color: '#3b82f6' },
  { key: 'credito', label: 'Crédito', color: '#8b5cf6' },
  { key: 'transferencia', label: 'Transferencia', color: '#f59e0b' },
  { key: 'qr', label: 'QR', color: '#06b6d4' },
  { key: 'cuenta_corriente', label: 'Cta. Cte.', color: '#f43f5e' },
]

interface PaymentMixBarProps {
  mix: PaymentMix
  className?: string
}

/** Barra apilada con la composición de la venta por medio de pago. */
export function PaymentMixBar({ mix, className }: PaymentMixBarProps) {
  const total = SEGMENTS.reduce((a, s) => a + (mix[s.key] || 0), 0)
  const present = SEGMENTS.filter(s => (mix[s.key] || 0) > 0)

  if (total <= 0) {
    return (
      <p className={`text-xs text-[var(--text3)] ${className ?? ''}`}>
        Todavía no hay ventas en este turno.
      </p>
    )
  }

  return (
    <div className={className}>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface2)]">
        {present.map(s => (
          <div
            key={s.key}
            title={`${s.label}: ${formatCurrency(mix[s.key])}`}
            style={{ width: `${(mix[s.key] / total) * 100}%`, backgroundColor: s.color }}
          />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
        {present.map(s => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-xs text-[var(--text3)]">{s.label}</span>
            <span className="text-xs font-semibold text-[var(--text2)]">
              {Math.round((mix[s.key] / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
