'use client'
import { useEffect, useState, useCallback } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoader } from '@/components/ui/Spinner'
import { api } from '@/lib/api'
import { formatCurrency, getStockStatusLabel, getStockStatusColor } from '@/lib/utils'
import type { StockSummary, PaginatedResponse, Pagination as PaginationType } from '@/types'
import { Plus, Search, Package } from 'lucide-react'

export default function ProductsPage() {
  const [data, setData]         = useState<StockSummary[]>([])
  const [pagination, setPagination] = useState<PaginationType>({ total: 0, page: 1, limit: 20, pages: 0 })
  const [search, setSearch]     = useState('')
  const [page, setPage]         = useState(1)
  const [loading, setLoading]   = useState(true)

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<PaginatedResponse<StockSummary>>('/api/products', {
        search: search || undefined,
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
  }, [search, page])

  useEffect(() => { fetchProducts() }, [fetchProducts])

  // Reset page cuando cambia búsqueda
  useEffect(() => { setPage(1) }, [search])

  return (
    <AppShell>
      <PageHeader
        title="Productos"
        description={`${pagination.total} productos`}
        action={
          <Button onClick={() => {/* TODO: abrir modal */}}>
            <Plus size={15} /> Nuevo producto
          </Button>
        }
      />

      <div className="p-5 space-y-4">
        {/* Búsqueda */}
        <div className="relative max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre o código..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>

        {/* Tabla */}
        {loading ? <PageLoader /> : data.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Sin productos"
            description="Creá tu primer producto para empezar a gestionar el stock."
          />
        ) : (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)]">Producto</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden md:table-cell">Categoría</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)]">Stock</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)] hidden sm:table-cell">P. Costo</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)]">P. Venta</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-[var(--text3)]">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {data.map(product => (
                    <tr key={product.id} className="hover:bg-[var(--surface2)] transition-colors cursor-pointer">
                      <td className="px-4 py-3">
                        <p className="font-medium text-[var(--text)]">{product.name}</p>
                        {product.barcode && (
                          <p className="text-xs mono text-[var(--text3)]">{product.barcode}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[var(--text2)] hidden md:table-cell">
                        {product.category_name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right mono font-semibold" style={{ color: getStockStatusColor(product.stock_status) }}>
                        {product.stock_current}
                      </td>
                      <td className="px-4 py-3 text-right mono text-[var(--text2)] hidden sm:table-cell">
                        {formatCurrency(product.cost_price)}
                      </td>
                      <td className="px-4 py-3 text-right mono font-medium text-[var(--text)]">
                        {formatCurrency(product.sell_price)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge
                          variant={
                            product.stock_status === 'ok'       ? 'success' :
                            product.stock_status === 'bajo'     ? 'warning' :
                            product.stock_status === 'critico'  ? 'danger'  :
                            'danger'
                          }
                        >
                          {getStockStatusLabel(product.stock_status)}
                        </Badge>
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
