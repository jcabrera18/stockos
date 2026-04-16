'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { StatCardSkeleton, CardListSkeleton } from '@/components/ui/Skeleton'
import { api } from '@/lib/api'
import { formatCurrency, formatDateTime, getPaymentMethodLabel, getPeriodDates, getLocalWeekStart } from '@/lib/utils'
import { TrendingUp, AlertTriangle, DollarSign, CreditCard, RefreshCw } from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

// ─── Tipos ────────────────────────────────────────────────
interface SalesByHour   { hour: number; label: string; total_sales: number; total_revenue: number }
interface PaymentMethod { method: string; total: number }
interface RecentSale    { id: string; total: number; payment_method: string; created_at: string }
interface CriticalItem  { id: string; name: string; stock_current: number; stock_min: number; supplier_name: string | null }
interface WeekComp      { this_week: number; prev_week: number; diff_pct: number; this_count: number; prev_count: number }
interface DailySale     { sale_date: string; total_sales: number; total_revenue: number; gross_margin: number }

interface DashboardData {
  today_revenue:       number
  today_sales:         number
  week_comparison:     WeekComp
  low_stock_alerts:    number
  accounts_receivable: number
  sales_by_hour:       SalesByHour[]
  payment_methods:     PaymentMethod[]
  recent_sales:        RecentSale[]
  critical_stock:      CriticalItem[]
}

// ─── Constantes ───────────────────────────────────────────
const CHART_COLORS  = ['#16a34a', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6']
const PAYMENT_LABELS: Record<string, string> = {
  efectivo: 'Efectivo', transferencia: 'Transf.', debito: 'Débito',
  credito: 'Crédito', qr: 'QR', mixto: 'Mixto', cuenta_corriente: 'Cta. Cte.',
}

// ─── Tooltip hora ──────────────────────────────────────────
const HourlyTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="text-[var(--text3)] mb-1">{label}</p>
      <p className="font-semibold text-[var(--accent)]">{formatCurrency(Number(payload[0]?.value ?? 0))}</p>
    </div>
  )
}

// ─── Comparativo card ──────────────────────────────────────
const ComparisonCard = ({
  title, current, prev, currentCount, prevCount, diffPct, labelCurrent, labelPrev,
}: {
  title: string; current: number; prev: number; currentCount: number; prevCount: number;
  diffPct: number; labelCurrent: string; labelPrev: string;
}) => (
  <Card>
    <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
    <div className="space-y-3">
      <div>
        <p className="text-xs text-[var(--text3)] mb-0.5">{labelCurrent}</p>
        <p className="text-2xl font-bold mono text-[var(--accent)] truncate">{formatCurrency(current)}</p>
        <p className="text-xs text-[var(--text3)] mt-0.5">{currentCount} ventas</p>
      </div>
      <div className="flex items-start justify-between pt-3 border-t border-[var(--border)]">
        <div>
          <p className="text-xs text-[var(--text3)]">{labelPrev}</p>
          <p className="text-sm font-semibold mono text-[var(--text2)] truncate">{formatCurrency(prev)}</p>
          <p className="text-xs text-[var(--text3)]">{prevCount} ventas</p>
        </div>
        <span className={`text-sm font-bold mono ${diffPct >= 0 ? 'text-[var(--accent)]' : 'text-[var(--danger)]'}`}>
          {diffPct >= 0 ? '+' : ''}{diffPct}%
        </span>
      </div>
      <div className="h-1.5 bg-[var(--surface2)] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{
          width: `${prev > 0 ? Math.min(current / prev * 100, 150) : 100}%`,
          background: diffPct >= 0 ? 'var(--accent)' : 'var(--danger)',
        }} />
      </div>
    </div>
  </Card>
)

