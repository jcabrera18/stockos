'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoader } from '@/components/ui/Spinner'
import { Pagination } from '@/components/ui/Pagination'
import { api } from '@/lib/api'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import type { Product, Pagination as PaginationType } from '@/types'
import type { PriceList } from '@/app/price-lists/page'
import {
  Plus, Search, Package, CheckCircle, Clock, Truck,
  X, Minus, Trash2, ChevronRight, DollarSign, AlertCircle,
  ClipboardList, Printer,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Tipos ────────────────────────────────────────────────
type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'in_transit' | 'delivered' | 'invoiced' | 'cancelled'
type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'credit'
type PaymentMethod = 'efectivo' | 'transferencia' | 'debito' | 'credito' | 'qr' | 'cuenta_corriente'

interface OrderSummary {
  id: string
  customer_name: string
  customer_address?: string
  customer_phone?: string
  status: OrderStatus
  payment_status: PaymentStatus
  payment_method?: PaymentMethod
  paid_amount: number
  total: number
  subtotal: number
  discount: number
  item_count: number
  total_units: number
  seller_name?: string
  warehouse_name?: string
  notes?: string
  created_at: string
  confirmed_at?: string
  dispatched_at?: string
  delivered_at?: string
}

interface OrderDetail extends OrderSummary {
  warehouse_id?: string
  order_items: {
    id: string
    product_id: string
    quantity: number
    unit_price: number
    discount: number
    subtotal: number
    products: { name: string; barcode?: string; unit: string }
  }[]
  warehouses?: { name: string }
}

interface CartItem {
  product: Product
  quantity: number
  unit_price: number
  discount: number
}

interface Warehouse {
  id: string
  name: string
  is_default: boolean
}

// ─── Labels ────────────────────────────────────────────────
const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  preparing: 'En preparación',
  ready: 'Listo',
  in_transit: 'En camino',
  delivered: 'Entregado',
  invoiced: 'Facturado',
  cancelled: 'Cancelado',
}

const STATUS_VARIANTS: Record<OrderStatus, 'default' | 'success' | 'warning' | 'danger'> = {
  pending: 'warning',
  confirmed: 'default',
  preparing: 'default',
  ready: 'success',
  in_transit: 'warning',
  delivered: 'success',
  invoiced: 'success',
  cancelled: 'danger',
}

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Sin cobrar',
  partial: 'Parcial',
  paid: 'Pagado',
  credit: 'Cta. Cte.',
}

const PAYMENT_METHODS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'debito', label: 'Débito' },
  { value: 'credito', label: 'Crédito' },
  { value: 'qr', label: 'QR' },
  { value: 'cuenta_corriente', label: 'Cta. Corriente' },
]

