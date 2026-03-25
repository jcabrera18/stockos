'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoader } from '@/components/ui/Spinner'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { PurchaseOrderModal } from '@/components/modules/PurchaseOrderModal'
import { SupplierModal } from '@/components/modules/SupplierModal'
import { api } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { PurchaseOrder, Supplier, PaginatedResponse, Pagination as PaginationType } from '@/types'
import { Plus, Truck, Building2, CheckCircle, XCircle, Eye } from 'lucide-react'
import { toast } from 'sonner'

type Tab          = 'orders' | 'suppliers'
type StatusFilter = 'all' | 'pending' | 'received' | 'cancelled'

const statusConfig: Record<string, { label: string; variant: 'warning' | 'success' | 'danger' | 'default' }> = {
  pending:   { label: 'Pendiente',  variant: 'warning' },
  received:  { label: 'Recibida',   variant: 'success' },
  cancelled: { label: 'Cancelada',  variant: 'danger'  },
}

export default function PurchasesPage() {
  const [tab, setTab] = useState<Tab>('orders')

  // ── Órdenes ────────────────────────────────────────────
  const [orders, setOrders]           = useState<PurchaseOrder[]>([])
  const [orderPag, setOrderPag]       = useState<PaginationType>({ total: 0, page: 1, limit: 20, pages: 0 })
  const [statusFilter, setStatus]     = useState<StatusFilter>('all')
  const [orderPage, setOrderPage]     = useState(1)
  const [loadingOrders, setLoadingOrders] = useState(true)
  const [orderModal, setOrderModal]   = useState(false)

  // Recibir mercadería
  const [receivingId, setReceivingId] = useState<string | null>(null)
  const [receiveModal, setReceiveModal] = useState(false)
  const [receiving, setReceiving]     = useState(false)

  // Detalle orden
  const [detailOrder, setDetailOrder]   = useState<PurchaseOrder | null>(null)
  const [detailModal, setDetailModal]   = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // ── Proveedores ────────────────────────────────────────
  const [suppliers, setSuppliers]     = useState<Supplier[]>([])
  const [loadingSuppliers, setLoadingSuppliers] = useState(false)
  const [supplierModal, setSupplierModal] = useState(false)
  const [editSupplier, setEditSupplier]   = useState<Supplier | null>(null)
  const [deleteSupplierModal, setDeleteSupplierModal] = useState(false)
  const [deletingSupplier, setDeletingSupplier]       = useState<Supplier | null>(null)
  const [deletingSupplierLoading, setDeletingSupplierLoading] = useState(false)

  // ── Fetch órdenes ──────────────────────────────────────
  const statusFilterRef = useRef(statusFilter)
  const orderPageRef = useRef(orderPage)
  useEffect(() => { statusFilterRef.current = statusFilter }, [statusFilter])

  const fetchOrders = useCallback(async () => {
    setLoadingOrders(true)
    try {
      const res = await api.get<PaginatedResponse<PurchaseOrder>>('/api/purchases', {
        status: statusFilterRef.current !== 'all' ? statusFilterRef.current : undefined,
        page: orderPageRef.current, limit: 20,
      })
      setOrders(res.data)
      setOrderPag(res.pagination)
    } catch (err) { console.error(err) }
    finally { setLoadingOrders(false) }
  }, [])

  useEffect(() => {
    orderPageRef.current = 1
    setOrderPage(1)
    fetchOrders()
  }, [statusFilter, fetchOrders])

  const handlePageChange = useCallback((newPage: number) => {
    orderPageRef.current = newPage
    setOrderPage(newPage)
    fetchOrders()
  }, [fetchOrders])

  // ── Fetch proveedores ──────────────────────────────────
  const fetchSuppliers = useCallback(async () => {
    setLoadingSuppliers(true)
    try {
      const data = await api.get<Supplier[]>('/api/purchases/suppliers')
      setSuppliers(data)
    } catch (err) { console.error(err) }
    finally { setLoadingSuppliers(false) }
  }, [])

  useEffect(() => { if (tab === 'suppliers') fetchSuppliers() }, [tab, fetchSuppliers])

  // ── Recibir orden ──────────────────────────────────────
  const handleReceive = async () => {
    if (!receivingId) return
    setReceiving(true)
    try {
      await api.post(`/api/purchases/${receivingId}/receive`, {})
      toast.success('Mercadería recibida — stock actualizado')
      setReceiveModal(false)
      setReceivingId(null)
      fetchOrders()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al recibir')
    } finally { setReceiving(false) }
  }

  // ── Ver detalle orden ──────────────────────────────────
  const handleDetail = async (order: PurchaseOrder) => {
    setLoadingDetail(true)
    setDetailModal(true)
    try {
      const data = await api.get<PurchaseOrder>(`/api/purchases/${order.id}`)
      setDetailOrder(data)
    } catch { toast.error('Error al cargar la orden') }
    finally { setLoadingDetail(false) }
  }

  // ── Eliminar proveedor (soft) ──────────────────────────
  const handleDeleteSupplier = async () => {
    if (!deletingSupplier) return
    setDeletingSupplierLoading(true)
    try {
      await api.patch(`/api/purchases/suppliers/${deletingSupplier.id}`, { is_active: false })
      toast.success('Proveedor eliminado')
      setDeleteSupplierModal(false)
      setDeletingSupplier(null)
      fetchSuppliers()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    } finally { setDeletingSupplierLoading(false) }
  }

  const statusFilters: { key: StatusFilter; label: string }[] = [
    { key: 'all',       label: 'Todas' },
    { key: 'pending',   label: 'Pendientes' },
    { key: 'received',  label: 'Recibidas' },
    { key: 'cancelled', label: 'Canceladas' },
  ]

  return (
    <AppShell>
      <PageHeader
        title="Compras"
        action={
          tab === 'orders'
            ? <Button onClick={() => setOrderModal(true)}><Plus size={15} /> Nueva orden</Button>
            : <Button onClick={() => { setEditSupplier(null); setSupplierModal(true) }}><Plus size={15} /> Nuevo proveedor</Button>
        }
      />

      <div className="p-5 space-y-4">
        {/* Tabs */}
        <div className="flex border-b border-[var(--border)]">
          {[
            { key: 'orders',    label: 'Órdenes de compra', icon: Truck },
            { key: 'suppliers', label: 'Proveedores',        icon: Building2 },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key as Tab)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === key
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-transparent text-[var(--text3)] hover:text-[var(--text)]'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        {/* ── TAB: ÓRDENES ─────────────────────────────── */}
        {tab === 'orders' && (
          <>
            <div className="flex gap-2 flex-wrap">
              {statusFilters.map(f => (
                <button key={f.key} onClick={() => setStatus(f.key)}
                  className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors ${
                    statusFilter === f.key
                      ? 'bg-[var(--accent)] text-white'
                      : 'bg-[var(--surface2)] text-[var(--text2)] hover:bg-[var(--surface3)]'
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>

            {loadingOrders ? <PageLoader /> : orders.length === 0 ? (
              <EmptyState
                icon={Truck}
                title="Sin órdenes de compra"
                description="Creá tu primera orden para gestionar las compras a proveedores."
                action={<Button onClick={() => setOrderModal(true)}><Plus size={15} /> Nueva orden</Button>}
              />
            ) : (
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
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
                    {orders.map(order => {
                      const sc = statusConfig[order.status]
                      const supplier = order.suppliers as { name: string } | undefined
                      return (
                        <tr key={order.id} className="hover:bg-[var(--surface2)] transition-colors group">
                          <td className="px-4 py-3 text-xs mono text-[var(--text2)]">
                            {formatDate(order.created_at)}
                          </td>
                          <td className="px-4 py-3 font-medium text-[var(--text)]">
                            {supplier?.name ?? <span className="text-[var(--text3)]">Sin proveedor</span>}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge variant={sc.variant}>{sc.label}</Badge>
                          </td>
                          <td className="px-4 py-3 text-right mono font-semibold text-[var(--text)]">
                            {formatCurrency(order.total)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {/* Ver detalle */}
                              <button
                                onClick={() => handleDetail(order)}
                                title="Ver detalle"
                                className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface3)] transition-colors"
                              >
                                <Eye size={14} />
                              </button>
                              {/* Recibir */}
                              {order.status === 'pending' && (
                                <button
                                  onClick={() => { setReceivingId(order.id); setReceiveModal(true) }}
                                  title="Recibir mercadería"
                                  className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-colors"
                                >
                                  <CheckCircle size={14} />
                                </button>
                              )}
                              {/* Cancelar */}
                              {order.status === 'pending' && (
                                <button
                                  onClick={async () => {
                                    await api.patch(`/api/purchases/${order.id}/cancel`, {})
                                    toast.success('Orden cancelada')
                                    fetchOrders()
                                  }}
                                  title="Cancelar orden"
                                  className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--danger)] hover:bg-[var(--danger-subtle)] transition-colors"
                                >
                                  <XCircle size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <Pagination pagination={orderPag} onPageChange={handlePageChange} />
              </div>
            )}
          </>
        )}

        {/* ── TAB: PROVEEDORES ──────────────────────────── */}
        {tab === 'suppliers' && (
          loadingSuppliers ? <PageLoader /> : suppliers.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="Sin proveedores"
              description="Agregá tus proveedores para asociarlos a las órdenes de compra."
              action={<Button onClick={() => { setEditSupplier(null); setSupplierModal(true) }}><Plus size={15} /> Nuevo proveedor</Button>}
            />
          ) : (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)]">Proveedor</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden md:table-cell">CUIT</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden sm:table-cell">Teléfono</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden lg:table-cell">Email</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {suppliers.map(supplier => (
                    <tr key={supplier.id} className="hover:bg-[var(--surface2)] transition-colors group">
                      <td className="px-4 py-3">
                        <p className="font-medium text-[var(--text)]">{supplier.name}</p>
                        {supplier.address && <p className="text-xs text-[var(--text3)]">{supplier.address}</p>}
                      </td>
                      <td className="px-4 py-3 mono text-[var(--text2)] hidden md:table-cell">
                        {supplier.cuit ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-[var(--text2)] hidden sm:table-cell">
                        {supplier.phone ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-[var(--text2)] hidden lg:table-cell">
                        {supplier.email ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => { setEditSupplier(supplier); setSupplierModal(true) }}
                            className="px-2.5 py-1 text-xs rounded text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface3)] transition-colors"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => { setDeletingSupplier(supplier); setDeleteSupplierModal(true) }}
                            className="px-2.5 py-1 text-xs rounded text-[var(--text3)] hover:text-[var(--danger)] hover:bg-[var(--danger-subtle)] transition-colors"
                          >
                            Eliminar
                          </button>
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

      {/* Modal nueva orden */}
      <PurchaseOrderModal
        open={orderModal}
        onClose={() => setOrderModal(false)}
        onSaved={fetchOrders}
      />

      {/* Modal proveedor */}
      <SupplierModal
        open={supplierModal}
        onClose={() => { setSupplierModal(false); setEditSupplier(null) }}
        onSaved={fetchSuppliers}
        supplier={editSupplier}
      />

      {/* Confirm recibir mercadería */}
      <ConfirmDialog
        open={receiveModal}
        onClose={() => { setReceiveModal(false); setReceivingId(null) }}
        onConfirm={handleReceive}
        title="Recibir mercadería"
        message="¿Confirmás la recepción de esta orden? El stock de todos los productos se actualizará automáticamente y se recalculará el precio de costo promedio."
        confirmLabel="Confirmar recepción"
        loading={receiving}
      />

      {/* Confirm eliminar proveedor */}
      <ConfirmDialog
        open={deleteSupplierModal}
        onClose={() => { setDeleteSupplierModal(false); setDeletingSupplier(null) }}
        onConfirm={handleDeleteSupplier}
        title="Eliminar proveedor"
        message={`¿Estás seguro que querés eliminar a "${deletingSupplier?.name}"?`}
        confirmLabel="Eliminar"
        loading={deletingSupplierLoading}
        danger
      />

      {/* Modal detalle orden */}
      {detailModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setDetailModal(false) }}
        >
          <div className="w-full max-w-lg bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <h2 className="text-base font-semibold text-[var(--text)]">Detalle de orden</h2>
              <button onClick={() => setDetailModal(false)} className="p-1 rounded text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface2)]">✕</button>
            </div>
            <div className="p-5">
              {loadingDetail ? (
                <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" /></div>
              ) : detailOrder ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-[var(--text3)]">Proveedor</p>
                      <p className="font-medium text-[var(--text)]">{(detailOrder.suppliers as { name: string } | undefined)?.name ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--text3)]">Estado</p>
                      <Badge variant={statusConfig[detailOrder.status].variant}>{statusConfig[detailOrder.status].label}</Badge>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--text3)]">Fecha</p>
                      <p className="text-[var(--text)]">{formatDate(detailOrder.created_at)}</p>
                    </div>
                    {detailOrder.received_at && (
                      <div>
                        <p className="text-xs text-[var(--text3)]">Recibida</p>
                        <p className="text-[var(--text)]">{formatDate(detailOrder.received_at)}</p>
                      </div>
                    )}
                  </div>

                  {/* Ítems */}
                  <div className="bg-[var(--surface2)] rounded-[var(--radius-md)] overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border)]">
                          <th className="text-left px-3 py-2 text-xs text-[var(--text3)]">Producto</th>
                          <th className="text-right px-3 py-2 text-xs text-[var(--text3)]">Cant.</th>
                          <th className="text-right px-3 py-2 text-xs text-[var(--text3)]">P. Costo</th>
                          <th className="text-right px-3 py-2 text-xs text-[var(--text3)]">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {(detailOrder.purchase_items ?? []).map((item, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2 text-[var(--text)]">{(item.products as { name: string } | undefined)?.name ?? '—'}</td>
                            <td className="px-3 py-2 text-right mono text-[var(--text2)]">{item.quantity}</td>
                            <td className="px-3 py-2 text-right mono text-[var(--text2)]">{formatCurrency(item.unit_cost)}</td>
                            <td className="px-3 py-2 text-right mono font-medium text-[var(--text)]">{formatCurrency(item.subtotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-[var(--border)]">
                          <td colSpan={3} className="px-3 py-2 text-sm font-semibold text-[var(--text)]">Total</td>
                          <td className="px-3 py-2 text-right mono font-bold text-[var(--accent)]">{formatCurrency(detailOrder.total)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {detailOrder.notes && (
                    <p className="text-sm text-[var(--text2)] italic">"{detailOrder.notes}"</p>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

    </AppShell>
  )
}
