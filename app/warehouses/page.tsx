'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { HelpBanner } from '@/components/ui/HelpBanner'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoader } from '@/components/ui/Spinner'
import { Pagination } from '@/components/ui/Pagination'
import { AdjustStockModal } from '@/components/modules/AdjustStockModal'
import { TransferModal, type TransferPrefill } from '@/components/modules/TransferModal'
import { api } from '@/lib/api'
import { formatCurrency, formatCompactCurrency, getStockStatusLabel, getStockStatusColor } from '@/lib/utils'
import { printDocument, partiesGrid } from '@/lib/printDocument'
import { useAuth } from '@/hooks/useAuth'
import { getPlanLimits } from '@/lib/plans'
import { PlanLimitBanner } from '@/components/modules/PlanLimitBanner'
import type { PaginatedResponse, Pagination as PaginationType, Category } from '@/types'
import {
  Plus, Warehouse, Pencil, Trash2, Star, Search, ArrowLeftRight,
  CheckCircle, Printer, Filter, X, ChevronUp, ChevronDown, ArrowUpDown,
  SlidersHorizontal, Building2, TrendingDown,
} from 'lucide-react'
import { toast } from 'sonner'

interface WarehouseItem {
  id: string
  name: string
  address?: string
  is_default: boolean
  is_active: boolean
  created_at: string
  branch_id?: string | null
  branch?: { id: string; name: string } | null
  is_primary?: boolean
}

interface BranchOption { id: string; name: string }

interface WarehouseStats {
  warehouse_id: string
  is_central: boolean
  total_skus: number
  skus_with_stock: number
  total_units: number
  total_reserved: number
  inventory_cost: number
  inventory_retail: number
  out_of_stock: number
  critical: number
}

interface StockItem {
  id: string
  product_id?: string
  product_name?: string
  name?: string
  barcode?: string
  cost_price: number
  stock_current: number
  stock_reserved?: number
  stock_min: number
  stock_max: number
  category_name?: string
  stock_status: 'ok' | 'bajo' | 'critico' | 'sin_stock'
}

type Tab = 'warehouses' | 'stock' | 'transfers'
type StockFilter = 'all' | 'ok' | 'bajo' | 'critico' | 'sin_stock'
type SortField = 'name' | 'stock_current' | 'cost_price' | 'stock_min'
type SortDir = 'asc' | 'desc'

interface Transfer {
  id: string
  created_at: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  close_reason?: string
  notes?: string
  approved_at?: string
  from_warehouse: { name: string }
  to_warehouse: { name: string }
  users?: { full_name: string }
  warehouse_transfer_items: { quantity: number; products: { name: string; barcode?: string; unit?: string } }[]
}

interface Supplier { id: string; name: string }

interface RestockSuggestion {
  product_id: string
  product_name: string
  to_warehouse_id: string
  to_warehouse_name: string
  to_available: number
  to_stock_min: number
  from_warehouse_id: string
  from_warehouse_name: string
  from_surplus: number
}

const selectClass = 'px-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]'

const TRANSFER_STATUS: Record<Transfer['status'], { label: string; variant: 'success' | 'warning' | 'danger' | 'default' }> = {
  pending:   { label: 'Pendiente', variant: 'warning' },
  approved:  { label: 'Aprobado',  variant: 'success' },
  rejected:  { label: 'Rechazado', variant: 'danger'  },
  cancelled: { label: 'Cancelado', variant: 'default' },
}

function SortIcon({ field, sortBy, sortDir }: { field: SortField; sortBy: SortField; sortDir: SortDir }) {
  if (sortBy !== field) return <ArrowUpDown size={11} className="opacity-25 group-hover:opacity-60 transition-opacity" />
  return sortDir === 'asc' ? <ChevronUp size={11} className="text-[var(--accent)]" /> : <ChevronDown size={11} className="text-[var(--accent)]" />
}

const emptyForm = { name: '', address: '', is_default: false, branch_id: '', is_primary: false }

