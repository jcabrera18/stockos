'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState } from '@/components/ui/EmptyState'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ProductForm } from '@/components/modules/ProductForm'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { StockSummary, Product, Category, PaginatedResponse, Pagination as PaginationType } from '@/types'
import {
  Plus, Search, Package, Pencil, Trash2,
  Tag, Filter, X, ChevronUp, ChevronDown, ArrowUpDown, MoreVertical,
} from 'lucide-react'
import { createPortal } from 'react-dom'
import { CategoryTreePicker } from '@/components/ui/CategoryTreePicker'
import { toast } from 'sonner'
import { ProductPriceRulesModal } from '@/components/modules/ProductPriceRulesModal'

interface Supplier { id: string; name: string }

const STOCK_STATUS_OPTIONS = [
  { value: 'ok', label: 'Stock OK' },
  { value: 'bajo', label: 'Stock bajo' },
  { value: 'critico', label: 'Stock crítico' },
  { value: 'sin_stock', label: 'Sin stock' },
]

const SORT_OPTIONS = [
  { value: 'name', label: 'Nombre' },
  { value: 'sku', label: 'Código' },
  { value: 'sell_price', label: 'Precio venta' },
  { value: 'cost_price', label: 'Precio costo' },
]

const selectClass = 'px-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed'

type SortField = 'name' | 'sell_price' | 'cost_price' | 'stock_current' | 'sku'
type SortDir = 'asc' | 'desc'

function SortIcon({ field, sortBy, sortDir }: { field: SortField; sortBy: SortField; sortDir: SortDir }) {
  if (sortBy !== field) return <ArrowUpDown size={11} className="opacity-25 group-hover:opacity-60 transition-opacity" />
  return sortDir === 'asc' ? <ChevronUp size={11} className="text-[var(--accent)]" /> : <ChevronDown size={11} className="text-[var(--accent)]" />
}

function RowActionsMenu({ onEdit, onPriceRules, onDelete }: {
  onEdit: () => void
  onPriceRules: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, right: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const onScrollOrResize = () => setOpen(false)
    document.addEventListener('mousedown', onPointer)
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [open])

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setCoords({ top: r.bottom + 4, right: window.innerWidth - r.right })
    }
    setOpen(o => !o)
  }

  const item = (label: string, Icon: typeof Pencil, onClick: () => void, danger = false) => (
    <button
      onClick={e => { e.stopPropagation(); setOpen(false); onClick() }}
      className={cn(
        'flex w-full items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors',
        danger
          ? 'text-[var(--danger)] hover:bg-[var(--danger-subtle)]'
          : 'text-[var(--text2)] hover:bg-[var(--surface3)] hover:text-[var(--text)]'
      )}
    >
      <Icon size={15} /> {label}
    </button>
  )

  return (
    <div className="flex justify-end" onClick={e => e.stopPropagation()}>
      <button
        ref={btnRef}
        onClick={toggle}
        title="Acciones"
        data-open={open}
        className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface3)] transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100 data-[open=true]:opacity-100"
      >
        <MoreVertical size={16} />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: coords.top, right: coords.right }}
          className="z-50 min-w-[180px] py-1 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius)] shadow-lg"
        >
          {item('Editar', Pencil, onEdit)}
          {item('Reglas de precio', Tag, onPriceRules)}
          {item('Eliminar', Trash2, onDelete, true)}
        </div>,
        document.body
      )}
    </div>
  )
}

