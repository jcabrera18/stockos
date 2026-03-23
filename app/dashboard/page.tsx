'use client'
import { useEffect, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { PageLoader } from '@/components/ui/Spinner'
import { api } from '@/lib/api'
import { formatCurrency, formatDateTime, getPaymentMethodLabel } from '@/lib/utils'
import type { DashboardStats, Sale, StockSummary } from '@/types'
import { TrendingUp, ShoppingCart, AlertTriangle, DollarSign } from 'lucide-react'

export default function DashboardPage() {
  const [stats, setStats]         = useState<DashboardStats | null>(null)
  const [recentSales, setRecentSales] = useState<Sale[]>([])
  const [lowStock, setLowStock]   = useState<StockSummary[]>([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    Promise.all([
      api.get<DashboardStats>('/api/dashboard/stats'),
      api.get<Sale[]>('/api/dashboard/recent-sales'),
      api.get<StockSummary[]>('/api/dashboard/low-stock'),
    ]).then(([s, sales, stock]) => {
      setStats(s)
      setRecentSales(sales)
      setLowStock(stock)
    }).catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <AppShell><PageLoader /></AppShell>

  return (
    <AppShell>
      <PageHeader title="Dashboard" description={new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })} />

      <div className="p-5 space-y-5">
        {/* Stats grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            title="Ventas hoy"
            value={formatCurrency(stats?.today_revenue ?? 0)}
            subtitle={`${stats?.today_sales ?? 0} transacciones`}
            icon={DollarSign}
            accent
          />
          <StatCard
            title="Esta semana"
            value={formatCurrency(stats?.week_revenue ?? 0)}
            icon={TrendingUp}
          />
          <StatCard
            title="Este mes"
            value={formatCurrency(stats?.month_revenue ?? 0)}
            icon={ShoppingCart}
          />
          <StatCard
            title="Alertas stock"
            value={stats?.low_stock_alerts ?? 0}
            subtitle="Bajo mínimo"
            icon={AlertTriangle}
            className={(stats?.low_stock_alerts ?? 0) > 0 ? 'border-[var(--danger)] bg-[var(--danger-subtle)]' : ''}
          />
        </div>

        <div className="grid lg:grid-cols-2 gap-5">
          {/* Ventas recientes */}
          <Card padding="none">
            <CardHeader className="px-4 pt-4 pb-3">
              <CardTitle>Ventas recientes</CardTitle>
            </CardHeader>
            <div className="divide-y divide-[var(--border)]">
              {recentSales.length === 0 ? (
                <p className="text-sm text-[var(--text3)] text-center py-8">Sin ventas aún</p>
              ) : recentSales.map(sale => (
                <div key={sale.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-[var(--text)]">
                      {formatCurrency(sale.total)}
                    </p>
                    <p className="text-xs text-[var(--text3)]">
                      {formatDateTime(sale.created_at)}
                    </p>
                  </div>
                  <Badge variant="default">
                    {getPaymentMethodLabel(sale.payment_method)}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>

          {/* Alertas stock */}
          <Card padding="none">
            <CardHeader className="px-4 pt-4 pb-3">
              <CardTitle>Stock crítico</CardTitle>
            </CardHeader>
            <div className="divide-y divide-[var(--border)]">
              {lowStock.length === 0 ? (
                <p className="text-sm text-[var(--text3)] text-center py-8">Todo el stock en orden ✓</p>
              ) : lowStock.map(item => (
                <div key={item.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-[var(--text)]">{item.name}</p>
                    <p className="text-xs text-[var(--text3)]">{item.supplier_name ?? 'Sin proveedor'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold mono text-[var(--danger)]">
                      {item.stock_current}
                    </p>
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
