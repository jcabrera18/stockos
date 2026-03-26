'use client'
import { useEffect, useState, useCallback } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { StatCardSkeleton, CardListSkeleton } from '@/components/ui/Skeleton'
import { api } from '@/lib/api'
import { formatCurrency, formatDateTime, getPaymentMethodLabel } from '@/lib/utils'
import type { DashboardStats, Sale } from '@/types'
import {
  TrendingUp, TrendingDown, ShoppingCart, AlertTriangle,
  DollarSign, Users, Package, BarChart2, RefreshCw,
} from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

// ─── Tipos de datos ───────────────────────────────────────
interface SalesByHour { hour: number; label: string; total_sales: number; total_revenue: number }
interface SalesLast30 { sale_date: string; total_sales: number; total_revenue: number; gross_margin: number }
interface PaymentMethod { method: string; total: number }
interface TopProduct { product_id: string; name: string; total_sold: number; total_revenue: number; margin_pct: number }
interface WeekComparison { this_week: number; prev_week: number; diff_pct: number; this_count: number; prev_count: number }
interface MarginData { revenue: number; cost: number; margin: number; margin_pct: number }
interface AccountsReceivable { total: number; top_debtors: { full_name: string; current_balance: number; credit_limit: number }[] }
interface BranchStats { branch_id: string; branch_name: string; register_count: number; sales_today: number; revenue_today: number; revenue_month: number; open_registers: number }

// ─── Colores para gráficos ────────────────────────────────
const CHART_COLORS = ['#16a34a', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6']

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: 'Efectivo', transferencia: 'Transf.', debito: 'Débito',
  credito: 'Crédito', qr: 'QR', mixto: 'Mixto',
}

