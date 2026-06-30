import { formatCurrency } from '@/lib/utils'
import { BUCKET_STYLE, BUCKET_ORDER, type AgingBucket } from '@/lib/cc-aging'

interface AgingBarProps {
  buckets: AgingBucket[]
  className?: string
}

/**
 * Distribución de la cartera por antigüedad. Misma estética que PaymentMixBar
 * (barra apilada + leyenda), pero muestra monto y porcentaje de cada grupo.
 */
export function AgingBar({ buckets, className }: AgingBarProps) {
  const byKey = new Map(buckets.map(b => [b.bucket, b]))
  const ordered = BUCKET_ORDER.map(k => ({ key: k, amount: byKey.get(k)?.amount ?? 0 }))
  const total = ordered.reduce((a, b) => a + b.amount, 0)
  const present = ordered.filter(b => b.amount > 0)

  if (total <= 0) {
    return (
      <p className={`text-xs text-[var(--text3)] ${className ?? ''}`}>
        No hay deuda pendiente en la cartera.
      </p>
    )
  }

  return (
    <div className={className}>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface2)]">
        {present.map(b => (
          <div
            key={b.key}
            title={`${BUCKET_STYLE[b.key].label}: ${formatCurrency(b.amount)}`}
            style={{ width: `${(b.amount / total) * 100}%`, backgroundColor: BUCKET_STYLE[b.key].color }}
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
        {BUCKET_ORDER.map(k => {
          const amount = byKey.get(k)?.amount ?? 0
          const pct = total > 0 ? Math.round((amount / total) * 100) : 0
          return (
            <div key={k} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: BUCKET_STYLE[k].color }} />
                <span className="text-xs text-[var(--text3)]">{BUCKET_STYLE[k].label}</span>
                <span className="text-xs font-semibold text-[var(--text2)] ml-auto">{pct}%</span>
              </div>
              <span className="text-sm font-semibold mono text-[var(--text)] pl-3.5">{formatCurrency(amount)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
