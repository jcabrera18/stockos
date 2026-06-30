'use client'
import { useEffect, useState, useCallback } from 'react'
import { StatCard } from '@/components/ui/StatCard'
import { AgingBar } from '@/components/ui/AgingBar'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { BUCKET_STYLE, formatDebtAge, type CcPortfolioKpis } from '@/lib/cc-aging'
import { buildCcInsights, type CcInsightTone } from '@/lib/cc-insights'
import {
  Wallet, Users, HandCoins, AlertTriangle, Sparkles,
  TrendingUp, TrendingDown, CheckCircle2, Info,
} from 'lucide-react'

const INSIGHT_STYLE: Record<CcInsightTone, { Icon: typeof Info; color: string; bg: string }> = {
  success: { Icon: CheckCircle2,  color: 'var(--accent)',  bg: 'var(--accent-subtle)' },
  warning: { Icon: TrendingUp,    color: 'var(--warning)', bg: 'var(--warning-subtle)' },
  danger:  { Icon: AlertTriangle, color: 'var(--danger)',  bg: 'var(--danger-subtle)' },
  info:    { Icon: Info,          color: 'var(--text2)',   bg: 'var(--surface2)' },
}

// ─── Hook compartido: una sola llamada al endpoint para ambas secciones ───────
export function useCcPortfolioKpis(refreshKey = 0, enabled = true) {
  const [kpis, setKpis] = useState<CcPortfolioKpis | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const fetchKpis = useCallback(async () => {
    if (!enabled) { setLoading(false); return }
    setLoading(true)
    setError(false)
    try {
      const res = await api.get<CcPortfolioKpis>('/api/customers/cc-kpis')
      setKpis(res)
    } catch (err) {
      console.error(err)
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => { fetchKpis() }, [fetchKpis, refreshKey])

  return { kpis, loading, error }
}

// ═══════════════════════════════════════════════════════════════════════════
// Sección superior: KPIs + estado de la cartera (vistazo rápido, sobre la tabla)
// ═══════════════════════════════════════════════════════════════════════════
export function CCPortfolioTop({ kpis, loading }: { kpis: CcPortfolioKpis | null; loading: boolean }) {
  if (loading) return <TopSkeleton />
  if (!kpis) return null  // silencioso: la tabla sigue siendo útil sin el panel

  const recoveryPct = kpis.charged_this_month > 0
    ? Math.round((kpis.collected_this_month / kpis.charged_this_month) * 100)
    : null

  const trendPct = kpis.prev_month_pending > 0
    ? Math.round(((kpis.total_pending - kpis.prev_month_pending) / kpis.prev_month_pending) * 100)
    : null

  // Color de la deuda vencida según su peso en la cartera: bajo→verde, medio→amarillo, alto→rojo.
  const overdueRatio = kpis.total_pending > 0 ? kpis.overdue_total / kpis.total_pending : 0
  const overdueTone = kpis.overdue_total === 0 || overdueRatio < 0.2
    ? 'accent' : overdueRatio <= 0.5 ? 'warning' : 'danger'

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Saldo pendiente"
          value={formatCurrency(kpis.total_pending)}
          valueTitle={formatCurrency(kpis.total_pending)}
          icon={Wallet}
          subtitle={trendPct === null
            ? 'Sin datos del mes pasado'
            : `${trendPct >= 0 ? '↑' : '↓'} ${Math.abs(trendPct)}% vs mes pasado`}
        />
        <StatCard
          title="Clientes con deuda"
          value={kpis.customers_with_debt}
          icon={Users}
          subtitle={kpis.overdue_customers > 0
            ? `${kpis.overdue_customers} con deuda >30 días`
            : 'Ninguno vencido'}
        />
        <StatCard
          title="Cobrado este mes"
          value={formatCurrency(kpis.collected_this_month)}
          valueTitle={formatCurrency(kpis.collected_this_month)}
          icon={HandCoins}
          accent={recoveryPct !== null && recoveryPct >= 80}
          subtitle={recoveryPct === null
            ? 'Sin emisiones este mes'
            : `${recoveryPct}% de lo emitido`}
        />
        <StatCard
          title="Deuda vencida (>30 días)"
          value={formatCurrency(kpis.overdue_total)}
          valueTitle={formatCurrency(kpis.overdue_total)}
          icon={AlertTriangle}
          accent={overdueTone === 'accent'}
          warning={overdueTone === 'warning'}
          danger={overdueTone === 'danger'}
          subtitle={kpis.overdue_customers > 0
            ? `${kpis.overdue_customers} ${kpis.overdue_customers === 1 ? 'cliente' : 'clientes'}`
            : 'Sin deuda vencida'}
        />
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
        <p className="text-xs font-medium text-[var(--text3)] mb-3">Estado de la cartera por antigüedad</p>
        <AgingBar buckets={kpis.aging} />
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Sección inferior: insights + top deudores (cierre de pantalla, bajo la tabla)
// ═══════════════════════════════════════════════════════════════════════════
export function CCPortfolioBottom({
  kpis, onSelectDebtor,
}: { kpis: CcPortfolioKpis | null; onSelectDebtor?: (id: string) => void }) {
  if (!kpis) return null
  const insights = buildCcInsights(kpis)

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* Insights */}
      <Card padding="none" className="flex flex-col">
        <CardHeader className="px-4 pt-4 pb-3">
          <CardTitle>
            <span className="flex items-center gap-1.5">
              <Sparkles size={15} className="text-[var(--accent)]" />
              Para tener en cuenta
            </span>
          </CardTitle>
        </CardHeader>
        {insights.length === 0 ? (
          <div className="px-4 pb-5 text-xs text-[var(--text3)]">Sin novedades en la cartera.</div>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {insights.map(it => {
              const s = INSIGHT_STYLE[it.tone]
              const { Icon } = s
              return (
                <li key={it.id} className="flex gap-3 px-4 py-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: s.bg }}>
                    <Icon size={15} style={{ color: s.color }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--text)]">{it.title}</p>
                    <p className="text-xs text-[var(--text3)] mt-0.5 leading-relaxed">{it.message}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {/* Top deudores */}
      <Card padding="none" className="flex flex-col">
        <CardHeader className="px-4 pt-4 pb-3">
          <CardTitle>
            <span className="flex items-center gap-1.5">
              <TrendingDown size={15} className="text-[var(--danger)]" />
              Top deudores
            </span>
          </CardTitle>
        </CardHeader>
        {kpis.top_debtors.length === 0 ? (
          <div className="px-4 pb-5 text-xs text-[var(--text3)]">No hay clientes con deuda.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-[var(--border)]">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-[var(--text3)]">Cliente</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-[var(--text3)]">Saldo</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-[var(--text3)] hidden sm:table-cell">Antigüedad</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-[var(--text3)]">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {kpis.top_debtors.map(d => {
                  const s = BUCKET_STYLE[d.bucket]
                  return (
                    <tr key={d.id}
                      onClick={onSelectDebtor ? () => onSelectDebtor(d.id) : undefined}
                      className={`transition-colors ${onSelectDebtor ? 'cursor-pointer hover:bg-[var(--surface2)]' : ''}`}>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-[var(--text)] truncate max-w-[14rem]">{d.full_name}</p>
                      </td>
                      <td className="px-4 py-2.5 text-right mono font-bold text-[var(--danger)] whitespace-nowrap">
                        {formatCurrency(d.balance)}
                      </td>
                      <td className="px-4 py-2.5 text-right mono text-[var(--text2)] hidden sm:table-cell whitespace-nowrap">
                        {formatDebtAge(d.days)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
                          style={{ color: s.text, background: s.bg }}>
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

// ─── Skeleton de la sección superior ──────────────────────────────────────────
function TopSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
            <div className="h-3 w-1/2 rounded bg-[var(--surface2)] animate-pulse" />
            <div className="h-7 w-3/4 rounded bg-[var(--surface2)] animate-pulse mt-3" />
            <div className="h-3 w-2/3 rounded bg-[var(--surface2)] animate-pulse mt-3 opacity-60" />
          </div>
        ))}
      </div>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
        <div className="h-3 w-1/3 rounded bg-[var(--surface2)] animate-pulse mb-4" />
        <div className="h-2.5 w-full rounded-full bg-[var(--surface2)] animate-pulse" />
      </div>
    </div>
  )
}