// ─── Tooltip personalizado ────────────────────────────────
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

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recentSales, setRecentSales] = useState<Sale[]>([])
  const [lowStock, setLowStock] = useState<{ id: string; name: string; stock_current: number; stock_min: number; stock_status: string; supplier_name?: string }[]>([])
  const [salesByHour, setSalesByHour] = useState<SalesByHour[]>([])
  const [salesLast30, setSalesLast30] = useState<SalesLast30[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [weekComp, setWeekComp] = useState<WeekComparison | null>(null)
  const [margin, setMargin] = useState<MarginData | null>(null)
  const [accounts, setAccounts] = useState<AccountsReceivable | null>(null)
  const [branchStats, setBranchStats] = useState<BranchStats[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const [s, sales, stock, byHour, last30, payments, top, week, mar, acc, branches] = await Promise.all([
        api.get<DashboardStats>('/api/dashboard/stats'),
        api.get<Sale[]>('/api/dashboard/recent-sales'),
        api.get<typeof lowStock>('/api/dashboard/low-stock'),
        api.get<SalesByHour[]>('/api/dashboard/sales-by-hour'),
        api.get<SalesLast30[]>('/api/dashboard/sales-last-30'),
        api.get<PaymentMethod[]>('/api/dashboard/payment-methods'),
        api.get<TopProduct[]>('/api/dashboard/top-products'),
        api.get<WeekComparison>('/api/dashboard/week-comparison'),
        api.get<MarginData>('/api/dashboard/margin'),
        api.get<AccountsReceivable>('/api/dashboard/accounts-receivable'),
        api.get<BranchStats[]>('/api/branches/stats'),
      ])
      setStats(s)
      setRecentSales(sales)
      setLowStock(stock)
      setSalesByHour(byHour)
      setSalesLast30(last30)
      setPaymentMethods(payments)
      setTopProducts(top)
      setWeekComp(week)
      setMargin(mar)
      setAccounts(acc)
      setBranchStats(branches)
    } catch (err) { console.error(err) }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Auto-refresh cada 5 minutos
  useEffect(() => {
    const interval = setInterval(() => fetchAll(true), 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchAll])

  const today = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })

  // Hora pico
  const peakHour = salesByHour.reduce((max, h) => h.total_revenue > (max?.total_revenue ?? 0) ? h : max, salesByHour[0])

  // Datos del gráfico de 30 días formateados
  const last30Formatted = [...salesLast30].map(d => ({
    ...d,
    label: new Date(d.sale_date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }),
  }))

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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 space-y-3">
            <div className="h-4 w-40 rounded bg-[var(--surface2)] animate-pulse" />
            <div className="h-32 rounded bg-[var(--surface2)] animate-pulse opacity-50" />
          </div>
          <CardListSkeleton rows={4} />
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

      <div className="p-5 space-y-5">

        {/* ── Fila 1: Stats principales ── */}
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

        {/* ── Fila 2: Comparativo semana + Cuentas corrientes ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

          {/* Comparativo semanas */}
          <Card>
            <CardHeader>
              <CardTitle>Esta semana vs anterior</CardTitle>
            </CardHeader>
            {weekComp && (
              <div className="space-y-3">
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-xs text-[var(--text3)]">Esta semana</p>
                    <p className="text-2xl font-bold mono text-[var(--accent)]">{formatCurrency(weekComp.this_week)}</p>
                    <p className="text-xs text-[var(--text3)]">{weekComp.this_count} ventas</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-[var(--text3)]">Semana anterior</p>
                    <p className="text-lg font-semibold mono text-[var(--text2)]">{formatCurrency(weekComp.prev_week)}</p>
                    <p className="text-xs text-[var(--text3)]">{weekComp.prev_count} ventas</p>
                  </div>
                </div>
                {/* Barra comparativa */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-[var(--text3)]">
                    <span>Esta semana</span>
                    <span className={weekComp.diff_pct >= 0 ? 'text-[var(--accent)]' : 'text-[var(--danger)]'}>
                      {weekComp.diff_pct >= 0 ? '+' : ''}{weekComp.diff_pct}%
                    </span>
                  </div>
                  <div className="h-2 bg-[var(--surface2)] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${weekComp.prev_week > 0 ? Math.min(weekComp.this_week / weekComp.prev_week * 100, 150) : 100}%`,
                        background: weekComp.diff_pct >= 0 ? 'var(--accent)' : 'var(--danger)',
                      }}
                    />
                  </div>
                  <div className="h-1.5 bg-[var(--surface2)] rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--text3)] rounded-full opacity-40" style={{ width: '100%' }} />
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Cuentas corrientes */}
          <Card>
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

        {/* ── Gráfico: Evolución 30 días ── */}
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
                <Line type="monotone" dataKey="gross_margin" name="Margen" stroke="#0ea5e9" strokeWidth={2} dot={false} strokeDasharray="4 2" activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* ── Fila 3: Ventas por hora + Métodos de pago ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Ventas por hora */}
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
                          <p className="font-semibold text-[var(--accent)]">
                            {formatCurrency(Number(payload[0]?.value ?? 0))}
                          </p>
                        </div>
                      )
                    }}
                  />
                  <Bar dataKey="total_revenue" fill="#16a34a" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* Métodos de pago */}
          <Card>
            <CardHeader>
              <CardTitle>Métodos de pago</CardTitle>
              <span className="text-xs text-[var(--text3)]">Últimos 30 días</span>
            </CardHeader>
            {paymentMethods.length === 0 ? (
              <p className="text-sm text-[var(--text3)] text-center py-8">Sin datos</p>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={160}>
                  <PieChart>
                    <Pie
                      data={[...paymentMethods]}
                      dataKey="total"
                      nameKey="method"
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                    >
                      {paymentMethods.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null
                        return (
                          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 shadow-xl text-xs">
                            <p className="text-[var(--text3)] mb-1">{label}</p>
                            <p className="font-semibold text-[var(--accent)]">
                              {formatCurrency(Number(payload[0]?.value ?? 0))}
                            </p>
                          </div>
                        )
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {paymentMethods
                    .sort((a, b) => b.total - a.total)
                    .map((pm, i) => {
                      const total = paymentMethods.reduce((a, p) => a + p.total, 0)
                      const pct = total > 0 ? Math.round(pm.total / total * 100) : 0
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
                    })}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* ── Fila 4: Top productos + Ventas recientes + Stock crítico ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Top 5 productos */}
          <Card padding="none">
            <CardHeader className="px-4 pt-4 pb-3">
              <CardTitle>Top 5 productos</CardTitle>
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
    </AppShell>
  )
}