// ═══════════════════════════════════════════════════════════
export default function DashboardPage() {
  const [data,       setData]       = useState<DashboardData | null>(null)
  const [salesLast30, setSalesLast30] = useState<DailySale[]>([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const [result, last30] = await Promise.all([
        api.get<DashboardData>('/api/dashboard/all', {
          today_from: getPeriodDates('today').from,
          week_from:  getLocalWeekStart(),
        }),
        api.get<DailySale[]>('/api/dashboard/sales-last-30'),
      ])
      setData(result)
      setSalesLast30(last30 ?? [])
    } catch (err) { console.error(err) }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    const id = setInterval(() => fetchAll(true), 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [fetchAll])

  const hourlyData  = useMemo(() => data ? [...data.sales_by_hour]  : [], [data])
  const paymentData = useMemo(() => data ? [...data.payment_methods] : [], [data])
  const dailyData   = useMemo(() => salesLast30.map(d => ({
    ...d,
    label: d.sale_date.slice(5).replace('-', '/'), // "MM/DD" → "16/04"
  })), [salesLast30])
  const paymentColorMap = useMemo(() =>
    Object.fromEntries(paymentData.map((pm, i) => [pm.method, CHART_COLORS[i % CHART_COLORS.length]])),
  [paymentData])
  const peakHour    = useMemo(
    () => hourlyData.reduce((max, h) => h.total_revenue > (max?.total_revenue ?? 0) ? h : max, hourlyData[0]),
    [hourlyData],
  )

  const today = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })

  // ── Loading skeleton ──
  if (loading) return (
    <AppShell>
      <div className="px-5 py-4 border-b border-[var(--border)]">
        <div className="h-6 w-24 rounded bg-[var(--surface2)] animate-pulse" />
        <div className="h-3.5 w-32 rounded bg-[var(--surface2)] animate-pulse mt-1.5 opacity-60" />
      </div>
      <div className="p-5 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
          <div className="xl:col-span-2 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
            <div className="h-4 w-40 rounded bg-[var(--surface2)] animate-pulse mb-3" />
            <div className="h-44 rounded bg-[var(--surface2)] animate-pulse opacity-50" />
          </div>
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
            <div className="h-4 w-32 rounded bg-[var(--surface2)] animate-pulse mb-3" />
            <div className="h-44 rounded bg-[var(--surface2)] animate-pulse opacity-50" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <CardListSkeleton key={i} rows={5} />)}
        </div>
      </div>
    </AppShell>
  )

  // ════════════════════════════════════════════════════════
  const wc = data?.week_comparison

  return (
    <AppShell>
      <PageHeader
        title="Dashboard"
        description={today}
        action={
          <button
            onClick={() => fetchAll(true)}
            disabled={refreshing}
            className="p-2 rounded-lg text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </button>
        }
      />

      <div className="p-5 space-y-6">

        {/* ══ KPIs ═══════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            title="Ventas hoy"
            value={formatCurrency(data?.today_revenue ?? 0)}
            subtitle={`${data?.today_sales ?? 0} transacciones`}
            icon={DollarSign}
            accent
          />
          <StatCard
            title="Esta semana"
            value={formatCurrency(wc?.this_week ?? 0)}
            subtitle={wc ? `${wc.diff_pct >= 0 ? '+' : ''}${wc.diff_pct}% vs semana anterior` : undefined}
            icon={TrendingUp}
          />
          <StatCard
            title="Alertas stock"
            value={data?.low_stock_alerts ?? 0}
            subtitle="Bajo mínimo"
            icon={AlertTriangle}
            className={(data?.low_stock_alerts ?? 0) > 0 ? 'border-[var(--danger)] bg-[var(--danger-subtle)]' : ''}
          />
          <StatCard
            title="Cuentas corrientes"
            value={formatCurrency(data?.accounts_receivable ?? 0)}
            subtitle="Saldo pendiente"
            icon={CreditCard}
            className={(data?.accounts_receivable ?? 0) > 0 ? 'border-amber-500/30 bg-amber-500/5' : ''}
          />
        </div>

        {/* ══ Gráficos ════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">

          {/* Tráfico por hora */}
          <Card className="xl:col-span-2 flex flex-col">
            <CardHeader>
              <CardTitle>Tráfico por hora</CardTitle>
              {peakHour && peakHour.total_revenue > 0 && (
                <span className="text-xs text-[var(--text3)]">Pico: {peakHour.label}</span>
              )}
            </CardHeader>
            {hourlyData.every(h => h.total_revenue === 0) ? (
              <p className="text-sm text-[var(--text3)] text-center py-8">Sin datos esta semana</p>
            ) : (
              <div className="flex-1 min-h-0" style={{ minHeight: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourlyData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--text3)' }} interval={2} />
                    <YAxis tick={{ fontSize: 9, fill: 'var(--text3)' }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} width={35} />
                    <Tooltip content={<HourlyTooltip />} />
                    <Bar dataKey="total_revenue" fill="#16a34a" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          {/* Métodos de pago */}
          <Card>
            <CardHeader>
              <CardTitle>Métodos de pago</CardTitle>
              <span className="text-xs text-[var(--text3)]">Últimos 7 días</span>
            </CardHeader>
            {paymentData.length === 0 ? (
              <p className="text-sm text-[var(--text3)] text-center py-8">Sin datos</p>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex justify-center">
                  <div style={{ width: 140, height: 140 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={paymentData} dataKey="total" nameKey="method"
                          cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={2}
                        >
                          {paymentData.map((pm) => (
                            <Cell key={pm.method} fill={paymentColorMap[pm.method]} />
                          ))}
                        </Pie>
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null
                            return (
                              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 shadow-xl text-xs">
                                <p className="text-[var(--text3)] mb-1">{PAYMENT_LABELS[(payload[0] as { name?: string })?.name ?? ''] ?? payload[0]?.name}</p>
                                <p className="font-semibold text-[var(--accent)]">{formatCurrency(Number(payload[0]?.value ?? 0))}</p>
                              </div>
                            )
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="space-y-2">
                  {(() => {
                    const pmTotal = paymentData.reduce((a, p) => a + p.total, 0)
                    return [...paymentData].sort((a, b) => b.total - a.total).map((pm, i) => {
                      const pct = pmTotal > 0 ? Math.round(pm.total / pmTotal * 100) : 0
                      return (
                        <div key={pm.method}>
                          <div className="flex justify-between text-xs mb-0.5">
                            <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: paymentColorMap[pm.method] }} />
                              <span className="text-[var(--text2)]">{PAYMENT_LABELS[pm.method] ?? pm.method}</span>
                            </div>
                            <span className="mono text-[var(--text3)]">{pct}%</span>
                          </div>
                          <div className="h-1 bg-[var(--surface2)] rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: paymentColorMap[pm.method] }} />
                          </div>
                        </div>
                      )
                    })
                  })()}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* ══ Evolución 30 días ═══════════════════════════════════ */}
        {dailyData.length > 0 && (
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle>Ventas últimos 30 días</CardTitle>
              <span className="text-xs text-[var(--text3)]">Facturación y margen bruto</span>
            </CardHeader>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--text3)' }} interval={4} />
                  <YAxis tick={{ fontSize: 9, fill: 'var(--text3)' }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} width={38} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      return (
                        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 shadow-xl text-xs space-y-1">
                          <p className="text-[var(--text3)] mb-1">{label}</p>
                          {payload.map((p) => (
                            <p key={p.dataKey as string} style={{ color: p.color }} className="font-semibold">
                              {p.dataKey === 'total_revenue' ? 'Ventas' : 'Margen'}: {formatCurrency(Number(p.value ?? 0))}
                            </p>
                          ))}
                        </div>
                      )
                    }}
                  />
                  <Legend
                    formatter={(value) => (
                      <span className="text-xs text-[var(--text2)]">
                        {value === 'total_revenue' ? 'Ventas' : 'Margen bruto'}
                      </span>
                    )}
                  />
                  <Line type="monotone" dataKey="total_revenue" stroke="#16a34a" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="gross_margin"  stroke="#0ea5e9" strokeWidth={2} dot={false} activeDot={{ r: 4 }} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {/* ══ Operativo ═══════════════════════════════════════════ */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">

          {/* Comparativo semana */}
          {wc && (
            <ComparisonCard
              title="Esta semana vs anterior"
              current={wc.this_week}   prev={wc.prev_week}
              currentCount={wc.this_count} prevCount={wc.prev_count}
              diffPct={wc.diff_pct}
              labelCurrent="Esta semana" labelPrev="Semana anterior"
            />
          )}

          {/* Ventas recientes */}
          <Card padding="none">
            <CardHeader className="px-4 pt-4 pb-3">
              <CardTitle>Ventas recientes</CardTitle>
            </CardHeader>
            <div className="divide-y divide-[var(--border)]">
              {(data?.recent_sales ?? []).length === 0 ? (
                <p className="text-sm text-[var(--text3)] text-center py-6 px-4">Sin ventas aún</p>
              ) : (data?.recent_sales ?? []).map(sale => (
                <div key={sale.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-[var(--text)]">{formatCurrency(sale.total)}</p>
                    <p className="text-xs text-[var(--text3)]">{formatDateTime(sale.created_at)}</p>
                  </div>
                  <Badge variant="default">{getPaymentMethodLabel(sale.payment_method)}</Badge>
                </div>
              ))}
            </div>
          </Card>

          {/* Stock crítico */}
          <Card padding="none">
            <CardHeader className="px-4 pt-4 pb-3">
              <CardTitle>Stock crítico</CardTitle>
            </CardHeader>
            <div className="divide-y divide-[var(--border)]">
              {(data?.critical_stock ?? []).length === 0 ? (
                <p className="text-sm text-[var(--text3)] text-center py-6 px-4">Todo el stock en orden ✓</p>
              ) : (data?.critical_stock ?? []).map(item => (
                <div key={item.id} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text)] truncate">{item.name}</p>
                    <p className="text-xs text-[var(--text3)]">{item.supplier_name ?? 'Sin proveedor'}</p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <p className="text-sm font-bold mono text-[var(--danger)]">{item.stock_current}</p>
                    <p className="text-xs text-[var(--text3)]">mín: {item.stock_min}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

        </div>
      </div>
    </AppShell>
  )
}
