'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState } from '@/components/ui/EmptyState'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { api } from '@/lib/api'
import { getStockStatusLabel, formatCurrency } from '@/lib/utils'
import type { StockSummary, PaginatedResponse, Pagination as PaginationType, Category } from '@/types'
import {
  Boxes, Search, Filter, X,
  ChevronUp, ChevronDown, ArrowUpDown,
} from 'lucide-react'
import { AdjustStockModal } from '@/components/modules/AdjustStockModal'
import type { Product } from '@/types'

type StockFilter = 'all' | 'ok' | 'bajo' | 'critico' | 'sin_stock'
type SortField   = 'name' | 'stock_current' | 'cost_price' | 'stock_min'
type SortDir     = 'asc' | 'desc'

interface Supplier  { id: string; name: string }
interface Warehouse { id: string; name: string }

type StockItem = StockSummary & {
  stock_reserved?: number
  warehouse_id?: string
  warehouse_name?: string
}

const selectClass = 'px-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]'

function SortIcon({ field, sortBy, sortDir }: { field: SortField; sortBy: SortField; sortDir: SortDir }) {
  if (sortBy !== field) return <ArrowUpDown size={11} className="opacity-25 group-hover:opacity-60 transition-opacity" />
  return sortDir === 'asc' ? <ChevronUp size={11} className="text-[var(--accent)]" /> : <ChevronDown size={11} className="text-[var(--accent)]" />
}

