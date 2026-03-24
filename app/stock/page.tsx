'use client'
import { useEffect, useState, useCallback } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoader } from '@/components/ui/Spinner'
import { api } from '@/lib/api'
import { getStockStatusLabel, formatCurrency } from '@/lib/utils'
import type { StockSummary, PaginatedResponse, Pagination as PaginationType } from '@/types'
import { Boxes, Search } from 'lucide-react'
import { AdjustStockModal } from '@/components/modules/AdjustStockModal'
import type { Product } from '@/types'

type StockFilter = 'all' | 'ok' | 'bajo' | 'critico' | 'sin_stock'

interface Warehouse { id: string; name: string }

type StockItem = StockSummary & {
  stock_reserved?: number
  warehouse_id?: string
  warehouse_name?: string
}

export default function StockPage() {
  const [data, setData] = useState<StockItem[]>([])
  const [pagination, setPagination] = useState<PaginationType>({ total: 0, page: 1, limit: 50, pages: 0 })
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<StockFilter>('all')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('')

  const [adjustModal, setAdjustModal] = useState(false)
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null)
  const [adjustWarehouseId, setAdjustWarehouseId] = useState<string | undefined>()

  useEffect(() => {
    api.get<Warehouse[]>('/api/warehouses')
      .then(setWarehouses)
      .catch(() => { })
  }, [])

  const fetchStock = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<PaginatedResponse<StockItem>>('/api/stock', {
        search: search || undefined,
        stock_status: filter !== 'all' ? filter : undefined,
        warehouse_id: selectedWarehouse || undefined,
        page,
        limit: 50,
      })
      const mappedData = res.data.map(item => ({
        ...item,
        name: (item as StockItem & { product_name?: string }).product_name ?? item.name,
      }))
      setData(mappedData)
      setPagination(res.pagination)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [search, filter, page, selectedWarehouse])

  useEffect(() => { fetchStock() }, [fetchStock])
  useEffect(() => { setPage(1) }, [search, filter, selectedWarehouse])

  const filters: { key: StockFilter; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'critico', label: 'Crítico' },
    { key: 'sin_stock', label: 'Sin stock' },
    { key: 'bajo', label: 'Bajo' },
    { key: 'ok', label: 'OK' },
  ]

  return (
    <AppShell>
      <PageHeader
        title="Inventario"
        description={`${pagination.total} productos`}
      />

      <div className="p-5 space-y-4">

        {/* Selector de depósito */}
        {warehouses.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-xs text-[var(--text3)] flex-shrink-0">Depósito:</span>
            {[{ id: '', name: 'Todos' }, ...warehouses].map(w => (
              <button key={w.id} onClick={() => setSelectedWarehouse(w.id)}
                className={`px-3 py-1.5 text-xs rounded-full font-medium flex-shrink-0 transition-colors ${selectedWarehouse === w.id
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--surface2)] text-[var(--text2)] hover:bg-[var(--surface3)]'
                  }`}>
                {w.name}
              </button>
            ))}
          </div>
        )}

        {/* Filtros + buscador */}
        <div className="flex flex-wrap gap-2">
          {filters.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors ${filter === f.key
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--surface2)] text-[var(--text2)] hover:bg-[var(--surface3)]'
                }`}>
              {f.label}
            </button>
          ))}
          <div className="relative ml-auto">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="pl-7 pr-3 py-1.5 text-xs rounded-full bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
        </div>

        {loading ? <PageLoader /> : data.length === 0 ? (
          <EmptyState icon={Boxes} title="Sin resultados" description="Probá con otro filtro." />
        ) : (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)]">Producto</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)]">Stock</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)]">Mín</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)] hidden sm:table-cell">Máx</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)] hidden md:table-cell">P. Costo</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-[var(--text3)]">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {data.map(item => (
                    <tr key={item.id}
                      onClick={() => {
                        setAdjustProduct(item as unknown as Product)
                        setAdjustWarehouseId(selectedWarehouse || undefined)
                        setAdjustModal(true)
                      }}
                      className="hover:bg-[var(--surface2)] transition-colors cursor-pointer">
                      <td className="px-4 py-3">
                        <p className="font-medium text-[var(--text)]">{item.name}</p>
                        <p className="text-xs text-[var(--text3)]">{item.category_name ?? '—'}</p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="mono font-bold text-[var(--text)]">{item.stock_current}</span>
                        {(item.stock_reserved ?? 0) > 0 && (
                          <div className="text-xs text-[var(--warning)]">
                            {item.stock_current - (item.stock_reserved ?? 0)} disp.
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right mono text-[var(--text3)]">{item.stock_min}</td>
                      <td className="px-4 py-3 text-right mono text-[var(--text3)] hidden sm:table-cell">{item.stock_max}</td>
                      <td className="px-4 py-3 text-right mono text-[var(--text2)] hidden md:table-cell">
                        {formatCurrency(item.cost_price)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={
                          item.stock_status === 'ok' ? 'success' :
                            item.stock_status === 'bajo' ? 'warning' : 'danger'
                        }>
                          {getStockStatusLabel(item.stock_status)}
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

        <AdjustStockModal
          open={adjustModal}
          onClose={() => { setAdjustModal(false); setAdjustProduct(null); setAdjustWarehouseId(undefined) }}
          onSaved={fetchStock}
          product={adjustProduct}
          warehouseId={adjustWarehouseId}
        />

      </div>
    </AppShell>
  )
}
