'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { HelpBanner } from '@/components/ui/HelpBanner'
import { StatCard } from '@/components/ui/StatCard'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { StatCardSkeleton, CardListSkeleton } from '@/components/ui/Skeleton'
import { SmartInsightsCard } from '@/components/modules/SmartInsightsCard'
// import { OnboardingCard } from '@/components/onboarding/OnboardingCard' // WIP oculto
import Link from 'next/link'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { formatCurrency, formatCompactCurrency, formatIntCurrency, formatAxisCurrency, formatNumber, formatDateTime, getPaymentMethodLabel, getPeriodDates, getLocalWeekStart } from '@/lib/utils'
import { TrendingUp, AlertTriangle, DollarSign, CreditCard, RefreshCw, Receipt, Package, Store } from 'lucide-react'
import {
  Bar, ComposedChart, Area, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

// ─── Tipos ────────────────────────────────────────────────
interface SalesByHour   { hour: number; label: string; total_sales: number; total_revenue: number }
interface PaymentMethod { method: string; total: number }
interface RecentSale    { id: string; total: number; payment_method: string; created_at: string }
interface CriticalItem  { id: string; name: string; stock_current: number; stock_min: number; supplier_name: string | null }
interface StockAlert    { id: string; name: string; stock_current: number; stock_min: number; stock_status: 'ok' | 'bajo' | 'critico' | 'sin_stock'; supplier_name: string | null; category_name: string | null }
interface WeekComp      { this_week: number; prev_week: number; diff_pct: number; this_count: number; prev_count: number }
interface DailySale     { sale_date: string; total_sales: number; total_revenue: number; gross_margin: number }
interface MonthlySale   { month: string; total_sales: number; total_revenue: number }
interface TopProduct    { name: string; revenue: number; units: number }
interface TopCategory   { label: string; revenue: number }
interface BranchSale    { branch_id: string; branch_name: string; revenue_today: number; sales_today: number }

interface DashboardData {
  today_revenue:       number
  today_sales:         number
  today_units:         number
  yesterday_revenue:   number
  yesterday_sales:     number
  dod_pct:             number
  today_margin:        number
  today_margin_pct:    number
  has_cost_data:       boolean
  ticket_avg:          number
  inventory_value:     number
  week_comparison:     WeekComp
  low_stock_alerts:    number
  accounts_receivable: number
  sales_by_hour:       SalesByHour[]
  payment_methods:     PaymentMethod[]
  recent_sales:        RecentSale[]
  critical_stock:      CriticalItem[]
  top_products:        TopProduct[]
  top_categories:      TopCategory[]
  sales_by_branch:     BranchSale[]
}

// ─── Constantes ───────────────────────────────────────────
const CHART_COLORS  = ['#16a34a', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6']
const PAYMENT_LABELS: Record<string, string> = {
  efectivo: 'Efectivo', transferencia: 'Transf.', debito: 'Débito',
  credito: 'Crédito', qr: 'QR', mixto: 'Mixto', cuenta_corriente: 'Cta. Cte.',
}

// ─── Tooltips ──────────────────────────────────────────────
const HourlyTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="text-[var(--text3)] mb-1">{label}</p>
      <p className="font-semibold text-[var(--accent)]">{formatCurrency(Number(payload[0]?.value ?? 0))}</p>
    </div>
  )
}