// ─── Componente principal ─────────────────────────────────
export default function OrdersPage() {
  const router = useRouter()

  // Lista
  const [orders, setOrders] = useState<OrderSummary[]>([])
  const [pagination, setPagination] = useState<PaginationType>({ total: 0, page: 1, limit: 20, pages: 0 })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('')
  const [search, setSearch] = useState('')

  // Detalle
  const [detailModal, setDetailModal] = useState(false)
  const [detail, setDetail] = useState<OrderDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Nuevo pedido
  const [newOrderModal, setNewOrderModal] = useState(false)
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [priceLists, setPriceLists] = useState<PriceList[]>([])

  // Form nuevo pedido
  const [customerName, setCustomerName] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [priceListId, setPriceListId] = useState('')
  const [orderNotes, setOrderNotes] = useState('')
  const [orderDiscount, setOrderDiscount] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [productQuery, setProductQuery] = useState('')
  const [productResults, setProductResults] = useState<Product[]>([])
  const [searchingProducts, setSearchingProducts] = useState(false)
  const [payAlreadyCollected, setPayAlreadyCollected] = useState(false)
  const [collectedMethod, setCollectedMethod] = useState<PaymentMethod>('efectivo')
  const [collectedAmount, setCollectedAmount] = useState('')
  const [savingOrder, setSavingOrder] = useState(false)

  // Entrega
  const [deliverModal, setDeliverModal] = useState(false)
  const [deliverOrderId, setDeliverOrderId] = useState<string | null>(null)
  const [deliverMethod, setDeliverMethod] = useState<PaymentMethod>('efectivo')
  const [deliverAmount, setDeliverAmount] = useState('')
  const [deliverNotes, setDeliverNotes] = useState('')
  const [delivering, setDelivering] = useState(false)

  // Cobro parcial
  const [paymentModal, setPaymentModal] = useState(false)
  const [paymentOrderId, setPaymentOrderId] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [registeringPayment, setRegisteringPayment] = useState(false)

  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState<{ id: string; full_name: string; phone?: string; current_balance: number }[]>([])
  const [searchingCustomers, setSearchingCustomers] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)

  const [stockIssues, setStockIssues] = useState<Record<string, { available: number; needed: number }>>({})

  // Lista de carga (picking)
  interface PickingItem {
    product_id: string; name: string; barcode?: string; unit: string; total_qty: number
    orders: { id: string; customer_name: string; status: string; quantity: number }[]
  }
  const [pickingModal, setPickingModal] = useState(false)
  const [pickingItems, setPickingItems] = useState<PickingItem[]>([])
  const [loadingPicking, setLoadingPicking] = useState(false)
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set())

  const openPickingList = async () => {
    setPickingModal(true)
    setCheckedItems(new Set())
    setLoadingPicking(true)
    try {
      const data = await api.get<PickingItem[]>('/api/orders/picking-list')
      setPickingItems(data)
    } catch { setPickingItems([]) }
    finally { setLoadingPicking(false) }
  }

  const togglePickingCheck = (productId: string) =>
    setCheckedItems(prev => {
      const next = new Set(prev)
      next.has(productId) ? next.delete(productId) : next.add(productId)
      return next
    })

  const statusFilterRef = useRef(statusFilter)
  const searchRef = useRef(search)
  const pageRef = useRef(page)
  useEffect(() => { statusFilterRef.current = statusFilter }, [statusFilter])
  useEffect(() => { searchRef.current = search }, [search])

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number | undefined> = { page: pageRef.current, limit: 20 }
      if (statusFilterRef.current) params.status = statusFilterRef.current
      if (searchRef.current) params.search = searchRef.current
      const res = await api.get<{ data: OrderSummary[]; pagination: PaginationType }>('/api/orders', params)
      setOrders(res.data)
      setPagination(res.pagination)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    pageRef.current = 1
    setPage(1)
    fetchOrders()
  }, [statusFilter, search, fetchOrders])

  const handlePageChange = useCallback((newPage: number) => {
    pageRef.current = newPage
    setPage(newPage)
    fetchOrders()
  }, [fetchOrders])

  useEffect(() => {
    Promise.all([
      api.get<Warehouse[]>('/api/warehouses'),
      api.get<PriceList[]>('/api/price-lists'),
    ]).then(([wh, pl]) => {
      setWarehouses(wh)
      setPriceLists(pl)
      const def = wh.find(w => w.is_default)
      if (def) setWarehouseId(def.id)
      const defPl = pl.find(p => p.is_default)
      if (defPl) setPriceListId(defPl.id)
    }).catch(() => { })
  }, [])

  // Búsqueda de productos para el pedido
  useEffect(() => {
    if (!productQuery.trim()) { setProductResults([]); return }
    const timer = setTimeout(async () => {
      setSearchingProducts(true)
      try {
        const res = await api.get<{ data: Product[] }>('/api/products', { search: productQuery.trim(), limit: 6 })
        setProductResults(res.data.filter(p => !cart.find(c => c.product.id === p.id)))
      } catch { setProductResults([]) }
      finally { setSearchingProducts(false) }
    }, 300)
    return () => clearTimeout(timer)
  }, [productQuery, cart])

  useEffect(() => {
    if (!customerQuery.trim() || customerQuery.length < 2) { setCustomerResults([]); return }
    const timer = setTimeout(async () => {
      setSearchingCustomers(true)
      try {
        const data = await api.get<{ id: string; full_name: string; phone?: string; current_balance: number }[]>(
          `/api/customers/search?q=${encodeURIComponent(customerQuery)}`
        )
        setCustomerResults(data)
      } catch { setCustomerResults([]) }
      finally { setSearchingCustomers(false) }
    }, 300)
    return () => clearTimeout(timer)
  }, [customerQuery])

  const openDetail = async (id: string) => {
    setDetailModal(true)
    setLoadingDetail(true)
    try {
      const d = await api.get<OrderDetail>(`/api/orders/${id}`)
      setDetail(d)
    } catch { toast.error('Error al cargar el pedido') }
    finally { setLoadingDetail(false) }
  }

  const addToCart = (product: Product) => {
    const list = priceLists.find(pl => pl.id === priceListId)
    const price = list
      ? Math.round(product.cost_price * (1 + list.margin_pct / 100) * 100) / 100
      : product.sell_price
    setCart(prev => [...prev, { product, quantity: 1, unit_price: price, discount: 0 }])
    setProductQuery('')
    setProductResults([])
  }

  const updateCartQty = (id: string, delta: number) =>
    setCart(prev => prev.map(i => i.product.id === id
      ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i))

  const setCartQty = (id: string, value: string) => {
    const n = parseInt(value, 10)
    if (!value) {
      // Dejar el campo vacío temporalmente — se normaliza al salir
      setCart(prev => prev.map(i => i.product.id === id ? { ...i, quantity: 0 } : i))
    } else if (!isNaN(n) && n >= 1) {
      setCart(prev => prev.map(i => i.product.id === id ? { ...i, quantity: n } : i))
    }
  }

  const normalizeCartQty = (id: string) =>
    setCart(prev => prev.map(i => i.product.id === id
      ? { ...i, quantity: Math.max(1, i.quantity) } : i))

  const updateCartPrice = (id: string, value: string) =>
    setCart(prev => prev.map(i => i.product.id === id
      ? { ...i, unit_price: Math.max(0, Number(value) || 0) } : i))

  const removeFromCart = (id: string) =>
    setCart(prev => prev.filter(i => i.product.id !== id))

  const cartSubtotal = cart.reduce((a, i) => a + i.unit_price * i.quantity - i.discount, 0)
  const discountPct  = Math.min(100, Math.max(0, Number(orderDiscount) || 0))
  const cartDiscount = Math.round(cartSubtotal * discountPct / 100 * 100) / 100
  const cartTotal    = Math.max(0, cartSubtotal - cartDiscount)

  const resetOrderForm = () => {
    setOrderNotes(''); setOrderDiscount(''); setCart([])
    setPayAlreadyCollected(false); setCollectedAmount(''); setCollectedMethod('efectivo')
    setCustomerQuery(''); setCustomerResults([]); setSelectedCustomerId(null)
  }

  const handleCreateOrder = async () => {
    if (!customerName.trim()) { toast.error('El nombre del cliente es obligatorio'); return }
    if (cart.length === 0) { toast.error('Agregá al menos un producto'); return }

    setSavingOrder(true)
    try {
      await api.post('/api/orders', {
        customer_name: customerName.trim(),
        warehouse_id: warehouseId || null,
        price_list_id: priceListId || null,
        discount: cartDiscount,
        notes: orderNotes.trim() || null,
        customer_id: selectedCustomerId ?? null,
        items: cart.map(i => ({
          product_id: i.product.id,
          quantity: i.quantity,
          unit_price: i.unit_price,
          discount: i.discount,
        })),
        paid_amount: payAlreadyCollected ? Number(collectedAmount) || cartTotal : 0,
        payment_method: payAlreadyCollected ? collectedMethod : null,
        payment_status: payAlreadyCollected
          ? ((Number(collectedAmount) || cartTotal) >= cartTotal ? 'paid' : 'partial')
          : 'unpaid',
      })
      toast.success('Pedido creado correctamente')
      resetOrderForm()
      setNewOrderModal(false)
      fetchOrders()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al crear el pedido')
    } finally { setSavingOrder(false) }
  }

  const handleAction = async (id: string, action: string) => {
    try {
      await api.post(`/api/orders/${id}/${action}`, {})
      toast.success('Estado actualizado')
      setStockIssues({})
      fetchOrders()
      if (detail?.id === id) {
        const updated = await api.get<OrderDetail>(`/api/orders/${id}`)
        setDetail(updated)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al actualizar'

      // Si es error de stock, parsear y marcar los ítems
      if (msg.includes('Stock insuficiente') && detail) {
        // Refetch del stock del depósito para marcar visualmente
        if (detail.warehouse_id) {
          try {
            const ws = await api.get<{ data: { product_id: string; stock_current: number }[] }>(
              `/api/warehouses/${detail.warehouse_id}/stock`, { limit: 200 }
            )
            const stockMap = new Map(ws.data.map(s => [s.product_id, s.stock_current]))
            const issues: Record<string, { available: number; needed: number }> = {}
            for (const item of detail.order_items) {
              const available = stockMap.get(item.product_id) ?? 0  // ← directo
              if (available < item.quantity) {
                issues[item.product_id] = { available, needed: item.quantity }
              }
            }
            setStockIssues(issues)
          } catch { }
        }
      }

      msg.split('\n').forEach((line, i) => {
        setTimeout(() => toast.error(line), i * 150)
      })
    }
  }

  const handleDeliver = async () => {
    if (!deliverOrderId) return
    setDelivering(true)
    try {
      await api.post(`/api/orders/${deliverOrderId}/deliver`, {
        payment_method: deliverMethod,
        paid_amount: Number(deliverAmount) || 0,
        delivery_notes: deliverNotes || null,
      })
      toast.success('Entrega confirmada — venta generada automáticamente')
      setDeliverModal(false)
      setDeliverOrderId(null)
      setDeliverAmount(''); setDeliverNotes('')
      fetchOrders()
      if (detail?.id === deliverOrderId) setDetailModal(false)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al confirmar entrega')
    } finally { setDelivering(false) }
  }

  const handleRegisterPayment = async () => {
    if (!paymentOrderId || !paymentAmount) return
    setRegisteringPayment(true)
    try {
      await api.post(`/api/orders/${paymentOrderId}/payment`, {
        payment_method: paymentMethod,
        paid_amount: Number(paymentAmount),
      })
      toast.success('Pago registrado')
      setPaymentModal(false)
      setPaymentOrderId(null)
      setPaymentAmount('')
      fetchOrders()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar pago')
    } finally { setRegisteringPayment(false) }
  }

  // ─── Acciones disponibles por estado ─────────────────────
  const getActions = (order: OrderSummary) => {
    const actions = []
    if (order.status === 'pending') {
      actions.push({ label: 'Confirmar', action: 'confirm', variant: 'success' as const })
      actions.push({ label: 'Cancelar', action: 'cancel', variant: 'danger' as const })
    }
    if (order.status === 'confirmed') {
      actions.push({ label: 'En preparación', action: 'prepare', variant: 'success' as const })
    }
    if (order.status === 'preparing') {
      actions.push({ label: 'Listo', action: 'ready', variant: 'success' as const })
    }
    if (order.status === 'ready') {
      actions.push({ label: 'Despachar', action: 'dispatch', variant: 'success' as const })
    }
    if (order.status === 'in_transit') {
      actions.push({ label: 'Confirmar entrega', action: 'deliver_modal', variant: 'success' as const })
    }
    if (['unpaid', 'partial'].includes(order.payment_status) && !['cancelled', 'pending'].includes(order.status)) {
      actions.push({ label: 'Registrar cobro', action: 'payment_modal', variant: 'default' as const })
    }
    return actions
  }

  return (
    <AppShell>
      <PageHeader
        title="Pedidos"
        description={`${pagination.total} pedidos`}
        action={
          <>
            <Button variant="secondary" onClick={openPickingList}>
              <ClipboardList size={15} /> <span className="hidden sm:inline">Lista de carga</span>
            </Button>
            <Button onClick={() => setNewOrderModal(true)}>
              <Plus size={15} /> Nuevo pedido
            </Button>
          </>
        }
      />

      <div className="p-5 space-y-4">
        {/* Filtros */}
        <div className="flex flex-wrap gap-2 items-center">
          {([['', 'Todos'], ['pending', 'Pendientes'], ['confirmed', 'Confirmados'],
          ['preparing', 'En preparación'], ['ready', 'Listos'], ['in_transit', 'En camino'],
          ['delivered', 'Entregados']] as [string, string][]).map(([val, label]) => (
            <button key={val} onClick={() => setStatusFilter(val as OrderStatus | '')}
              className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors ${statusFilter === val
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--surface2)] text-[var(--text2)] hover:bg-[var(--surface3)]'
                }`}>
              {label}
            </button>
          ))}
          <div className="relative ml-auto">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar cliente..."
              className="pl-7 pr-3 py-1.5 text-xs rounded-full bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
        </div>

        {/* Tabla */}
        {loading ? <PageLoader /> : orders.length === 0 ? (
          <EmptyState icon={Package} title="Sin pedidos"
            description="Los vendedores pueden crear pedidos desde el botón 'Nuevo pedido'."
            action={<Button onClick={() => setNewOrderModal(true)}><Plus size={15} />Nuevo pedido</Button>}
          />
        ) : (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)]">Cliente</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden md:table-cell">Vendedor</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden lg:table-cell">Depósito</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-[var(--text3)]">Estado</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-[var(--text3)]">Pago</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)]">Total</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden sm:table-cell">Fecha</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {orders.map(order => {
                  const actions = getActions(order)
                  return (
                    <tr key={order.id}
                      onClick={() => openDetail(order.id)}
                      className="hover:bg-[var(--surface2)] transition-colors cursor-pointer group">
                      <td className="px-4 py-3">
                        <p className="font-medium text-[var(--text)]">{order.customer_name}</p>
                        {order.customer_address && (
                          <p className="text-xs text-[var(--text3)] truncate max-w-[160px]">{order.customer_address}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[var(--text2)] hidden md:table-cell">{order.seller_name ?? '—'}</td>
                      <td className="px-4 py-3 text-[var(--text2)] hidden lg:table-cell">{order.warehouse_name ?? '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={STATUS_VARIANTS[order.status]}>{STATUS_LABELS[order.status]}</Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={
                          order.payment_status === 'paid' ? 'success' :
                            order.payment_status === 'partial' ? 'warning' :
                              order.payment_status === 'credit' ? 'default' : 'danger'
                        }>
                          {PAYMENT_STATUS_LABELS[order.payment_status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right mono font-semibold text-[var(--text)]">
                        {formatCurrency(order.total)}
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--text3)] hidden sm:table-cell">
                        {formatDateTime(order.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={e => e.stopPropagation()}>
                          {actions.slice(0, 1).map(a => (
                            <button key={a.action}
                              onClick={() => {
                                if (a.action === 'deliver_modal') {
                                  setDeliverOrderId(order.id); setDeliverModal(true)
                                } else if (a.action === 'payment_modal') {
                                  setPaymentOrderId(order.id); setPaymentModal(true)
                                } else {
                                  handleAction(order.id, a.action)
                                }
                              }}
                              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${a.variant === 'success' ? 'bg-[var(--accent-subtle)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white' :
                                a.variant === 'danger' ? 'bg-[var(--danger-subtle)] text-[var(--danger)]' :
                                  'bg-[var(--surface2)] text-[var(--text2)]'
                                }`}>
                              {a.label}
                            </button>
                          ))}
                          <ChevronRight size={14} className="text-[var(--text3)]" />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <Pagination pagination={pagination} onPageChange={handlePageChange} />
          </div>
        )}
      </div>

      {/* ── Modal detalle ── */}
      <Modal open={detailModal} onClose={() => { setDetailModal(false); setDetail(null) }}
        title="Detalle del pedido" size="lg">
        {loadingDetail ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
          </div>
        ) : detail && (
          <div className="space-y-4">
            {/* Status timeline */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {(['pending', 'confirmed', 'preparing', 'ready', 'in_transit', 'delivered'] as OrderStatus[]).map((s, i) => {
                const statuses: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'in_transit', 'delivered', 'invoiced', 'cancelled']
                const currentIdx = statuses.indexOf(detail.status)
                const stepIdx = statuses.indexOf(s)
                const done = stepIdx < currentIdx
                const current = s === detail.status
                return (
                  <div key={s} className="flex items-center gap-1 flex-shrink-0">
                    <div className={`px-2 py-1 rounded text-xs font-medium ${current ? 'bg-[var(--accent)] text-white' :
                      done ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' :
                        'bg-[var(--surface2)] text-[var(--text3)]'
                      }`}>
                      {STATUS_LABELS[s]}
                    </div>
                    {i < 5 && <ChevronRight size={12} className="text-[var(--text3)] flex-shrink-0" />}
                  </div>
                )
              })}
            </div>

            {/* Info cliente + pago */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[var(--surface2)] rounded-[var(--radius-md)] p-3 space-y-1">
                <p className="text-xs text-[var(--text3)]">Cliente</p>
                <p className="text-sm font-semibold text-[var(--text)]">{detail.customer_name}</p>
                {detail.customer_address && <p className="text-xs text-[var(--text2)]">{detail.customer_address}</p>}
                {detail.customer_phone && <p className="text-xs text-[var(--text2)]">{detail.customer_phone}</p>}
              </div>
              <div className="bg-[var(--surface2)] rounded-[var(--radius-md)] p-3 space-y-1">
                <p className="text-xs text-[var(--text3)]">Pago</p>
                <div className="flex items-center gap-2">
                  <Badge variant={
                    detail.payment_status === 'paid' ? 'success' :
                      detail.payment_status === 'partial' ? 'warning' :
                        detail.payment_status === 'credit' ? 'default' : 'danger'
                  }>
                    {PAYMENT_STATUS_LABELS[detail.payment_status]}
                  </Badge>
                </div>
                {Number(detail.paid_amount) > 0 && (
                  <p className="text-xs text-[var(--text2)]">
                    Cobrado: <span className="font-semibold text-[var(--accent)]">{formatCurrency(detail.paid_amount)}</span>
                    {' '}de {formatCurrency(detail.total)}
                  </p>
                )}
                {detail.payment_method && (
                  <p className="text-xs text-[var(--text3)]">{PAYMENT_METHODS.find(m => m.value === detail.payment_method)?.label}</p>
                )}
              </div>
            </div>

            {/* Info adicional */}
            <div className="flex gap-2 flex-wrap text-xs text-[var(--text3)]">
              {detail.seller_name && <span>Vendedor: <strong>{detail.seller_name}</strong></span>}
              {detail.warehouse_name && <span>· Depósito: <strong>{detail.warehouse_name}</strong></span>}
              <span>· {formatDateTime(detail.created_at)}</span>
            </div>

            {/* Productos */}
            {/* Banner de stock insuficiente */}
            {Object.keys(stockIssues).length > 0 && (
              <div className="flex items-start gap-2 px-3 py-2.5 bg-[var(--danger-subtle)] border border-[var(--danger)] rounded-[var(--radius-md)] text-xs text-[var(--danger)]">
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                <span>
                  <strong>{Object.keys(stockIssues).length} producto(s)</strong> con stock insuficiente. Cambiá el depósito o ajustá el stock antes de confirmar.
                </span>
              </div>
            )}

            {/* Tabla de ítems */}
            <div className="bg-[var(--surface2)] rounded-[var(--radius-lg)] overflow-hidden mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left px-3 py-2 text-xs font-medium text-[var(--text3)]">Producto</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-[var(--text3)]">Cant.</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-[var(--text3)]">Precio</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-[var(--text3)]">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {detail.order_items?.map(item => {
                    const pid = (item as unknown as { product_id: string }).product_id
                    const issue = stockIssues[item.product_id]   // ← buscar por product_id
                    return (
                      <tr key={item.id} className={issue ? 'bg-[var(--danger-subtle)]' : ''}>
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-[var(--text)]">{item.products.name}</p>
                          {issue && (
                            <p className="text-xs text-[var(--danger)] font-medium mt-0.5">
                              ⚠ Disponible: {issue.available} — Necesita: {issue.needed}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right mono text-[var(--text2)]">{item.quantity} {item.products.unit}</td>
                        <td className="px-3 py-2.5 text-right mono text-[var(--text2)]">{formatCurrency(item.unit_price)}</td>
                        <td className="px-3 py-2.5 text-right mono font-semibold text-[var(--text)]">{formatCurrency(item.subtotal)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  {detail.discount > 0 && (
                    <tr className="border-t border-[var(--border)]">
                      <td colSpan={3} className="px-3 py-2 text-sm text-[var(--text3)]">Descuento</td>
                      <td className="px-3 py-2 text-right mono text-[var(--danger)]">− {formatCurrency(detail.discount)}</td>
                    </tr>
                  )}
                  <tr className="border-t-2 border-[var(--border)]">
                    <td colSpan={3} className="px-3 py-2.5 text-sm font-semibold">Total</td>
                    <td className="px-3 py-2.5 text-right mono font-bold text-[var(--accent)]">{formatCurrency(detail.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {detail.notes && (
              <p className="text-sm text-[var(--text2)] italic px-1">"{detail.notes}"</p>
            )}

            {/* Cambiar depósito — solo en pending */}
            {detail.status === 'pending' && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-[var(--surface2)] rounded-[var(--radius-md)]">
                <span className="text-xs text-[var(--text3)] flex-shrink-0">Depósito:</span>
                <select
                  defaultValue={detail.warehouse_id ?? ''}
                  onChange={async e => {
                    try {
                      await api.patch(`/api/orders/${detail.id}`, { warehouse_id: e.target.value || null })
                      const updated = await api.get<OrderDetail>(`/api/orders/${detail.id}`)
                      setDetail(updated)
                      fetchOrders()
                      toast.success('Depósito actualizado')
                    } catch (err: unknown) {
                      toast.error(err instanceof Error ? err.message : 'Error al cambiar depósito')
                    }
                  }}
                  className="flex-1 text-sm bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] px-2 py-1.5 text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                >
                  <option value="">Sin depósito</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Acciones del detalle */}
            {detail.status !== 'delivered' && detail.status !== 'invoiced' && detail.status !== 'cancelled' && (
              <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-4 border-t border-[var(--border)]">
                <div className="flex justify-end gap-2">                {getActions(detail).map(a => (
                  <button key={a.action}
                    onClick={() => {
                      if (a.action === 'deliver_modal') {
                        setDeliverOrderId(detail.id); setDeliverModal(true)
                      } else if (a.action === 'payment_modal') {
                        setPaymentOrderId(detail.id); setPaymentModal(true)
                      } else {
                        handleAction(detail.id, a.action)
                      }
                    }}
                    className={`px-4 py-2 text-sm rounded-[var(--radius-md)] font-medium transition-colors ${a.variant === 'success' ? 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]' :
                      a.variant === 'danger' ? 'bg-[var(--danger-subtle)] text-[var(--danger)] border border-[var(--danger)]' :
                        'bg-[var(--surface2)] text-[var(--text2)] border border-[var(--border)]'
                      }`}>
                    {a.label}
                  </button>
                ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── Modal nuevo pedido ── */}
      <Modal open={newOrderModal} onClose={() => { resetOrderForm(); setNewOrderModal(false) }}
        title="Nuevo pedido" size="lg">
        <div className="space-y-4">

          {/* Datos del cliente */}
          <div className="grid grid-cols-1 gap-3">
            {/* Cliente */}
            <div className="sm:col-span-3">
              {selectedCustomerId ? (
                <div className="flex items-center justify-between px-3 py-2.5 bg-[var(--accent-subtle)] border border-[var(--accent)] rounded-[var(--radius-md)]">
                  <div>
                    <p className="text-xs font-semibold text-[var(--accent)]">{customerName}</p>
                    <p className="text-xs text-[var(--text3)]">Cliente existente vinculado</p>
                  </div>
                  <button
                    onClick={() => { setSelectedCustomerId(null); setCustomerName(''); setCustomerQuery('') }}
                    className="text-xs text-[var(--text3)] hover:text-[var(--danger)]">✕</button>
                </div>
              ) : (
                <div className="relative">
                  <label className="text-sm font-medium text-[var(--text2)] block mb-1">Cliente *</label>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                    {searchingCustomers && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
                    )}
                    <input
                      value={customerQuery || customerName}
                      onChange={e => {
                        setCustomerQuery(e.target.value)
                        setCustomerName(e.target.value)
                      }}
                      placeholder="Buscar cliente existente o escribir nombre nuevo..."
                      className="w-full pl-9 pr-4 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  {customerResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-lg z-20 overflow-hidden">
                      {customerResults.map(c => (
                        <button key={c.id}
                          onClick={() => {
                            setSelectedCustomerId(c.id)
                            setCustomerName(c.full_name)
                            setCustomerQuery('')
                            setCustomerResults([])
                          }}
                          className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-[var(--surface2)] transition-colors text-left border-b border-[var(--border)] last:border-0">
                          <div>
                            <p className="text-sm font-medium text-[var(--text)]">{c.full_name}</p>
                            {c.phone && <p className="text-xs text-[var(--text3)]">{c.phone}</p>}
                          </div>
                          {Number(c.current_balance) > 0 && (
                            <span className="text-xs mono text-[var(--danger)]">{formatCurrency(c.current_balance)}</span>
                          )}
                        </button>
                      ))}
                      {/* Opción de crear como nuevo sin vincular */}
                      <div className="px-3 py-2 bg-[var(--surface2)] border-t border-[var(--border)]">
                        <p className="text-xs text-[var(--text3)]">
                          O continuá escribiendo para crear como cliente nuevo sin vincular
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Depósito + lista de precio */}
          <div className="grid grid-cols-2 gap-3">
            <Select label="Depósito"
              options={warehouses.map(w => ({ value: w.id, label: w.name }))}
              value={warehouseId} onChange={e => setWarehouseId(e.target.value)} />
            <Select label="Lista de precio"
              options={priceLists.map(pl => ({ value: pl.id, label: `${pl.name} (+${pl.margin_pct}%)` }))}
              value={priceListId} onChange={e => setPriceListId(e.target.value)} />
          </div>

          {/* Buscador de productos */}
          <div>
            <label className="text-sm font-medium text-[var(--text2)] block mb-1">Productos</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
              {searchingProducts && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
              )}
              <input value={productQuery} onChange={e => setProductQuery(e.target.value)}
                placeholder="Buscar producto por nombre o código..."
                className="w-full pl-9 pr-4 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
            {productResults.length > 0 && (
              <div className="mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] overflow-hidden shadow-lg">
                {productResults.map(p => (
                  <button key={p.id} onClick={() => addToCart(p)}
                    className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-[var(--surface2)] transition-colors text-left border-b border-[var(--border)] last:border-0">
                    <div>
                      <p className="text-sm font-medium text-[var(--text)]">{p.name}</p>
                      {p.barcode && <p className="text-xs mono text-[var(--text3)]">{p.barcode}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-xs mono font-medium text-[var(--accent)]">{formatCurrency(p.sell_price)}</p>
                      <p className="text-xs text-[var(--text3)]">Stock: {p.stock_current}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Carrito del pedido */}
          {cart.length > 0 && (
            <div className="bg-[var(--surface2)] rounded-[var(--radius-lg)] overflow-hidden mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left px-3 py-2 text-xs font-medium text-[var(--text3)]">Producto</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-[var(--text3)]">Cant.</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-[var(--text3)]">Precio</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-[var(--text3)]">Subtotal</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {cart.map(item => (
                    <tr key={item.product.id}>
                      <td className="px-3 py-2 font-medium text-[var(--text)]">{item.product.name}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => updateCartQty(item.product.id, -1)}
                            className="p-1 rounded hover:bg-[var(--surface2)] hover:text-[var(--accent)] transition-colors">
                            <Minus size={11} />
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity || ''}
                            onChange={e => setCartQty(item.product.id, e.target.value)}
                            onBlur={() => normalizeCartQty(item.product.id)}
                            onFocus={e => e.target.select()}
                            className="w-12 text-sm mono text-center bg-[var(--surface)] border border-[var(--border)] rounded px-1 py-0.5 focus:outline-none focus:border-[var(--accent)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button onClick={() => updateCartQty(item.product.id, 1)}
                            className="p-1 rounded hover:bg-[var(--surface2)] hover:text-[var(--accent)] transition-colors">
                            <Plus size={11} />
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input type="number" min="0" step="0.01" value={item.unit_price}
                          onChange={e => updateCartPrice(item.product.id, e.target.value)}
                          className="w-20 text-xs mono text-right bg-[var(--surface)] border border-[var(--border)] rounded px-1.5 py-1 focus:outline-none focus:border-[var(--accent)]"
                        />
                      </td>
                      <td className="px-3 py-2 text-right mono text-sm font-semibold">
                        {formatCurrency(item.unit_price * item.quantity)}
                      </td>
                      <td className="px-3 py-2">
                        <button onClick={() => removeFromCart(item.product.id)}
                          className="text-[var(--text3)] hover:text-[var(--danger)]">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-3 py-2 border-t border-[var(--border)] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--text3)]">Descuento:</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={orderDiscount}
                      onChange={e => setOrderDiscount(e.target.value)}
                      onFocus={e => e.target.select()}
                      placeholder="0"
                      className="w-16 text-xs mono text-right bg-[var(--surface)] border border-[var(--border)] rounded px-1.5 py-1 focus:outline-none focus:border-[var(--accent)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-xs text-[var(--text3)]">%</span>
                  </div>
                  {cartDiscount > 0 && (
                    <span className="text-xs text-[var(--danger)] mono">−{formatCurrency(cartDiscount)}</span>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold mono text-[var(--accent)]">{formatCurrency(cartTotal)}</p>
                </div>
              </div>
            </div>
          )}

          <Input label="Notas" value={orderNotes}
            onChange={e => setOrderNotes(e.target.value)}
            placeholder="Instrucciones de entrega, observaciones..." />

          {/* ¿Ya cobró? */}
          <div className="border border-[var(--border)] rounded-[var(--radius-md)] p-3 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={payAlreadyCollected}
                onChange={e => setPayAlreadyCollected(e.target.checked)}
                className="w-4 h-4 accent-[var(--accent)]" />
              <span className="text-sm font-medium text-[var(--text)]">
                Ya cobré este pedido al cliente
              </span>
            </label>
            {payAlreadyCollected && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <Select label="Método de cobro"
                  options={PAYMENT_METHODS}
                  value={collectedMethod}
                  onChange={e => setCollectedMethod(e.target.value as PaymentMethod)} />
                <Input label="Monto cobrado" type="number" min="0"
                  value={collectedAmount} placeholder={String(cartTotal)}
                  onChange={e => setCollectedAmount(e.target.value)}
                  hint="Dejá vacío para el total completo" />
              </div>
            )}
          </div>

          <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-2 border-t border-[var(--border)]">
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { resetOrderForm(); setNewOrderModal(false) }} disabled={savingOrder}>
                Cancelar
              </Button>
              <Button onClick={handleCreateOrder} loading={savingOrder} disabled={cart.length === 0}>
                Crear pedido {cart.length > 0 ? `· ${formatCurrency(cartTotal)}` : ''}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Modal confirmar entrega ── */}
      <Modal open={deliverModal} onClose={() => { setDeliverModal(false); setDeliverOrderId(null) }}
        title="Confirmar entrega" size="sm">
        <div className="space-y-4">
          <div className="px-3 py-2.5 bg-[var(--accent-subtle)] border border-[var(--accent)] rounded-[var(--radius-md)] text-xs text-[var(--accent)]">
            Se generará una venta automáticamente al confirmar la entrega.
          </div>
          <Select label="Método de cobro *"
            options={PAYMENT_METHODS}
            value={deliverMethod}
            onChange={e => setDeliverMethod(e.target.value as PaymentMethod)} />
          <Input label="Monto cobrado" type="number" min="0"
            value={deliverAmount} placeholder="0 si no cobró en la entrega"
            onChange={e => setDeliverAmount(e.target.value)} />
          <Input label="Notas de entrega" value={deliverNotes}
            onChange={e => setDeliverNotes(e.target.value)}
            placeholder="Observaciones de la entrega (opcional)" />
          <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-4 border-t border-[var(--border)]">
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setDeliverModal(false); setDeliverOrderId(null) }} disabled={delivering}>
                Cancelar
              </Button>
              <Button onClick={handleDeliver} loading={delivering}>
                Confirmar entrega
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Modal registrar cobro ── */}
      <Modal open={paymentModal} onClose={() => { setPaymentModal(false); setPaymentOrderId(null) }}
        title="Registrar cobro" size="sm">
        <div className="space-y-4">
          <Select label="Método de cobro *"
            options={PAYMENT_METHODS}
            value={paymentMethod}
            onChange={e => setPaymentMethod(e.target.value as PaymentMethod)} />
          <Input label="Monto *" type="number" min="0"
            value={paymentAmount} placeholder="0.00"
            onChange={e => setPaymentAmount(e.target.value)} />
          <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-4 border-t border-[var(--border)]">
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setPaymentModal(false); setPaymentOrderId(null) }} disabled={registeringPayment}>
                Cancelar
              </Button>
              <Button onClick={handleRegisterPayment} loading={registeringPayment} disabled={!paymentAmount}>
                Registrar cobro
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Modal: Lista de carga ── */}
      <Modal
        open={pickingModal}
        onClose={() => setPickingModal(false)}
        title="Lista de carga"
        size="lg"
      >
        {loadingPicking ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : pickingItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-[var(--text3)]">
            <ClipboardList size={32} className="opacity-40" />
            <p className="text-sm">No hay pedidos confirmados pendientes de carga</p>
          </div>
        ) : (() => {
          const pending = pickingItems.filter(i => !checkedItems.has(i.product_id))
          const done    = pickingItems.filter(i =>  checkedItems.has(i.product_id))
          const sorted  = [...pending, ...done]
          return (
            <div className="space-y-3">
              {/* Resumen + progreso */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[var(--text3)]">
                    <span className="font-semibold text-[var(--text)] mono">{pickingItems.length}</span> productos ·{' '}
                    <span className="font-semibold text-[var(--text)] mono">
                      {new Set(pickingItems.flatMap(i => i.orders.map(o => o.id))).size}
                    </span>{' '}pedidos
                  </p>
                  {checkedItems.size > 0 && (
                    <p className="text-xs text-[var(--accent)] font-medium mt-0.5">
                      {checkedItems.size} de {pickingItems.length} cargados
                    </p>
                  )}
                </div>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 text-xs text-[var(--text3)] hover:text-[var(--text)] transition-colors"
                >
                  <Printer size={13} /> Imprimir
                </button>
              </div>

              {/* Barra de progreso */}
              {checkedItems.size > 0 && (
                <div className="h-1.5 bg-[var(--surface2)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent)] rounded-full transition-all duration-300"
                    style={{ width: `${(checkedItems.size / pickingItems.length) * 100}%` }}
                  />
                </div>
              )}

              {/* Lista de productos */}
              <div className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
                {sorted.map((item, idx) => {
                  const checked = checkedItems.has(item.product_id)
                  return (
                    <button
                      key={item.product_id}
                      onClick={() => togglePickingCheck(item.product_id)}
                      className={`w-full px-4 py-3 text-left transition-colors ${checked ? 'bg-[var(--accent-subtle)]' : 'hover:bg-[var(--surface2)]'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          {/* Checkbox visual */}
                          <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${checked ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--border)]'}`}>
                            {checked && (
                              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className={`font-semibold truncate transition-colors ${checked ? 'text-[var(--text3)] line-through' : 'text-[var(--text)]'}`}>
                              {!checked && <span className="text-xs mono text-[var(--text3)] mr-1.5">{idx + 1}.</span>}
                              {item.name}
                            </p>
                            {item.barcode && !checked && <p className="text-xs mono text-[var(--text3)]">{item.barcode}</p>}
                            {!checked && (
                              <div className="mt-1.5 space-y-0.5">
                                {item.orders.map(o => (
                                  <div key={o.id} className="flex items-center gap-2 text-xs text-[var(--text2)]">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--border)] flex-shrink-0" />
                                    <span className="truncate">{o.customer_name}</span>
                                    <span className="mono text-[var(--text3)] flex-shrink-0">× {o.quantity} {item.unit}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <p className={`text-xl font-bold mono transition-colors ${checked ? 'text-[var(--text3)]' : 'text-[var(--accent)]'}`}>
                            {item.total_qty}
                          </p>
                          <p className="text-xs text-[var(--text3)]">{item.unit}</p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>

              {checkedItems.size === pickingItems.length && pickingItems.length > 0 && (
                <p className="text-center text-sm font-semibold text-[var(--accent)] py-2">
                  ✓ Todo cargado al camión
                </p>
              )}
            </div>
          )
        })()}
      </Modal>
    </AppShell>
  )
}
