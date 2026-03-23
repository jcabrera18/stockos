'use client'
import { useEffect, useState, useCallback } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoader } from '@/components/ui/Spinner'
import { api } from '@/lib/api'
import { formatCurrency, formatDateTime, getPaymentMethodLabel, getPeriodDates } from '@/lib/utils'
import type { Sale, PaginatedResponse, Pagination as PaginationType } from '@/types'
import { Plus, ShoppingCart } from 'lucide-react'

type Period = 'today' | 'week' | 'month'

export default function SalesPage() {
  const [data, setData]             = useState<Sale[]>([])
  const [pagination, setPagination] = useState<PaginationType>({ total: 0, page: 1, limit: 20, pages: 0 })
  const [period, setPeriod]         = useState<Period>('today')
  const [page, setPage]             = useState(1)
  const [loading, setLoading]       = useState(true)

  const fetchSales = useCallback(async () => {
    setLoading(true)
    try {
      const { from, to } = getPeriodDates(period)
      const res = await api.get<PaginatedResponse<Sale>>('/api/sales', { from, to, page, limit: 20 })
      setData(res.data)
      setPagination(res.pagination)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [period, page])

  useEffect(() => { fetchSales() }, [fetchSales])
  useEffect(() => { setPage(1) }, [period])

  const totalRevenue = data.reduce((a, s) => a + Number(s.total), 0)

  const periods: { key: Period; label: string }[] = [
    { key: 'today', label: 'Hoy' },
    { key: 'week',  label: 'Semana' },
    { key: 'month', label: 'Mes' },
  ]

  return (
    <AppShell>
      <PageHeader
        title="Ventas"
        description={loading ? '...' : `${pagination.total} ventas · ${formatCurrency(totalRevenue)}`}
        action={
          <Button onClick={() => { /* TODO: abrir POS */ }}>
            <Plus size={15} /> Nueva venta
          </Button>
        }
      />

      <div className="p-5 space-y-4">
        {/* Filtro período */}
        <div className="flex gap-2">
          {periods.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-4 py-1.5 text-xs rounded-full font-medium transition-colors ${
                period === p.key
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--surface2)] text-[var(--text2)] hover:bg-[var(--surface3)]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {loading ? <PageLoader /> : data.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title="Sin ventas"
            description="Registrá tu primera venta con el botón Nueva venta."
          />
        ) : (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)]">Fecha</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden md:table-cell">Vendedor</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-[var(--text3)]">Método</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)] hidden sm:table-cell">Descuento</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)]">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {data.map(sale => (
                    <tr key={sale.id} className="hover:bg-[var(--surface2)] transition-colors cursor-pointer">
                      <td className="px-4 py-3 text-[var(--text2)] text-xs mono">
                        {formatDateTime(sale.created_at)}
                      </td>
                      <td className="px-4 py-3 text-[var(--text2)] hidden md:table-cell">
                        {(sale.users as { full_name: string } | undefined)?.full_name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="default">{getPaymentMethodLabel(sale.payment_method)}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right mono text-[var(--text3)] hidden sm:table-cell">
                        {sale.discount > 0 ? `- ${formatCurrency(sale.discount)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right mono font-semibold text-[var(--text)]">
                        {formatCurrency(sale.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination pagination={pagination} onPageChange={setPage} />
          </div>
        )}
      </div>
    </AppShell>
  )
}
