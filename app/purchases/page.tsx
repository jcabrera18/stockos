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
import { Plus, Truck, Building2 } from 'lucide-react'
import { toast } from 'sonner'

type Tab          = 'orders' | 'suppliers'
type StatusFilter = 'all' | 'pending' | 'received' | 'cancelled'
type CostDecision = 'keep' | 'new_price' | 'weighted' | 'highest'

interface CostPreviewItem {
  product_id:   string
  product_name: string
  quantity:     number
  order_cost:   number
  current_cost: number
  weighted_avg: number
  highest:      number
  cost_changed: boolean
}

const COST_OPTIONS: {
  key: CostDecision
  label: string
  getValue: (i: CostPreviewItem) => number
}[] = [
  { key: 'keep',      label: 'Mantener actual', getValue: i => i.current_cost  },
  { key: 'new_price', label: 'Precio orden',    getValue: i => i.order_cost    },
  { key: 'weighted',  label: 'Prom. pond.',     getValue: i => i.weighted_avg  },
  { key: 'highest',   label: 'Mayor precio',    getValue: i => i.highest       },
]

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

  // Detalle orden
  const [detailOrder, setDetailOrder]     = useState<PurchaseOrder | null>(null)
  const [detailModal, setDetailModal]     = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Recibir mercadería
  const [receiveModal, setReceiveModal]       = useState(false)
  const [receiving, setReceiving]             = useState(false)
  const [previewLoading, setPreviewLoading]   = useState(false)
  const [costPreviewModal, setCostPreviewModal] = useState(false)
  const [previewItems, setPreviewItems]       = useState<CostPreviewItem[]>([])
  const [costDecisions, setCostDecisions]     = useState<Record<string, CostDecision>>({})

  // Cancelar orden
  const [cancelModal, setCancelModal] = useState(false)
  const [cancelling, setCancelling]   = useState(false)

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

  // ── Imprimir remito de compra ──────────────────────────
  const printRemito = (d: PurchaseOrder) => {
    const win = window.open('', '_blank', 'width=750,height=700')
    if (!win) return
    const supplier = (d.suppliers as { name: string } | undefined)?.name ?? 'Sin proveedor'
    const warehouse = (d as unknown as { warehouse_name?: string }).warehouse_name
    const date = new Date(d.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const receivedDate = d.received_at ? new Date(d.received_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
    const rows = (d.purchase_items ?? []).map(i => {
      const prod = i.products as { name: string; barcode?: string; unit?: string } | undefined
      return `<tr>
        <td>${prod?.name ?? '—'}${prod?.barcode ? `<br><span class="small">${prod.barcode}</span>` : ''}</td>
        <td class="center">${i.quantity}${prod?.unit ? ` ${prod.unit}` : ''}</td>
        <td class="right">${Number(i.unit_cost).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</td>
        <td class="right">${Number(i.subtotal).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</td>
      </tr>`
    }).join('')

    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Remito de compra</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;padding:32px;color:#111;font-size:13px}
      h1{font-size:22px;margin-bottom:2px}
      .num{font-size:12px;color:#666;margin-bottom:24px}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px}
      .box{border:1px solid #e0e0e0;border-radius:6px;padding:12px}
      .box .label{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
      .box p{font-size:13px;font-weight:600}
      .box .sub{font-size:12px;color:#555;font-weight:400;margin-top:2px}
      table{width:100%;border-collapse:collapse;margin-bottom:16px}
      th{background:#f5f5f5;text-align:left;padding:8px 10px;font-size:11px;text-transform:uppercase;color:#555;border-bottom:2px solid #ddd}
      td{padding:9px 10px;border-bottom:1px solid #eee;font-size:13px;vertical-align:top}
      .center{text-align:center} .right{text-align:right}
      .small{font-size:11px;color:#888}
      tfoot td{border-top:2px solid #ddd;border-bottom:none;font-weight:600;font-size:15px;color:#1a56db}
      .footer{margin-top:40px;display:grid;grid-template-columns:1fr 1fr;gap:40px}
      .sign{border-top:1px solid #aaa;padding-top:8px;font-size:11px;color:#666;text-align:center}
      @media print{button{display:none}}
    </style></head><body>
    <h1>Remito de compra</h1>
    <p class="num">N° ${d.id.slice(0, 8).toUpperCase()} · ${date}</p>

    <div class="grid">
      <div class="box">
        <div class="label">Proveedor</div>
        <p>${supplier}</p>
      </div>
      <div class="box">
        <div class="label">Depósito destino</div>
        <p>${warehouse ?? 'Sin depósito'}</p>
        <p class="sub">Recibido: ${receivedDate}</p>
      </div>
    </div>

    <table>
      <thead><tr><th>Producto</th><th class="center">Cantidad</th><th class="right">Precio costo</th><th class="right">Subtotal</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><td colspan="3"><strong>Total</strong></td><td class="right"><strong>${Number(d.total).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</strong></td></tr>
      </tfoot>
    </table>

    ${d.notes ? `<p style="font-size:12px;color:#555;margin-bottom:20px"><em>Notas: ${d.notes}</em></p>` : ''}

    <div class="footer">
      <div class="sign">Firma responsable depósito</div>
      <div class="sign">Firma proveedor / transportista</div>
    </div>

    <script>window.onload=()=>window.print()</script>
    </body></html>`)
    win.document.close()
  }

  // ── Ver detalle orden ──────────────────────────────────
  const handleDetail = async (order: PurchaseOrder) => {
    setDetailOrder(null)
    setLoadingDetail(true)
    setDetailModal(true)
    try {
      const data = await api.get<PurchaseOrder>(`/api/purchases/${order.id}`)
      setDetailOrder(data)
    } catch { toast.error('Error al cargar la orden') }
    finally { setLoadingDetail(false) }
  }

  // ── Recibir orden ──────────────────────────────────────
  const handleReceiveClick = async () => {
    if (!detailOrder) return
    setPreviewLoading(true)
    try {
      const preview = await api.get<{ items: CostPreviewItem[] }>(
        `/api/purchases/${detailOrder.id}/receive-preview`
      )
      const changed = preview.items.filter(i => i.cost_changed)
      if (changed.length === 0) {
        setReceiveModal(true)
      } else {
        setPreviewItems(preview.items)
        const defaults: Record<string, CostDecision> = {}
        changed.forEach(i => { defaults[i.product_id] = 'weighted' })
        setCostDecisions(defaults)
        setCostPreviewModal(true)
      }
    } catch {
      toast.error('Error al cargar la previsualización')
    } finally { setPreviewLoading(false) }
  }

  const handleReceive = async (decisions: Record<string, CostDecision> = {}) => {
    if (!detailOrder) return
    setReceiving(true)
    try {
      await api.post(`/api/purchases/${detailOrder.id}/receive`, { cost_decisions: decisions })
      toast.success('Mercadería recibida — stock actualizado')
      setCostPreviewModal(false)
      setReceiveModal(false)
      fetchOrders()
      const updated = await api.get<PurchaseOrder>(`/api/purchases/${detailOrder.id}`)
      setDetailOrder(updated)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al recibir')
    } finally { setReceiving(false) }
  }

  // ── Cancelar orden ─────────────────────────────────────
  const handleCancel = async () => {
    if (!detailOrder) return
    setCancelling(true)
    try {
      await api.patch(`/api/purchases/${detailOrder.id}/cancel`, {})
      toast.success('Orden cancelada')
      setCancelModal(false)
      fetchOrders()
      const updated = await api.get<PurchaseOrder>(`/api/purchases/${detailOrder.id}`)
      setDetailOrder(updated)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al cancelar')
    } finally { setCancelling(false) }
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {orders.map(order => {
                      const sc = statusConfig[order.status]
                      const supplier = order.suppliers as { name: string } | undefined
                      return (
                        <tr
                          key={order.id}
                          onClick={() => handleDetail(order)}
                          className="hover:bg-[var(--surface2)] transition-colors cursor-pointer"
                        >
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
        onClose={() => setReceiveModal(false)}
        onConfirm={() => handleReceive({})}
        title="Recibir mercadería"
        message="¿Confirmás la recepción de esta orden? El stock de los productos se actualizará en el depósito seleccionado."
        confirmLabel="Confirmar recepción"
        loading={receiving}
      />

      {/* Confirm cancelar orden */}
      <ConfirmDialog
        open={cancelModal}
        onClose={() => setCancelModal(false)}
        onConfirm={handleCancel}
        title="Cancelar orden"
        message="¿Estás seguro que querés cancelar esta orden de compra? Esta acción no se puede deshacer."
        confirmLabel="Cancelar orden"
        loading={cancelling}
        danger
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
          className="fixed inset-0 z-40 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setDetailModal(false) }}
        >
          <div className="w-full max-w-lg bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <h2 className="text-base font-semibold text-[var(--text)]">Detalle de orden</h2>
              <button onClick={() => setDetailModal(false)} className="p-1 rounded text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface2)]">✕</button>
            </div>

            <div className="p-5 overflow-y-auto flex-1">
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
                      <p className="text-xs text-[var(--text3)]">Depósito destino</p>
                      <p className="text-[var(--text)]">{(detailOrder as unknown as { warehouse_name?: string }).warehouse_name ?? <span className="text-[var(--text3)]">Sin depósito</span>}</p>
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

            {/* Footer con acciones */}
            {detailOrder && (detailOrder.status === 'pending' || detailOrder.status === 'received') && (
              <div className="px-5 py-4 border-t border-[var(--border)] flex justify-between items-center gap-2">
                <div>
                  {detailOrder.status === 'received' && (
                    <button
                      onClick={() => printRemito(detailOrder)}
                      className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-[var(--radius-md)] text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors border border-[var(--border)]"
                    >
                      🖨 Imprimir remito
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  {detailOrder.status === 'pending' && (
                    <>
                      <button
                        onClick={() => setCancelModal(true)}
                        className="px-4 py-2 text-sm rounded-[var(--radius-md)] font-medium bg-[var(--danger-subtle)] text-[var(--danger)] border border-[var(--danger)] hover:opacity-80 transition-opacity"
                      >
                        Cancelar orden
                      </button>
                      <button
                        onClick={handleReceiveClick}
                        disabled={previewLoading}
                        className="px-4 py-2 text-sm rounded-[var(--radius-md)] font-medium bg-[var(--accent)] text-white hover:opacity-90 transition-opacity flex items-center gap-2 disabled:opacity-70"
                      >
                        {previewLoading
                          ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Cargando...</>
                          : 'Confirmar recepción'
                        }
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal decisión de costos al recibir */}
      {costPreviewModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setCostPreviewModal(false) }}
        >
          <div className="w-full max-w-lg bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-start justify-between px-5 py-4 border-b border-[var(--border)]">
              <div>
                <h2 className="text-base font-semibold text-[var(--text)]">Confirmar recepción</h2>
                <p className="text-xs text-[var(--text3)] mt-0.5">
                  {previewItems.filter(i => i.cost_changed).length} producto(s) con cambio de precio costo — elegí cómo actualizar cada uno
                </p>
              </div>
              <button onClick={() => setCostPreviewModal(false)} className="p-1 rounded text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface2)]">✕</button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-5">
              {previewItems.filter(i => i.cost_changed).map(item => (
                <div key={item.product_id}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-[var(--text)]">{item.product_name}</p>
                    <span className="text-xs text-[var(--text3)] mono">
                      {formatCurrency(item.current_cost)} → {formatCurrency(item.order_cost)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {COST_OPTIONS.map(opt => {
                      const val = opt.getValue(item)
                      const selected = (costDecisions[item.product_id] ?? 'weighted') === opt.key
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => setCostDecisions(d => ({ ...d, [item.product_id]: opt.key }))}
                          className={`flex flex-col items-start px-3 py-2 text-xs rounded-[var(--radius-md)] border transition-colors text-left ${
                            selected
                              ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                              : 'bg-[var(--surface2)] text-[var(--text2)] border-[var(--border)] hover:border-[var(--accent)]'
                          }`}
                        >
                          <span className="font-medium">{opt.label}</span>
                          <span className={`mono font-bold ${selected ? 'text-white/90' : 'text-[var(--text)]'}`}>
                            {formatCurrency(val)}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}

              {previewItems.filter(i => !i.cost_changed).length > 0 && (
                <p className="text-xs text-[var(--text3)] pt-3 border-t border-[var(--border)]">
                  {previewItems.filter(i => !i.cost_changed).length} producto(s) sin cambio de costo — se aplica promedio ponderado.
                </p>
              )}
            </div>

            <div className="px-5 py-4 border-t border-[var(--border)] flex justify-end gap-2">
              <button
                onClick={() => setCostPreviewModal(false)}
                className="px-4 py-2 text-sm rounded-[var(--radius-md)] font-medium bg-[var(--surface2)] text-[var(--text2)] border border-[var(--border)] hover:opacity-80 transition-opacity"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleReceive(costDecisions)}
                disabled={receiving}
                className="px-4 py-2 text-sm rounded-[var(--radius-md)] font-medium bg-[var(--accent)] text-white hover:opacity-90 transition-opacity flex items-center gap-2 disabled:opacity-60"
              >
                {receiving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                Confirmar recepción
              </button>
            </div>
          </div>
        </div>
      )}

    </AppShell>
  )
}