export default function StockPage() {
  const [data, setData] = useState<StockItem[]>([])
  const [pagination, setPagination] = useState<PaginationType>({ total: 0, page: 1, limit: 50, pages: 0 })
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filter, setFilter] = useState<StockFilter>('all')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [sortBy, setSortBy] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [loading, setLoading] = useState(true)
  const [showFilters, setShowFilters] = useState(false)

  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('')
  const [categories, setCategories] = useState<Category[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [categoryFilter, setCategoryFilter] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [minStockInput, setMinStockInput] = useState('')
  const [maxStockInput, setMaxStockInput] = useState('')
  const [minStock, setMinStock] = useState('')
  const [maxStock, setMaxStock] = useState('')

  const [adjustModal, setAdjustModal] = useState(false)
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null)
  const [adjustWarehouseId, setAdjustWarehouseId] = useState<string | undefined>()

  // Refs
  const searchRef          = useRef(debouncedSearch)
  const filterRef          = useRef(filter)
  const warehouseRef       = useRef(selectedWarehouse)
  const categoryRef        = useRef(categoryFilter)
  const supplierRef        = useRef(supplierFilter)
  const minStockRef        = useRef(minStock)
  const maxStockRef        = useRef(maxStock)
  const pageRef            = useRef(page)
  const limitRef           = useRef(limit)
  const sortByRef          = useRef(sortBy)
  const sortDirRef         = useRef(sortDir)

  // Debounces
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), search ? 300 : 0)
    return () => clearTimeout(t)
  }, [search])
  useEffect(() => {
    const t = setTimeout(() => setMinStock(minStockInput), 400)
    return () => clearTimeout(t)
  }, [minStockInput])
  useEffect(() => {
    const t = setTimeout(() => setMaxStock(maxStockInput), 400)
    return () => clearTimeout(t)
  }, [maxStockInput])

  // Sync refs
  useEffect(() => { searchRef.current = debouncedSearch }, [debouncedSearch])
  useEffect(() => { filterRef.current = filter }, [filter])
  useEffect(() => { warehouseRef.current = selectedWarehouse }, [selectedWarehouse])
  useEffect(() => { categoryRef.current = categoryFilter }, [categoryFilter])
  useEffect(() => { supplierRef.current = supplierFilter }, [supplierFilter])
  useEffect(() => { minStockRef.current = minStock }, [minStock])
  useEffect(() => { maxStockRef.current = maxStock }, [maxStock])

  const fetchStock = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<PaginatedResponse<StockItem>>('/api/stock', {
        search:       searchRef.current      || undefined,
        stock_status: filterRef.current !== 'all' ? filterRef.current : undefined,
        warehouse_id: warehouseRef.current   || undefined,
        category_id:  categoryRef.current    || undefined,
        supplier_id:  supplierRef.current    || undefined,
        min_stock:    minStockRef.current    ? Number(minStockRef.current) : undefined,
        max_stock:    maxStockRef.current    ? Number(maxStockRef.current) : undefined,
        sort_by:      sortByRef.current,
        sort_dir:     sortDirRef.current,
        page:         pageRef.current,
        limit:        limitRef.current,
      })
      const mappedData = res.data.map(item => ({
        ...item,
        name: (item as StockItem & { product_name?: string }).product_name ?? item.name,
      }))
      setData(mappedData)
      setPagination(res.pagination)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    pageRef.current = 1
    setPage(1)
    fetchStock()
  }, [debouncedSearch, filter, selectedWarehouse, categoryFilter, supplierFilter, minStock, maxStock, fetchStock])

  const handlePageChange = useCallback((newPage: number) => {
    pageRef.current = newPage
    setPage(newPage)
    fetchStock()
  }, [fetchStock])

  const handleLimitChange = useCallback((newLimit: number) => {
    limitRef.current = newLimit
    pageRef.current = 1
    setLimit(newLimit)
    setPage(1)
    fetchStock()
  }, [fetchStock])

  const handleSort = useCallback((field: SortField) => {
    const newDir: SortDir = sortByRef.current === field && sortDirRef.current === 'asc' ? 'desc' : 'asc'
    sortByRef.current  = field
    sortDirRef.current = newDir
    pageRef.current    = 1
    setSortBy(field)
    setSortDir(newDir)
    setPage(1)
    fetchStock()
  }, [fetchStock])

  useEffect(() => {
    api.get<Warehouse[]>('/api/warehouses').then(setWarehouses).catch(() => {})
    api.get<Category[]>('/api/products/categories').then(setCategories).catch(() => {})
    api.get<Supplier[]>('/api/purchases/suppliers').then(setSuppliers).catch(() => {})
  }, [])

  const statusFilters: { key: StockFilter; label: string }[] = [
    { key: 'all',      label: 'Todos' },
    { key: 'critico',  label: 'Crítico' },
    { key: 'sin_stock', label: 'Sin stock' },
    { key: 'bajo',     label: 'Bajo' },
    { key: 'ok',       label: 'OK' },
  ]

  const hasExtraFilter = !!(categoryFilter || supplierFilter || minStockInput || maxStockInput)
  const activeFilterCount = [categoryFilter, supplierFilter, (minStockInput || maxStockInput) ? 'stock' : ''].filter(Boolean).length

  function clearFilters() {
    setCategoryFilter(''); setSupplierFilter('')
    setMinStockInput(''); setMaxStockInput('')
  }

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

        {/* Barra principal: pills de estado + búsqueda + filtros */}
        <div className="flex flex-wrap gap-2 items-center">
          {statusFilters.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 text-xs rounded-full font-medium flex-shrink-0 transition-colors ${filter === f.key
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--surface2)] text-[var(--text2)] hover:bg-[var(--surface3)]'
              }`}>
              {f.label}
            </button>
          ))}
          <div className="flex gap-2 ml-auto items-center">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar..."
                className="w-full min-w-[130px] pl-7 pr-3 py-1.5 text-xs rounded-full bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
            <button
              onClick={() => setShowFilters(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full font-medium border transition-colors flex-shrink-0 ${showFilters || hasExtraFilter ? 'bg-[var(--accent)] border-[var(--accent)] text-white' : 'bg-[var(--surface2)] border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface3)]'}`}
            >
              <Filter size={12} />
              Filtros
              {activeFilterCount > 0 && (
                <span className="bg-white/25 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Panel de filtros extra */}
        {showFilters && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">

              {/* Categoría */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--text3)]">Categoría</label>
                <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className={selectClass}>
                  <option value="">Todas</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* Proveedor */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--text3)]">Proveedor</label>
                <select value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)} className={selectClass}>
                  <option value="">Todos</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              {/* Rango de stock */}
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-xs font-medium text-[var(--text3)]">Cantidad en stock</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    value={minStockInput}
                    onChange={e => setMinStockInput(e.target.value)}
                    placeholder="Mínimo"
                    className={`${selectClass} flex-1 min-w-0`}
                  />
                  <span className="text-xs text-[var(--text3)] flex-shrink-0">—</span>
                  <input
                    type="number"
                    min="0"
                    value={maxStockInput}
                    onChange={e => setMaxStockInput(e.target.value)}
                    placeholder="Máximo"
                    className={`${selectClass} flex-1 min-w-0`}
                  />
                </div>
              </div>

              {/* Ordenar por */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--text3)]">Ordenar por</label>
                <div className="flex gap-1">
                  <select
                    value={sortBy}
                    onChange={e => handleSort(e.target.value as SortField)}
                    className={`${selectClass} flex-1 min-w-0`}
                  >
                    <option value="name">Nombre</option>
                    <option value="stock_current">Stock actual</option>
                    <option value="stock_min">Stock mínimo</option>
                    <option value="cost_price">Precio costo</option>
                  </select>
                  <button
                    onClick={() => handleSort(sortBy)}
                    title={sortDir === 'asc' ? 'Ascendente' : 'Descendente'}
                    className="px-2.5 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text2)] hover:border-[var(--accent)] transition-colors"
                  >
                    {sortDir === 'asc' ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                </div>
              </div>
            </div>

            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-[var(--text3)] hover:text-[var(--danger)] transition-colors">
                <X size={12} /> Limpiar filtros
              </button>
            )}
          </div>
        )}

        {loading ? <TableSkeleton rows={15} /> : data.length === 0 ? (
          <EmptyState icon={Boxes} title="Sin resultados" description="Probá con otro filtro." />
        ) : (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th
                      onClick={() => handleSort('name')}
                      className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] cursor-pointer hover:text-[var(--text)] select-none group"
                    >
                      <div className="flex items-center gap-1">
                        Producto
                        <SortIcon field="name" sortBy={sortBy} sortDir={sortDir} />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('stock_current')}
                      className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)] cursor-pointer hover:text-[var(--text)] select-none group"
                    >
                      <div className="flex items-center justify-end gap-1">
                        Stock
                        <SortIcon field="stock_current" sortBy={sortBy} sortDir={sortDir} />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('stock_min')}
                      className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)] cursor-pointer hover:text-[var(--text)] select-none group"
                    >
                      <div className="flex items-center justify-end gap-1">
                        Mín
                        <SortIcon field="stock_min" sortBy={sortBy} sortDir={sortDir} />
                      </div>
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)] hidden sm:table-cell">Máx</th>
                    <th
                      onClick={() => handleSort('cost_price')}
                      className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)] cursor-pointer hover:text-[var(--text)] select-none group hidden md:table-cell"
                    >
                      <div className="flex items-center justify-end gap-1">
                        P. Costo
                        <SortIcon field="cost_price" sortBy={sortBy} sortDir={sortDir} />
                      </div>
                    </th>
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
            <Pagination pagination={pagination} onPageChange={handlePageChange} onLimitChange={handleLimitChange} />
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