// ─── Mini ranking con barra (top productos / categorías) ───
function RankList({ rows, max, sub }: {
  rows: { key: string; label: string; revenue: number; sub?: string }[]
  max: number
  sub?: boolean
}) {
  if (rows.length === 0)
    return <p className="text-sm text-[var(--text3)] text-center py-6">Sin datos esta semana</p>
  return (
    <div className="space-y-2.5">
      {rows.map((r, i) => (
        <div key={r.key}>
          <div className="flex items-center justify-between gap-2 text-xs mb-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[var(--text3)] mono w-3 flex-shrink-0">{i + 1}</span>
              <span className="text-[var(--text2)] truncate">{r.label}</span>
            </div>
            <span className="mono font-semibold text-[var(--text)] flex-shrink-0" title={formatCurrency(r.revenue)}>
              {formatCompactCurrency(r.revenue)}
            </span>
          </div>
          <div className="h-1.5 bg-[var(--surface2)] rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all"
              style={{ width: `${max > 0 ? Math.max(r.revenue / max * 100, 2) : 0}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
          </div>
          {sub && r.sub && <p className="text-[10px] text-[var(--text3)] mt-0.5 ml-5">{r.sub}</p>}
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
export default function DashboardPage() {
  const { user } = useAuth()
  const role = user?.role ?? 'cashier'
  const stockEnabled = user?.business?.stock_enabled ?? true

  const [data,        setData]        = useState<DashboardData | null>(null)
  const [salesLast30, setSalesLast30] = useState<DailySale[]>([])
  const [salesByMonth, setSalesByMonth] = useState<MonthlySale[]>([])
  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)

  // Modal listado completo de alertas de stock
  const [alertsOpen,    setAlertsOpen]    = useState(false)
  const [alerts,        setAlerts]        = useState<StockAlert[]>([])
  const [alertsLoading, setAlertsLoading] = useState(false)

  const openAlerts = useCallback(async () => {
    setAlertsOpen(true)
    setAlertsLoading(true)
    try {
      const rows = await api.get<StockAlert[]>('/api/stock/alerts')
      setAlerts(rows ?? [])
    } catch (err) { console.error(err) }
    finally { setAlertsLoading(false) }
  }, [])

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const [result, last30, byMonth] = await Promise.all([
        api.get<DashboardData>('/api/dashboard/all', {
          today_from: getPeriodDates('today').from,
          week_from:  getLocalWeekStart(),
        }),
        api.get<DailySale[]>('/api/dashboard/sales-last-30'),
        api.get<MonthlySale[]>('/api/dashboard/sales-by-month'),
      ])
      setData(result)
      setSalesLast30(last30 ?? [])
      setSalesByMonth(byMonth ?? [])
    } catch (err) { console.error(err) }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    const id = setInterval(() => fetchAll(true), 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [fetchAll])

  // v_sales_by_hour agrupa por hora UTC → rotamos a la hora local del navegador
  // (Σ por hora-del-día: una venta en hora UTC H siempre cae en hora local H+offset).
  const hourlyData = useMemo(() => {
    const offset = -new Date().getTimezoneOffset() / 60 // -3 en AR
    const local = Array.from({ length: 24 }, (_, h) => ({
      hour: h, label: `${String(h).padStart(2, '0')}:00`, total_sales: 0, total_revenue: 0,
    }))
    for (const r of data?.sales_by_hour ?? []) {
      const lh = (((r.hour + offset) % 24) + 24) % 24
      local[lh].total_sales   += r.total_sales
      local[lh].total_revenue += r.total_revenue
    }
    return local
  }, [data])
  const paymentData = useMemo(() => data ? [...data.payment_methods] : [], [data])
  const dailyData   = useMemo(() => salesLast30.map(d => ({
    ...d,
    label: d.sale_date.slice(5).replace('-', '/'),
  })), [salesLast30])
  const MONTH_ABBR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const monthlyData = useMemo(() => salesByMonth.map(m => {
    const [y, mm] = m.month.split('-')
    return { ...m, label: `${MONTH_ABBR[Number(mm) - 1]} '${y.slice(2)}` }
  }), [salesByMonth])
  const paymentColorMap = useMemo(() =>
    Object.fromEntries(paymentData.map((pm, i) => [pm.method, CHART_COLORS[i % CHART_COLORS.length]])),
  [paymentData])
  const peakHour = useMemo(
    () => hourlyData.reduce((max, h) => h.total_revenue > (max?.total_revenue ?? 0) ? h : max, hourlyData[0]),
    [hourlyData],
  )

  const topProductRows = useMemo(() => (data?.top_products ?? []).map(p => ({
    key: p.name, label: p.name, revenue: p.revenue, sub: `${formatNumber(p.units)} u.`,
  })), [data])
  const topCategoryRows = useMemo(() => (data?.top_categories ?? []).map(c => ({
    key: c.label, label: c.label, revenue: c.revenue,
  })), [data])
  const maxProductRev  = useMemo(() => Math.max(1, ...topProductRows.map(r => r.revenue)), [topProductRows])
  const maxCategoryRev = useMemo(() => Math.max(1, ...topCategoryRows.map(r => r.revenue)), [topCategoryRows])
  const maxBranchRev   = useMemo(() => Math.max(1, ...(data?.sales_by_branch ?? []).map(b => b.revenue_today)), [data])

  const today = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })

  // ── Loading skeleton ──
  if (loading) return (
    <AppShell>
      <div className="px-5 py-4 border-b border-[var(--border)]">
        <div className="h-6 w-24 rounded bg-[var(--surface2)] animate-pulse" />
        <div className="h-3.5 w-32 rounded bg-[var(--surface2)] animate-pulse mt-1.5 opacity-60" />
      </div>
      <div className="p-5 space-y-5">
        <HelpBanner id="dashboard" title="Tu panel de control">
          <p>Acá ves de un vistazo cómo va el negocio: ventas del día, productos con bajo stock y la evolución en gráficos. Los datos se actualizan en tiempo real.</p>
        </HelpBanner>
        <div className={`grid gap-3 ${stockEnabled ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5' : 'grid-cols-2 lg:grid-cols-4'}`}>
          {Array.from({ length: stockEnabled ? 5 : 4 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
          <div className="xl:col-span-2 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
            <div className="h-4 w-40 rounded bg-[var(--surface2)] animate-pulse mb-3" />
            <div className="h-52 rounded bg-[var(--surface2)] animate-pulse opacity-50" />
          </div>
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
            <div className="h-4 w-32 rounded bg-[var(--surface2)] animate-pulse mb-3" />
            <div className="h-52 rounded bg-[var(--surface2)] animate-pulse opacity-50" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <CardListSkeleton key={i} rows={5} />)}
        </div>
      </div>
    </AppShell>
  )

  const hasMultiBranch = (data?.sales_by_branch?.length ?? 0) > 1

  // Fila inferior: tráfico por hora (siempre) + sucursal (si multi) + stock (si stock_enabled)
  const bottomCount = 1 + (hasMultiBranch ? 1 : 0) + (stockEnabled ? 1 : 0)
  const bottomColsClass = bottomCount >= 3 ? 'lg:grid-cols-3' : bottomCount === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-1'

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

        {/* ══ Onboarding con Stocky — OCULTO (WIP, tira error). Re-habilitar cuando esté listo ══ */}
        {/* {(role === 'owner' || role === 'admin') && <OnboardingCard />} */}

        {/* ══ KPIs ═══════════════════════════════════════════════ */}
        <div className={`grid gap-3 ${stockEnabled ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5' : 'grid-cols-2 lg:grid-cols-4'}`}>
          <StatCard
            title="Ventas hoy"
            value={formatIntCurrency(data?.today_revenue ?? 0)}
            valueClassName="text-[clamp(1rem,1.6vw,1.5rem)] tracking-tight"
            valueTitle={formatCurrency(data?.today_revenue ?? 0)}
            subtitle={`${data?.today_sales ?? 0} ventas · ${formatNumber(data?.today_units ?? 0)} u.`}
            delta={data ? { value: data.dod_pct, label: 'vs ayer' } : undefined}
            icon={DollarSign}
            accent
          />
          <StatCard
            title="Ganancia hoy"
            value={data?.has_cost_data ? formatIntCurrency(data?.today_margin ?? 0) : '—'}
            valueClassName="text-[clamp(1rem,1.6vw,1.5rem)] tracking-tight"
            valueTitle={data?.has_cost_data ? formatCurrency(data?.today_margin ?? 0) : 'Sin costos cargados'}
            subtitle={data?.has_cost_data ? `${data?.today_margin_pct ?? 0}% de margen` : 'Cargá costos de productos'}
            icon={TrendingUp}
          />
          <StatCard
            title="Ticket promedio"
            value={formatIntCurrency(data?.ticket_avg ?? 0)}
            valueClassName="text-[clamp(1rem,1.6vw,1.5rem)] tracking-tight"
            valueTitle={formatCurrency(data?.ticket_avg ?? 0)}
            subtitle="Por venta · hoy"
            icon={Receipt}
          />
          {stockEnabled && (
            <button
              type="button"
              onClick={openAlerts}
              className="text-left rounded-[var(--radius-lg)] transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              title="Ver listado completo"
            >
              <StatCard
                title="Alertas stock"
                value={data?.low_stock_alerts ?? 0}
                subtitle="Ver listado completo →"
                icon={AlertTriangle}
                className={`h-full ${(data?.low_stock_alerts ?? 0) > 0 ? 'border-[var(--danger)] bg-[var(--danger-subtle)]' : ''}`}
              />
            </button>
          )}
          <Link
            href="/accounts"
            className="block text-left rounded-[var(--radius-lg)] transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            title="Ir a Cuentas corrientes"
          >
            <StatCard
              title="Cuentas corrientes"
              value={formatIntCurrency(data?.accounts_receivable ?? 0)}
              valueClassName="text-[clamp(1rem,1.6vw,1.5rem)] tracking-tight"
              valueTitle={formatCurrency(data?.accounts_receivable ?? 0)}
              subtitle="Ir a las cuentas →"
              icon={CreditCard}
              className={`h-full ${(data?.accounts_receivable ?? 0) > 0 ? 'border-amber-500/30 bg-amber-500/5' : ''}`}
            />
          </Link>
        </div>

        {/* ══ Para tener en cuenta — avisos accionables del negocio ═ */}
        <SmartInsightsCard />

        {/* ══ Héroe: tendencia 30 días + acción requerida ═════════ */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">

          {/* Tendencia 30 días */}
          <Card className="xl:col-span-2 flex flex-col">
            <CardHeader>
              <CardTitle>Tendencia · últimos 30 días</CardTitle>
              <span className="text-xs text-[var(--text3)]">Facturación y margen bruto</span>
            </CardHeader>
            {dailyData.length === 0 ? (
              <p className="text-sm text-[var(--text3)] text-center py-12">Sin datos en el período</p>
            ) : (
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={dailyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <defs>
                      <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor="#16a34a" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#16a34a" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--text3)' }} interval={4} />
                    <YAxis tick={{ fontSize: 9, fill: 'var(--text3)' }} tickFormatter={v => formatAxisCurrency(v)} width={44} />
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
                    <Area type="monotone" dataKey="total_revenue" stroke="#16a34a" strokeWidth={2} fill="url(#revGradient)" dot={false} activeDot={{ r: 4 }} />
                    <Line type="monotone" dataKey="gross_margin"  stroke="#0ea5e9" strokeWidth={2} dot={false} activeDot={{ r: 4 }} strokeDasharray="4 2" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[var(--border)] text-xs text-[var(--text3)]">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#16a34a]" /> Ventas</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 bg-[#0ea5e9]" /> Margen bruto</span>
            </div>
          </Card>

          {/* Ventas recientes — al lado del gráfico de ventas */}
          <Card padding="none" className="flex flex-col">
            <CardHeader className="px-4 pt-4 pb-3">
              <CardTitle>Ventas recientes</CardTitle>
            </CardHeader>
            <div className="divide-y divide-[var(--border)] flex-1">
              {(data?.recent_sales ?? []).length === 0 ? (
                <p className="text-sm text-[var(--text3)] text-center py-8 px-4">Sin ventas aún</p>
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
        </div>

        {/* ══ Facturación mensual — últimos 6 meses ═══════════════ */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Ventas mensuales · últimos 6 meses</CardTitle>
            <span className="text-xs text-[var(--text3)]">Total vendido por mes</span>
          </CardHeader>
          {monthlyData.every(m => m.total_revenue === 0) ? (
            <p className="text-sm text-[var(--text3)] text-center py-12">Sin ventas en el período</p>
          ) : (
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={[...monthlyData]} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text3)' }} />
                  <YAxis tick={{ fontSize: 9, fill: 'var(--text3)' }} tickFormatter={v => formatAxisCurrency(v)} width={44} />
                  <Tooltip
                    cursor={{ fill: 'var(--surface2)', opacity: 0.4 }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      const row = payload[0]?.payload as MonthlySale
                      return (
                        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 shadow-xl text-xs space-y-1">
                          <p className="text-[var(--text3)] mb-1">{label}</p>
                          <p className="font-semibold text-[var(--accent)]">{formatCurrency(Number(payload[0]?.value ?? 0))}</p>
                          <p className="text-[var(--text3)]">{formatNumber(row?.total_sales ?? 0)} ventas</p>
                        </div>
                      )
                    }}
                  />
                  <Bar dataKey="total_revenue" fill="#16a34a" radius={[4, 4, 0, 0]} maxBarSize={64} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* ══ Qué se vende: top productos / categorías / pagos ════ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

          <Card>
            <CardHeader>
              <CardTitle>Top productos</CardTitle>
              <span className="text-xs text-[var(--text3)]">7 días · por facturación</span>
            </CardHeader>
            <RankList rows={topProductRows} max={maxProductRev} sub />
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top categorías</CardTitle>
              <span className="text-xs text-[var(--text3)]">7 días · por facturación</span>
            </CardHeader>
            <RankList rows={topCategoryRows} max={maxCategoryRev} />
          </Card>

          {/* Métodos de pago — donut + leyenda (sin barras redundantes) */}
          <Card>
            <CardHeader>
              <CardTitle>Métodos de pago</CardTitle>
              <span className="text-xs text-[var(--text3)]">Últimos 7 días</span>
            </CardHeader>
            {paymentData.length === 0 ? (
              <p className="text-sm text-[var(--text3)] text-center py-8">Sin datos</p>
            ) : (
              <div className="flex items-center gap-4">
                <div style={{ width: 120, height: 120 }} className="flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={paymentData} dataKey="total" nameKey="method" cx="50%" cy="50%" innerRadius={32} outerRadius={56} paddingAngle={2}>
                        {paymentData.map((pm) => <Cell key={pm.method} fill={paymentColorMap[pm.method]} />)}
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
                <div className="flex-1 min-w-0 space-y-1.5">
                  {(() => {
                    const pmTotal = paymentData.reduce((a, p) => a + p.total, 0)
                    return [...paymentData].sort((a, b) => b.total - a.total).map((pm) => {
                      const pct = pmTotal > 0 ? Math.round(pm.total / pmTotal * 100) : 0
                      return (
                        <div key={pm.method} className="flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: paymentColorMap[pm.method] }} />
                            <span className="text-[var(--text2)] truncate">{PAYMENT_LABELS[pm.method] ?? pm.method}</span>
                          </div>
                          <span className="mono text-[var(--text3)] flex-shrink-0">{pct}%</span>
                        </div>
                      )
                    })
                  })()}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* ══ Operación: hora / sucursal / stock ══════════════════ */}
        <div className={`grid grid-cols-1 ${bottomColsClass} gap-3`}>

          {/* Tráfico por hora */}
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle>Tráfico por hora</CardTitle>
              {peakHour && peakHour.total_revenue > 0 && (
                <span className="text-xs text-[var(--text3)]">Pico: {peakHour.label}</span>
              )}
            </CardHeader>
            {hourlyData.every(h => h.total_revenue === 0) ? (
              <p className="text-sm text-[var(--text3)] text-center py-8 flex-1">Sin datos esta semana</p>
            ) : (
              <div className="flex-1 min-h-0" style={{ minHeight: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={hourlyData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--text3)' }} interval={2} />
                    <YAxis tick={{ fontSize: 9, fill: 'var(--text3)' }} tickFormatter={v => formatAxisCurrency(v)} width={40} />
                    <Tooltip content={<HourlyTooltip />} />
                    <Bar dataKey="total_revenue" fill="#16a34a" radius={[3, 3, 0, 0]} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          {/* Ventas por sucursal (solo si hay más de una) */}
          {hasMultiBranch && (
            <Card>
              <CardHeader>
                <CardTitle>Ventas por sucursal</CardTitle>
                <span className="text-xs text-[var(--text3)]">Hoy</span>
              </CardHeader>
              <div className="space-y-3">
                {(data?.sales_by_branch ?? []).map((b, i) => (
                  <div key={b.branch_id}>
                    <div className="flex items-center justify-between gap-2 text-xs mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Store size={12} className="text-[var(--text3)] flex-shrink-0" />
                        <span className="text-[var(--text2)] truncate">{b.branch_name}</span>
                      </div>
                      <span className="mono font-semibold text-[var(--text)] flex-shrink-0" title={formatCurrency(b.revenue_today)}>
                        {formatCompactCurrency(b.revenue_today)}
                      </span>
                    </div>
                    <div className="h-1.5 bg-[var(--surface2)] rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${maxBranchRev > 0 ? Math.max(b.revenue_today / maxBranchRev * 100, 2) : 0}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                    </div>
                    <p className="text-[10px] text-[var(--text3)] mt-0.5 ml-5">{b.sales_today} ventas</p>
                  </div>
                ))}
              </div>
              {(role === 'owner' || role === 'admin') && (
                <Link href="/branches"
                  className="mt-3 block text-xs text-[var(--accent)] hover:underline">
                  Ver comparativa completa (ticket, mes, inventario) →
                </Link>
              )}
            </Card>
          )}

          {/* Stock: crítico + capital inmovilizado (solo si controla inventario) */}
          {stockEnabled && (
            <Card padding="none" className="flex flex-col">
              <CardHeader className="px-4 pt-4 pb-3">
                <CardTitle>Stock crítico</CardTitle>
                {(data?.low_stock_alerts ?? 0) > 0 && (
                  <Badge variant="danger">{data?.low_stock_alerts} alertas</Badge>
                )}
              </CardHeader>
              <div className="divide-y divide-[var(--border)] flex-1">
                {(data?.critical_stock ?? []).length === 0 ? (
                  <p className="text-sm text-[var(--text3)] text-center py-8 px-4">Todo el stock en orden ✓</p>
                ) : (data?.critical_stock ?? []).map(item => (
                  <div key={item.id} className="flex items-center justify-between px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--text)] truncate">{item.name}</p>
                      <p className="text-xs text-[var(--text3)] truncate">{item.supplier_name ?? 'Sin proveedor'}</p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <p className="text-sm font-bold mono text-[var(--danger)]">{item.stock_current}</p>
                      <p className="text-xs text-[var(--text3)]">mín: {item.stock_min}</p>
                    </div>
                  </div>
                ))}
              </div>
              {(data?.low_stock_alerts ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={openAlerts}
                  className="px-4 py-2.5 border-t border-[var(--border)] text-xs font-medium text-[var(--accent)] hover:bg-[var(--surface2)] transition-colors text-center"
                >
                  Ver todos ({data?.low_stock_alerts}) →
                </button>
              )}
              <div className="px-4 py-3 border-t border-[var(--border)] flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-[var(--text3)]">
                  <Package size={13} /> Capital en stock
                </span>
                <span className="text-sm font-semibold mono text-[var(--text)]" title={formatCurrency(data?.inventory_value ?? 0)}>
                  {formatCompactCurrency(data?.inventory_value ?? 0)}
                </span>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Listado completo de productos bajo mínimo */}
      <Modal
        open={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        title="Productos bajo mínimo"
        size="lg"
        headerActions={
          <Link
            href="/warehouses"
            onClick={() => setAlertsOpen(false)}
            className="text-xs font-medium text-[var(--accent)] hover:underline mr-1"
          >
            Ir a depósitos →
          </Link>
        }
      >
        {alertsLoading ? (
          <p className="text-sm text-[var(--text3)] text-center py-8">Cargando…</p>
        ) : alerts.length === 0 ? (
          <p className="text-sm text-[var(--text3)] text-center py-8">Todo el stock en orden ✓</p>
        ) : (
          <div className="divide-y divide-[var(--border)] -my-1">
            {alerts.map(item => (
              <div key={item.id} className="flex items-center justify-between py-2.5 gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text)] truncate">{item.name}</p>
                  <p className="text-xs text-[var(--text3)] truncate">
                    {item.supplier_name ?? 'Sin proveedor'}
                    {item.category_name ? ` · ${item.category_name}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <p className={`text-sm font-bold mono ${item.stock_current <= 0 ? 'text-[var(--danger)]' : 'text-[var(--warning)]'}`}>{item.stock_current}</p>
                    <p className="text-xs text-[var(--text3)]">mín: {item.stock_min}</p>
                  </div>
                  <Badge variant={item.stock_status === 'sin_stock' ? 'danger' : item.stock_status === 'critico' ? 'danger' : 'warning'}>
                    {item.stock_status === 'sin_stock' ? 'Sin stock' : item.stock_status === 'critico' ? 'Crítico' : 'Bajo'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </AppShell>
  )
}
