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
import { formatCurrency, formatDate } from '@/lib/utils'
import type { PurchaseOrder, PaginatedResponse, Pagination as PaginationType } from '@/types'
import { Plus, Truck } from 'lucide-react'

type StatusFilter = 'all' | 'pending' | 'received' | 'cancelled'

const statusConfig: Record<string, { label: string; variant: 'warning' | 'success' | 'danger' | 'default' }> = {
  pending:   { label: 'Pendiente',  variant: 'warning' },
  received:  { label: 'Recibida',   variant: 'success' },
  cancelled: { label: 'Cancelada',  variant: 'danger'  },
}

export default function PurchasesPage() {
  const [data, setData]             = useState<PurchaseOrder[]>([])
  const [pagination, setPagination] = useState<PaginationType>({ total: 0, page: 1, limit: 20, pages: 0 })
  const [statusFilter, setStatus]   = useState<StatusFilter>('all')
  const [page, setPage]             = useState(1)
  const [loading, setLoading]       = useState(true)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<PaginatedResponse<PurchaseOrder>>('/api/purchases', {
        status: statusFilter !== 'all' ? statusFilter : undefined,
        page,
        limit: 20,
      })
      setData(res.data)
      setPagination(res.pagination)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, page])

  useEffect(() => { fetchOrders() }, [fetchOrders])
  useEffect(() => { setPage(1) }, [statusFilter])

  const filters: { key: StatusFilter; label: string }[] = [
    { key: 'all',       label: 'Todas' },
    { key: 'pending',   label: 'Pendientes' },
    { key: 'received',  label: 'Recibidas' },
    { key: 'cancelled', label: 'Canceladas' },
  ]

  return (
    <AppShell>
      <PageHeader
        title="Compras"
        description={`${pagination.total} órdenes`}
        action={
          <Button onClick={() => { /* TODO: modal nueva orden */ }}>
            <Plus size={15} /> Nueva orden
          </Button>
        }
      />

      <div className="p-5 space-y-4">
        <div className="flex gap-2 flex-wrap">
          {filters.map(f => (
            <button
              key={f.key}
              onClick={() => setStatus(f.key)}
              className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors ${
                statusFilter === f.key
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--surface2)] text-[var(--text2)] hover:bg-[var(--surface3)]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? <PageLoader /> : data.length === 0 ? (
          <EmptyState
            icon={Truck}
            title="Sin órdenes de compra"
            description="Creá tu primera orden de compra."
          />
        ) : (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)]">Fecha</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)]">Proveedor</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-[var(--text3)]">Estado</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)]">Total</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {data.map(order => {
                    const sc = statusConfig[order.status]
                    return (
                      <tr key={order.id} className="hover:bg-[var(--surface2)] transition-colors">
                        <td className="px-4 py-3 text-xs mono text-[var(--text2)]">
                          {formatDate(order.created_at)}
                        </td>
                        <td className="px-4 py-3 font-medium text-[var(--text)]">
                          {(order.suppliers as { name: string } | undefined)?.name ?? 'Sin proveedor'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={sc.variant}>{sc.label}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right mono font-semibold text-[var(--text)]">
                          {formatCurrency(order.total)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {order.status === 'pending' && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={async () => {
                                await api.post(`/api/purchases/${order.id}/receive`, {})
                                fetchOrders()
                              }}
                            >
                              Recibir
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
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