export default function WarehousesPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('warehouses')
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([])
  const [selectedWarehouse, setSelectedWarehouse] = useState<WarehouseItem | null>(null)
  const [loading, setLoading] = useState(true)

  // Modales warehouse
  const [warehouseModal, setWarehouseModal] = useState(false)
  const [editWarehouse, setEditWarehouse] = useState<WarehouseItem | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteModal, setDeleteModal] = useState(false)
  const [deleteWarehouse, setDeleteWarehouse] = useState<WarehouseItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Stock
  const [stockData, setStockData] = useState<StockItem[]>([])
  const [stockPag, setStockPag] = useState<PaginationType>({ total: 0, page: 1, limit: 50, pages: 0 })
  const [stockPage, setStockPage] = useState(1)
  const [stockSearch, setStockSearch] = useState('')
  const [debouncedStockSearch, setDebouncedStockSearch] = useState('')
  const [loadingStock, setLoadingStock] = useState(false)
  const [adjustModal, setAdjustModal] = useState(false)
  const [adjustItem, setAdjustItem] = useState<StockItem | null>(null)

  // Stock filters
  const [stockFilter, setStockFilter] = useState<StockFilter>('all')
  const [sortBy, setSortBy] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [categories, setCategories] = useState<Category[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [warehouseStats, setWarehouseStats] = useState<Record<string, WarehouseStats>>({})
  const [categoryFilter, setCategoryFilter] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [minStockInput, setMinStockInput] = useState('')
  const [maxStockInput, setMaxStockInput] = useState('')
  const [minStock, setMinStock] = useState('')
  const [maxStock, setMaxStock] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  // Transferencias
  const [transferModal, setTransferModal] = useState(false)
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [loadingTransfers, setLoadingTransfers] = useState(false)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [transferDetail, setTransferDetail] = useState<Transfer | null>(null)
  const [cancelModal, setCancelModal] = useState(false)
  const [cancelTransfer, setCancelTransfer] = useState<Transfer | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [suggestions, setSuggestions] = useState<RestockSuggestion[]>([])
  const [transferPrefill, setTransferPrefill] = useState<TransferPrefill | null>(null)

  // Refs
  const selectedWarehouseRef = useRef(selectedWarehouse)
  const stockSearchRef = useRef(debouncedStockSearch)
  const stockPageRef = useRef(stockPage)
  const stockFilterRef = useRef<StockFilter>('all')
  const sortByRef = useRef<SortField>('name')
  const sortDirRef = useRef<SortDir>('asc')
  const categoryRef = useRef('')
  const supplierRef = useRef('')
  const minStockRef = useRef('')
  const maxStockRef = useRef('')

  useEffect(() => { selectedWarehouseRef.current = selectedWarehouse }, [selectedWarehouse])
  useEffect(() => { stockSearchRef.current = debouncedStockSearch }, [debouncedStockSearch])
  useEffect(() => { stockFilterRef.current = stockFilter }, [stockFilter])
  useEffect(() => { categoryRef.current = categoryFilter }, [categoryFilter])
  useEffect(() => { supplierRef.current = supplierFilter }, [supplierFilter])
  useEffect(() => { minStockRef.current = minStock }, [minStock])
  useEffect(() => { maxStockRef.current = maxStock }, [maxStock])

  // Debounces
  useEffect(() => {
    const t = setTimeout(() => setDebouncedStockSearch(stockSearch), stockSearch ? 300 : 0)
    return () => clearTimeout(t)
  }, [stockSearch])
  useEffect(() => {
    const t = setTimeout(() => setMinStock(minStockInput), 400)
    return () => clearTimeout(t)
  }, [minStockInput])
  useEffect(() => {
    const t = setTimeout(() => setMaxStock(maxStockInput), 400)
    return () => clearTimeout(t)
  }, [maxStockInput])

  const fetchWarehouses = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get<WarehouseItem[]>('/api/warehouses')
      setWarehouses(data)
      if (!selectedWarehouseRef.current && data.length > 0) {
        setSelectedWarehouse(data.find(w => w.is_default) ?? data[0])
      }
      // Métricas por depósito (valuación + estado de stock)
      api.get<WarehouseStats[]>('/api/warehouses/stats')
        .then(stats => setWarehouseStats(Object.fromEntries(stats.map(s => [s.warehouse_id, s]))))
        .catch(() => {})
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchWarehouses() }, [fetchWarehouses])

  const fetchStock = useCallback(async () => {
    if (!selectedWarehouseRef.current) return
    setLoadingStock(true)
    try {
      const res = await api.get<PaginatedResponse<StockItem>>('/api/stock', {
        warehouse_id:  selectedWarehouseRef.current.id,
        search:        stockSearchRef.current || undefined,
        stock_status:  stockFilterRef.current !== 'all' ? stockFilterRef.current : undefined,
        category_id:   categoryRef.current || undefined,
        supplier_id:   supplierRef.current || undefined,
        min_stock:     minStockRef.current ? Number(minStockRef.current) : undefined,
        max_stock:     maxStockRef.current ? Number(maxStockRef.current) : undefined,
        sort_by:       sortByRef.current,
        sort_dir:      sortDirRef.current,
        page:          stockPageRef.current,
        limit:         50,
      })
      const mapped = res.data.map(item => ({
        ...item,
        product_name: (item as StockItem & { product_name?: string }).product_name ?? item.name,
      }))
      setStockData(mapped)
      setStockPag(res.pagination)
    } catch (err) { console.error(err) }
    finally { setLoadingStock(false) }
  }, [])

  useEffect(() => {
    if (tab === 'stock') {
      stockPageRef.current = 1
      setStockPage(1)
      fetchStock()
    }
  }, [tab, selectedWarehouse, debouncedStockSearch, stockFilter, categoryFilter, supplierFilter, minStock, maxStock, fetchStock])

  const handleStockPageChange = useCallback((newPage: number) => {
    stockPageRef.current = newPage
    setStockPage(newPage)
    fetchStock()
  }, [fetchStock])

  const handleSort = useCallback((field: SortField) => {
    const newDir: SortDir = sortByRef.current === field && sortDirRef.current === 'asc' ? 'desc' : 'asc'
    sortByRef.current = field
    sortDirRef.current = newDir
    sortDirRef.current = newDir
    stockPageRef.current = 1
    setSortBy(field)
    setSortDir(newDir)
    setStockPage(1)
    fetchStock()
  }, [fetchStock])

  // Cargar categorías y proveedores para filtros
  useEffect(() => {
    api.get<BranchOption[]>('/api/branches').then(setBranches).catch(() => {})
    api.get<Category[]>('/api/products/categories').then(setCategories).catch(() => {})
    api.get<Supplier[]>('/api/purchases/suppliers').then(setSuppliers).catch(() => {})
  }, [])

  const fetchTransfers = useCallback(async () => {
    setLoadingTransfers(true)
    try {
      const res = await api.get<{ data: Transfer[] }>('/api/warehouses/transfers')
      setTransfers(res.data)
      api.get<RestockSuggestion[]>('/api/warehouses/restock-suggestions')
        .then(setSuggestions).catch(() => {})
    } catch (err) { console.error(err) }
    finally { setLoadingTransfers(false) }
  }, [])

  const openTransferFromSuggestion = (s: RestockSuggestion) => {
    const qty = Math.max(1, Math.min(s.from_surplus, (s.to_stock_min - s.to_available) || 1))
    setTransferPrefill({
      fromId: s.from_warehouse_id,
      toId:   s.to_warehouse_id,
      product: { id: s.product_id, name: s.product_name, stock_current: s.from_surplus } as never,
      quantity: qty,
    })
    setTransferModal(true)
  }

  const handleApprove = async (t: Transfer) => {
    setApprovingId(t.id)
    try {
      const approved = await api.post<Transfer>(`/api/warehouses/transfers/${t.id}/approve`, {})
      toast.success('Transferencia aprobada — stock actualizado')
      setTransfers(prev => prev.map(tr => tr.id === approved.id ? approved : tr))
      fetchStock()
      printRemito(approved)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al aprobar')
    } finally { setApprovingId(null) }
  }

  const handleCancel = async () => {
    if (!cancelTransfer) return
    setCancelling(true)
    try {
      const cancelled = await api.post<Transfer>(`/api/warehouses/transfers/${cancelTransfer.id}/cancel`, {
        status: 'cancelled',
        reason: cancelReason.trim() || null,
      })
      toast.success('Transferencia cancelada — reserva liberada')
      setTransfers(prev => prev.map(tr => tr.id === cancelled.id ? cancelled : tr))
      fetchStock()
      setCancelModal(false)
      setCancelTransfer(null)
      setCancelReason('')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al cancelar')
    } finally { setCancelling(false) }
  }

  const printRemito = (t: Transfer) => {
    const date = new Date(t.approved_at ?? t.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const rows = t.warehouse_transfer_items.map(i =>
      `<tr>
        <td>${i.products.name}${i.products.barcode ? `<div class="item-sub">${i.products.barcode}</div>` : ''}</td>
        <td class="c">${i.quantity} ${i.products.unit ?? 'unidad'}</td>
      </tr>`
    ).join('')

    const body = `
      ${partiesGrid([
        { title: 'Depósito origen', name: t.from_warehouse?.name ?? '—' },
        { title: 'Depósito destino', name: t.to_warehouse?.name ?? '—' },
      ])}
      ${t.notes ? `<div class="note-line">Notas: ${t.notes}</div>` : ''}
      <table>
        <thead><tr><th>Producto</th><th class="c" style="width:160px">Cantidad</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`

    printDocument({
      title: 'Remito de Transferencia',
      docLabel: 'Remito de transferencia',
      docNumber: `N° ${t.id.slice(0, 8).toUpperCase()}`,
      docMeta: [date],
      biz: user?.business,
      bodyHtml: body,
      signatures: ['Firma origen', 'Firma destino'],
      footerNote: 'Documento no válido como factura',
    })
  }

  useEffect(() => {
    if (tab === 'transfers') fetchTransfers()
  }, [tab, fetchTransfers])

  const planLimits        = getPlanLimits(user?.business?.subscription?.plan)
  const atWarehouseLimit  = planLimits.maxWarehouses != null && warehouses.length >= planLimits.maxWarehouses

  const openCreate = () => {
    if (atWarehouseLimit) {
      toast.error(`Tu plan permite hasta ${planLimits.maxWarehouses} depósito${planLimits.maxWarehouses === 1 ? '' : 's'}. Actualizá tu plan para sumar más.`)
      return
    }
    setEditWarehouse(null)
    setForm(emptyForm)
    setWarehouseModal(true)
  }

  const openEdit = (w: WarehouseItem) => {
    setEditWarehouse(w)
    setForm({
      name: w.name, address: w.address ?? '', is_default: w.is_default,
      branch_id: w.branch_id ?? '', is_primary: !!w.is_primary,
    })
    setWarehouseModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('El nombre es obligatorio'); return }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        address: form.address.trim() || null,
        is_default: form.is_default,
        branch_id: form.branch_id || null,
        // Central (sin sucursal) nunca es depósito de venta
        is_primary: form.branch_id ? form.is_primary : false,
      }
      if (editWarehouse) {
        await api.patch(`/api/warehouses/${editWarehouse.id}`, payload)
        toast.success('Depósito actualizado')
      } else {
        await api.post('/api/warehouses', payload)
        toast.success('Depósito creado')
      }
      setWarehouseModal(false)
      fetchWarehouses()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleteWarehouse) return
    setDeleting(true)
    try {
      await api.delete(`/api/warehouses/${deleteWarehouse.id}`)
      toast.success('Depósito eliminado')
      setDeleteModal(false)
      setDeleteWarehouse(null)
      fetchWarehouses()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    } finally { setDeleting(false) }
  }

  const clearStockFilters = () => {
    setCategoryFilter(''); setSupplierFilter('')
    setMinStockInput(''); setMaxStockInput('')
  }

  const hasExtraFilter = !!(categoryFilter || supplierFilter || minStockInput || maxStockInput)
  const activeFilterCount = [categoryFilter, supplierFilter, (minStockInput || maxStockInput) ? 'stock' : ''].filter(Boolean).length

  const statusFilters: { key: StockFilter; label: string }[] = [
    { key: 'all',       label: 'Todos' },
    { key: 'critico',   label: 'Crítico' },
    { key: 'sin_stock', label: 'Sin stock' },
    { key: 'bajo',      label: 'Bajo' },
    { key: 'ok',        label: 'OK' },
  ]

  const tabs: { key: Tab; label: string }[] = [
    { key: 'warehouses', label: 'Depósitos' },
    { key: 'stock',      label: 'Inventario' },
    { key: 'transfers',  label: 'Transferencias' },
  ]

  return (
    <AppShell>
      <PageHeader
        title="Depósitos"
        description={`${warehouses.length} depósitos activos`}
        action={
          tab === 'warehouses' ? (
            <Button onClick={openCreate}><Plus size={15} /> Nuevo depósito</Button>
          ) : tab === 'transfers' ? (
            <Button onClick={() => setTransferModal(true)}>
              <ArrowLeftRight size={15} /> Nueva transferencia
            </Button>
          ) : undefined
        }
      />

      <div className="p-5 space-y-4">
        <HelpBanner id="warehouses" title="Depósitos y stock">
          <p>Administrá el stock real por depósito y hacé transferencias entre ellos. Cada sucursal tiene un <strong>depósito de venta</strong> (de ahí descuenta el POS); los <strong>depósitos centrales</strong> abastecen a las sucursales vía transferencias.</p>
        </HelpBanner>
        {/* Tabs */}
        <div className="flex border-b border-[var(--border)]">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === t.key
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-transparent text-[var(--text3)] hover:text-[var(--text)]'
                }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Tab: Depósitos ── */}
        {tab === 'warehouses' && (
          loading ? <PageLoader /> : (
            <div className="space-y-4">
            {atWarehouseLimit && (
              <PlanLimitBanner title={`Llegaste al límite de tu plan (${planLimits.maxWarehouses} depósito${planLimits.maxWarehouses === 1 ? '' : 's'})`} />
            )}
            {warehouses.length === 0 ? (
            <EmptyState icon={Warehouse} title="Sin depósitos"
              description="Creá tu primer depósito para gestionar el stock por ubicación."
              action={<Button onClick={openCreate}><Plus size={15} /> Nuevo depósito</Button>}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {warehouses.map(w => (
                <div key={w.id}
                  className={`bg-[var(--surface)] border rounded-[var(--radius-lg)] p-4 group ${w.is_default ? 'border-[var(--accent)]' : 'border-[var(--border)]'
                    }`}>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-[var(--text)]">{w.name}</h3>
                        {w.is_default && <Star size={13} className="text-[var(--accent)] fill-[var(--accent)]" />}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        {w.branch ? (
                          <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${w.is_primary
                            ? 'bg-[var(--accent-subtle)] text-[var(--accent)] font-medium'
                            : 'bg-[var(--surface2)] text-[var(--text3)]'
                            }`}>
                            <Building2 size={10} /> {w.branch.name}{w.is_primary && ' · venta'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-[var(--surface2)] text-[var(--text3)]">
                            Central
                          </span>
                        )}
                      </div>
                      {w.address && <p className="text-xs text-[var(--text3)] mt-1">{w.address}</p>}
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(w)}
                        className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors">
                        <Pencil size={13} />
                      </button>
                      {!w.is_default && (
                        <button onClick={() => { setDeleteWarehouse(w); setDeleteModal(true) }}
                          className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--danger)] hover:bg-[var(--danger-subtle)] transition-colors">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                  {w.is_default && <Badge variant="success">Por defecto</Badge>}

                  {/* Resumen de stock del depósito */}
                  {(() => {
                    const st = warehouseStats[w.id]
                    if (!st) return null
                    return (
                      <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-2">
                        <div className="flex items-baseline justify-between gap-2 min-w-0">
                          <span className="text-xs text-[var(--text3)] flex-shrink-0">Valor a costo</span>
                          <span className="text-sm font-semibold mono text-[var(--text)] truncate" title={formatCurrency(st.inventory_cost)}>{formatCompactCurrency(st.inventory_cost)}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-[var(--text3)]">
                          <span>{st.skus_with_stock}/{st.total_skus} productos · {st.total_units} u.</span>
                          <div className="flex gap-1">
                            {st.critical > 0 && <Badge variant="warning">{st.critical} crítico{st.critical === 1 ? '' : 's'}</Badge>}
                            {st.out_of_stock > 0 && <Badge variant="danger">{st.out_of_stock} sin stock</Badge>}
                          </div>
                        </div>
                      </div>
                    )
                  })()}

                  <button
                    onClick={() => { setSelectedWarehouse(w); setTab('stock') }}
                    className="mt-3 w-full text-xs text-[var(--accent)] hover:underline text-left">
                    Ver inventario →
                  </button>
                </div>
              ))}
            </div>
          )}
            </div>
          )
        )}

        {/* ── Tab: Inventario ── */}
        {tab === 'stock' && (
          <div className="space-y-3">

            {/* Selector de depósito */}
            {warehouses.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <span className="text-xs text-[var(--text3)] flex-shrink-0">Depósito:</span>
                {warehouses.map(w => (
                  <button key={w.id} onClick={() => setSelectedWarehouse(w)}
                    className={`px-3 py-1.5 text-xs rounded-full font-medium flex-shrink-0 transition-colors ${selectedWarehouse?.id === w.id
                        ? 'bg-[var(--accent)] text-white'
                        : 'bg-[var(--surface2)] text-[var(--text2)] hover:bg-[var(--surface3)]'
                      }`}>
                    {w.name}
                  </button>
                ))}
              </div>
            )}

            {/* Pills de estado + búsqueda + filtros */}
            <div className="flex flex-wrap gap-2 items-center">
              {statusFilters.map(f => (
                <button key={f.key} onClick={() => setStockFilter(f.key)}
                  className={`px-3 py-1.5 text-xs rounded-full font-medium flex-shrink-0 transition-colors ${stockFilter === f.key
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--surface2)] text-[var(--text2)] hover:bg-[var(--surface3)]'
                  }`}>
                  {f.label}
                </button>
              ))}
              <div className="flex gap-2 ml-auto items-center">
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                  <input value={stockSearch} onChange={e => setStockSearch(e.target.value)}
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

            {/* Panel de filtros */}
            {showFilters && (
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-[var(--text3)]">Categoría</label>
                    <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className={selectClass}>
                      <option value="">Todas</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-[var(--text3)]">Proveedor</label>
                    <select value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)} className={selectClass}>
                      <option value="">Todos</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <label className="text-xs font-medium text-[var(--text3)]">Cantidad en stock</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min="0" value={minStockInput}
                        onChange={e => setMinStockInput(e.target.value)}
                        placeholder="Mínimo"
                        className={`${selectClass} flex-1 min-w-0`}
                      />
                      <span className="text-xs text-[var(--text3)] flex-shrink-0">—</span>
                      <input
                        type="number" min="0" value={maxStockInput}
                        onChange={e => setMaxStockInput(e.target.value)}
                        placeholder="Máximo"
                        className={`${selectClass} flex-1 min-w-0`}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-[var(--text3)]">Ordenar por</label>
                    <div className="flex gap-1">
                      <select value={sortBy} onChange={e => handleSort(e.target.value as SortField)} className={`${selectClass} flex-1 min-w-0`}>
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
                  <button onClick={clearStockFilters} className="flex items-center gap-1 text-xs text-[var(--text3)] hover:text-[var(--danger)] transition-colors">
                    <X size={12} /> Limpiar filtros
                  </button>
                )}
              </div>
            )}

            {loadingStock ? <PageLoader /> : stockData.length === 0 ? (
              <EmptyState icon={Warehouse} title="Sin resultados"
                description="Probá con otro filtro o transferí stock desde otro depósito."
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
                          className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)] cursor-pointer hover:text-[var(--text)] select-none group hidden sm:table-cell"
                        >
                          <div className="flex items-center justify-end gap-1">
                            Mín
                            <SortIcon field="stock_min" sortBy={sortBy} sortDir={sortDir} />
                          </div>
                        </th>
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
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {stockData.map(item => (
                        <tr key={item.id} onClick={() => { setAdjustItem(item); setAdjustModal(true) }} className="hover:bg-[var(--surface2)] transition-colors group cursor-pointer">
                          <td className="px-4 py-3">
                            <p className="font-medium text-[var(--text)]">{item.product_name ?? item.name}</p>
                            {item.barcode && <p className="text-xs mono text-[var(--text3)]">{item.barcode}</p>}
                          </td>
                          <td className="px-4 py-3 text-[var(--text2)] hidden md:table-cell">{item.category_name ?? '—'}</td>
                          <td className="px-4 py-3 text-right">
                            <span className="mono font-bold text-base" style={{ color: getStockStatusColor(item.stock_status) }}>
                              {item.stock_current}
                            </span>
                            {(item.stock_reserved ?? 0) > 0 && (
                              <div className="text-xs text-[var(--warning)]">
                                {item.stock_current - (item.stock_reserved ?? 0)} disp.
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right mono text-[var(--text3)] hidden sm:table-cell">{item.stock_min}</td>
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
                          <td className="px-4 py-3">
                            <button
                              onClick={() => { setAdjustItem(item); setAdjustModal(true) }}
                              title="Ajustar stock"
                              className="opacity-0 group-hover:opacity-100 p-1.5 rounded text-[var(--text3)] hover:text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-all"
                            >
                              <SlidersHorizontal size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination pagination={stockPag} onPageChange={handleStockPageChange} />
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Transferencias ── */}
        {tab === 'transfers' && (
          <div className="space-y-4">

          {/* Sugerencias de reposición */}
          {suggestions.length > 0 && (
            <div className="bg-[var(--surface)] border border-[var(--warning)]/40 rounded-[var(--radius-lg)] overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--border)] bg-[var(--warning-subtle)]/40">
                <TrendingDown size={14} className="text-[var(--warning)]" />
                <h3 className="text-sm font-semibold text-[var(--text)]">Sugerencias de reposición</h3>
                <span className="text-xs text-[var(--text3)]">· {suggestions.length} producto{suggestions.length === 1 ? '' : 's'} con stock bajo y excedente en otro depósito</span>
              </div>
              <div className="divide-y divide-[var(--border)] max-h-72 overflow-y-auto">
                {suggestions.slice(0, 20).map(s => (
                  <div key={`${s.product_id}-${s.to_warehouse_id}`} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm text-[var(--text)] truncate">{s.product_name}</p>
                      <p className="text-xs text-[var(--text3)]">
                        <span className="text-[var(--danger)]">{s.to_warehouse_name}</span> tiene {s.to_available} (mín. {s.to_stock_min}) ·{' '}
                        <span className="text-[var(--accent)]">{s.from_warehouse_name}</span> excedente {s.from_surplus}
                      </p>
                    </div>
                    <button
                      onClick={() => openTransferFromSuggestion(s)}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs rounded font-medium bg-[var(--accent-subtle)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-colors flex-shrink-0"
                    >
                      <ArrowLeftRight size={12} /> Transferir
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loadingTransfers ? <PageLoader /> : transfers.length === 0 ? (
            <EmptyState icon={ArrowLeftRight} title="Sin transferencias"
              description="Transferí stock entre depósitos para redistribuir mercadería."
              action={<Button onClick={() => setTransferModal(true)}><ArrowLeftRight size={15} /> Nueva transferencia</Button>}
            />
          ) : (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)]">N°</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)]">Fecha</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)]">Origen</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)]">Destino</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden md:table-cell">Productos</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-[var(--text3)]">Estado</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {transfers.map(t => (
                    <tr key={t.id}
                      onClick={() => setTransferDetail(t)}
                      className="hover:bg-[var(--surface2)] transition-colors cursor-pointer group">
                      <td className="px-4 py-3 text-xs mono text-[var(--text3)]">#{t.id.slice(0, 8).toUpperCase()}</td>
                      <td className="px-4 py-3 text-xs mono text-[var(--text2)]">
                        {new Date(t.created_at).toLocaleDateString('es-AR')}
                      </td>
                      <td className="px-4 py-3 text-[var(--text)]">{t.from_warehouse?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-[var(--text)]">{t.to_warehouse?.name ?? '—'}</td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {t.warehouse_transfer_items?.slice(0, 3).map((item, i) => (
                            <span key={i} className="text-xs bg-[var(--surface2)] px-2 py-0.5 rounded">
                              {item.quantity}× {item.products?.name}
                            </span>
                          ))}
                          {(t.warehouse_transfer_items?.length ?? 0) > 3 && (
                            <span className="text-xs text-[var(--text3)]">
                              +{t.warehouse_transfer_items.length - 3} más
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={TRANSFER_STATUS[t.status].variant}>
                          {TRANSFER_STATUS[t.status].label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end" onClick={e => e.stopPropagation()}>
                          {t.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApprove(t)}
                                disabled={approvingId === t.id}
                                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded font-medium bg-[var(--accent-subtle)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-colors disabled:opacity-50"
                              >
                                <CheckCircle size={12} />
                                {approvingId === t.id ? 'Aprobando…' : 'Aprobar'}
                              </button>
                              <button
                                onClick={() => { setCancelTransfer(t); setCancelModal(true) }}
                                disabled={approvingId === t.id}
                                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded font-medium bg-[var(--surface2)] text-[var(--text2)] hover:bg-[var(--danger-subtle)] hover:text-[var(--danger)] transition-colors disabled:opacity-50"
                              >
                                <X size={12} />
                                Cancelar
                              </button>
                            </>
                          )}
                          {t.status === 'approved' && (
                            <button
                              onClick={() => printRemito(t)}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded font-medium bg-[var(--surface2)] text-[var(--text2)] hover:bg-[var(--surface3)] transition-colors"
                            >
                              <Printer size={12} />
                              Remito
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </div>
        )}
      </div>

      {/* Modal cancelar transferencia */}
      <Modal open={cancelModal} onClose={() => setCancelModal(false)} title="Cancelar transferencia" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-[var(--text2)]">
            Se va a liberar la reserva de stock del depósito de origen. Esta acción no se puede deshacer.
          </p>
          <Input label="Motivo (opcional)" value={cancelReason}
            onChange={e => setCancelReason(e.target.value)}
            placeholder="Ej: error de carga, ya no se necesita..." autoFocus />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCancelModal(false)} disabled={cancelling}>Volver</Button>
            <Button variant="danger" onClick={handleCancel} loading={cancelling}>Cancelar transferencia</Button>
          </div>
        </div>
      </Modal>

      {/* Modal crear/editar depósito */}
      <Modal open={warehouseModal} onClose={() => setWarehouseModal(false)}
        title={editWarehouse ? 'Editar depósito' : 'Nuevo depósito'} size="sm">
        <div className="space-y-4">
          <Input label="Nombre *" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Ej: Depósito Central, Local Norte..." />
          <Input label="Dirección" value={form.address}
            onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
            placeholder="Opcional" />

          {/* Sucursal */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[var(--text2)]">Sucursal</label>
            <select
              value={form.branch_id}
              onChange={e => setForm(f => ({ ...f, branch_id: e.target.value, is_primary: e.target.value ? f.is_primary : false }))}
              className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-colors"
            >
              <option value="">Depósito central (sin sucursal)</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <p className="text-xs text-[var(--text3)]">Un depósito central abastece a las sucursales vía transferencias; no vende por caja.</p>
          </div>

          {form.branch_id && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_primary}
                onChange={e => setForm(f => ({ ...f, is_primary: e.target.checked }))}
                className="w-4 h-4 accent-[var(--accent)]" />
              <span className="text-sm text-[var(--text2)]">Es el depósito de venta de esta sucursal</span>
            </label>
          )}

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_default}
              onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))}
              className="w-4 h-4 accent-[var(--accent)]" />
            <span className="text-sm text-[var(--text2)]">Usar como depósito por defecto</span>
          </label>
          <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-4 border-t border-[var(--border)]">
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setWarehouseModal(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={handleSave} loading={saving}>{editWarehouse ? 'Guardar' : 'Crear'}</Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Confirm eliminar */}
      <ConfirmDialog
        open={deleteModal}
        onClose={() => { setDeleteModal(false); setDeleteWarehouse(null) }}
        onConfirm={handleDelete}
        title="Eliminar depósito"
        message={`¿Eliminás "${deleteWarehouse?.name}"? El stock asociado quedará sin depósito asignado.`}
        confirmLabel="Eliminar"
        loading={deleting}
        danger
      />

      {/* Modal ajuste de stock */}
      {adjustItem && (
        <AdjustStockModal
          open={adjustModal}
          onClose={() => { setAdjustModal(false); setAdjustItem(null) }}
          onSaved={fetchStock}
          product={{
            ...adjustItem,
            id: adjustItem.product_id ?? adjustItem.id,
            name: adjustItem.product_name ?? adjustItem.name ?? '',
            stock_current: adjustItem.stock_current,
            stock_min: adjustItem.stock_min,
          } as unknown as import('@/types').Product}
          warehouseId={selectedWarehouse?.id}
        />
      )}

      {/* Modal transferencia */}
      <TransferModal
        open={transferModal}
        onClose={() => { setTransferModal(false); setTransferPrefill(null) }}
        onSaved={() => { fetchTransfers(); fetchStock() }}
        warehouses={warehouses}
        prefill={transferPrefill}
      />

      {/* Modal detalle de transferencia */}
      {transferDetail && (
        <Modal open={!!transferDetail} onClose={() => setTransferDetail(null)} title="Detalle de transferencia" size="lg">
          <div className="space-y-5 pb-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant={transferDetail.status === 'approved' ? 'success' : 'warning'}>
                  {transferDetail.status === 'approved' ? 'Aprobado' : 'Pendiente'}
                </Badge>
                <span className="text-xs mono text-[var(--text3)]">#{transferDetail.id.slice(0, 8).toUpperCase()}</span>
              </div>
              <span className="text-xs text-[var(--text3)]">
                {new Date(transferDetail.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[var(--surface2)] rounded-[var(--radius-md)] p-3">
                <p className="text-xs text-[var(--text3)] mb-1">Depósito origen</p>
                <p className="font-semibold text-[var(--text)]">{transferDetail.from_warehouse?.name ?? '—'}</p>
              </div>
              <div className="bg-[var(--surface2)] rounded-[var(--radius-md)] p-3">
                <p className="text-xs text-[var(--text3)] mb-1">Depósito destino</p>
                <p className="font-semibold text-[var(--text)]">{transferDetail.to_warehouse?.name ?? '—'}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs text-[var(--text2)]">
              {transferDetail.users?.full_name && (
                <p><span className="text-[var(--text3)]">Creado por:</span> {transferDetail.users.full_name}</p>
              )}
              {transferDetail.approved_at && (
                <p><span className="text-[var(--text3)]">Aprobado:</span> {new Date(transferDetail.approved_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
              )}
            </div>

            {transferDetail.notes && (
              <p className="text-sm text-[var(--text2)] bg-[var(--surface2)] rounded-[var(--radius-md)] px-3 py-2">
                <span className="text-[var(--text3)] text-xs">Notas:</span> {transferDetail.notes}
              </p>
            )}

            <div className="bg-[var(--surface2)] rounded-[var(--radius-lg)] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left px-3 py-2 text-xs font-medium text-[var(--text3)]">Producto</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-[var(--text3)] hidden sm:table-cell">Código</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-[var(--text3)]">Cantidad</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-[var(--text3)] hidden sm:table-cell">Unidad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {transferDetail.warehouse_transfer_items?.map((item, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2.5 font-medium text-[var(--text)]">{item.products?.name}</td>
                      <td className="px-3 py-2.5 mono text-xs text-[var(--text3)] hidden sm:table-cell">{item.products?.barcode ?? '—'}</td>
                      <td className="px-3 py-2.5 text-right mono font-bold">{item.quantity}</td>
                      <td className="px-3 py-2.5 text-[var(--text3)] hidden sm:table-cell">{item.products?.unit ?? 'unidad'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              {transferDetail.status === 'pending' && (
                <Button
                  onClick={async () => {
                    setApprovingId(transferDetail.id)
                    try {
                      const approved = await api.post<Transfer>(`/api/warehouses/transfers/${transferDetail.id}/approve`, {})
                      toast.success('Transferencia aprobada — stock actualizado')
                      setTransfers(prev => prev.map(tr => tr.id === approved.id ? approved : tr))
                      setTransferDetail(approved)
                      fetchStock()
                      printRemito(approved)
                    } catch (err: unknown) {
                      toast.error(err instanceof Error ? err.message : 'Error al aprobar')
                    } finally { setApprovingId(null) }
                  }}
                  loading={approvingId === transferDetail.id}
                >
                  <CheckCircle size={14} /> Aprobar
                </Button>
              )}
              {transferDetail.status === 'approved' && (
                <Button variant="secondary" onClick={() => printRemito(transferDetail)}>
                  <Printer size={14} /> Imprimir remito
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </AppShell>
  )
}
