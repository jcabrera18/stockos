'use client'
import { useEffect, useState, useCallback } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoader } from '@/components/ui/Spinner'
import { Pagination } from '@/components/ui/Pagination'
import { AdjustStockModal } from '@/components/modules/AdjustStockModal'
import { TransferModal } from '@/components/modules/TransferModal'
import { api } from '@/lib/api'
import { formatCurrency, getStockStatusLabel, getStockStatusColor } from '@/lib/utils'
import type { Pagination as PaginationType } from '@/types'
import { Plus, Warehouse, Pencil, Trash2, Star, Search, SlidersHorizontal, ArrowLeftRight } from 'lucide-react'
import { toast } from 'sonner'

interface Warehouse {
  id: string
  name: string
  address?: string
  is_default: boolean
  is_active: boolean
  created_at: string
}

interface WarehouseStock {
  id: string
  warehouse_id: string
  warehouse_name: string
  product_id: string
  product_name: string
  barcode?: string
  cost_price: number
  stock_current: number
  stock_min: number
  stock_max: number
  category_name?: string
  stock_status: 'ok' | 'bajo' | 'critico' | 'sin_stock'
}

type Tab = 'warehouses' | 'stock' | 'transfers'

const emptyForm = { name: '', address: '', is_default: false }

export default function WarehousesPage() {
  const [tab, setTab] = useState<Tab>('warehouses')
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null)
  const [loading, setLoading] = useState(true)

  // Modales warehouse
  const [warehouseModal, setWarehouseModal] = useState(false)
  const [editWarehouse, setEditWarehouse] = useState<Warehouse | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteModal, setDeleteModal] = useState(false)
  const [deleteWarehouse, setDeleteWarehouse] = useState<Warehouse | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Stock del depósito
  const [stockData, setStockData] = useState<WarehouseStock[]>([])
  const [stockPag, setStockPag] = useState<PaginationType>({ total: 0, page: 1, limit: 50, pages: 0 })
  const [stockPage, setStockPage] = useState(1)
  const [stockSearch, setStockSearch] = useState('')
  const [loadingStock, setLoadingStock] = useState(false)
  const [adjustModal, setAdjustModal] = useState(false)
  const [adjustItem, setAdjustItem] = useState<WarehouseStock | null>(null)

  // Transferencias
  const [transferModal, setTransferModal] = useState(false)
  const [transfers, setTransfers] = useState<unknown[]>([])
  const [loadingTransfers, setLoadingTransfers] = useState(false)

  const fetchWarehouses = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get<Warehouse[]>('/api/warehouses')
      setWarehouses(data)
      if (!selectedWarehouse && data.length > 0) {
        setSelectedWarehouse(data.find(w => w.is_default) ?? data[0])
      }
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [selectedWarehouse])

  useEffect(() => { fetchWarehouses() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchStock = useCallback(async () => {
    if (!selectedWarehouse) return
    setLoadingStock(true)
    try {
      const res = await api.get<{ data: WarehouseStock[]; pagination: PaginationType }>(
        `/api/warehouses/${selectedWarehouse.id}/stock`,
        { search: stockSearch || undefined, page: stockPage, limit: 50 }
      )
      setStockData(res.data)
      setStockPag(res.pagination)
    } catch (err) { console.error(err) }
    finally { setLoadingStock(false) }
  }, [selectedWarehouse, stockSearch, stockPage])

  useEffect(() => {
    if (tab === 'stock') fetchStock()
  }, [tab, fetchStock])

  useEffect(() => { setStockPage(1) }, [stockSearch, selectedWarehouse])

  const fetchTransfers = useCallback(async () => {
    setLoadingTransfers(true)
    try {
      const res = await api.get<{ data: unknown[] }>('/api/warehouses/transfers')
      setTransfers(res.data)
    } catch (err) { console.error(err) }
    finally { setLoadingTransfers(false) }
  }, [])

  useEffect(() => {
    if (tab === 'transfers') fetchTransfers()
  }, [tab, fetchTransfers])

  const openCreate = () => {
    setEditWarehouse(null)
    setForm(emptyForm)
    setWarehouseModal(true)
  }

  const openEdit = (w: Warehouse) => {
    setEditWarehouse(w)
    setForm({ name: w.name, address: w.address ?? '', is_default: w.is_default })
    setWarehouseModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('El nombre es obligatorio'); return }
    setSaving(true)
    try {
      const payload = { name: form.name.trim(), address: form.address.trim() || null, is_default: form.is_default }
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

  const tabs: { key: Tab; label: string }[] = [
    { key: 'warehouses', label: 'Depósitos' },
    { key: 'stock', label: 'Stock por depósito' },
    { key: 'transfers', label: 'Transferencias' },
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
          loading ? <PageLoader /> : warehouses.length === 0 ? (
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
                      {w.address && <p className="text-xs text-[var(--text3)] mt-0.5">{w.address}</p>}
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
                  <button
                    onClick={() => { setSelectedWarehouse(w); setTab('stock') }}
                    className="mt-3 w-full text-xs text-[var(--accent)] hover:underline text-left">
                    Ver stock →
                  </button>
                </div>
              ))}
            </div>
          )
        )}

        {/* ── Tab: Stock ── */}
        {tab === 'stock' && (
          <div className="space-y-3">
            {/* Selector de depósito */}
            <div className="flex gap-2 flex-wrap items-center">
              <span className="text-xs text-[var(--text3)]">Depósito:</span>
              {warehouses.map(w => (
                <button key={w.id} onClick={() => setSelectedWarehouse(w)}
                  className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors ${selectedWarehouse?.id === w.id
                      ? 'bg-[var(--accent)] text-white'
                      : 'bg-[var(--surface2)] text-[var(--text2)] hover:bg-[var(--surface3)]'
                    }`}>
                  {w.name}
                </button>
              ))}
              <div className="relative ml-auto">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                <input value={stockSearch} onChange={e => setStockSearch(e.target.value)}
                  placeholder="Buscar..."
                  className="pl-7 pr-3 py-1.5 text-xs rounded-full bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>

            {loadingStock ? <PageLoader /> : stockData.length === 0 ? (
              <EmptyState icon={Warehouse} title="Sin stock en este depósito"
                description="Agregá productos o transferí stock desde otro depósito."
              />
            ) : (
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)]">Producto</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden md:table-cell">Categoría</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)]">Stock</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)] hidden sm:table-cell">Mín</th>
                      <th className="text-center px-4 py-3 text-xs font-medium text-[var(--text3)]">Estado</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {stockData.map(item => (
                      <tr key={item.id} className="hover:bg-[var(--surface2)] transition-colors group">
                        <td className="px-4 py-3">
                          <p className="font-medium text-[var(--text)]">{item.product_name}</p>
                          {item.barcode && <p className="text-xs mono text-[var(--text3)]">{item.barcode}</p>}
                        </td>
                        <td className="px-4 py-3 text-[var(--text2)] hidden md:table-cell">{item.category_name ?? '—'}</td>
                        <td className="px-4 py-3 text-right mono font-bold text-base"
                          style={{ color: getStockStatusColor(item.stock_status) }}>
                          {item.stock_current}
                        </td>
                        <td className="px-4 py-3 text-right mono text-[var(--text3)] hidden sm:table-cell">{item.stock_min}</td>
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
                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded text-[var(--text3)] hover:text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-all">
                            <SlidersHorizontal size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pagination pagination={stockPag} onPageChange={setStockPage} />
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Transferencias ── */}
        {tab === 'transfers' && (
          loadingTransfers ? <PageLoader /> : transfers.length === 0 ? (
            <EmptyState icon={ArrowLeftRight} title="Sin transferencias"
              description="Transferí stock entre depósitos para redistribuir mercadería."
              action={<Button onClick={() => setTransferModal(true)}><ArrowLeftRight size={15} /> Nueva transferencia</Button>}
            />
          ) : (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)]">Fecha</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)]">Origen</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)]">Destino</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden md:table-cell">Productos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {(transfers as {
                    id: string
                    created_at: string
                    from_warehouse: { name: string }
                    to_warehouse: { name: string }
                    warehouse_transfer_items: { products: { name: string }; quantity: number }[]
                  }[]).map(t => (
                    <tr key={t.id} className="hover:bg-[var(--surface2)] transition-colors">
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

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

      {/* Modal ajuste de stock en depósito */}
      {adjustItem && (
        <AdjustStockModal
          open={adjustModal}
          onClose={() => { setAdjustModal(false); setAdjustItem(null) }}
          onSaved={fetchStock}
          product={{
            ...adjustItem,
            id: adjustItem.product_id,
            name: adjustItem.product_name,
            stock_current: adjustItem.stock_current,
            stock_min: adjustItem.stock_min,
          } as unknown as import('@/types').Product}
          warehouseId={selectedWarehouse?.id}
        />
      )}

      {/* Modal transferencia */}
      <TransferModal
        open={transferModal}
        onClose={() => setTransferModal(false)}
        onSaved={() => { fetchTransfers(); fetchStock() }}
        warehouses={warehouses}
      />
    </AppShell>
  )
}
