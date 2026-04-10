'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { StatCardSkeleton, CardListSkeleton } from '@/components/ui/Skeleton'
import { api } from '@/lib/api'
import { formatCurrency, formatDateTime, getPaymentMethodLabel, getPeriodDates, getLocalWeekStart, getLocalMonthStart } from '@/lib/utils'
import type { DashboardStats, Sale } from '@/types'
import {
  TrendingUp, AlertTriangle,
  DollarSign, Users, BarChart2, RefreshCw,
} from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

// ─── Tipos ────────────────────────────────────────────────
interface OrdersByDay    { day: number; label: string; count: number; total: number }
interface SalesByHour   { hour: number; label: string; total_sales: number; total_revenue: number }
interface SalesLast30   { sale_date: string; total_sales: number; total_revenue: number; gross_margin: number }
interface PaymentMethod { method: string; total: number }
interface TopProduct    { product_id: string; name: string; total_sold: number; total_revenue: number; margin_pct: number }
interface WeekComparison  { this_week: number;  prev_week: number;  diff_pct: number; this_count: number; prev_count: number }
interface MonthComparison { this_month: number; prev_month: number; diff_pct: number; this_count: number; prev_count: number }
interface MarginData    { revenue: number; cost: number; margin: number; margin_pct: number }
interface AccountsReceivable { total: number; top_debtors: { full_name: string; current_balance: number; credit_limit: number }[] }
// Análisis por período
interface SalesByCategory { label: string; revenue: number }
interface TopProductChart { name: string; revenue: number; units: number }

type AnalysisPeriod = '7d' | '30d' | 'month' | '90d'

// ─── Constantes ───────────────────────────────────────────
const CHART_COLORS  = ['#16a34a', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b', '#a855f7', '#06b6d4']
const PAYMENT_LABELS: Record<string, string> = {
  efectivo: 'Efectivo', transferencia: 'Transf.', debito: 'Débito',
  credito: 'Crédito', qr: 'QR', mixto: 'Mixto',
}
const ANALYSIS_PERIODS: { key: AnalysisPeriod; label: string }[] = [
  { key: '7d',    label: '7 días'    },
  { key: '30d',   label: '30 días'   },
  { key: 'month', label: 'Este mes'  },
  { key: '90d',   label: '90 días'   },
]

// ─── Helpers ──────────────────────────────────────────────
const getAnalysisDates = (period: AnalysisPeriod) => {
  const now = new Date()
  const to  = now.toISOString()
  if (period === '7d')    return { from: new Date(Date.now() - 7  * 86400000).toISOString(), to }
  if (period === '90d')   return { from: new Date(Date.now() - 90 * 86400000).toISOString(), to }
  if (period === 'month') return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to }
  return { from: new Date(Date.now() - 30 * 86400000).toISOString(), to } // 30d default
}

const truncate = (str: string, max = 20) => str.length > max ? str.slice(0, max - 1) + '…' : str

// ─── Tooltips personalizados ──────────────────────────────
const CurrencyTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="text-[var(--text3)] mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.name === 'Ingresos' ? '#16a34a' : '#0ea5e9' }} className="font-semibold">
          {p.name}: {formatCurrency(p.value)}
        </p>
      ))}
    </div>
  )
}

// ─── Tick Y-axis con truncado ─────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TruncatedYTick = (props: any) => {
  const { x, y, payload } = props
  return (
    <text x={(x ?? 0) - 4} y={y} dy={4} textAnchor="end" fontSize={10} fill="var(--text3)">
      {truncate(payload?.value ?? '', 22)}
    </text>
  )
}

