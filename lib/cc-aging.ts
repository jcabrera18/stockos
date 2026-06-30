// ════════════════════════════════════════════════════════════════════════════
// Cuenta corriente — modelo de antigüedad de cartera (aging)
// ────────────────────────────────────────────────────────────────────────────
// La regla de negocio (umbrales 30/60/90 días y el cálculo FIFO del cargo más
// viejo impago) vive en la función SQL get_cc_portfolio_kpis. Acá sólo está la
// capa de PRESENTACIÓN: cómo se ve cada bucket (color, etiqueta, estado).
//
// Cuando se reemplace la regla de "30 días" por una fecha de vencimiento real
// por cliente, sólo cambia la función SQL: los buckets siguen llegando con las
// mismas keys y este archivo no se toca.
// ════════════════════════════════════════════════════════════════════════════

export type AgingBucketKey = '0-30' | '31-60' | '61-90' | '90+'

export interface AgingBucket {
  bucket:    AgingBucketKey
  amount:    number
  customers: number
}

export interface TopDebtor {
  id:         string
  full_name:  string
  balance:    number
  days:       number
  bucket:     AgingBucketKey
}

export interface CcPortfolioKpis {
  total_pending:        number
  prev_month_pending:   number
  customers_with_debt:  number
  overdue_total:        number
  overdue_customers:    number
  collected_this_month: number
  charged_this_month:   number
  aging:                AgingBucket[]
  top_debtors:          TopDebtor[]
  generated_at:         string
}

interface BucketStyle {
  /** Etiqueta corta para leyendas y barras */
  label:  string
  /** Etiqueta de estado para la tabla de top deudores */
  status: string
  /** Color sólido (barra apilada / punto de leyenda) */
  color:  string
  /** Color de texto para el pill de estado */
  text:   string
  /** Fondo del pill de estado */
  bg:     string
}

// Verde → amarillo → naranja → rojo, a medida que envejece la deuda.
export const BUCKET_STYLE: Record<AgingBucketKey, BucketStyle> = {
  '0-30':  { label: '0-30 días',  status: '🟢 Al día',     color: '#16a34a', text: '#16a34a', bg: 'rgba(22,163,74,0.12)' },
  '31-60': { label: '31-60 días', status: '🟡 31-60 días', color: '#d97706', text: '#d97706', bg: 'rgba(217,119,6,0.12)' },
  '61-90': { label: '61-90 días', status: '🟠 61-90 días', color: '#f97316', text: '#f97316', bg: 'rgba(249,115,22,0.14)' },
  '90+':   { label: '+90 días',   status: '🔴 +90 días',   color: '#dc2626', text: '#dc2626', bg: 'rgba(220,38,38,0.12)' },
}

export const BUCKET_ORDER: AgingBucketKey[] = ['0-30', '31-60', '61-90', '90+']

/** Antigüedad legible: "12 días", "1 día", "—" si está al día sin deuda vieja. */
export function formatDebtAge(days: number): string {
  if (days <= 0) return 'Hoy'
  return days === 1 ? '1 día' : `${days} días`
}
