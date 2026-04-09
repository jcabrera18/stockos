'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState } from '@/components/ui/EmptyState'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ProductModal } from '@/components/modules/ProductModal'
import { AdjustStockModal } from '@/components/modules/AdjustStockModal'
import { api } from '@/lib/api'
import { formatCurrency, getStockStatusLabel, getStockStatusColor } from '@/lib/utils'
import type { StockSummary, Product, Category, PaginatedResponse, Pagination as PaginationType } from '@/types'
import {
  Plus, Search, Package, Pencil, Trash2, SlidersHorizontal,
  Tag, Filter, X, ChevronUp, ChevronDown, ArrowUpDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { ProductPriceRulesModal } from '@/components/modules/ProductPriceRulesModal'
import { BulkPriceModal } from '@/components/modules/BulkPriceModal'
import { PrintPriceListModal } from '@/components/modules/PrintPriceListModal'
import { TrendingUp, Printer } from 'lucide-react'

interface Supplier { id: string; name: string }
interface CategoryWithChildren extends Category { children: CategoryWithChildren[] }

function buildCategoryTree(cats: Category[]): CategoryWithChildren[] {
  const map = new Map<string, CategoryWithChildren>()
  const roots: CategoryWithChildren[] = []
  cats.forEach(c => map.set(c.id, { ...c, children: [] }))
  cats.forEach(c => {
    const node = map.get(c.id)!
    if (c.parent_id && map.has(c.parent_id)) map.get(c.parent_id)!.children.push(node)
    else roots.push(node)
  })
  return roots
}

const STOCK_STATUS_OPTIONS = [
  { value: 'ok',        label: 'Stock OK' },
  { value: 'bajo',      label: 'Stock bajo' },
  { value: 'critico',   label: 'Stock crítico' },
  { value: 'sin_stock', label: 'Sin stock' },
]

const SORT_OPTIONS = [
  { value: 'name',          label: 'Nombre' },
  { value: 'sell_price',    label: 'Precio venta' },
  { value: 'cost_price',    label: 'Precio costo' },
]

const selectClass = 'px-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed'

type SortField = 'name' | 'sell_price' | 'cost_price' | 'stock_current'
type SortDir   = 'asc' | 'desc'

function SortIcon({ field, sortBy, sortDir }: { field: SortField; sortBy: SortField; sortDir: SortDir }) {
  if (sortBy !== field) return <ArrowUpDown size={11} className="opacity-25 group-hover:opacity-60 transition-opacity" />
  return sortDir === 'asc' ? <ChevronUp size={11} className="text-[var(--accent)]" /> : <ChevronDown size={11} className="text-[var(--accent)]" />
}

export default function ProductsPage() {
  const [data, setData] = useState<StockSummary[]>([])
  const [pagination, setPagination] = useState<PaginationType>({ total: 0, page: 1, limit: 20, pages: 0 })
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [sortBy, setSortBy] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [loading, setLoading] = useState(true)
  const [showFilters, setShowFilters] = useState(false)

  // Modales
  const [productModal, setProductModal] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [adjustModal, setAdjustModal] = useState(false)
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null)
  const [deleteModal, setDeleteModal] = useState(false)
  const [deleteProduct, setDeleteProduct] = useState<StockSummary | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [priceRulesModal, setPriceRulesModal] = useState(false)
  const [priceRulesProduct, setPriceRulesProduct] = useState<Product | null>(null)

  const [allCategories, setAllCategories] = useState<Category[]>([])
  const [bulkPriceModal, setBulkPriceModal] = useState(false)
  const [printModal, setPrintModal] = useState(false)

  // Filtros
  const [brandFilter, setBrandFilter] = useState('')
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([])
  const [supplierFilter, setSupplierFilter] = useState('')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [categoryFilter, setCategoryFilter] = useState('')
  const [stockStatusFilter, setStockStatusFilter] = useState('')
  const [minPriceInput, setMinPriceInput] = useState('')
  const [maxPriceInput, setMaxPriceInput] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')

  // Refs para acceso síncrono en callbacks
  const searchRef       = useRef(debouncedSearch)
  const pageRef         = useRef(page)
  const limitRef        = useRef(limit)
  const sortByRef       = useRef(sortBy)
  const sortDirRef      = useRef(sortDir)
  const brandRef        = useRef(brandFilter)
  const supplierRef     = useRef(supplierFilter)
  const categoryRef     = useRef(categoryFilter)
  const stockStatusRef  = useRef(stockStatusFilter)
  const minPriceRef     = useRef(minPrice)
  const maxPriceRef     = useRef(maxPrice)

  // Debounces
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), search ? 300 : 0)
    return () => clearTimeout(t)
  }, [search])
  useEffect(() => {
    const t = setTimeout(() => setMinPrice(minPriceInput), 400)
    return () => clearTimeout(t)
  }, [minPriceInput])
  useEffect(() => {
    const t = setTimeout(() => setMaxPrice(maxPriceInput), 400)
    return () => clearTimeout(t)
  }, [maxPriceInput])

  // Sync refs
  useEffect(() => { searchRef.current = debouncedSearch }, [debouncedSearch])
  useEffect(() => { brandRef.current = brandFilter }, [brandFilter])
  useEffect(() => { supplierRef.current = supplierFilter }, [supplierFilter])
  useEffect(() => { categoryRef.current = categoryFilter }, [categoryFilter])
  useEffect(() => { stockStatusRef.current = stockStatusFilter }, [stockStatusFilter])
  useEffect(() => { minPriceRef.current = minPrice }, [minPrice])
  useEffect(() => { maxPriceRef.current = maxPrice }, [maxPrice])

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<PaginatedResponse<StockSummary>>('/api/products', {
        search:       searchRef.current     || undefined,
        brand_id:     brandRef.current      || undefined,
        supplier_id:  supplierRef.current   || undefined,
        category_id:  categoryRef.current   || undefined,
        stock_status: stockStatusRef.current || undefined,
        min_price:    minPriceRef.current   ? Number(minPriceRef.current)  : undefined,
        max_price:    maxPriceRef.current   ? Number(maxPriceRef.current)  : undefined,
        sort_by:      sortByRef.current,
        sort_dir:     sortDirRef.current,
        page:         pageRef.current,
        limit:        limitRef.current,
      })
      setData(res.data)
      setPagination(res.pagination)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Re-fetch cuando cambian filtros (reset a página 1)
  useEffect(() => {
    pageRef.current = 1
    setPage(1)
    fetchProducts()
  }, [debouncedSearch, brandFilter, supplierFilter, categoryFilter, stockStatusFilter, minPrice, maxPrice, fetchProducts])

  const handlePageChange = useCallback((newPage: number) => {
    pageRef.current = newPage
    setPage(newPage)
    fetchProducts()
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [fetchProducts])

  const handleLimitChange = useCallback((newLimit: number) => {
    limitRef.current = newLimit
    pageRef.current = 1
    setLimit(newLimit)
    setPage(1)
    fetchProducts()
  }, [fetchProducts])

  const handleSort = useCallback((field: SortField) => {
    const newDir: SortDir = sortByRef.current === field && sortDirRef.current === 'asc' ? 'desc' : 'asc'
    sortByRef.current  = field
    sortDirRef.current = newDir
    pageRef.current    = 1
    setSortBy(field)
    setSortDir(newDir)
    setPage(1)
    fetchProducts()
  }, [fetchProducts])

  useEffect(() => {
    api.get<Category[]>('/api/products/categories').then(setAllCategories).catch(() => {})
    api.get<{ id: string; name: string }[]>('/api/brands').then(setBrands).catch(() => {})
    api.get<Supplier[]>('/api/purchases/suppliers').then(setSuppliers).catch(() => {})
  }, [])

  // Cascada de categorías
  const categoryMap = new Map(allCategories.map(c => [c.id, c]))
  const l1Tree = buildCategoryTree(allCategories)
  let catL1 = '', catL2 = '', catL3 = ''
  if (categoryFilter) {
    const cat = categoryMap.get(categoryFilter)
    if (cat) {
      if (!cat.parent_id) {
        catL1 = categoryFilter
      } else {
        const parent = categoryMap.get(cat.parent_id)
        if (parent) {
          if (!parent.parent_id) { catL1 = parent.id; catL2 = categoryFilter }
          else {
            const grandparent = categoryMap.get(parent.parent_id)
            if (grandparent) { catL1 = grandparent.id; catL2 = parent.id; catL3 = categoryFilter }
          }
        }
      }
    }
  }
  const l2Options = catL1 ? (l1Tree.find(c => c.id === catL1)?.children ?? []) : []
  const l2Node    = l2Options.find(c => c.id === catL2)
  const l3Options = catL2 ? (l2Node?.children ?? []) : []

  const hasPriceFilter = !!(minPriceInput || maxPriceInput)
  const activeFilterCount = [brandFilter, supplierFilter, categoryFilter, stockStatusFilter, hasPriceFilter ? 'price' : ''].filter(Boolean).length

  function clearFilters() {
    setBrandFilter(''); setSupplierFilter(''); setCategoryFilter(''); setStockStatusFilter('')
    setMinPriceInput(''); setMaxPriceInput('')
  }

  function getCategoryPath(categoryId: string | undefined, categories: Category[]): string {
    if (!categoryId) return '—'
    const map = new Map(categories.map(c => [c.id, c]))
    const path: string[] = []
    let current = map.get(categoryId)
    while (current) {
      path.unshift(current.name)
      current = current.parent_id ? map.get(current.parent_id) : undefined
    }
    return path.join(' › ')
  }

  const handleEdit = async (item: StockSummary) => {
    try {
      const product = await api.get<Product>(`/api/products/${item.id}`)
      setEditProduct(product)
      setProductModal(true)
    } catch {
      toast.error('Error al cargar el producto')
    }
  }

  const handleAdjust = (item: StockSummary) => {
    setAdjustProduct(item as unknown as Product)
    setAdjustModal(true)
  }

  const handleDelete = async () => {
    if (!deleteProduct) return
    setDeleting(true)
    try {
      await api.delete(`/api/products/${deleteProduct.id}`)
      toast.success('Producto eliminado')
      setDeleteModal(false)
      setDeleteProduct(null)
      fetchProducts()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    } finally {
      setDeleting(false)
    }
  }

  const openCreate = () => {
    setEditProduct(null)
    setProductModal(true)
  }

  return (
    <AppShell>
      <PageHeader
        title="Productos"
        description={`${pagination.total} productos`}
        action={
          <>
            <Button variant="secondary" onClick={() => setPrintModal(true)}>
              <Printer size={15} /> <span className="hidden sm:inline">Lista de precios</span>
            </Button>
            <Button variant="secondary" onClick={() => setBulkPriceModal(true)}>
              <TrendingUp size={15} /> <span className="hidden sm:inline">Actualizar precios</span>
            </Button>
            <Button onClick={openCreate}>
              <Plus size={15} /> Nuevo producto
            </Button>
          </>
        }
      />

      <div className="p-5 space-y-3">
        {/* Búsqueda + botón filtros */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre, código de barras o SKU..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-[var(--radius-md)] border transition-colors ${showFilters || activeFilterCount > 0 ? 'bg-[var(--accent)] border-[var(--accent)] text-white' : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text2)] hover:border-[var(--accent)]'}`}
          >
            <Filter size={14} />
            Filtros
            {activeFilterCount > 0 && (
              <span className="bg-white/25 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Panel de filtros */}
        {showFilters && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">

              {/* Categoría en cascada */}
              <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-1">
                <label className="text-xs font-medium text-[var(--text3)]">Categoría</label>
                <div className="flex gap-1">
                  <select value={catL1} onChange={e => setCategoryFilter(e.target.value)} className={`${selectClass} flex-1 min-w-0`}>
                    <option value="">Todas</option>
                    {l1Tree.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {l2Options.length > 0 && (
                    <select value={catL2} onChange={e => setCategoryFilter(e.target.value || catL1)} className={`${selectClass} flex-1 min-w-0`}>
                      <option value="">General</option>
                      {l2Options.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  )}
                  {l3Options.length > 0 && (
                    <select value={catL3} onChange={e => setCategoryFilter(e.target.value || catL2)} className={`${selectClass} flex-1 min-w-0`}>
                      <option value="">General</option>
                      {l3Options.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  )}
                </div>
              </div>

              {/* Proveedor */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--text3)]">Proveedor</label>
                <select value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)} className={selectClass}>
                  <option value="">Todos</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              {/* Marca */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--text3)]">Marca</label>
                <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)} className={selectClass}>
                  <option value="">Todas</option>
                  {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>

              {/* Rango precio venta */}
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-xs font-medium text-[var(--text3)]">Precio venta</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    value={minPriceInput}
                    onChange={e => setMinPriceInput(e.target.value)}
                    placeholder="Mínimo"
                    className={`${selectClass} flex-1 min-w-0`}
                  />
                  <span className="text-xs text-[var(--text3)] flex-shrink-0">—</span>
                  <input
                    type="number"
                    min="0"
                    value={maxPriceInput}
                    onChange={e => setMaxPriceInput(e.target.value)}
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
                    {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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

        {/* Tabla */}
        {loading ? <TableSkeleton rows={12} /> : data.length === 0 ? (
          <EmptyState
            icon={Package}
            title={search || activeFilterCount > 0 ? 'Sin resultados' : 'Sin productos'}
            description={search || activeFilterCount > 0 ? 'Probá con otros filtros.' : 'Creá tu primer producto para empezar.'}
            action={!search && activeFilterCount === 0 ? <Button onClick={openCreate}><Plus size={15} /> Nuevo producto</Button> : undefined}
          />
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
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden md:table-cell">Categoría</th>
                    <th
                      onClick={() => handleSort('cost_price')}
                      className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)] cursor-pointer hover:text-[var(--text)] select-none group hidden sm:table-cell"
                    >
                      <div className="flex items-center justify-end gap-1">
                        P. Costo
                        <SortIcon field="cost_price" sortBy={sortBy} sortDir={sortDir} />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('sell_price')}
                      className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)] cursor-pointer hover:text-[var(--text)] select-none group"
                    >
                      <div className="flex items-center justify-end gap-1">
                        P. Venta
                        <SortIcon field="sell_price" sortBy={sortBy} sortDir={sortDir} />
                      </div>
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {data.map(product => (
                    <tr
                      key={product.id}
                      onClick={() => handleEdit(product)}
                      className="hover:bg-[var(--surface2)] transition-colors cursor-pointer group"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-[var(--text)]">{product.name}</p>
                        {product.barcode && (
                          <p className="text-xs mono text-[var(--text3)]">{product.barcode}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[var(--text2)] hidden md:table-cell">
                        {getCategoryPath(product.category_id, allCategories)}
                      </td>
                      <td className="px-4 py-3 text-right mono text-[var(--text2)] hidden sm:table-cell">
                        {formatCurrency(product.cost_price)}
                      </td>
                      <td className="px-4 py-3 text-right mono font-medium text-[var(--text)]">
                        {formatCurrency(product.sell_price)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={e => { e.stopPropagation(); handleAdjust(product) }}
                            title="Ajustar stock"
                            className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface3)] transition-colors"
                          >
                            <SlidersHorizontal size={14} />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); handleEdit(product) }}
                            title="Editar"
                            className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface3)] transition-colors"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={async e => {
                              e.stopPropagation()
                              const p = await api.get<Product>(`/api/products/${product.id}`)
                              setPriceRulesProduct(p)
                              setPriceRulesModal(true)
                            }}
                            title="Reglas de precio"
                            className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-colors"
                          >
                            <Tag size={14} />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); setDeleteProduct(product); setDeleteModal(true) }}
                            title="Eliminar"
                            className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--danger)] hover:bg-[var(--danger-subtle)] transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination pagination={pagination} onPageChange={handlePageChange} onLimitChange={handleLimitChange} />
          </div>
        )}
      </div>

      <ProductModal
        open={productModal}
        onClose={() => { setProductModal(false); setEditProduct(null) }}
        onSaved={fetchProducts}
        product={editProduct}
      />

      <AdjustStockModal
        open={adjustModal}
        onClose={() => { setAdjustModal(false); setAdjustProduct(null) }}
        onSaved={fetchProducts}
        product={adjustProduct}
      />

      <ConfirmDialog
        open={deleteModal}
        onClose={() => { setDeleteModal(false); setDeleteProduct(null) }}
        onConfirm={handleDelete}
        title="Eliminar producto"
        message={`¿Estás seguro que querés eliminar "${deleteProduct?.name}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        loading={deleting}
        danger
      />

      <ProductPriceRulesModal
        open={priceRulesModal}
        onClose={() => { setPriceRulesModal(false); setPriceRulesProduct(null) }}
        product={priceRulesProduct}
      />

      <BulkPriceModal
        open={bulkPriceModal}
        onClose={() => setBulkPriceModal(false)}
        onApplied={fetchProducts}
      />

      <PrintPriceListModal
        open={printModal}
        onClose={() => setPrintModal(false)}
      />
    </AppShell>
  )
}