// ─── Selector de período ──────────────────────────────────
const PeriodSelector = ({ value, onChange }: { value: AnalysisPeriod; onChange: (p: AnalysisPeriod) => void }) => (
  <div className="flex gap-1 bg-[var(--surface2)] rounded-lg p-0.5">
    {ANALYSIS_PERIODS.map(p => (
      <button
        key={p.key}
        onClick={() => onChange(p.key)}
        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
          value === p.key
            ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm'
            : 'text-[var(--text3)] hover:text-[var(--text2)]'
        }`}
      >
        {p.label}
      </button>
    ))}
  </div>
)

// ─── Comparativo card ─────────────────────────────────────
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
  // ── Estado: datos fijos ──
  const [stats,          setStats]          = useState<DashboardStats | null>(null)
  const [recentSales,    setRecentSales]    = useState<Sale[]>([])
  const [lowStock,       setLowStock]       = useState<{ id: string; name: string; stock_current: number; stock_min: number; stock_status: string; supplier_name?: string }[]>([])
  const [ordersByDay,    setOrdersByDay]    = useState<OrdersByDay[]>([])
  const [salesByHour,    setSalesByHour]    = useState<SalesByHour[]>([])
  const [salesLast30,    setSalesLast30]    = useState<SalesLast30[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [topProducts,    setTopProducts]    = useState<TopProduct[]>([])
  const [weekComp,       setWeekComp]       = useState<WeekComparison | null>(null)
  const [monthComp,      setMonthComp]      = useState<MonthComparison | null>(null)
  const [margin,         setMargin]         = useState<MarginData | null>(null)
  const [accounts,       setAccounts]       = useState<AccountsReceivable | null>(null)
  // ── Estado: análisis por período ──
  const [analysisPeriod,   setAnalysisPeriod]   = useState<AnalysisPeriod>('30d')
  const analysisPeriodRef                        = useRef<AnalysisPeriod>('30d')
  const [salesByCategory,  setSalesByCategory]   = useState<SalesByCategory[]>([])
  const [topProductsChart, setTopProductsChart]  = useState<TopProductChart[]>([])
  const [analysisLoading,  setAnalysisLoading]   = useState(false)
  // ── UI ──
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // ── Tipos para respuestas consolidadas ──
  type DashboardAllResponse = {
    stats:               DashboardStats
    recent_sales:        Sale[]
    low_stock:           typeof lowStock
    orders_by_day:       OrdersByDay[]
    sales_by_hour:       SalesByHour[]
    sales_last_30:       SalesLast30[]
    payment_methods:     PaymentMethod[]
    top_products:        TopProduct[]
    week_comparison:     WeekComparison
    month_comparison:    MonthComparison
    margin:              MarginData
    accounts_receivable: AccountsReceivable
  }
  type AnalysisResponse = {
    sales_by_category:  SalesByCategory[]
    top_products_chart: TopProductChart[]
  }

  // ── Fetch análisis por período ──
  const fetchAnalysis = useCallback(async (period: AnalysisPeriod) => {
    setAnalysisLoading(true)
    try {
      const { from, to } = getAnalysisDates(period)
      const res = await api.get<AnalysisResponse>('/api/dashboard/analysis', { from, to })
      setSalesByCategory(res.sales_by_category)
      setTopProductsChart(res.top_products_chart)
    } catch (err) { console.error(err) }
    finally { setAnalysisLoading(false) }
  }, [])

  // ── Fetch todo ──
  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const res = await api.get<DashboardAllResponse>('/api/dashboard/all', {
        today_from: getPeriodDates('today').from,
        week_from:  getLocalWeekStart(),
        month_from: getLocalMonthStart(),
      })
      setStats(res.stats);           setRecentSales(res.recent_sales);   setLowStock(res.low_stock)
      setOrdersByDay(res.orders_by_day); setSalesByHour(res.sales_by_hour); setSalesLast30(res.sales_last_30)
      setPaymentMethods(res.payment_methods); setTopProducts(res.top_products)
      setWeekComp(res.week_comparison); setMonthComp(res.month_comparison)
      setMargin(res.margin); setAccounts(res.accounts_receivable)
      await fetchAnalysis(analysisPeriodRef.current)
    } catch (err) { console.error(err) }
    finally { setLoading(false); setRefreshing(false) }
  }, [fetchAnalysis])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Auto-refresh cada 5 min
  useEffect(() => {
    const id = setInterval(() => fetchAll(true), 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [fetchAll])

  const handlePeriodChange = (p: AnalysisPeriod) => {
    setAnalysisPeriod(p)
    analysisPeriodRef.current = p
    fetchAnalysis(p)
  }

  const today = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
  const peakHour = salesByHour.reduce((max, h) => h.total_revenue > (max?.total_revenue ?? 0) ? h : max, salesByHour[0])
  const last30Formatted = [...salesLast30].map(d => ({
    ...d,
    label: new Date(d.sale_date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }),
  }))

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
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 space-y-3">
              <div className="h-4 w-40 rounded bg-[var(--surface2)] animate-pulse" />
              <div className="h-32 rounded bg-[var(--surface2)] animate-pulse opacity-50" />
            </div>
          ))}
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 space-y-3">
          <div className="h-4 w-48 rounded bg-[var(--surface2)] animate-pulse" />
          <div className="h-48 rounded bg-[var(--surface2)] animate-pulse opacity-40" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, i) => <CardListSkeleton key={i} rows={5} />)}
        </div>
      </div>
    </AppShell>
  )

  // ════════════════════════════════════════════════════════
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

        {/* ══ Grupo 1: KPIs principales ══════════════════════════ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            title="Ventas hoy"
            value={formatCurrency(stats?.today_revenue ?? 0)}
            subtitle={`${stats?.today_sales ?? 0} transacciones`}
            icon={DollarSign}
            accent
          />
          <StatCard
            title="Esta semana"
            value={formatCurrency(weekComp?.this_week ?? 0)}
            subtitle={weekComp ? `${weekComp.diff_pct >= 0 ? '+' : ''}${weekComp.diff_pct}% vs semana anterior` : undefined}
            icon={TrendingUp}
          />
          <StatCard
            title="Margen bruto (mes)"
            value={formatCurrency(margin?.margin ?? 0)}
            subtitle={`${margin?.margin_pct ?? 0}% de margen`}
            icon={BarChart2}
          />
          <StatCard
            title="Alertas stock"
            value={stats?.low_stock_alerts ?? 0}
            subtitle="Bajo mínimo"
            icon={AlertTriangle}
            className={(stats?.low_stock_alerts ?? 0) > 0 ? 'border-[var(--danger)] bg-[var(--danger-subtle)]' : ''}
          />
        </div>

        {/* ══ Grupo 2: Comparativos de período ═══════════════════ */}
        <div>
          <p className="text-xs font-semibold text-[var(--text3)] uppercase tracking-wider mb-3">Comparativos</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {weekComp && (
              <ComparisonCard
                title="Esta semana vs anterior"
                current={weekComp.this_week}   prev={weekComp.prev_week}
                currentCount={weekComp.this_count} prevCount={weekComp.prev_count}
                diffPct={weekComp.diff_pct}
                labelCurrent="Esta semana" labelPrev="Semana anterior"
              />
            )}
            {monthComp && (
              <ComparisonCard
                title="Este mes vs anterior"
                current={monthComp.this_month}   prev={monthComp.prev_month}
                currentCount={monthComp.this_count} prevCount={monthComp.prev_count}
                diffPct={monthComp.diff_pct}
                labelCurrent="Este mes" labelPrev="Mes anterior"
              />
            )}

            {/* Cuentas corrientes */}
            <Card className="sm:col-span-2 xl:col-span-1">
              <CardHeader>
                <CardTitle>Cuentas corrientes</CardTitle>
                {accounts && accounts.total > 0 && (
                  <span className="text-sm font-bold mono text-[var(--danger)]">{formatCurrency(accounts.total)}</span>
                )}
              </CardHeader>
              {!accounts || accounts.total === 0 ? (
                <p className="text-sm text-[var(--text3)] text-center py-4">Sin deudas pendientes ✓</p>
              ) : (
                <div className="space-y-2">
                  {accounts.top_debtors.map((debtor, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-full bg-[var(--surface2)] flex items-center justify-center flex-shrink-0">
                          <Users size={11} className="text-[var(--text3)]" />
                        </div>
                        <p className="text-sm text-[var(--text)] truncate">{debtor.full_name}</p>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p className="text-sm mono font-semibold text-[var(--danger)]">{formatCurrency(debtor.current_balance)}</p>
                        {debtor.credit_limit > 0 && (
                          <p className="text-xs text-[var(--text3)]">límite: {formatCurrency(debtor.credit_limit)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* ══ Grupo 3: Tendencias de ventas ══════════════════════ */}
        <div>
          <p className="text-xs font-semibold text-[var(--text3)] uppercase tracking-wider mb-3">Tendencias</p>
          <div className="space-y-3">

            {/* Evolución 30 días */}
            <Card>
              <CardHeader>
                <CardTitle>Evolución de ventas — últimos 30 días</CardTitle>
              </CardHeader>
              {salesLast30.length === 0 ? (
                <p className="text-sm text-[var(--text3)] text-center py-8">Sin datos aún</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={[...last30Formatted]} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text3)' }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--text3)' }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} width={45} />
                    <Tooltip content={<CurrencyTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Line type="monotone" dataKey="total_revenue" name="Ingresos" stroke="#16a34a" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    <Line type="monotone" dataKey="gross_margin"  name="Margen"   stroke="#0ea5e9" strokeWidth={2} dot={false} strokeDasharray="4 2" activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Card>

            {/* Tráfico por hora + Métodos de pago */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">

              <Card>
                <CardHeader>
                  <CardTitle>Tráfico por hora</CardTitle>
                  {peakHour && peakHour.total_revenue > 0 && (
                    <span className="text-xs text-[var(--text3)]">Pico: {peakHour.label}</span>
                  )}
                </CardHeader>
                {salesByHour.every(h => h.total_revenue === 0) ? (
                  <p className="text-sm text-[var(--text3)] text-center py-8">Sin datos esta semana</p>
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={[...salesByHour]} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--text3)' }} interval={2} />
                      <YAxis tick={{ fontSize: 9, fill: 'var(--text3)' }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} width={35} />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null
                          return (
                            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 shadow-xl text-xs">
                              <p className="text-[var(--text3)] mb-1">{label}</p>
                              <p className="font-semibold text-[var(--accent)]">{formatCurrency(Number(payload[0]?.value ?? 0))}</p>
                            </div>
                          )
                        }}
                      />
                      <Bar dataKey="total_revenue" fill="#16a34a" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Métodos de pago</CardTitle>
                  <span className="text-xs text-[var(--text3)]">Últimos 30 días</span>
                </CardHeader>
                {paymentMethods.length === 0 ? (
                  <p className="text-sm text-[var(--text3)] text-center py-8">Sin datos</p>
                ) : (
                  <div className="flex items-center gap-4">
                    <div className="flex-shrink-0" style={{ width: 160, height: 160 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[...paymentMethods]}
                            dataKey="total" nameKey="method"
                            cx="50%" cy="50%"
                            innerRadius={40} outerRadius={70} paddingAngle={2}
                          >
                            {paymentMethods.map((_, i) => (
                              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
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
                    <div className="flex-1 min-w-0 space-y-2">
                      {(() => {
                        const pmTotal = paymentMethods.reduce((a, p) => a + p.total, 0)
                        return [...paymentMethods].sort((a, b) => b.total - a.total).map((pm, i) => {
                          const pct = pmTotal > 0 ? Math.round(pm.total / pmTotal * 100) : 0
                          return (
                            <div key={pm.method}>
                              <div className="flex justify-between text-xs mb-0.5">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                                  <span className="text-[var(--text2)]">{PAYMENT_LABELS[pm.method] ?? pm.method}</span>
                                </div>
                                <span className="mono text-[var(--text3)]">{pct}%</span>
                              </div>
                              <div className="h-1 bg-[var(--surface2)] rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
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
          </div>
        </div>

        {/* ══ Grupo 4: Análisis de productos ═════════════════════ */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-[var(--text3)] uppercase tracking-wider">Análisis de productos</p>
            <PeriodSelector value={analysisPeriod} onChange={handlePeriodChange} />
          </div>

          <div className={`space-y-3 transition-opacity ${analysisLoading ? 'opacity-50 pointer-events-none' : ''}`}>

            {/* Top 10 + Categorías en paralelo */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">

              {/* Top 10 productos más vendidos */}
              <Card>
                <CardHeader>
                  <CardTitle>Top 10 productos más vendidos</CardTitle>
                  <span className="text-xs text-[var(--text3)]">Por facturación</span>
                </CardHeader>
                {topProductsChart.length === 0 ? (
                  <p className="text-sm text-[var(--text3)] text-center py-8">Sin datos en el período</p>
                ) : (
                  <ResponsiveContainer width="100%" height={topProductsChart.length * 34 + 20}>
                    <BarChart
                      data={topProductsChart.map(p => ({ ...p, shortName: truncate(p.name, 22) }))}
                      layout="vertical"
                      margin={{ top: 4, right: 60, left: 4, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 9, fill: 'var(--text3)' }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="shortName" width={130} tick={TruncatedYTick} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null
                          const d = payload[0]?.payload as TopProductChart
                          return (
                            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 shadow-xl text-xs max-w-[200px]">
                              <p className="text-[var(--text)] font-medium mb-1 leading-tight">{d.name}</p>
                              <p className="text-[var(--accent)] font-semibold">{formatCurrency(d.revenue)}</p>
                              <p className="text-[var(--text3)]">{d.units} unidades</p>
                            </div>
                          )
                        }}
                      />
                      <Bar dataKey="revenue" fill="#16a34a" radius={[0, 3, 3, 0]} label={{ position: 'right', fontSize: 9, fill: 'var(--text3)', formatter: (v: unknown) => `$${(Number(v) / 1000).toFixed(0)}k` }} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>

              {/* Ventas por categoría */}
              <Card>
                <CardHeader>
                  <CardTitle>Ventas por categoría</CardTitle>
                  <span className="text-xs text-[var(--text3)]">Por facturación</span>
                </CardHeader>
                {salesByCategory.length === 0 ? (
                  <p className="text-sm text-[var(--text3)] text-center py-8">Sin datos en el período</p>
                ) : (
                  <ResponsiveContainer width="100%" height={salesByCategory.length * 34 + 20}>
                    <BarChart
                      data={salesByCategory.map(c => ({ ...c, shortLabel: truncate(c.label, 22) }))}
                      layout="vertical"
                      margin={{ top: 4, right: 60, left: 4, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 9, fill: 'var(--text3)' }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="shortLabel" width={130} tick={TruncatedYTick} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null
                          const d = payload[0]?.payload as SalesByCategory & { shortLabel: string }
                          return (
                            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 shadow-xl text-xs max-w-[200px]">
                              <p className="text-[var(--text)] font-medium mb-1 leading-tight">{d.label}</p>
                              <p className="text-[var(--accent)] font-semibold">{formatCurrency(d.revenue)}</p>
                            </div>
                          )
                        }}
                      />
                      <Bar dataKey="revenue" radius={[0, 3, 3, 0]} label={{ position: 'right', fontSize: 9, fill: 'var(--text3)', formatter: (v: unknown) => `$${(Number(v) / 1000).toFixed(0)}k` }}>
                        {salesByCategory.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </div>

          </div>
        </div>

        {/* ══ Grupo 5: Operativo ══════════════════════════════════ */}
        <div>
          <p className="text-xs font-semibold text-[var(--text3)] uppercase tracking-wider mb-3">Operativo</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">

            {/* Top 5 productos (lista) */}
            <Card padding="none">
              <CardHeader className="px-4 pt-4 pb-3">
                <CardTitle>Top 5 productos</CardTitle>
                <span className="text-xs text-[var(--text3)]">Período actual</span>
              </CardHeader>
              <div className="divide-y divide-[var(--border)]">
                {topProducts.length === 0 ? (
                  <p className="text-sm text-[var(--text3)] text-center py-6 px-4">Sin ventas aún</p>
                ) : topProducts.map((p, i) => (
                  <div key={p.product_id} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-xs font-bold mono text-[var(--text3)] w-4">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--text)] truncate">{p.name}</p>
                      <p className="text-xs text-[var(--text3)]">{p.total_sold} unidades</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs mono font-semibold text-[var(--text)]">{formatCurrency(p.total_revenue)}</p>
                      <p className="text-xs text-[var(--accent)]">{p.margin_pct}% mg</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Ventas recientes */}
            <Card padding="none">
              <CardHeader className="px-4 pt-4 pb-3">
                <CardTitle>Ventas recientes</CardTitle>
              </CardHeader>
              <div className="divide-y divide-[var(--border)]">
                {recentSales.length === 0 ? (
                  <p className="text-sm text-[var(--text3)] text-center py-6 px-4">Sin ventas aún</p>
                ) : recentSales.map(sale => (
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
                {lowStock.length === 0 ? (
                  <p className="text-sm text-[var(--text3)] text-center py-6 px-4">Todo el stock en orden ✓</p>
                ) : lowStock.map(item => (
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

        {/* ══ Grupo 6: Pedidos ════════════════════════════════════ */}
        <div>
          <p className="text-xs font-semibold text-[var(--text3)] uppercase tracking-wider mb-3">Pedidos</p>
          <Card>
            <CardHeader>
              <CardTitle>Pedidos por día — mes actual</CardTitle>
              {ordersByDay.length > 0 && (
                <span className="text-xs text-[var(--text3)]">
                  {ordersByDay.reduce((a, d) => a + d.count, 0)} pedidos
                </span>
              )}
            </CardHeader>
            {ordersByDay.every(d => d.count === 0) ? (
              <p className="text-sm text-[var(--text3)] text-center py-8">Sin pedidos este mes</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={[...ordersByDay]} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--text3)' }} interval={2} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 9, fill: 'var(--text3)' }} width={25} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      return (
                        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 shadow-xl text-xs">
                          <p className="text-[var(--text3)] mb-1">Día {label}</p>
                          <p className="font-semibold text-[var(--accent)]">{payload[0]?.value} pedidos</p>
                        </div>
                      )
                    }}
                  />
                  <Bar dataKey="count" name="Pedidos" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>

      </div>
    </AppShell>
  )
}