export default function ProductsPage() {
  const [data, setData] = useState<StockSummary[]>([])
  const [pagination, setPagination] = useState<PaginationType>({ total: 0, page: 1, limit: 20, pages: 0 })
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(15)
  const [sortBy, setSortBy] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [loading, setLoading] = useState(true)
  const [showFilters, setShowFilters] = useState(false)

  // Panel / form state
  const [panelOpen, setPanelOpen] = useState(false)
  const [formProduct, setFormProduct] = useState<Product | null>(null)
  const [formStockCurrent, setFormStockCurrent] = useState<number | undefined>(undefined)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Modales
  const [deleteModal, setDeleteModal] = useState(false)
  const [deleteProduct, setDeleteProduct] = useState<StockSummary | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [priceRulesModal, setPriceRulesModal] = useState(false)
  const [priceRulesProduct, setPriceRulesProduct] = useState<Product | null>(null)

  const [allCategories, setAllCategories] = useState<Category[]>([])

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
  const searchRef = useRef(debouncedSearch)
  const pageRef = useRef(page)
  const limitRef = useRef(15)
  const sortByRef = useRef(sortBy)
  const sortDirRef = useRef(sortDir)
  const brandRef = useRef(brandFilter)
  const supplierRef = useRef(supplierFilter)
  const categoryRef = useRef(categoryFilter)
  const stockStatusRef = useRef(stockStatusFilter)
  const minPriceRef = useRef(minPrice)
  const maxPriceRef = useRef(maxPrice)
  const fetchProductsRef = useRef<(() => Promise<void>) | undefined>(undefined)

  const isBarcode = (v: string) => /^\d{8,14}$/.test(v.trim())

  const lookupBarcode = (value: string) => {
    const trimmed = value.trim()
    api.get<Product>(`/api/products/barcode/${trimmed}`)
      .then(product => {
        openEdit(product)
        setSearch('')
      })
      .catch(() => {
        setDebouncedSearch(trimmed)
      })
  }

  // Debounce: barcodes con margen corto para que el lector termine de "tipear"
  useEffect(() => {
    if (isBarcode(search)) {
      const trimmed = search.trim()
      const t = setTimeout(() => lookupBarcode(trimmed), 150)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setDebouncedSearch(search), search ? 300 : 0)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => { const t = setTimeout(() => setMinPrice(minPriceInput), 400); return () => clearTimeout(t) }, [minPriceInput])
  useEffect(() => { const t = setTimeout(() => setMaxPrice(maxPriceInput), 400); return () => clearTimeout(t) }, [maxPriceInput])

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
        search: searchRef.current || undefined,
        brand_id: brandRef.current || undefined,
        supplier_id: supplierRef.current || undefined,
        category_id: categoryRef.current || undefined,
        stock_status: stockStatusRef.current || undefined,
        min_price: minPriceRef.current ? Number(minPriceRef.current) : undefined,
        max_price: maxPriceRef.current ? Number(maxPriceRef.current) : undefined,
        sort_by: sortByRef.current,
        sort_dir: sortDirRef.current,
        page: pageRef.current,
        limit: limitRef.current,
      })
      setData(res.data)
      setPagination(res.pagination)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { fetchProductsRef.current = fetchProducts }, [fetchProducts])

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
    sortByRef.current = field
    sortDirRef.current = newDir
    pageRef.current = 1
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

  const categoryMap = new Map(allCategories.map(c => [c.id, c]))
  const childrenMap = new Map<string | null, Category[]>()
  allCategories.forEach(c => {
    const key = c.parent_id ?? null
    if (!childrenMap.has(key)) childrenMap.set(key, [])
    childrenMap.get(key)!.push(c)
  })

  const hasPriceFilter = !!(minPriceInput || maxPriceInput)
  const activeFilterCount = [brandFilter, supplierFilter, categoryFilter, stockStatusFilter, hasPriceFilter ? 'price' : ''].filter(Boolean).length

  function clearFilters() {
    setBrandFilter(''); setSupplierFilter(''); setCategoryFilter(''); setStockStatusFilter('')
    setMinPriceInput(''); setMaxPriceInput('')
  }

  function getCategoryPath(categoryId: string | undefined, map: Map<string, Category>): string {
    if (!categoryId) return '—'
    const path: string[] = []
    let current = map.get(categoryId)
    while (current) {
      path.unshift(current.name)
      current = current.parent_id ? map.get(current.parent_id) : undefined
    }
    return path.length ? path.join(' › ') : '—'
  }

  const openEdit = (product: Product, stockCurrent?: number) => {
    setFormProduct(product)
    setFormStockCurrent(stockCurrent)
    setSelectedId(product.id)
    setPanelOpen(true)
  }

  const handleEdit = async (item: StockSummary) => {
    try {
      const product = await api.get<Product>(`/api/products/${item.id}`)
      openEdit(product, item.stock_current)
    } catch {
      toast.error('Error al cargar el producto')
    }
  }

  const handleNavigateToProduct = async (id: string) => {
    try {
      const product = await api.get<Product>(`/api/products/${id}`)
      const summary = data.find(d => d.id === id)
      openEdit(product, summary?.stock_current)
    } catch {
      toast.error('Error al cargar el producto')
    }
  }

  const handleDelete = async () => {
    if (!deleteProduct) return
    setDeleting(true)
    try {
      await api.delete(`/api/products/${deleteProduct.id}`)
      toast.success('Producto eliminado')
      setDeleteModal(false)
      setDeleteProduct(null)
      if (selectedId === deleteProduct.id) {
        setPanelOpen(false)
        setFormProduct(null)
        setSelectedId(null)
      }
      fetchProducts()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    } finally {
      setDeleting(false)
    }
  }

  const openCreate = () => {
    setFormProduct(null)
    setSelectedId(null)
    setPanelOpen(true)
  }

  const closePanel = () => {
    setPanelOpen(false)
    setFormProduct(null)
    setFormStockCurrent(undefined)
    setSelectedId(null)
  }

  const tablePanel = (
    <div className={cn(
      'flex flex-col overflow-hidden transition-all',
      panelOpen ? 'hidden md:flex md:w-[30%] md:border-r md:border-[var(--border)]' : 'w-full flex'
    )}>
      {/* Header */}
      <div className="shrink-0">
        <PageHeader
          title="Productos"
          description={`${pagination.total} productos`}
          action={
            <Button onClick={openCreate}>
              <Plus size={15} /> Nuevo producto
            </Button>
          }
        />

        {/* Búsqueda + filtros */}
        <div className="px-5 pt-4 pb-4 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && isBarcode(search)) {
                    e.preventDefault()
                    lookupBarcode(search)
                  }
                }}
                placeholder="Buscar por nombre, código de barras o código interno..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
            <button
              onClick={() => setShowFilters(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-[var(--radius-md)] border transition-colors ${showFilters || activeFilterCount > 0 ? 'bg-[var(--accent)] border-[var(--accent)] text-white' : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text2)] hover:border-[var(--accent)]'}`}
            >
              <Filter size={14} />
              {!panelOpen && 'Filtros'}
              {activeFilterCount > 0 && (
                <span className="bg-white/25 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {showFilters && (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 space-y-3">
              <div className={cn('grid gap-3', panelOpen ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4')}>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-[var(--text3)]">Categoría</label>
                  <CategoryTreePicker
                    categoryMap={categoryMap}
                    childrenMap={childrenMap}
                    value={categoryFilter}
                    onChange={setCategoryFilter}
                    rootLabel="Todas las categorías"
                    selectClass={selectClass}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-[var(--text3)]">Proveedor</label>
                  <select value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)} className={selectClass}>
                    <option value="">Todos</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-[var(--text3)]">Marca</label>
                  <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)} className={selectClass}>
                    <option value="">Todas</option>
                    {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>

                {!panelOpen && (
                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <label className="text-xs font-medium text-[var(--text3)]">Precio venta</label>
                    <div className="flex items-center gap-2">
                      <input type="number" min="0" value={minPriceInput} onChange={e => setMinPriceInput(e.target.value)} placeholder="Mínimo" className={`${selectClass} flex-1 min-w-0`} />
                      <span className="text-xs text-[var(--text3)] flex-shrink-0">—</span>
                      <input type="number" min="0" value={maxPriceInput} onChange={e => setMaxPriceInput(e.target.value)} placeholder="Máximo" className={`${selectClass} flex-1 min-w-0`} />
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-[var(--text3)]">Ordenar por</label>
                  <div className="flex gap-1">
                    <select value={sortBy} onChange={e => handleSort(e.target.value as SortField)} className={`${selectClass} flex-1 min-w-0`}>
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
        </div>
      </div>

      {/* Tabla — scrollable */}
      <div className={cn('overflow-y-auto', panelOpen ? 'px-3 pb-4' : 'px-5 pb-5')}>
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
              <table className="w-full text-sm table-fixed">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th onClick={() => handleSort('name')} className="w-[30%] text-left px-4 py-3 text-xs font-medium text-[var(--text3)] cursor-pointer hover:text-[var(--text)] select-none group">
                      <div className="flex items-center gap-1">Producto <SortIcon field="name" sortBy={sortBy} sortDir={sortDir} /></div>
                    </th>
                    {!panelOpen && (
                      <th onClick={() => handleSort('sku')} className="w-[9%] text-left px-4 py-3 text-xs font-medium text-[var(--text3)] cursor-pointer hover:text-[var(--text)] select-none group hidden lg:table-cell">
                        <div className="flex items-center gap-1">Código <SortIcon field="sku" sortBy={sortBy} sortDir={sortDir} /></div>
                      </th>
                    )}
                    {!panelOpen && <th className="w-[22%] text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden md:table-cell">Categoría</th>}
                    {!panelOpen && (
                      <th onClick={() => handleSort('cost_price')} className="w-[13%] text-right px-4 py-3 text-xs font-medium text-[var(--text3)] cursor-pointer hover:text-[var(--text)] select-none group hidden sm:table-cell">
                        <div className="flex items-center justify-end gap-1">P. Costo <SortIcon field="cost_price" sortBy={sortBy} sortDir={sortDir} /></div>
                      </th>
                    )}
                    {!panelOpen && (
                      <th onClick={() => handleSort('sell_price')} className="w-[13%] text-right px-4 py-3 text-xs font-medium text-[var(--text3)] cursor-pointer hover:text-[var(--text)] select-none group">
                        <div className="flex items-center justify-end gap-1">P. Venta <SortIcon field="sell_price" sortBy={sortBy} sortDir={sortDir} /></div>
                      </th>
                    )}
                    {!panelOpen && <th className="w-[7%] text-right px-4 py-3 text-xs font-medium text-[var(--text3)] hidden sm:table-cell">Stock</th>}
                    <th className="w-[6%] px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {data.map(product => {
                    const isSelected = selectedId === product.id
                    return (
                      <tr
                        key={product.id}
                        onClick={() => handleEdit(product)}
                        className={cn(
                          'hover:bg-[var(--surface2)] transition-colors cursor-pointer group',
                          isSelected && 'bg-[var(--accent)]/8 hover:bg-[var(--accent)]/12'
                        )}
                      >
                        <td className="px-4 py-3 min-w-0">
                          <p className={cn('font-medium truncate', isSelected ? 'text-[var(--accent)]' : 'text-[var(--text)]')} title={product.name}>{product.name}</p>
                          {!panelOpen && product.barcode && (
                            <p className="text-xs mono text-[var(--text3)] truncate">{product.barcode}</p>
                          )}
                        </td>
                        {!panelOpen && (
                          <td className="px-4 py-3 hidden lg:table-cell">
                            {product.sku ? <span className="mono text-xs text-[var(--text2)]">{product.sku}</span> : <span className="text-xs text-[var(--text3)]">—</span>}
                          </td>
                        )}
                        {!panelOpen && (
                          <td className="px-4 py-3 hidden md:table-cell min-w-0">
                            <span className="block truncate text-[var(--text2)] text-sm" title={getCategoryPath(product.category_id, categoryMap)}>
                              {getCategoryPath(product.category_id, categoryMap)}
                            </span>
                          </td>
                        )}
                        {!panelOpen && (
                          <td className="px-4 py-3 text-right mono text-[var(--text2)] whitespace-nowrap hidden sm:table-cell">
                            {formatCurrency(product.cost_price)}
                          </td>
                        )}
                        {!panelOpen && (
                          <td className="px-4 py-3 text-right mono font-medium text-[var(--text)] whitespace-nowrap">
                            {formatCurrency(product.use_fixed_sell_price ? product.sell_price : (product.default_list_price ?? product.sell_price))}
                          </td>
                        )}
                        {!panelOpen && (
                          <td className="px-4 py-3 text-right hidden sm:table-cell">
                            {(() => {
                              const available = product.stock_available ?? (product.stock_current - (product.stock_reserved ?? 0))
                              const color = available <= 0 ? 'text-[var(--danger,#ef4444)]' : available <= 5 ? 'text-[var(--warning,#f59e0b)]' : 'text-[var(--text)]'
                              return <span className={`mono font-medium text-sm ${color}`}>{available}</span>
                            })()}
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <RowActionsMenu
                            onEdit={() => handleEdit(product)}
                            onPriceRules={async () => {
                              const p = await api.get<Product>(`/api/products/${product.id}`)
                              setPriceRulesProduct(p)
                              setPriceRulesModal(true)
                            }}
                            onDelete={() => { setDeleteProduct(product); setDeleteModal(true) }}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pagination pagination={pagination} onPageChange={handlePageChange} />
          </div>
        )}
      </div>
    </div>
  )

  return (
    <AppShell>
      <div className="flex h-full overflow-hidden">

        {tablePanel}

        {/* Panel derecho — formulario */}
        {panelOpen && (
          <div className="w-full md:flex-1 overflow-y-auto">
            <ProductForm
              product={formProduct}
              stockCurrent={formStockCurrent}
              onSaved={() => fetchProductsRef.current?.()}
              onClose={closePanel}
              onNavigateToProduct={handleNavigateToProduct}
            />
          </div>
        )}

      </div>

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
    </AppShell>
  )
}
