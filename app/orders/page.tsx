'use client'
import { useEffect, useState, useCallback, useRef, Suspense, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { HelpBanner } from '@/components/ui/HelpBanner'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoader } from '@/components/ui/Spinner'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { Pagination } from '@/components/ui/Pagination'
import { api } from '@/lib/api'
import { formatCurrency, formatDateTime, cn } from '@/lib/utils'
import type { Product, Pagination as PaginationType } from '@/types'
import type { PriceList } from '@/app/price-lists/page'
import {
  Plus, Search, Package, CheckCircle, Clock, Truck,
  X, Minus, Trash2, ChevronRight, DollarSign, AlertCircle,
  ClipboardList, Printer, Receipt, FileText, RefreshCw, Copy,
} from 'lucide-react'
import { SaleDetailModal } from '@/components/modules/SaleDetailModal'
import { ConvertInvoiceModal } from '@/components/modules/ConvertInvoiceModal'
import { useAuth } from '@/hooks/useAuth'
import { usePOSSync } from '@/hooks/usePOSSync'
import { useDebounce } from '@/hooks/useDebounce'
import { useCollapseSidebar } from '@/contexts/SidePanelContext'
import { searchProductsLocal, searchCustomersLocal } from '@/lib/pos-cache'
import { printDocument, partiesGrid, totalsBox, highlightBox, fmtARS } from '@/lib/printDocument'
import { queueOrder, getPendingOrdersCount, syncPendingOrders } from '@/lib/orders-queue'
import { isNetworkError } from '@/lib/sales-queue'
import { toast } from 'sonner'

// ─── Tipos ────────────────────────────────────────────────
type OrderStatus = 'pending' | 'confirmed' | 'partially_delivered' | 'delivered' | 'cancelled'
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
  pickup_mode?: boolean
  created_at: string
  confirmed_at?: string
  dispatched_at?: string
  delivered_at?: string
}

interface OrderDetail extends OrderSummary {
  warehouse_id?: string
  price_list_id?: string
  invoice_id?: string
  sale_id?: string
  order_items: {
    id: string
    product_id: string
    product_name?: string
    quantity: number
    quantity_delivered?: number
    unit_price: number
    discount: number
    subtotal: number
    products: { name: string; barcode?: string; unit: string } | null
  }[]
  warehouses?: { name: string }
  users?: { full_name: string }
  price_lists?: { name: string; margin_pct: number } | null
  customers?: { full_name: string; current_balance: number; document?: string; phone?: string }
  invoices?: { id: string; invoice_type: string; numero: number; afip_status: string } | null
}

interface OrderDelivery {
  id: string
  delivered_at: string
  notes?: string | null
  user_id?: string | null
  order_delivery_items: {
    id: string
    order_item_id: string
    product_id: string
    product_name?: string | null
    quantity: number
  }[]
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
  partially_delivered: 'Retiro parcial',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

const STATUS_VARIANTS: Record<OrderStatus, 'default' | 'success' | 'warning' | 'danger'> = {
  pending: 'warning',
  confirmed: 'default',
  partially_delivered: 'warning',
  delivered: 'success',
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
]

// ─── Componente principal ─────────────────────────────────
function OrdersPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user: authUser } = useAuth()
  const stockEnabled      = authUser?.business?.stock_enabled ?? false
  const sellerWarehouseId = authUser?.role === 'seller' ? (authUser.warehouse_id ?? null) : null
  // El form de nuevo pedido necesita el catálogo local (productos/promos/precios).
  // Solo sincronizamos cuando se abre, no en cada carga de la lista de pedidos.
  const [newOrderModal, setNewOrderModal] = useState(false)
  const [isMac, setIsMac] = useState(true)
  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad|iPod/.test(navigator.platform) || /Mac/.test(navigator.userAgent))
  }, [])
  const { cacheReady, syncing: cacheSyncing, forceSync } = usePOSSync(null, newOrderModal)

  // Lista
  const [orders, setOrders] = useState<OrderSummary[]>([])
  const [pagination, setPagination] = useState<PaginationType>({ total: 0, page: 1, limit: 10, pages: 0 })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('')
  const [search, setSearch] = useState('')
  const [idSearch, setIdSearch] = useState('')

  // Detalle
  const [detailModal, setDetailModal] = useState(false)
  const [detail, setDetail] = useState<OrderDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [deliveries, setDeliveries] = useState<OrderDelivery[]>([])

  // Nuevo pedido
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [priceLists, setPriceLists] = useState<PriceList[]>([])
  // Map<product_id, Map<price_list_id, price>> — cargado una vez
  const priceOverridesRef = useRef<Map<string, Map<string, number>>>(new Map())

  // Form nuevo pedido
  const [customerName, setCustomerName] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [priceListId, setPriceListId] = useState('')
  const [orderNotes, setOrderNotes] = useState('')
  const [orderDiscount, setOrderDiscount] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [productQuery, setProductQuery] = useState('')
  const [productResults, setProductResults] = useState<Product[]>([])
  const [productHighlight, setProductHighlight] = useState(0)
  const [searchingProducts, setSearchingProducts] = useState(false)
  const [payAlreadyCollected, setPayAlreadyCollected] = useState(false)
  const [collectedMethod, setCollectedMethod] = useState<PaymentMethod>('efectivo')
  const [collectedAmount, setCollectedAmount] = useState('')
  const [pickupMode, setPickupMode] = useState(false)
  const [savingOrder, setSavingOrder] = useState(false)

  // Modo retiro: retiros parciales (corralón). El cobro va por el flujo de pago
  // existente (/payment); la deuda ya se carga a la CC al crear el pedido.
  const [withdrawModal, setWithdrawModal] = useState(false)
  const [withdrawOrderId, setWithdrawOrderId] = useState<string | null>(null)
  const [withdrawQty, setWithdrawQty] = useState<Record<string, string>>({})
  const [withdrawNotes, setWithdrawNotes] = useState('')
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawSearch, setWithdrawSearch] = useState('')
  const [withdrawShowDelivered, setWithdrawShowDelivered] = useState(false)
  const [withdrawShowNote, setWithdrawShowNote] = useState(false)

  // Entrega
  const [deliverModal, setDeliverModal] = useState(false)
  const [deliverOrderId, setDeliverOrderId] = useState<string | null>(null)
  const [deliverMethod, setDeliverMethod] = useState<PaymentMethod>('efectivo')
  const [deliverAmount, setDeliverAmount] = useState('')
  const [deliverNotes, setDeliverNotes] = useState('')
  const [delivering, setDelivering] = useState(false)
  const [saleDetailId, setSaleDetailId] = useState<string | null>(null)
  const [autoConvertSale, setAutoConvertSale] = useState(false)
  const [convertInvoiceId, setConvertInvoiceId] = useState<string | null>(null)
  const [detailInvoice, setDetailInvoice] = useState<{ id: string; invoice_type: string; numero: number } | null>(null)

  // Confirmación cancelación
  const [cancelConfirmOrder, setCancelConfirmOrder] = useState<{ id: string; customer_name: string } | null>(null)
  // Confirmación de "Confirmar pedido"
  const [confirmOrder, setConfirmOrder] = useState<{ id: string; customer_name: string } | null>(null)

  // Cobro parcial
  const [paymentModal, setPaymentModal] = useState(false)
  const [paymentOrderId, setPaymentOrderId] = useState<string | null>(null)
  const [paymentOrderPending, setPaymentOrderPending] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [registeringPayment, setRegisteringPayment] = useState(false)

  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState<{ id: string; full_name: string; phone?: string; document?: string; current_balance: number; credit_limit: number }[]>([])
  const [searchingCustomers, setSearchingCustomers] = useState(false)
  const [customerHighlight, setCustomerHighlight] = useState(0)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [selectedCustomerBalance, setSelectedCustomerBalance] = useState<number>(0)
  const [selectedCustomerCreditLimit, setSelectedCustomerCreditLimit] = useState<number>(0)
  const [quickCustomerModal, setQuickCustomerModal] = useState(false)
  const [qcForm, setQcForm] = useState({ full_name: '', document: '', phone: '', credit_limit: '' })
  const [qcSaving, setQcSaving] = useState(false)
  const customerSearchRequestRef = useRef(0)
  const draftLoadedRef = useRef(false)

  // Pedidos offline pendientes de sincronizar
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0)

  // Lista de carga (picking)
  interface PickingItem {
    product_id: string; name: string; barcode?: string; unit: string; total_qty: number
    orders: { id: string; customer_name: string; status: string; quantity: number; customer_address?: string; customer_locality?: string; customer_province?: string }[]
  }
  const [pickingModal, setPickingModal] = useState(false)
  const [byClientModal, setByClientModal] = useState(false)
  const [pickingItems, setPickingItems] = useState<PickingItem[]>([])
  const [loadingPicking, setLoadingPicking] = useState(false)
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set())
  const [pickingWarehouseId, setPickingWarehouseId] = useState('')
  const [remitoFormOpen, setRemitoFormOpen] = useState(false)
  const [remitoTransport, setRemitoTransport] = useState<{ patente: string; conductor: string; dni: string }>(() => {
    if (typeof window === 'undefined') return { patente: '', conductor: '', dni: '' }
    try {
      const s = localStorage.getItem('stockos_remito_transport')
      return s ? JSON.parse(s) : { patente: '', conductor: '', dni: '' }
    } catch { return { patente: '', conductor: '', dni: '' } }
  })

  const fetchPickingList = async (wid: string) => {
    setLoadingPicking(true)
    setCheckedItems(new Set())
    try {
      const params = wid ? { warehouse_id: wid } : {}
      const data = await api.get<PickingItem[]>('/api/orders/picking-list', params)
      setPickingItems(data)
    } catch { setPickingItems([]) }
    finally { setLoadingPicking(false) }
  }

  const openPickingList = () => {
    const defWh = warehouses.find(w => w.is_default)
    const wid = defWh?.id ?? warehouses[0]?.id ?? ''
    setPickingWarehouseId(wid)
    setPickingModal(true)
    fetchPickingList(wid)
  }

  const openByClientList = () => {
    const defWh = warehouses.find(w => w.is_default)
    const wid = defWh?.id ?? warehouses[0]?.id ?? ''
    setPickingWarehouseId(wid)
    setByClientModal(true)
    fetchPickingList(wid)
  }

  const printRemitoTraslado = (transport: { patente: string; conductor: string; dni: string }) => {
    localStorage.setItem('stockos_remito_transport', JSON.stringify(transport))
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const dateStr = now.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}hs`
    const docNumber = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
    const biz = authUser?.business
    const totalUnits = pickingItems.reduce((s, i) => s + i.total_qty, 0)

    // Unique orders → grouped by customer
    const uniqueOrders = new Map<string, { customer_name: string; customer_address?: string; customer_locality?: string; customer_province?: string }>()
    for (const item of pickingItems) {
      for (const o of item.orders) {
        if (!uniqueOrders.has(o.id)) {
          uniqueOrders.set(o.id, { customer_name: o.customer_name, customer_address: o.customer_address, customer_locality: o.customer_locality, customer_province: o.customer_province })
        }
      }
    }
    const customerRows = new Map<string, { address_line: string; order_ids: string[] }>()
    for (const [orderId, info] of uniqueOrders) {
      if (!customerRows.has(info.customer_name)) {
        const addr = [info.customer_address, info.customer_locality, info.customer_province].filter(Boolean).join(', ')
        customerRows.set(info.customer_name, { address_line: addr, order_ids: [] })
      }
      customerRows.get(info.customer_name)!.order_ids.push(orderId.slice(0, 8).toUpperCase())
    }
    const allOrderRefs = Array.from(uniqueOrders.keys()).map(id => id.slice(0, 8).toUpperCase()).join(' · ')

    const productRows = pickingItems.map((item, idx) =>
      `<tr>
        <td style="color:#ccc;width:22px">${idx + 1}</td>
        <td><strong>${item.name}</strong></td>
        <td style="font-size:10px;color:#666;line-height:1.7">${item.orders.map(o => `${o.customer_name} <span class="qty-tag">×${o.quantity}</span>`).join('<br>')}</td>
        <td class="r" style="font-size:14px;font-weight:700;color:#15803d;width:50px">${item.total_qty}</td>
        <td style="font-size:9.5px;color:#999;width:48px">${item.unit}</td>
      </tr>`
    ).join('')

    const destRows = Array.from(customerRows.entries()).map(([name, info]) =>
      `<tr>
        <td style="font-weight:600">${name}</td>
        <td style="font-size:10.5px;color:#666">${info.address_line || '<span style="color:#ccc">—</span>'}</td>
        <td style="font-size:10px;color:#999;white-space:nowrap">${info.order_ids.join(', ')}</td>
      </tr>`
    ).join('')

    const body = `
      <div class="section-title">Datos del traslado</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 28px">
        <div><span style="color:#888;font-size:10px">Origen: </span><strong style="font-size:10.5px">${biz?.address ?? '—'}</strong></div>
        <div><span style="color:#888;font-size:10px">Destino: </span><strong style="font-size:10.5px">Varios destinos según detalle</strong></div>
        <div><span style="color:#888;font-size:10px">Patente: </span><strong style="font-size:10.5px">${transport.patente || '—'}</strong></div>
        <div><span style="color:#888;font-size:10px">Conductor: </span><strong style="font-size:10.5px">${transport.conductor || '—'}</strong></div>
        <div></div>
        <div><span style="color:#888;font-size:10px">DNI: </span><strong style="font-size:10.5px">${transport.dni || '—'}</strong></div>
      </div>

      <div class="section-title">Mercadería a transportar</div>
      <table style="margin-top:0">
        <thead><tr>
          <th style="width:22px">#</th><th>Descripción</th><th>Pedidos</th>
          <th class="r" style="width:50px">Cant.</th><th>Unidad</th>
        </tr></thead>
        <tbody>${productRows}</tbody>
      </table>
      <div class="totals-bar">
        <span><span class="lbl">Productos:</span><span class="val">${pickingItems.length}</span></span>
        <span><span class="lbl">Total unidades:</span><span class="val">${totalUnits}</span></span>
      </div>

      <div class="section-title">Destinos</div>
      <table style="margin-top:0">
        <thead><tr><th>Cliente</th><th>Dirección</th><th>Pedido(s)</th></tr></thead>
        <tbody>${destRows}</tbody>
      </table>

      <div class="meta-line">Pedidos incluidos: ${allOrderRefs}</div>`

    printDocument({
      title: `Remito de Traslado ${docNumber}`,
      docLabel: 'Remito de traslado',
      letra: 'X',
      docNumber: `N° ${docNumber}`,
      docMeta: ['Pto. Venta 0001', `${dateStr} · ${timeStr}`],
      biz,
      bodyHtml: body,
      signatures: ['Firma y aclaración<br>Transportista', 'Firma y aclaración<br>Receptor', 'Sello y firma<br>Empresa'],
      footerNote: 'Documento no válido como factura',
    })
  }

  const printByClient = () => {
    const byCustomer: Record<string, { name: string; items: { product: string; barcode?: string; unit: string; qty: number }[] }> = {}
    pickingItems.forEach(item => {
      item.orders.forEach(o => {
        if (!byCustomer[o.customer_name]) byCustomer[o.customer_name] = { name: o.customer_name, items: [] }
        byCustomer[o.customer_name].items.push({ product: item.name, barcode: item.barcode, unit: item.unit, qty: o.quantity })
      })
    })
    const date = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const sections = Object.values(byCustomer).map(customer =>
      `<div style="margin-top:18px;page-break-inside:avoid">
        <div class="section-title" style="color:#15803d;border-bottom-color:#16a34a">${customer.name}</div>
        <table style="margin-top:0">
          <thead><tr><th>Producto</th><th class="r">Cantidad</th></tr></thead>
          <tbody>${customer.items.map(i =>
        `<tr>
              <td>${i.product}</td>
              <td class="r" style="font-size:14px;font-weight:700;color:#15803d;width:90px">${i.qty} <span style="font-size:10px;color:#888;font-weight:400">${i.unit}</span></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`
    ).join('')

    printDocument({
      title: 'Pedidos por cliente',
      docLabel: 'Pedidos por cliente',
      docMeta: [date, `${Object.keys(byCustomer).length} clientes · pedidos confirmados`],
      biz: authUser?.business,
      bodyHtml: sections,
    })
  }

  // lines: si se pasan, el remito lista esas cantidades (ej. un retiro parcial)
  // en vez del pedido completo.
  const printRemito = (
    d: OrderDetail,
    lines?: { name: string; barcode?: string; quantity: number; unit?: string }[],
    opts?: { date?: string; remitoId?: string },
  ) => {
    const date = opts?.date
      ? new Date(opts.date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const biz = authUser?.business
    const remitoLines = lines ?? (d.order_items ?? []).map(i => ({
      name: i.products?.name ?? i.product_name ?? '(producto eliminado)',
      barcode: i.products?.barcode,
      quantity: i.quantity,
      unit: i.products?.unit,
    }))
    const rows = remitoLines.map(i =>
      `<tr>
        <td>${i.name}</td>
        <td class="c">${i.quantity} ${i.unit ?? ''}</td>
      </tr>`
    ).join('')

    const body = `
      ${partiesGrid([
        {
          title: 'Destinatario',
          name: d.customer_name,
          rows: [
            d.customers?.document ? `DNI/CUIT: ${d.customers.document}` : '',
            d.customer_address ?? '',
            (d.customer_phone || d.customers?.phone) ? `Tel: ${d.customer_phone || d.customers?.phone}` : '',
          ],
        },
        {
          title: 'Detalle',
          rows: [
            d.warehouse_name ? `Depósito: ${d.warehouse_name}` : '',
            (d.seller_name || d.users?.full_name) ? `Vendedor: ${d.seller_name || d.users?.full_name}` : '',
            `Pedido: ${d.id.slice(0, 8).toUpperCase()}`,
          ],
        },
      ])}
      <table>
        <thead><tr><th>Producto</th><th class="c" style="width:160px">Cantidad</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${d.notes ? `<div class="note-line">Observaciones: ${d.notes}</div>` : ''}`

    printDocument({
      title: 'Remito',
      docLabel: 'Remito',
      docNumber: `N° ${(opts?.remitoId ?? d.id).slice(0, 8).toUpperCase()}`,
      docMeta: [date],
      biz,
      bodyHtml: body,
      signatures: ['Firma y aclaración<br>Transportista', 'Firma y aclaración<br>Receptor', 'Sello y firma<br>Empresa'],
      footerNote: 'Documento no válido como factura',
    })
  }

  const printOrder = (d: OrderDetail) => {
    const date = new Date(d.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const pending = Math.max(0, Number(d.total) - Number(d.paid_amount))
    const paymentLabel: Record<string, string> = {
      efectivo: 'Efectivo', transferencia: 'Transferencia', debito: 'Débito',
      credito: 'Crédito', qr: 'QR', cuenta_corriente: 'Cuenta corriente',
    }
    const rows = (d.order_items ?? []).map(i =>
      `<tr>
        <td>${i.products?.name ?? i.product_name ?? '(producto eliminado)'}${i.products?.barcode ? `<div class="item-sub">${i.products.barcode}</div>` : ''}</td>
        <td class="c">${i.quantity} ${i.products?.unit ?? ''}</td>
        <td class="r">${fmtARS(Number(i.unit_price))}</td>
        <td class="r">${fmtARS(Number(i.subtotal))}</td>
      </tr>`
    ).join('')

    const balance = d.customers?.current_balance
    const body = `
      ${partiesGrid([
        {
          title: 'Cliente',
          name: d.customer_name,
          rows: [
            d.customers?.document ? `DNI: ${d.customers.document}` : '',
            (d.customer_phone || d.customers?.phone) ? `Tel: ${d.customer_phone || d.customers?.phone}` : '',
            d.customer_address ?? '',
          ],
          rawHtml: balance !== undefined && balance !== null
            ? `<div style="margin-top:7px;font-size:11px;font-weight:700;color:${Number(balance) > 0 ? '#dc2626' : '#16a34a'}">Saldo en cuenta: ${fmtARS(Number(balance))}</div>`
            : undefined,
        },
        {
          title: 'Estado del pago',
          name: PAYMENT_STATUS_LABELS[d.payment_status as PaymentStatus] ?? d.payment_status,
          rows: [
            d.payment_method ? (paymentLabel[d.payment_method] ?? d.payment_method) : '',
            Number(d.paid_amount) > 0 ? `Cobrado: ${fmtARS(Number(d.paid_amount))}` : '',
          ],
        },
      ])}
      <table>
        <thead><tr><th>Producto</th><th class="c" style="width:80px">Cant.</th><th class="r" style="width:120px">Precio unit.</th><th class="r" style="width:130px">Subtotal</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${totalsBox([
        ...(Number(d.discount) > 0 ? [{ label: 'Descuento', value: `− ${fmtARS(Number(d.discount))}` }] : []),
        { label: 'Total', value: fmtARS(Number(d.total)), grand: true },
      ])}
      ${pending > 0 ? highlightBox({ tone: 'warn', label: 'Saldo pendiente de cobro de este pedido', amount: fmtARS(pending) }) : ''}
      ${d.notes ? `<div class="note-line">Notas: ${d.notes}</div>` : ''}
      ${(d.seller_name || d.users?.full_name) ? `<div class="meta-line">Vendedor: ${d.seller_name || d.users?.full_name}</div>` : ''}`

    printDocument({
      title: 'Pedido de venta',
      docLabel: 'Pedido de venta',
      docNumber: `N° ${d.id.slice(0, 8).toUpperCase()}`,
      docMeta: [date, d.warehouse_name ? `Depósito: ${d.warehouse_name}` : ''].filter(Boolean) as string[],
      biz: authUser?.business,
      bodyHtml: body,
      signatures: ['Firma cliente', 'Firma vendedor'],
    })
  }

  const togglePickingCheck = (productId: string) =>
    setCheckedItems(prev => {
      const next = new Set(prev)
      next.has(productId) ? next.delete(productId) : next.add(productId)
      return next
    })

  // Debounce de ambos buscadores → menos requests mientras se tipea
  const debouncedSearch = useDebounce(search.trim(), 300)
  const debouncedIdSearch = useDebounce(idSearch.trim(), 300)

  const statusFilterRef = useRef(statusFilter)
  const searchRef = useRef(debouncedSearch)
  const idSearchRef = useRef(debouncedIdSearch)
  const pageRef = useRef(page)
  useEffect(() => { statusFilterRef.current = statusFilter }, [statusFilter])
  useEffect(() => { searchRef.current = debouncedSearch }, [debouncedSearch])
  useEffect(() => { idSearchRef.current = debouncedIdSearch }, [debouncedIdSearch])

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number | undefined> = { page: pageRef.current, limit: 10 }
      if (statusFilterRef.current) params.status = statusFilterRef.current
      // El N° de pedido se busca en la base (prefijo del UUID), no solo en la
      // página cargada → permite ir directo a un pedido viejo de cualquier página.
      if (idSearchRef.current) params.order_number = idSearchRef.current
      else if (searchRef.current) params.search = searchRef.current
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
  }, [statusFilter, debouncedSearch, debouncedIdSearch, fetchOrders])

  const handlePageChange = useCallback((newPage: number) => {
    pageRef.current = newPage
    setPage(newPage)
    fetchOrders()
  }, [fetchOrders])

  // Sincronizar pedidos offline al recuperar la conexión (y al montar)
  useEffect(() => {
    const handleOnline = () => {
      syncPendingOrders()
        .then(({ synced, failed }) => {
          if (synced > 0) {
            toast.success(`${synced} pedido${synced > 1 ? 's' : ''} sincronizado${synced > 1 ? 's' : ''}`)
            fetchOrders()
          }
          if (failed > 0) toast.error(`${failed} pedido${failed > 1 ? 's' : ''} no se pudieron sincronizar`)
          getPendingOrdersCount().then(setPendingOrdersCount).catch(() => {})
        })
        .catch(() => {})
    }
    window.addEventListener('online', handleOnline)
    getPendingOrdersCount().then(setPendingOrdersCount).catch(() => {})
    handleOnline()
    return () => window.removeEventListener('online', handleOnline)
  }, [fetchOrders])

  // Depósitos: los usan también "Lista de carga" / "Por cliente" en la vista de
  // lista → se cargan al entrar (request chico). Setean el depósito por defecto.
  useEffect(() => {
    api.get<Warehouse[]>('/api/warehouses').then(wh => {
      setWarehouses(wh)
      if (sellerWarehouseId) {
        setWarehouseId(sellerWarehouseId)
      } else {
        const def = wh.find(w => w.is_default)
        // No pisar un depósito ya restaurado desde el borrador
        setWarehouseId(current => current || def?.id || '')
      }
    }).catch(() => { })
  }, [])

  // Listas de precio + overrides solo se usan en el form de nuevo pedido → lazy.
  const orderCatalogsLoadedRef = useRef(false)
  useEffect(() => {
    if (!newOrderModal || orderCatalogsLoadedRef.current) return
    orderCatalogsLoadedRef.current = true
    Promise.all([
      api.get<PriceList[]>('/api/price-lists'),
      api.get<{ product_id: string; price_list_id: string; price: number }[]>('/api/products/price-overrides').catch(() => []),
    ]).then(([pl, ovRaw]) => {
      setPriceLists(pl)
      setPriceListId(current => current || pl.find(list => list.is_default)?.id || pl[0]?.id || '')
      // Construir mapa de overrides para uso sin re-render
      const ovMap = new Map<string, Map<string, number>>()
      for (const ov of ovRaw) {
        let inner = ovMap.get(ov.product_id)
        if (!inner) { inner = new Map(); ovMap.set(ov.product_id, inner) }
        inner.set(ov.price_list_id, ov.price)
      }
      priceOverridesRef.current = ovMap
    }).catch(() => { })
  }, [newOrderModal])

  // ─── Borrador del nuevo pedido (persistente) ─────────────
  const DRAFT_KEY = 'stockos_order_draft'

  // Restaurar borrador al montar
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) {
        const d = JSON.parse(raw)
        if (Array.isArray(d.cart)) setCart(d.cart)
        if (d.selectedCustomerId) {
          setSelectedCustomerId(d.selectedCustomerId)
          setCustomerName(d.customerName || '')
          setSelectedCustomerBalance(Number(d.selectedCustomerBalance) || 0)
          setSelectedCustomerCreditLimit(Number(d.selectedCustomerCreditLimit) || 0)
        }
        if (d.warehouseId) setWarehouseId(d.warehouseId)
        if (d.priceListId) setPriceListId(d.priceListId)
        if (d.orderNotes) setOrderNotes(d.orderNotes)
        if (d.orderDiscount) setOrderDiscount(d.orderDiscount)
        if (d.payAlreadyCollected) setPayAlreadyCollected(true)
        if (d.collectedMethod) setCollectedMethod(d.collectedMethod)
        if (d.collectedAmount) setCollectedAmount(d.collectedAmount)
        if (d.pickupMode) setPickupMode(true)
      }
    } catch { /* ignore */ }
    draftLoadedRef.current = true
  }, [])

  // Guardar borrador ante cualquier cambio relevante
  useEffect(() => {
    if (!draftLoadedRef.current) return
    const hasContent = cart.length > 0 || !!selectedCustomerId || !!orderNotes.trim()
    if (!hasContent) { localStorage.removeItem(DRAFT_KEY); return }
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        cart, selectedCustomerId, customerName, selectedCustomerBalance, selectedCustomerCreditLimit,
        warehouseId, priceListId, orderNotes, orderDiscount, payAlreadyCollected, collectedMethod, collectedAmount, pickupMode,
      }))
    } catch { /* ignore */ }
  }, [cart, selectedCustomerId, customerName, selectedCustomerBalance, selectedCustomerCreditLimit,
    warehouseId, priceListId, orderNotes, orderDiscount, payAlreadyCollected, collectedMethod, collectedAmount, pickupMode])

  // Búsqueda de productos para el pedido
  useEffect(() => {
    if (!productQuery.trim()) { setProductResults([]); return }

    if (warehouseId && stockEnabled) {
      // Con depósito y stock habilitado: va a la API para obtener stock por depósito
      const timer = setTimeout(async () => {
        setSearchingProducts(true)
        try {
          const res = await api.get<{ data: { product_id: string; product_name: string; stock_current: number; barcode?: string; cost_price?: number; sell_price?: number }[] }>(
            `/api/warehouses/${warehouseId}/stock`, { search: productQuery.trim(), limit: 6 }
          )
          setProductResults(
            res.data
              .filter(s => !cart.find(c => c.product.id === s.product_id))
              .map(s => ({ id: s.product_id, name: s.product_name, stock_current: s.stock_current, barcode: s.barcode, cost_price: s.cost_price ?? 0, sell_price: s.sell_price ?? 0 } as Product))
          )
        } catch {
          // Sin conexión → fallback al cache local de productos
          const local = await searchProductsLocal(productQuery.trim(), 8)
          setProductResults(local.filter(p => !cart.find(c => c.product.id === p.id)))
        }
        finally { setSearchingProducts(false) }
      }, 300)
      return () => clearTimeout(timer)
    }

    // Sin depósito: búsqueda local en IndexedDB (instantánea)
    if (cacheReady) {
      let cancelled = false
      searchProductsLocal(productQuery.trim(), 8).then(results => {
        if (!cancelled) setProductResults(results.filter(p => !cart.find(c => c.product.id === p.id)))
      })
      return () => { cancelled = true }
    }

    // Fallback a API si el cache aún no está listo
    const timer = setTimeout(async () => {
      setSearchingProducts(true)
      try {
        const res = await api.get<{ data: Product[] }>('/api/products', { search: productQuery.trim(), limit: 6 })
        setProductResults(res.data.filter(p => !cart.find(c => c.product.id === p.id)))
      } catch { setProductResults([]) }
      finally { setSearchingProducts(false) }
    }, 300)
    return () => clearTimeout(timer)
  }, [productQuery, cart, warehouseId, cacheReady])

  useEffect(() => {
    const query = customerQuery.trim()
    if (query.length < 2) {
      customerSearchRequestRef.current += 1
      setCustomerResults([])
      setSearchingCustomers(false)
      return
    }

    const requestId = ++customerSearchRequestRef.current
    const timer = setTimeout(async () => {
      // Cache local primero → resultados instantáneos y soporte offline
      const local = (await searchCustomersLocal(query)).map(c => ({
        id: c.id, full_name: c.full_name, phone: c.phone, document: c.document,
        current_balance: c.current_balance, credit_limit: c.credit_limit,
      }))
      if (customerSearchRequestRef.current === requestId && local.length > 0) setCustomerResults(local)

      setSearchingCustomers(true)
      try {
        // Refresca con el server para tener saldos al día
        const data = await api.get<{ id: string; full_name: string; phone?: string; document?: string; current_balance: number; credit_limit: number }[]>(
          `/api/customers/search?q=${encodeURIComponent(query)}`
        )
        if (customerSearchRequestRef.current === requestId) setCustomerResults(data)
      } catch {
        // Sin red → quedarse con los resultados del cache local
        if (customerSearchRequestRef.current === requestId && local.length === 0) setCustomerResults([])
      } finally {
        if (customerSearchRequestRef.current === requestId) setSearchingCustomers(false)
      }
    }, 180)
    return () => clearTimeout(timer)
  }, [customerQuery])

  // Modo retiro: historial de retiros parciales del pedido.
  const fetchDeliveries = async (id: string) => {
    try {
      const data = await api.get<OrderDelivery[]>(`/api/orders/${id}/deliveries`)
      setDeliveries(data ?? [])
    } catch { setDeliveries([]) }
  }

  const openDetail = async (id: string) => {
    setNewOrderModal(false)
    setDetailModal(true)
    setLoadingDetail(true)
    setDetailInvoice(null)
    setDeliveries([])
    try {
      const d = await api.get<OrderDetail>(`/api/orders/${id}`)
      setDetail(d)
      if (d.pickup_mode) fetchDeliveries(id)
      // Usar invoice directo del pedido si existe
      if (d.invoices) {
        setDetailInvoice(d.invoices)
      } else if (d.sale_id) {
        api.get<{ id: string; invoice_type: string; numero: number } | null>(`/api/invoices/sale/${d.sale_id}`)
          .then(inv => { if (inv) setDetailInvoice(inv) })
          .catch(() => { })
      }
    } catch { toast.error('Error al cargar el pedido') }
    finally { setLoadingDetail(false) }
  }

  // Abrir un pedido directo desde ?open= (ej. al convertir un presupuesto)
  useEffect(() => {
    const openId = searchParams.get('open')
    if (openId) {
      openDetail(openId)
      router.replace('/orders')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const addToCart = (product: Product) => {
    const list = priceLists.find(pl => pl.id === priceListId)
    const override = priceOverridesRef.current.get(product.id)?.get(priceListId)
    const price = override ?? (list && product.cost_price
      ? Math.round(product.cost_price * (1 + list.margin_pct / 100) * 100) / 100
      : (product.sell_price || product.cost_price || 0))
    setCart(prev => [...prev, { product, quantity: 1, unit_price: price, discount: 0 }])
    setProductQuery('')
    setProductResults([])
  }

  // Navegación con teclado del dropdown de productos (↑/↓ + Enter, Esc para cerrar)
  const handleProductKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (productResults.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setProductHighlight(h => Math.min(h + 1, productResults.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setProductHighlight(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const p = productResults[productHighlight]
      if (p) addToCart(p)
    } else if (e.key === 'Escape') {
      setProductQuery('')
      setProductResults([])
    }
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
  const discountPct = Math.min(100, Math.max(0, Number(orderDiscount) || 0))
  const cartDiscount = Math.round(cartSubtotal * discountPct / 100 * 100) / 100
  const cartTotal = Math.max(0, cartSubtotal - cartDiscount)
  const getDefaultPriceListId = () => priceLists.find(pl => pl.is_default)?.id ?? priceLists[0]?.id ?? ''
  const getPriceListLabel = (id?: string | null) => {
    if (!id) return null
    const list = priceLists.find(pl => pl.id === id)
    return list ? `${list.name} (+${list.margin_pct}%)` : id.slice(0, 8).toUpperCase()
  }

  const resetOrderForm = () => {
    setOrderNotes(''); setOrderDiscount(''); setCart([])
    setPayAlreadyCollected(false); setCollectedAmount(''); setCollectedMethod('efectivo')
    setPickupMode(false)
    setCustomerQuery(''); setCustomerResults([]); setSelectedCustomerId(null)
    setSelectedCustomerBalance(0); setSelectedCustomerCreditLimit(0)
    setCustomerName(''); setQuickCustomerModal(false)
    setQcForm({ full_name: '', document: '', phone: '', credit_limit: '' })
    setPriceListId(getDefaultPriceListId())
    try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
  }

  // Abre el panel SIN resetear: si hay un borrador en curso, lo retoma
  const openNewOrder = () => {
    setDetailModal(false); setDetail(null); setDetailInvoice(null)
    setNewOrderModal(true)
  }

  // Cierra el panel manteniendo el borrador (no se pierde lo cargado)
  const closeNewOrder = () => {
    setQuickCustomerModal(false)
    setNewOrderModal(false)
  }

  // Descarta el borrador por completo y cierra
  const discardNewOrder = () => {
    resetOrderForm()
    setNewOrderModal(false)
  }

  const handleQuickCreate = async () => {
    if (!qcForm.full_name.trim()) { toast.error('El nombre es obligatorio'); return }
    setQcSaving(true)
    try {
      const customer = await api.post<{ id: string; full_name: string; current_balance: number; credit_limit: number }>('/api/customers', {
        full_name: qcForm.full_name.trim(),
        document: qcForm.document.trim() || null,
        phone: qcForm.phone.trim() || null,
        credit_limit: Number(qcForm.credit_limit) || 0,
      })
      toast.success(`Cliente "${customer.full_name}" creado`)
      setSelectedCustomerId(customer.id)
      setCustomerName(customer.full_name)
      setSelectedCustomerBalance(Number(customer.current_balance))
      setSelectedCustomerCreditLimit(Number(customer.credit_limit))
      setCustomerQuery(''); setCustomerResults([])
      setQuickCustomerModal(false)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al crear el cliente')
    } finally { setQcSaving(false) }
  }

  const cartStockIssues = stockEnabled ? cart.filter(i => i.quantity > (i.product.stock_current ?? 0)) : []
  const trimmedCustomerQuery = customerQuery.trim()
  const showCustomerDropdown = !selectedCustomerId && trimmedCustomerQuery.length >= 2

  const selectCustomer = (c: { id: string; full_name: string; current_balance: number; credit_limit: number }) => {
    setSelectedCustomerId(c.id)
    setCustomerName(c.full_name)
    setSelectedCustomerBalance(Number(c.current_balance))
    setSelectedCustomerCreditLimit(Number(c.credit_limit))
    setCustomerQuery('')
    setCustomerResults([])
  }
  const openQuickCustomerCreate = () => {
    setQcForm({ full_name: trimmedCustomerQuery, document: '', phone: '', credit_limit: '' })
    setQuickCustomerModal(true)
  }
  // Navegación con teclado del dropdown de clientes (↑/↓ + Enter, Esc para cerrar)
  const handleCustomerKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!showCustomerDropdown) return
    const optionsCount = customerResults.length + 1 // +1 por la opción "Crear cliente"
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCustomerHighlight(h => Math.min(h + 1, optionsCount - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCustomerHighlight(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (customerHighlight < customerResults.length) selectCustomer(customerResults[customerHighlight])
      else openQuickCustomerCreate()
    } else if (e.key === 'Escape') {
      setCustomerQuery('')
      setCustomerResults([])
    }
  }
  useEffect(() => { setCustomerHighlight(0) }, [customerResults])
  useEffect(() => { setProductHighlight(0) }, [productResults])

  const handleCreateOrder = async () => {
    if (!selectedCustomerId) { toast.error('Seleccioná un cliente de la lista'); return }
    if (selectedCustomerCreditLimit > 0 && selectedCustomerBalance >= selectedCustomerCreditLimit) {
      toast.error(`${customerName} superó su límite de crédito (${formatCurrency(selectedCustomerCreditLimit)}). Saldo actual: ${formatCurrency(selectedCustomerBalance)}`)
      return
    }
    if (cart.length === 0) { toast.error('Agregá al menos un producto'); return }
    if (cartStockIssues.length > 0) { toast.error('Hay productos con stock insuficiente'); return }

    setSavingOrder(true)

    const payload = {
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
      pickup_mode: pickupMode,
    }

    // Guarda el pedido en la cola offline y limpia el formulario
    const saveOffline = async () => {
      await queueOrder({
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        customer_name: customerName.trim(),
        payload,
      })
      toast.success('Sin conexión — pedido guardado, se sincronizará automáticamente')
      resetOrderForm()
      setNewOrderModal(false)
      getPendingOrdersCount().then(setPendingOrdersCount).catch(() => {})
    }

    try {
      // Sin conexión → directo a la cola
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await saveOffline()
        return
      }
      const created = await api.post<OrderSummary>('/api/orders', payload)
      toast.success('Pedido creado correctamente')
      // Optimista: si estamos en la primera página sin filtros que lo excluyan,
      // mostramos el pedido recién creado al instante (el re-fetch reconcilia
      // item_count/total_units y demás campos calculados por el view).
      const noExcludingFilter = pageRef.current === 1
        && (!statusFilterRef.current || statusFilterRef.current === 'pending')
        && !searchRef.current && !idSearchRef.current
      if (created?.id && noExcludingFilter) {
        const optimistic: OrderSummary = {
          ...created,
          item_count: created.item_count ?? cart.length,
          total_units: created.total_units ?? cart.reduce((s, i) => s + i.quantity, 0),
          seller_name: created.seller_name ?? authUser?.full_name,
          warehouse_name: created.warehouse_name ?? warehouses.find(w => w.id === warehouseId)?.name,
        }
        setOrders(prev => [optimistic, ...prev.filter(o => o.id !== optimistic.id)])
      }
      resetOrderForm()
      setNewOrderModal(false)
      fetchOrders()
    } catch (err: unknown) {
      // Falló por red → encolar igualmente para no perder el pedido
      if (isNetworkError(err)) {
        await saveOffline()
      } else {
        toast.error(err instanceof Error ? err.message : 'Error al crear el pedido')
      }
    } finally { setSavingOrder(false) }
  }

  // Ctrl+Enter dispara "Crear pedido" cuando el panel está abierto (atajo de teclado).
  // Usamos un ref para tomar siempre la última versión de handleCreateOrder.
  const handleCreateOrderRef = useRef(handleCreateOrder)
  handleCreateOrderRef.current = handleCreateOrder
  useEffect(() => {
    if (!newOrderModal) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      if (!savingOrder && cart.length > 0) handleCreateOrderRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [newOrderModal, savingOrder, cart.length])

  // Estado que deja cada acción — para reflejar el cambio al instante sin esperar
  // el re-fetch (cancel devuelve { success } y no la fila, los demás sí la traen).
  const ACTION_RESULT_STATUS: Record<string, OrderStatus> = {
    confirm: 'confirmed', cancel: 'cancelled',
  }

  const handleAction = async (id: string, action: string) => {
    try {
      const res = await api.post<Partial<OrderDetail>>(`/api/orders/${id}/${action}`, {})
      toast.success('Estado actualizado')
      // Optimista: pintar el nuevo estado de inmediato. El re-fetch de abajo
      // reconcilia con el server (totales del view + joins completos).
      const row = res && typeof res === 'object' && 'status' in res ? res : null
      const newStatus = (row?.status ?? ACTION_RESULT_STATUS[action]) as OrderStatus | undefined
      if (newStatus) {
        setOrders(prev => prev.map(o => o.id === id ? { ...o, status: newStatus } : o))
        setDetail(prev => prev && prev.id === id ? { ...prev, ...(row ?? {}), status: newStatus } : prev)
      }
      fetchOrders()
      if (detail?.id === id) {
        api.get<OrderDetail>(`/api/orders/${id}`).then(setDetail).catch(() => {})
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al actualizar'
      msg.split('\n').forEach((line, i) => {
        setTimeout(() => toast.error(line), i * 150)
      })
    }
  }

  const handleDeliver = async () => {
    if (!deliverOrderId) return
    setDelivering(true)
    try {
      // Nunca cobrar más que el saldo pendiente: el backend SUMA este monto a lo ya
      // cobrado, así que clampeamos para no sobre-cobrar un pedido ya pagado total o
      // parcialmente.
      const pendingToCollect = detail?.id === deliverOrderId
        ? Math.max(0, Number(detail.total) - Number(detail.paid_amount))
        : Number(deliverAmount) || 0
      const collected = Math.min(Number(deliverAmount) || 0, pendingToCollect)
      await api.post(`/api/orders/${deliverOrderId}/deliver`, {
        payment_method: deliverMethod,
        paid_amount: collected,
        delivery_notes: deliverNotes || null,
      })
      toast.success('Entrega confirmada — venta generada automáticamente')
      setDeliverModal(false)
      setDeliverOrderId(null)
      setDeliverAmount(''); setDeliverNotes('')
      fetchOrders()
      if (detail?.id === deliverOrderId) {
        const updated = await api.get<OrderDetail>(`/api/orders/${deliverOrderId}`)
        setDetail(updated)
        if (updated.invoices) setDetailInvoice(updated.invoices)
        else if (updated.sale_id) {
          api.get<{ id: string; invoice_type: string; numero: number } | null>(`/api/invoices/sale/${updated.sale_id}`)
            .then(inv => { if (inv) setDetailInvoice(inv) })
            .catch(() => { })
        }
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al confirmar entrega')
    } finally { setDelivering(false) }
  }

  // Modo retiro: registra un retiro parcial e imprime su remito.
  // Llena (o limpia) todas las cantidades pendientes de un toque
  const fillAllPending = () => {
    if (!detail) return
    const next: Record<string, string> = {}
    detail.order_items.forEach(i => {
      const pending = i.quantity - (i.quantity_delivered ?? 0)
      if (pending > 0) next[i.id] = String(pending)
    })
    setWithdrawQty(next)
  }
  const setWithdrawClamped = (id: string, pending: number, raw: number) => {
    const n = Math.max(0, Math.min(pending, Math.floor(raw) || 0))
    setWithdrawQty(prev => ({ ...prev, [id]: n === 0 ? '' : String(n) }))
  }

  // Modo retiro: arma un texto estilo WhatsApp con lo que al cliente le queda
  // pendiente de retirar (lo que tiene "a favor") y lo copia al portapapeles para
  // pegarlo en el chat. Mismo patrón que "Copiar para WhatsApp" de presupuestos.
  const copyPickupText = async (d: OrderDetail) => {
    const biz = authUser?.business
    const num = d.id.slice(0, 8).toUpperCase()
    const firstName = d.customer_name?.trim().split(/\s+/)[0] ?? ''

    const pendingItems = d.order_items
      .map(i => ({ name: i.products?.name ?? i.product_name ?? '(producto)', pending: i.quantity - (i.quantity_delivered ?? 0) }))
      .filter(i => i.pending > 0)

    if (pendingItems.length === 0) {
      toast.info('Este pedido ya fue retirado por completo')
      return
    }

    const totalUnits = pendingItems.reduce((s, i) => s + i.pending, 0)
    const lines: string[] = []
    lines.push(`*Pedido N° ${num}*`)
    if (biz?.name) lines.push(biz.name)
    lines.push('')
    lines.push(firstName ? `Hola ${firstName}! Te queda a favor para retirar:` : 'Te queda a favor para retirar:')
    lines.push('')
    for (const i of pendingItems) {
      lines.push(`• ${i.pending} × ${i.name}`)
    }
    lines.push('')
    lines.push(`*Total a retirar: ${totalUnits} ${totalUnits === 1 ? 'unidad' : 'unidades'}*`)

    const text = lines.join('\n')
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copiado — pegalo en el chat del cliente')
    } catch {
      // Fallback para navegadores sin permiso de Clipboard API (o contexto no seguro).
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
        toast.success('Copiado — pegalo en el chat del cliente')
      } catch { toast.error('No se pudo copiar') }
      document.body.removeChild(ta)
    }
  }

  const handleWithdraw = async () => {
    if (!withdrawOrderId || !detail) return
    const items = Object.entries(withdrawQty)
      .map(([order_item_id, qty]) => ({ order_item_id, quantity: Number(qty) || 0 }))
      .filter(i => i.quantity > 0)
    if (items.length === 0) { toast.error('Ingresá al menos una cantidad a retirar'); return }

    const orderId = withdrawOrderId
    setWithdrawing(true)
    try {
      await api.post(`/api/orders/${orderId}/deliveries`, {
        items,
        notes: withdrawNotes || null,
      })
      toast.success('Retiro registrado')
      setWithdrawModal(false)
      setWithdrawOrderId(null)
      setWithdrawQty({}); setWithdrawNotes('')
      // Actualización optimista del drawer: incrementamos quantity_delivered con lo
      // que acabamos de retirar para que la info refleje el retiro al instante, sin
      // depender de que el refetch (que puede tardar varios segundos) llegue antes
      // de que el usuario reabra el modal y reintente sobre datos viejos.
      const deltas = new Map(items.map(i => [i.order_item_id, i.quantity]))
      setDetail(prev => prev && prev.id === orderId ? {
        ...prev,
        order_items: prev.order_items.map(oi =>
          deltas.has(oi.id)
            ? { ...oi, quantity_delivered: (oi.quantity_delivered ?? 0) + deltas.get(oi.id)! }
            : oi
        ),
      } : prev)
      fetchOrders()
      // El remito de cada retiro se imprime a demanda desde el historial.
      // Refetch de confirmación: reconcilia el estado real (status del pedido, etc.).
      api.get<OrderDetail>(`/api/orders/${orderId}`)
        .then(updated => setDetail(prev => prev && prev.id === orderId ? updated : prev))
        .catch(() => {})
      fetchDeliveries(orderId)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar el retiro')
    } finally { setWithdrawing(false) }
  }

  const handleRegisterPayment = async () => {
    if (!paymentOrderId || !paymentAmount) return
    setRegisteringPayment(true)
    try {
      const updatedRow = await api.post<Partial<OrderDetail>>(`/api/orders/${paymentOrderId}/payment`, {
        payment_method: paymentMethod,
        paid_amount: Number(paymentAmount),
      })
      toast.success('Pago registrado')
      setPaymentModal(false)
      const closedOrderId = paymentOrderId
      setPaymentOrderId(null)
      setPaymentAmount('')
      // Optimista: aplicar paid_amount/payment_status devueltos al instante. Así el
      // panel y los PDFs (que leen detail.paid_amount) reflejan el cobro sin esperar
      // el re-fetch. El re-fetch de abajo reconcilia joins/saldos de cuenta.
      const row = updatedRow && typeof updatedRow === 'object' && 'paid_amount' in updatedRow ? updatedRow : null
      if (row) {
        setOrders(prev => prev.map(o => o.id === closedOrderId
          ? { ...o, paid_amount: row.paid_amount ?? o.paid_amount, payment_status: row.payment_status ?? o.payment_status }
          : o))
        setDetail(prev => prev && prev.id === closedOrderId ? { ...prev, ...row } : prev)
      }
      fetchOrders()
      if (detail?.id === closedOrderId) {
        api.get<OrderDetail>(`/api/orders/${closedOrderId}`)
          .then(updated => setDetail(prev => prev && prev.id === closedOrderId ? updated : prev))
          .catch(() => {})
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar pago')
    } finally { setRegisteringPayment(false) }
  }

  const sidePanelOpen = detailModal || newOrderModal
  useCollapseSidebar(sidePanelOpen)

  return (
    <AppShell>
      <div className="flex h-full overflow-hidden">
        <div className={cn(
          'flex flex-col overflow-hidden transition-all',
          sidePanelOpen ? 'hidden md:flex md:w-[30%] md:border-r md:border-[var(--border)]' : 'w-full flex'
        )}>
          <div className="shrink-0">
            <PageHeader
              title="Pedidos"
              description={`${pagination.total} pedidos`}
              action={
                <>
                  {!sidePanelOpen && (
                    <>
                      <Button variant="secondary" onClick={openPickingList}>
                        <ClipboardList size={15} /> <span className="hidden sm:inline">Lista de carga</span>
                      </Button>
                      <Button variant="secondary" onClick={openByClientList}>
                        <FileText size={15} /> <span className="hidden sm:inline">Por cliente</span>
                      </Button>
                    </>
                  )}
                  {!newOrderModal && (
                    <Button onClick={openNewOrder}>
                      <Plus size={15} /> <span className={cn(detailModal && 'hidden lg:inline')}>{cart.length > 0 ? 'Retomar pedido' : 'Nuevo pedido'}</span>
                    </Button>
                  )}
                </>
              }
            />
          </div>

          <div className="overflow-y-auto flex-1 p-5 space-y-4">
        <HelpBanner id="orders" title="¿Cómo funcionan los pedidos?">
          <p>Cargá pedidos de tus clientes y seguí su estado. Al confirmar un pedido se <strong>reserva el stock</strong> automáticamente; si lo cancelás, ese stock se libera.</p>
        </HelpBanner>
        {/* Banner pedidos offline pendientes */}
        {pendingOrdersCount > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-300 dark:border-yellow-700">
            <div className="flex items-center gap-2 text-xs text-yellow-700 dark:text-yellow-400">
              <AlertCircle size={14} className="flex-shrink-0" />
              <span className="font-medium">{pendingOrdersCount} pedido{pendingOrdersCount > 1 ? 's' : ''} sin sincronizar</span>
            </div>
            <button
              onClick={() => {
                syncPendingOrders()
                  .then(({ synced, failed }) => {
                    if (synced > 0) { toast.success(`${synced} pedido${synced > 1 ? 's' : ''} sincronizado${synced > 1 ? 's' : ''}`); fetchOrders() }
                    if (failed > 0) toast.error(`${failed} no se pudieron sincronizar`)
                    getPendingOrdersCount().then(setPendingOrdersCount).catch(() => {})
                  })
                  .catch(() => {})
              }}
              className="text-xs font-semibold text-yellow-700 dark:text-yellow-400 underline flex-shrink-0"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Filtros */}
        <div className="space-y-2">
          {/* Estado */}
          <div className="flex items-center gap-1 rounded-full bg-[var(--surface2)] border border-[var(--border)] p-0.5 w-fit max-w-full overflow-x-auto">
            {([['', 'Todos'], ['pending', 'Pendientes'], ['confirmed', 'Confirmados'],
            ['delivered', 'Entregados']] as [string, string][]).map(([val, label]) => (
              <button key={val} onClick={() => setStatusFilter(val as OrderStatus | '')}
                className={`px-3 py-1 text-xs rounded-full font-medium whitespace-nowrap transition-colors ${statusFilter === val
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--text2)] hover:text-[var(--text)]'
                  }`}>
                {label}
              </button>
            ))}
          </div>
          {/* Búsqueda */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1 min-w-0">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar cliente..."
                disabled={!!idSearch.trim()}
                className="w-full pl-7 pr-8 py-1.5 text-xs rounded-full bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-50 disabled:cursor-not-allowed"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text3)] hover:text-[var(--text)]">
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="relative flex-1 min-w-0">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
              <input value={idSearch} onChange={e => setIdSearch(e.target.value)}
                placeholder="N° pedido..."
                className="w-full pl-7 pr-8 py-1.5 text-xs rounded-full bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)] font-mono uppercase"
              />
              {idSearch && (
                <button type="button" onClick={() => setIdSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text3)] hover:text-[var(--text)]">
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tabla */}
        {loading ? <TableSkeleton rows={8} /> : orders.length === 0 ? (
          (search.trim() || idSearch.trim() || statusFilter) ? (
            <EmptyState icon={Search} title="Sin resultados"
              description={idSearch.trim()
                ? `No encontramos ningún pedido con el N° "${idSearch.trim().toUpperCase()}".`
                : 'Ningún pedido coincide con la búsqueda o el filtro aplicado.'}
              action={<Button variant="secondary" onClick={() => { setSearch(''); setIdSearch(''); setStatusFilter('') }}><X size={15} />Limpiar filtros</Button>}
            />
          ) : (
            <EmptyState icon={Package} title="Sin pedidos"
              description="Los vendedores pueden crear pedidos desde el botón 'Nuevo pedido'."
              action={<Button onClick={openNewOrder}><Plus size={15} />Nuevo pedido</Button>}
            />
          )
        ) : (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className={cn('w-full text-sm', !sidePanelOpen && 'min-w-[640px]')}>
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    {!sidePanelOpen && <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden sm:table-cell">N° Pedido</th>}
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)]">Cliente</th>
                    {!sidePanelOpen && <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden md:table-cell">Vendedor</th>}
                    {!sidePanelOpen && <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden lg:table-cell">Depósito</th>}
                    <th className="text-center px-4 py-3 text-xs font-medium text-[var(--text3)]">Estado</th>
                    {!sidePanelOpen && <th className="text-center px-4 py-3 text-xs font-medium text-[var(--text3)]">Pago</th>}
                    <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)]">Total</th>
                    {!sidePanelOpen && <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden sm:table-cell">Fecha</th>}
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {orders.map(order => {
                    return (
                      <tr key={order.id}
                        onClick={() => openDetail(order.id)}
                        className={cn(
                          'hover:bg-[var(--surface2)] transition-colors cursor-pointer group',
                          detail?.id === order.id && 'bg-[var(--accent)]/8 hover:bg-[var(--accent)]/12'
                        )}>
                        {!sidePanelOpen && (
                          <td className="px-4 py-3 hidden sm:table-cell">
                            <span className="font-mono text-xs text-[var(--text2)] tracking-wider">{order.id.slice(0, 8).toUpperCase()}</span>
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <p className="font-medium text-[var(--text)]">{order.customer_name}</p>
                          {order.customer_address && (
                            <p className="text-xs text-[var(--text3)] truncate max-w-[160px]">{order.customer_address}</p>
                          )}
                        </td>
                        {!sidePanelOpen && <td className="px-4 py-3 text-[var(--text2)] hidden md:table-cell">{order.seller_name ?? '—'}</td>}
                        {!sidePanelOpen && <td className="px-4 py-3 text-[var(--text2)] hidden lg:table-cell">{order.warehouse_name ?? '—'}</td>}
                        <td className="px-4 py-3 text-center">
                          <Badge variant={STATUS_VARIANTS[order.status]}>{STATUS_LABELS[order.status]}</Badge>
                        </td>
                        {!sidePanelOpen && (
                          <td className="px-4 py-3 text-center">
                            <Badge variant={
                              order.payment_status === 'paid' ? 'success' :
                                order.payment_status === 'partial' ? 'warning' :
                                  order.payment_status === 'credit' ? 'default' : 'danger'
                            }>
                              {PAYMENT_STATUS_LABELS[order.payment_status]}
                            </Badge>
                          </td>
                        )}
                        <td className="px-4 py-3 text-right mono font-semibold text-[var(--text)]">
                          {formatCurrency(order.total)}
                        </td>
                        {!sidePanelOpen && (
                          <td className="px-4 py-3 text-xs text-[var(--text3)] hidden sm:table-cell">
                            {formatDateTime(order.created_at)}
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                            <ChevronRight size={14} className="text-[var(--text3)]" />
                          </div>
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

        {/* ── Panel detalle ── */}
        {detailModal && (
          <div className="w-full md:flex-1 overflow-y-auto flex flex-col">
            <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)] sticky top-0 bg-[var(--surface)] z-10">
              <h2 className="text-sm font-semibold text-[var(--text)]">Detalle del pedido</h2>
              <button
                onClick={() => { setDetailModal(false); setDetail(null); setDetailInvoice(null) }}
                className="p-1.5 rounded-md text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 p-5">
        {loadingDetail ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
          </div>
        ) : detail && (
          <div className="space-y-4">
            {/* Status stepper interactivo */}
            <div className="space-y-2">
              <div className="flex items-center gap-1 overflow-x-auto pb-1">
                {detail.status === 'cancelled' ? (
                  <>
                    {(['pending', 'confirmed', 'delivered'] as OrderStatus[]).map((s, i) => (
                      <div key={s} className="flex items-center gap-1 flex-shrink-0">
                        <div className="px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--surface2)] text-[var(--text3)]">
                          {STATUS_LABELS[s]}
                        </div>
                        {i < 2 && <ChevronRight size={12} className="text-[var(--text3)] flex-shrink-0" />}
                      </div>
                    ))}
                    <ChevronRight size={12} className="text-[var(--text3)] flex-shrink-0" />
                    <div className="px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--danger-subtle)] text-[var(--danger)]">
                      Cancelado
                    </div>
                  </>
                ) : detail.pickup_mode ? (() => {
                  // Modo retiro: pendiente → retiro parcial → entregado (no interactivo;
                  // las acciones viven en la tarjeta "Modo retiro" más abajo). El pago es
                  // independiente (ver tarjeta "Pago"). Usa las mismas etiquetas que la tabla.
                  const statuses: OrderStatus[] = ['pending', 'partially_delivered', 'delivered']
                  const currentIdx = Math.max(0, statuses.indexOf(detail.status))
                  return statuses.map((s, i) => {
                    const done = i < currentIdx
                    const current = i === currentIdx
                    return (
                      <div key={s} className="flex items-center gap-1 flex-shrink-0">
                        <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${current ? 'bg-[var(--accent)] text-white' :
                          done ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' :
                            'bg-[var(--surface2)] text-[var(--text3)]'
                          }`}>
                          {done && (
                            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                              <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                          {STATUS_LABELS[s]}
                        </div>
                        {i < statuses.length - 1 && <ChevronRight size={12} className="text-[var(--text3)] flex-shrink-0" />}
                      </div>
                    )
                  })
                })() : (() => {
                  const statuses: OrderStatus[] = ['pending', 'confirmed', 'delivered']
                  const currentIdx = statuses.indexOf(detail.status)
                  const NEXT_LABELS: Partial<Record<OrderStatus, string>> = { confirmed: 'Confirmar', delivered: 'Entregar' }
                  const advance = (target: OrderStatus) => {
                    if (target === 'confirmed') setConfirmOrder({ id: detail.id, customer_name: detail.customer_name })
                    else if (target === 'delivered') { setDeliverOrderId(detail.id); setDeliverModal(true) }
                  }
                  return statuses.map((s, i) => {
                    const done = i < currentIdx
                    const current = i === currentIdx
                    const isNext = i === currentIdx + 1
                    return (
                      <div key={s} className="flex items-center gap-1 flex-shrink-0">
                        {isNext ? (
                          <button
                            onClick={() => advance(s)}
                            className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border border-dashed border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white hover:border-solid transition-colors">
                            {NEXT_LABELS[s] ?? STATUS_LABELS[s]}
                            <ChevronRight size={12} />
                          </button>
                        ) : (
                          <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${current ? 'bg-[var(--accent)] text-white' :
                            done ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' :
                              'bg-[var(--surface2)] text-[var(--text3)]'
                            }`}>
                            {done && (
                              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                            {STATUS_LABELS[s]}
                          </div>
                        )}
                        {i < 2 && <ChevronRight size={12} className="text-[var(--text3)] flex-shrink-0" />}
                      </div>
                    )
                  })
                })()}
              </div>
              {/* Timeline de fechas */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[var(--text3)]">
                <span>Creado <span className="font-medium text-[var(--text2)]">{formatDateTime(detail.created_at)}</span></span>
                {detail.confirmed_at && <span>· Confirmado <span className="font-medium text-[var(--text2)]">{formatDateTime(detail.confirmed_at)}</span></span>}
                {detail.dispatched_at && <span>· Despachado <span className="font-medium text-[var(--text2)]">{formatDateTime(detail.dispatched_at)}</span></span>}
                {detail.delivered_at && <span>· Entregado <span className="font-medium text-[var(--text2)]">{formatDateTime(detail.delivered_at)}</span></span>}
              </div>
              {detail.status === 'pending' && (
                <button
                  onClick={() => setCancelConfirmOrder({ id: detail.id, customer_name: detail.customer_name })}
                  className="inline-flex items-center gap-1.5 self-start rounded-[var(--radius-md)] border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--danger)] hover:bg-[var(--danger)]/20 transition-colors">
                  <X size={14} /> Cancelar pedido
                </button>
              )}
            </div>

            {/* ── Modo retiro: retiros parciales (la deuda ya está en la cuenta corriente) ── */}
            {detail.pickup_mode && detail.status !== 'cancelled' && (
              <div className="bg-[var(--surface2)] rounded-[var(--radius-md)] p-3.5 space-y-3 border border-[var(--accent)]/30">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text)]">Modo retiro</p>
                    <p className="text-[11px] text-[var(--text3)]">La deuda está cargada en la cuenta corriente. El cliente puede retirar aunque no haya pagado.</p>
                  </div>
                  {detail.status !== 'delivered' && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button size="sm" variant="secondary" onClick={() => copyPickupText(detail)}>
                        <Copy size={14} /> <span className="hidden sm:inline">Enviar pendientes</span>
                      </Button>
                      <Button size="sm" onClick={() => { setWithdrawOrderId(detail.id); setWithdrawQty({}); setWithdrawNotes(''); setWithdrawSearch(''); setWithdrawShowDelivered(false); setWithdrawShowNote(false); setWithdrawModal(true) }}>
                        Registrar retiro
                      </Button>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  {detail.order_items.map(i => {
                    const delivered = i.quantity_delivered ?? 0
                    const pending = i.quantity - delivered
                    return (
                      <div key={i.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-[var(--text2)] truncate">{i.products?.name ?? i.product_name}</span>
                        <span className="flex-shrink-0 text-[var(--text3)]">
                          Retirado <span className="font-medium text-[var(--text)]">{delivered}</span>/{i.quantity}
                          {pending > 0
                            ? <span className="ml-1.5 font-medium text-[var(--accent)]">· faltan {pending}</span>
                            : <span className="ml-1.5 font-medium text-[var(--accent)]">· completo</span>}
                        </span>
                      </div>
                    )
                  })}
                </div>

                {/* Historial de retiros: cada uno con su remito imprimible */}
                {deliveries.length > 0 && (
                  <div className="space-y-2 pt-3 border-t border-[var(--border)]">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text3)]">
                      Retiros realizados ({deliveries.length})
                    </p>
                    {deliveries.map((dl, idx) => {
                      const when = new Date(dl.delivered_at).toLocaleString('es-AR', {
                        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
                      })
                      const lines = dl.order_delivery_items.map(di => {
                        const oi = detail.order_items.find(o => o.id === di.order_item_id)
                        return {
                          name: oi?.products?.name ?? di.product_name ?? 'Producto',
                          barcode: oi?.products?.barcode,
                          quantity: di.quantity,
                          unit: oi?.products?.unit,
                        }
                      })
                      return (
                        <div key={dl.id} className="flex items-start justify-between gap-2 bg-[var(--surface)] rounded-[var(--radius-sm)] p-2.5 border border-[var(--border)]">
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-[var(--text)]">
                              Retiro #{deliveries.length - idx} · <span className="text-[var(--text3)] font-normal">{when}</span>
                            </p>
                            <p className="text-[11px] text-[var(--text2)] mt-0.5 leading-snug">
                              {lines.map(l => `${l.name} ×${l.quantity}`).join(' · ')}
                            </p>
                            {dl.notes && <p className="text-[11px] text-[var(--text3)] mt-0.5 italic">{dl.notes}</p>}
                          </div>
                          <Button
                            size="sm" variant="secondary" className="flex-shrink-0"
                            onClick={() => printRemito(detail, lines, { date: dl.delivered_at, remitoId: dl.id })}
                          >
                            <Printer size={14} /> Remito
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Info cliente + pago */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Cliente */}
              <div className="bg-[var(--surface2)] rounded-[var(--radius-md)] p-3.5 flex flex-col gap-1.5">
                <p className="text-xs text-[var(--text3)]">Cliente</p>
                <p className="text-sm font-semibold text-[var(--text)] leading-tight">{detail.customer_name}</p>
                <div className="flex flex-col gap-0.5 text-xs text-[var(--text2)]">
                  {detail.customers?.document && <span>DNI/CUIT: <span className="mono">{detail.customers.document}</span></span>}
                  {(detail.customer_phone || detail.customers?.phone) && <span>Tel: {detail.customer_phone || detail.customers?.phone}</span>}
                  {detail.customer_address && <span>{detail.customer_address}</span>}
                </div>
                {detail.customers?.current_balance !== undefined && detail.customers?.current_balance !== null && (
                  <span className={`mt-auto self-start inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${Number(detail.customers.current_balance) > 0 ? 'bg-[var(--danger-subtle)] text-[var(--danger)]' : 'bg-[var(--accent-subtle)] text-[var(--accent)]'}`}>
                    Saldo en cuenta: {formatCurrency(detail.customers.current_balance)}
                  </span>
                )}
              </div>
              {/* Pago */}
              <div className="bg-[var(--surface2)] rounded-[var(--radius-md)] p-3.5 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-[var(--text3)]">Pago</p>
                  <Badge variant={
                    detail.payment_status === 'paid' ? 'success' :
                      detail.payment_status === 'partial' ? 'warning' :
                        detail.payment_status === 'credit' ? 'default' : 'danger'
                  }>
                    {PAYMENT_STATUS_LABELS[detail.payment_status]}
                  </Badge>
                </div>
                {(() => {
                  const pending = Math.max(0, Number(detail.total) - Number(detail.paid_amount))
                  return detail.payment_status === 'paid' ? (
                    <div>
                      <p className="text-[11px] text-[var(--text3)]">Total cobrado</p>
                      <p className="text-xl font-bold mono text-[var(--accent)] leading-tight">{formatCurrency(detail.total)}</p>
                    </div>
                  ) : (
                    <>
                      <div>
                        <p className="text-[11px] text-[var(--text3)]">Pendiente de cobro</p>
                        <p className="text-xl font-bold mono text-[var(--danger)] leading-tight">{formatCurrency(pending)}</p>
                      </div>
                      {Number(detail.paid_amount) > 0 && (
                        <p className="text-xs text-[var(--text2)]">Cobrado {formatCurrency(detail.paid_amount)} de {formatCurrency(detail.total)}</p>
                      )}
                    </>
                  )
                })()}
                {detail.payment_method && (
                  <p className="text-xs text-[var(--text3)]">{PAYMENT_METHODS.find(m => m.value === detail.payment_method)?.label}</p>
                )}
              </div>
            </div>

            {/* Info adicional — chips */}
            <div className="flex gap-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-[var(--radius-md)] bg-[var(--surface2)] text-[11px] text-[var(--text3)]">
                Pedido <strong className="mono font-semibold text-[var(--text2)]">{detail.id.slice(0, 8).toUpperCase()}</strong>
              </span>
              {(detail.price_lists || detail.price_list_id) && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-[var(--radius-md)] bg-[var(--surface2)] text-[11px] text-[var(--text3)]">
                  Lista <strong className="font-semibold text-[var(--text2)]">{
                    detail.price_lists
                      ? `${detail.price_lists.name} (+${detail.price_lists.margin_pct}%)`
                      : getPriceListLabel(detail.price_list_id)
                  }</strong>
                </span>
              )}
              {(detail.seller_name || detail.users?.full_name) && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-[var(--radius-md)] bg-[var(--surface2)] text-[11px] text-[var(--text3)]">
                  Vendedor <strong className="font-semibold text-[var(--text2)]">{detail.seller_name || detail.users?.full_name}</strong>
                </span>
              )}
              {detail.warehouse_name && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-[var(--radius-md)] bg-[var(--surface2)] text-[11px] text-[var(--text3)]">
                  Depósito <strong className="font-semibold text-[var(--text2)]">{detail.warehouse_name}</strong>
                </span>
              )}
              {detail.sale_id && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-[var(--radius-md)] bg-[var(--accent-subtle)] text-[11px] text-[var(--accent)]">
                  Venta <strong className="mono font-semibold">#{detail.sale_id.slice(0, 8).toUpperCase()}</strong>
                </span>
              )}
              {detailInvoice && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-[var(--radius-md)] bg-[var(--accent-subtle)] text-[11px] text-[var(--accent)]">
                  Comprobante <strong className="font-semibold">{detailInvoice.invoice_type}-{String(detailInvoice.numero).padStart(5, '0')}</strong>
                </span>
              )}
            </div>

            {/* Tabla de ítems */}
            <div className="bg-[var(--surface2)] rounded-[var(--radius-lg)] mb-4">
              <div className="hidden sm:block overflow-auto max-h-[320px]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="text-left px-3 py-2 text-xs font-medium text-[var(--text3)] sticky top-0 bg-[var(--surface2)] z-10">Producto</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-[var(--text3)] sticky top-0 bg-[var(--surface2)] z-10">Cant.</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-[var(--text3)] sticky top-0 bg-[var(--surface2)] z-10">Precio</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-[var(--text3)] sticky top-0 bg-[var(--surface2)] z-10">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {detail.order_items?.map(item => (
                      <tr key={item.id}>
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-[var(--text)]">{item.products?.name ?? item.product_name ?? '(producto eliminado)'}</p>
                          {item.products?.barcode && <p className="text-[11px] text-[var(--text3)] mono">{item.products.barcode}</p>}
                        </td>
                        <td className="px-3 py-2.5 text-right mono text-[var(--text2)]">{item.quantity} {item.products?.unit ?? ''}</td>
                        <td className="px-3 py-2.5 text-right mono text-[var(--text2)]">{formatCurrency(item.unit_price)}</td>
                        <td className="px-3 py-2.5 text-right mono font-semibold text-[var(--text)]">{formatCurrency(item.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    {detail.discount > 0 && (
                      <tr className="border-t border-[var(--border)]">
                        <td colSpan={3} className="px-3 py-2 text-sm text-[var(--text3)]">Descuento</td>
                        <td className="px-3 py-2 text-right mono text-[var(--danger)]">− {formatCurrency(detail.discount)}</td>
                      </tr>
                    )}
                    <tr className="border-t-2 border-[var(--border)]">
                      <td colSpan={3} className="px-3 py-2.5 text-sm font-semibold sticky bottom-0 bg-[var(--surface2)]">
                        Total <span className="font-normal text-[var(--text3)]">· {detail.order_items?.length ?? 0} {(detail.order_items?.length ?? 0) === 1 ? 'ítem' : 'ítems'}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right mono font-bold text-[var(--accent)] sticky bottom-0 bg-[var(--surface2)]">{formatCurrency(detail.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
                <div className="sm:hidden px-3 py-3 pt-4 space-y-3 border-t border-[var(--border)]">
                  <div className="flex text-xs uppercase tracking-widest text-[var(--text3)] justify-between">
                    <span>Producto</span>
                    <span className="text-right">Subtotal</span>
                  </div>
                  <div className="border-b border-[var(--border)]" />
                  <div className="space-y-3 divide-y divide-[var(--border)] max-h-[300px] overflow-y-auto">
                    {detail.order_items?.map(item => (
                      <div key={item.id} className="space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-[var(--text)]">{item.products?.name ?? item.product_name ?? '(producto eliminado)'}</p>
                          <span className="mono text-[var(--text2)]">{formatCurrency(item.subtotal)}</span>
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-[var(--text3)]">
                          <span>
                            {item.quantity} {item.products?.unit ?? ''}
                          </span>
                          <span>{formatCurrency(item.unit_price)}</span>
                          {item.products?.barcode && (
                            <span className="mono truncate max-w-[180px]">{item.products.barcode}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {detail.discount > 0 && (
                    <div className="flex items-center justify-between text-xs text-[var(--danger)]">
                      <span>Descuento</span>
                      <span className="mono">− {formatCurrency(detail.discount)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>Total</span>
                    <span className="mono text-[var(--accent)]">{formatCurrency(detail.total)}</span>
                  </div>
                </div>
            </div>

            {detail.notes && (
              <div className="bg-[var(--surface2)] rounded-[var(--radius-md)] p-3 space-y-1">
                <p className="text-xs text-[var(--text3)]">Nota</p>
                <p className="text-sm text-[var(--text2)] italic">"{detail.notes}"</p>
              </div>
            )}

            {/* Depósito del pedido (solo lectura) — el stock se descuenta del
                depósito al crear el pedido; cambiarlo después no revalida ni
                mueve stock, por eso se muestra como info, no editable. */}
            {detail.warehouse_name && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-[var(--surface2)] rounded-[var(--radius-md)]">
                <span className="text-xs text-[var(--text3)] flex-shrink-0">Depósito:</span>
                <span className="text-sm font-medium text-[var(--text)]">{detail.warehouse_name}</span>
              </div>
            )}

            {/* Acciones del detalle */}
            {(() => {
              const canPay = (detail.payment_status === 'unpaid' || detail.payment_status === 'partial' || detail.payment_status === 'credit') && detail.status !== 'cancelled'
              const canInvoice = detail.status !== 'pending' && detail.status !== 'cancelled' && (!detailInvoice || detailInvoice.invoice_type === 'X')
              return (
                <div className="sticky bottom-0 z-10 -mx-5 mt-4 border-t border-[var(--border)] bg-[var(--surface)] px-5 pt-4 pb-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    {/* Documentos */}
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text3)]">Documentos</p>
                      <div className="flex flex-wrap gap-1">
                        <button
                          onClick={() => printOrder(detail)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-[var(--radius-md)] text-[var(--text2)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors">
                          <Printer size={14} /> Imprimir
                        </button>
                        <button
                          onClick={() => printRemito(detail)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-[var(--radius-md)] text-[var(--text2)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors">
                          <FileText size={14} /> Remito
                        </button>
                        {detail.sale_id && (
                          <button
                            onClick={() => setSaleDetailId(detail.sale_id!)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-[var(--radius-md)] text-[var(--text2)] hover:text-[var(--accent)] hover:bg-[var(--surface2)] transition-colors">
                            <Receipt size={14} /> Ver venta
                          </button>
                        )}
                        {detailInvoice && (
                          <button
                            onClick={() => router.push(`/invoices?open=${detailInvoice.id}`)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-[var(--radius-md)] text-[var(--text2)] hover:text-[var(--accent)] hover:bg-[var(--surface2)] transition-colors">
                            <FileText size={14} /> {detailInvoice.invoice_type}-{String(detailInvoice.numero).padStart(5, '0')}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Acciones primarias */}
                    {(canPay || canInvoice) && (
                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        {canPay && (
                          <button
                            onClick={() => {
                              setPaymentOrderId(detail.id)
                              setPaymentOrderPending(Math.max(0, Number(detail.total) - Number(detail.paid_amount)))
                              setPaymentModal(true)
                            }}
                            className="px-4 py-2 text-sm rounded-[var(--radius-md)] font-medium bg-[var(--surface2)] text-[var(--text2)] border border-[var(--border)] hover:bg-[var(--surface3)] transition-colors">
                            Registrar cobro
                          </button>
                        )}
                        {canInvoice && (
                          detailInvoice?.invoice_type === 'X' ? (
                            <button
                              onClick={() => setConvertInvoiceId(detailInvoice.id)}
                              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm rounded-[var(--radius-md)] font-medium bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors">
                              <Receipt size={14} /> Facturar
                            </button>
                          ) : (
                            <button
                              onClick={async () => {
                                // Refresca el pedido para que detailInvoice quede sincronizado
                                // (si el usuario cierra el modal de conversión, el comprobante ya existe).
                                const syncDetail = () =>
                                  api.get<OrderDetail>(`/api/orders/${detail.id}`)
                                    .then(d => { setDetail(d); if (d.invoices) setDetailInvoice(d.invoices) })
                                    .catch(() => {})
                                try {
                                  const inv = await api.post<{ id: string }>(`/api/orders/${detail.id}/invoice`, {})
                                  setConvertInvoiceId(inv.id)
                                  void syncDetail()
                                } catch (err: unknown) {
                                  // El pedido ya tenía comprobante (ej. se generó y se cerró el modal sin querer):
                                  // recuperamos el invoice_id existente y abrimos el modal en vez de mostrar error.
                                  const existingId = (err as { body?: { invoice_id?: string } })?.body?.invoice_id
                                  if (existingId) {
                                    setConvertInvoiceId(existingId)
                                    void syncDetail()
                                  } else {
                                    toast.error(err instanceof Error ? err.message : 'Error al generar comprobante')
                                  }
                                }
                              }}
                              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm rounded-[var(--radius-md)] font-medium bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors">
                              <Receipt size={14} /> Facturar
                            </button>
                          )
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
        )}
            </div>
          </div>
        )}

        {/* ── Panel nuevo pedido ── */}
        {newOrderModal && (
          <div className="w-full md:flex-1 overflow-y-auto flex flex-col">
            <div className="shrink-0 flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-[var(--border)] sticky top-0 bg-[var(--surface)] z-10">
              <h2 className="text-sm font-semibold text-[var(--text)]">Nuevo pedido</h2>
              <button
                onClick={closeNewOrder}
                className="p-1.5 rounded-md text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 p-4 sm:p-5 space-y-4">

          {/* Datos del cliente */}
          <div className="grid grid-cols-1 gap-3">
            {/* Cliente */}
            <div className="sm:col-span-3">
              {selectedCustomerId ? (
                <div className={`flex items-center justify-between px-3 py-2.5 rounded-[var(--radius-md)] border ${selectedCustomerCreditLimit > 0 && selectedCustomerBalance >= selectedCustomerCreditLimit ? 'bg-[var(--danger-subtle)] border-[var(--danger)]' : 'bg-[var(--accent-subtle)] border-[var(--accent)]'}`}>
                  <div>
                    <p className={`text-xs font-semibold ${selectedCustomerCreditLimit > 0 && selectedCustomerBalance >= selectedCustomerCreditLimit ? 'text-[var(--danger)]' : 'text-[var(--accent)]'}`}>{customerName}</p>
                    <p className="text-xs text-[var(--text3)]">
                      Saldo: <span className={`font-medium ${selectedCustomerBalance > 0 ? 'text-[var(--danger)]' : 'text-[var(--accent)]'}`}>{formatCurrency(selectedCustomerBalance)}</span>
                      {selectedCustomerCreditLimit > 0 && (
                        <span className="ml-2 text-[var(--text3)]">· límite: {formatCurrency(selectedCustomerCreditLimit)}</span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => { setSelectedCustomerId(null); setCustomerName(''); setCustomerQuery(''); setSelectedCustomerBalance(0); setSelectedCustomerCreditLimit(0) }}
                    className="text-xs text-[var(--text3)] hover:text-[var(--danger)]">✕</button>
                </div>
              ) : quickCustomerModal ? (
                <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--accent)] bg-[var(--accent-subtle)]/40 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-[var(--text)]">Nuevo cliente</p>
                    <button onClick={() => setQuickCustomerModal(false)}
                      className="text-xs text-[var(--text3)] hover:text-[var(--text)]">✕</button>
                  </div>
                  <Input label="Nombre y apellido *" value={qcForm.full_name}
                    onChange={e => setQcForm(f => ({ ...f, full_name: e.target.value }))}
                    placeholder="Ej: Juan García" autoFocus />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input label="CUIT / DNI" value={qcForm.document}
                      onChange={e => setQcForm(f => ({ ...f, document: e.target.value }))}
                      placeholder="20-12345678-9" />
                    <Input label="Teléfono" value={qcForm.phone}
                      onChange={e => setQcForm(f => ({ ...f, phone: e.target.value }))}
                      placeholder="11-1234-5678" />
                  </div>
                  <Input label="Límite de crédito" type="number" min="0" step="1000"
                    value={qcForm.credit_limit}
                    onChange={e => setQcForm(f => ({ ...f, credit_limit: e.target.value }))}
                    placeholder="0 = sin límite" hint="Podés modificarlo después desde Clientes" />
                  <div className="flex gap-2">
                    <Button variant="secondary" className="flex-1" onClick={() => setQuickCustomerModal(false)} disabled={qcSaving}>
                      Cancelar
                    </Button>
                    <Button className="flex-1" onClick={handleQuickCreate} loading={qcSaving}>
                      Crear y seleccionar
                    </Button>
                  </div>
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
                      onKeyDown={handleCustomerKeyDown}
                      placeholder="Buscar y seleccionar cliente..."
                      className="w-full pl-9 pr-4 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  {showCustomerDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-lg z-20 overflow-hidden">
                      {customerResults.length > 0 ? (
                        <>
                          {customerResults.map((c, idx) => (
                            <button key={c.id}
                              onClick={() => selectCustomer(c)}
                              onMouseEnter={() => setCustomerHighlight(idx)}
                              className={`w-full flex items-center justify-between px-3 py-2.5 transition-colors text-left border-b border-[var(--border)] last:border-0 ${customerHighlight === idx ? 'bg-[var(--surface2)]' : ''}`}>
                              <div>
                                <p className="text-sm font-medium text-[var(--text)]">{c.full_name}</p>
                                {(c.phone || c.document) && <p className="text-xs text-[var(--text3)]">{c.phone || `DNI ${c.document}`}</p>}
                              </div>
                              {Number(c.current_balance) > 0 && (
                                <span className="text-xs mono text-[var(--danger)]">{formatCurrency(c.current_balance)}</span>
                              )}
                            </button>
                          ))}
                          <button
                            onClick={openQuickCustomerCreate}
                            onMouseEnter={() => setCustomerHighlight(customerResults.length)}
                            className={`w-full flex items-center gap-2 px-3 py-2.5 transition-colors text-left border-t border-[var(--border)] ${customerHighlight === customerResults.length ? 'bg-[var(--accent-subtle)]' : 'bg-[var(--surface)]'}`}>
                            <Plus size={14} className="text-[var(--accent)]" />
                            <span className="text-sm font-medium text-[var(--accent)]">Crear cliente &quot;{trimmedCustomerQuery}&quot;</span>
                          </button>
                        </>
                      ) : !searchingCustomers ? (
                        <div className="p-3">
                          <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface2)] p-3">
                            <div className="flex items-start gap-2.5">
                              <AlertCircle size={16} className="mt-0.5 text-[var(--text3)]" />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-[var(--text)]">
                                  No encontramos clientes para &quot;{trimmedCustomerQuery}&quot;
                                </p>
                                <p className="mt-1 text-xs text-[var(--text3)]">
                                  Crealo ahora mismo sin salir del pedido.
                                </p>
                                <button
                                  onClick={() => { setQcForm({ full_name: trimmedCustomerQuery, document: '', phone: '', credit_limit: '' }); setQuickCustomerModal(true) }}
                                  className="mt-3 inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-2 text-xs font-medium text-white hover:bg-[var(--accent-hover)] transition-colors">
                                  <Plus size={13} />
                                  Crear cliente rápido
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Depósito + lista de precio */}
          <div className={`grid gap-3 ${sellerWarehouseId ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
            {!sellerWarehouseId && (
              <Select label="Depósito"
                options={warehouses.map(w => ({ value: w.id, label: w.name }))}
                value={warehouseId} onChange={e => { setWarehouseId(e.target.value); setCart([]); setProductResults([]) }} />
            )}
            {priceLists.length > 0 && (
              <Select label="Lista de precio"
                options={priceLists.map(pl => ({ value: pl.id, label: `${pl.name} (+${pl.margin_pct}%)` }))}
                value={priceListId} onChange={e => {
                  const newId = e.target.value
                  setPriceListId(newId)
                  if (cart.length > 0) {
                    const list = priceLists.find(pl => pl.id === newId)
                    setCart(prev => prev.map(i => {
                      const override = priceOverridesRef.current.get(i.product.id)?.get(newId)
                      return {
                        ...i,
                        unit_price: override ?? (list && i.product.cost_price
                          ? Math.round(i.product.cost_price * (1 + list.margin_pct / 100) * 100) / 100
                          : (i.product.sell_price || i.product.cost_price || i.unit_price)),
                      }
                    }))
                  }
                }} />
            )}
          </div>

          {/* Buscador de productos */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-[var(--text2)]">Productos</label>
              <button onClick={forceSync} disabled={cacheSyncing}
                className="flex items-center gap-1 text-xs text-[var(--text3)] hover:text-[var(--accent)] disabled:opacity-50 transition-colors">
                <RefreshCw size={11} className={cacheSyncing ? 'animate-spin text-[var(--accent)]' : ''} />
                {cacheSyncing ? 'Actualizando...' : 'Actualizar catálogo'}
              </button>
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
              {searchingProducts && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
              )}
              <input value={productQuery} onChange={e => setProductQuery(e.target.value)}
                onKeyDown={handleProductKeyDown}
                placeholder="Buscar producto por nombre o código..."
                className="w-full pl-9 pr-4 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
            {productResults.length > 0 && (
              <div className="mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] overflow-hidden shadow-lg">
                {productResults.map((p, idx) => (
                  <button key={p.id} onClick={() => addToCart(p)}
                    onMouseEnter={() => setProductHighlight(idx)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 transition-colors text-left border-b border-[var(--border)] last:border-0 ${productHighlight === idx ? 'bg-[var(--surface2)]' : ''}`}>
                    <div>
                      <p className="text-sm font-medium text-[var(--text)]">{p.name}</p>
                      {p.barcode && <p className="text-xs mono text-[var(--text3)]">{p.barcode}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-xs mono font-medium text-[var(--accent)]">{formatCurrency(
                        (() => {
                          const list = priceLists.find(pl => pl.id === priceListId)
                          return list && p.cost_price
                            ? Math.round(p.cost_price * (1 + list.margin_pct / 100) * 100) / 100
                            : (p.sell_price || p.cost_price || 0)
                        })()
                      )}</p>
                      <p className="text-xs text-[var(--text3)]">Stock: {p.stock_current}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Banner de stock insuficiente */}
          {cartStockIssues.length > 0 && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-[var(--danger-subtle)] border border-[var(--danger)] rounded-[var(--radius-md)] text-xs text-[var(--danger)]">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>
                <strong>{cartStockIssues.length} producto(s)</strong> con stock insuficiente. Ajustá las cantidades antes de crear el pedido.
              </span>
            </div>
          )}

          {/* Carrito del pedido */}
          {cart.length > 0 && (
            <div className="bg-[var(--surface2)] rounded-[var(--radius-lg)] overflow-hidden mb-4">
              <div className="divide-y divide-[var(--border)]">
                {cart.map(item => {
                  const hasStockIssue = stockEnabled && item.quantity > (item.product.stock_current ?? 0)
                  return (
                    <div key={item.product.id} className={`p-3 ${hasStockIssue ? 'bg-[var(--danger-subtle)]' : ''}`}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <p className="font-medium text-[var(--text)] text-sm leading-tight">{item.product.name}</p>
                          {hasStockIssue && (
                            <p className="text-xs text-[var(--danger)] font-medium mt-0.5">
                              ⚠ Stock disponible: {item.product.stock_current ?? 0}
                            </p>
                          )}
                        </div>
                        <button onClick={() => removeFromCart(item.product.id)}
                          className="p-1 -m-1 text-[var(--text3)] hover:text-[var(--danger)] flex-shrink-0">
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Cantidad */}
                        <div className="flex items-center gap-1">
                          <button onClick={() => updateCartQty(item.product.id, -1)}
                            className="w-7 h-7 flex items-center justify-center rounded-md bg-[var(--surface)] border border-[var(--border)] hover:text-[var(--accent)] transition-colors">
                            <Minus size={13} />
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity || ''}
                            onChange={e => setCartQty(item.product.id, e.target.value)}
                            onBlur={() => normalizeCartQty(item.product.id)}
                            onFocus={e => e.target.select()}
                            className="w-12 h-7 text-sm mono text-center bg-[var(--surface)] border border-[var(--border)] rounded-md focus:outline-none focus:border-[var(--accent)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button onClick={() => updateCartQty(item.product.id, 1)}
                            className="w-7 h-7 flex items-center justify-center rounded-md bg-[var(--surface)] border border-[var(--border)] hover:text-[var(--accent)] transition-colors">
                            <Plus size={13} />
                          </button>
                        </div>
                        {/* Precio unitario */}
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-[var(--text3)]">$</span>
                          <input type="number" min="0" step="0.01" value={item.unit_price}
                            onChange={e => updateCartPrice(item.product.id, e.target.value)}
                            className="w-24 h-7 text-sm mono text-right bg-[var(--surface)] border border-[var(--border)] rounded-md px-2 focus:outline-none focus:border-[var(--accent)]"
                          />
                        </div>
                        {/* Subtotal */}
                        <span className="mono text-sm font-semibold text-[var(--text)] ml-auto whitespace-nowrap">
                          {formatCurrency(item.unit_price * item.quantity)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <Select label="Método de cobro"
                  options={PAYMENT_METHODS}
                  value={collectedMethod}
                  onChange={e => setCollectedMethod(e.target.value as PaymentMethod)} />
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="monto-cobrado-pedido" className="text-sm font-medium text-[var(--text2)]">
                      Monto cobrado
                    </label>
                    <button type="button"
                      onClick={() => setCollectedAmount(String(Math.round(cartTotal * 100) / 100))}
                      className="text-xs font-medium text-[var(--accent)] hover:underline">
                      Total: {formatCurrency(cartTotal)}
                    </button>
                  </div>
                  <Input id="monto-cobrado-pedido" type="number" min="0"
                    value={collectedAmount} placeholder={String(Math.round(cartTotal * 100) / 100)}
                    onChange={e => setCollectedAmount(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          {/* Modo retiro (corralón): deuda a cuenta corriente + retiros en varias veces */}
          <div className="border border-[var(--border)] rounded-[var(--radius-md)] p-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={pickupMode}
                onChange={e => setPickupMode(e.target.checked)}
                className="w-4 h-4 accent-[var(--accent)]" />
              <span className="text-sm font-medium text-[var(--text)]">
                Modo retiro (retira en varias veces)
              </span>
            </label>
            {pickupMode && (
              <p className="mt-2 text-[11px] text-[var(--text3)]">
                La deuda se carga a la cuenta corriente del cliente al crear el pedido. Puede ir retirando la mercadería en varias veces y pagar cuando quiera (parcial o total).
              </p>
            )}
          </div>

              <div className="sticky bottom-0 -mx-4 sm:-mx-5 px-4 sm:px-5 bg-[var(--surface)] pt-3 pb-4 mt-2 border-t border-[var(--border)]">
                <div className="flex gap-2">
                  <Button variant="secondary" className="flex-1 sm:flex-none" onClick={discardNewOrder} disabled={savingOrder}>
                    Descartar
                  </Button>
                  <Button className="flex-1" onClick={handleCreateOrder} loading={savingOrder} disabled={cart.length === 0} title={isMac ? 'Atajo: ⌘ + Enter' : 'Atajo: Ctrl + Enter'}>
                    Crear pedido {cart.length > 0 ? `· ${formatCurrency(cartTotal)}` : ''}
                    <kbd className="ml-2 hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded border border-current/30 opacity-70">{isMac ? '⌘ + ↵' : 'Ctrl + ↵'}</kbd>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal confirmar entrega ── */}
      <Modal open={deliverModal} onClose={() => { setDeliverModal(false); setDeliverOrderId(null) }}
        title="Confirmar entrega" size="sm">
        {(() => {
          const total = Number(detail?.total ?? 0)
          const alreadyPaid = Number(detail?.paid_amount ?? 0)
          const pendingToCollect = Math.max(0, total - alreadyPaid)
          const fullyPaid = alreadyPaid > 0 && pendingToCollect <= 0
          return (
        <div className="space-y-4">
          <div className="px-3 py-2.5 bg-[var(--accent-subtle)] border border-[var(--accent)] rounded-[var(--radius-md)] text-xs text-[var(--accent)]">
            Se generará una venta automáticamente al confirmar la entrega.
          </div>
          {alreadyPaid > 0 && (
            <div className="px-3 py-2 bg-[var(--surface2)] border border-[var(--border)] rounded-[var(--radius-md)] text-xs text-[var(--text2)]">
              Ya cobrado: <span className="font-semibold text-[var(--text)]">{formatCurrency(alreadyPaid)}</span>
              {!fullyPaid && <> · Saldo a cobrar: <span className="font-semibold text-[var(--text)]">{formatCurrency(pendingToCollect)}</span></>}
            </div>
          )}
          {fullyPaid ? (
            <div className="px-3 py-2.5 bg-[var(--success-subtle,var(--surface2))] border border-[var(--success,var(--border))] rounded-[var(--radius-md)] text-xs text-[var(--text2)]">
              Este pedido ya está totalmente cobrado. No es necesario registrar un cobro adicional en la entrega.
            </div>
          ) : (
            <>
              <Select label="Método de cobro *"
                options={PAYMENT_METHODS}
                value={deliverMethod}
                onChange={e => setDeliverMethod(e.target.value as PaymentMethod)} />
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="monto-cobrado" className="text-sm font-medium text-[var(--text2)]">
                    Monto cobrado en la entrega
                  </label>
                  {pendingToCollect > 0 && (
                    <button type="button"
                      onClick={() => setDeliverAmount(String(pendingToCollect))}
                      className="text-xs font-medium text-[var(--accent)] hover:underline">
                      Saldo: {formatCurrency(pendingToCollect)}
                    </button>
                  )}
                </div>
                <Input id="monto-cobrado" type="number" min="0" max={pendingToCollect || undefined}
                  value={deliverAmount} placeholder="0 si no cobró en la entrega"
                  onChange={e => setDeliverAmount(e.target.value)} />
              </div>
            </>
          )}
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
          )
        })()}
      </Modal>

      {/* ── Modal registrar retiro parcial (modo retiro) ── */}
      {(() => {
        const allItems = detail?.order_items ?? []
        const pendingItems = allItems.filter(i => (i.quantity - (i.quantity_delivered ?? 0)) > 0)
        const deliveredItems = allItems.filter(i => (i.quantity - (i.quantity_delivered ?? 0)) <= 0)
        const totalPending = pendingItems.reduce((s, i) => s + (i.quantity - (i.quantity_delivered ?? 0)), 0)
        const q = withdrawSearch.trim().toLowerCase()
        const visiblePending = q
          ? pendingItems.filter(i => (i.products?.name ?? i.product_name ?? '').toLowerCase().includes(q))
          : pendingItems
        const selUnits = Object.values(withdrawQty).reduce((s, v) => s + (Number(v) || 0), 0)
        const selCount = Object.values(withdrawQty).filter(v => (Number(v) || 0) > 0).length
        const allFilled = totalPending > 0 && selUnits >= totalPending

        return (
      <Modal open={withdrawModal} onClose={() => { setWithdrawModal(false); setWithdrawOrderId(null) }}
        title="Registrar retiro" size="sm"
        footer={
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 min-h-[20px]">
              {!withdrawShowNote && (
                <button type="button" onClick={() => setWithdrawShowNote(true)}
                  className="text-xs font-medium text-[var(--accent)] hover:underline">
                  + Agregar nota
                </button>
              )}
              {selCount > 0 && (
                <span className="ml-auto text-xs text-[var(--text3)] whitespace-nowrap">
                  <span className="font-semibold text-[var(--text)]">{selCount}</span> ítem{selCount !== 1 ? 's' : ''} · <span className="font-semibold text-[var(--text)]">{selUnits}</span> u
                </span>
              )}
            </div>
            {withdrawShowNote && (
              <Input value={withdrawNotes} autoFocus
                onChange={e => setWithdrawNotes(e.target.value)}
                placeholder="Observaciones del retiro (opcional)" />
            )}
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => { setWithdrawModal(false); setWithdrawOrderId(null) }} disabled={withdrawing}>
                Cancelar
              </Button>
              <Button className="flex-1" onClick={handleWithdraw} loading={withdrawing} disabled={selCount === 0}>
                Registrar
              </Button>
            </div>
          </div>
        }>
        <div className="space-y-2.5">
          {/* Buscador (solo con muchos ítems) */}
          {pendingItems.length > 6 && (
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)] pointer-events-none" />
              <Input className="pl-9" value={withdrawSearch} placeholder="Buscar producto…"
                onChange={e => setWithdrawSearch(e.target.value)} />
            </div>
          )}

          {/* Encabezado: conteo + retirar todo */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] uppercase tracking-wide text-[var(--text3)] font-medium">
              {pendingItems.length} pendiente{pendingItems.length !== 1 ? 's' : ''} de retiro
            </span>
            {totalPending > 0 && (
              <button type="button" onClick={() => allFilled ? setWithdrawQty({}) : fillAllPending()}
                className="text-xs font-medium text-[var(--accent)] hover:underline">
                {allFilled ? 'Limpiar todo' : 'Retirar todo'}
              </button>
            )}
          </div>

          {/* Lista de pendientes */}
          {pendingItems.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--text3)]">No hay productos pendientes de retiro.</p>
          ) : visiblePending.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--text3)]">Sin resultados para «{withdrawSearch}».</p>
          ) : (
            <div className="space-y-1.5">
              {visiblePending.map(i => {
                const pending = i.quantity - (i.quantity_delivered ?? 0)
                const qty = Number(withdrawQty[i.id]) || 0
                return (
                  <div key={i.id} className={cn(
                    'flex items-center gap-3 px-2.5 py-2.5 rounded-[var(--radius-md)] border transition-colors',
                    qty > 0 ? 'bg-[var(--accent-subtle)] border-[var(--accent)]' : 'border-[var(--border)]'
                  )}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[var(--text)] truncate">{i.products?.name ?? i.product_name}</p>
                      <p className="text-[11px] text-[var(--text3)]">Pendiente: {pending} {i.products?.unit ?? ''}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button type="button" onClick={() => setWithdrawClamped(i.id, pending, qty - 1)}
                        disabled={qty <= 0}
                        className="w-9 h-9 flex items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface)] disabled:opacity-40 disabled:cursor-default transition-colors">
                        <Minus size={15} />
                      </button>
                      <input type="number" inputMode="numeric" min="0" max={pending}
                        value={withdrawQty[i.id] ?? ''} placeholder="0"
                        onChange={e => setWithdrawClamped(i.id, pending, Number(e.target.value))}
                        className="w-20 h-9 text-center text-sm tabular-nums rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                      <button type="button" onClick={() => setWithdrawClamped(i.id, pending, qty + 1)}
                        disabled={qty >= pending}
                        className="w-9 h-9 flex items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface)] disabled:opacity-40 disabled:cursor-default transition-colors">
                        <Plus size={15} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Acordeón: ya retirados */}
          {deliveredItems.length > 0 && (
            <div className="pt-1">
              <button type="button" onClick={() => setWithdrawShowDelivered(v => !v)}
                className="flex items-center gap-1.5 text-xs font-medium text-[var(--text3)] hover:text-[var(--text2)] transition-colors">
                <ChevronRight size={14} className={cn('transition-transform', withdrawShowDelivered && 'rotate-90')} />
                {deliveredItems.length} producto{deliveredItems.length !== 1 ? 's' : ''} ya retirado{deliveredItems.length !== 1 ? 's' : ''}
              </button>
              {withdrawShowDelivered && (
                <div className="mt-1.5 space-y-1">
                  {deliveredItems.map(i => (
                    <div key={i.id} className="flex items-center gap-2 px-2 py-1.5 text-xs text-[var(--text3)]">
                      <CheckCircle size={14} className="text-[var(--accent)] flex-shrink-0" />
                      <span className="truncate">{i.products?.name ?? i.product_name}</span>
                      <span className="ml-auto flex-shrink-0">{i.quantity} {i.products?.unit ?? ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>
        )
      })()}

      {/* ── Modal registrar cobro ── */}
      <Modal open={paymentModal} onClose={() => { setPaymentModal(false); setPaymentOrderId(null); setPaymentOrderPending(0) }}
        title="Registrar cobro" size="sm">
        <div className="space-y-4">
          <Select label="Método de cobro *"
            options={PAYMENT_METHODS}
            value={paymentMethod}
            onChange={e => setPaymentMethod(e.target.value as PaymentMethod)} />
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-[var(--text2)]">Monto *</span>
              {paymentOrderPending > 0 && (
                <button
                  onClick={() => setPaymentAmount(String(paymentOrderPending))}
                  className="text-xs font-medium text-[var(--accent)] hover:underline">
                  Total adeudado: {formatCurrency(paymentOrderPending)}
                </button>
              )}
            </div>
            <Input type="number" min="0"
              value={paymentAmount} placeholder="0.00"
              onChange={e => setPaymentAmount(e.target.value)} />
          </div>
          <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-4 border-t border-[var(--border)]">
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setPaymentModal(false); setPaymentOrderId(null); setPaymentOrderPending(0) }} disabled={registeringPayment}>
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
        {/* Selector de depósito */}
        {warehouses.length > 1 && (
          <div className="flex gap-2 flex-wrap items-center mb-4">
            <span className="text-xs text-[var(--text3)]">Depósito:</span>
            {warehouses.map(w => (
              <button key={w.id}
                onClick={() => { setPickingWarehouseId(w.id); fetchPickingList(w.id) }}
                className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors ${pickingWarehouseId === w.id
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--surface2)] text-[var(--text2)] hover:bg-[var(--surface3)]'
                  }`}>
                {w.name}
              </button>
            ))}
          </div>
        )}
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
          const done = pickingItems.filter(i => checkedItems.has(i.product_id))
          const sorted = [...pending, ...done]
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
                  onClick={() => setRemitoFormOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] border border-[var(--border)] text-[var(--text2)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors"
                >
                  <Truck size={13} /> Remito de traslado
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
              <div className="pb-6" />
            </div>
          )
        })()}
      </Modal>

      {/* ── Modal: Remito de traslado — datos de transporte ── */}
      <Modal
        open={remitoFormOpen}
        onClose={() => setRemitoFormOpen(false)}
        title="Datos del transporte"
        size="sm"
      >
        <div className="space-y-4">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text2)] mb-1">Patente del vehículo</label>
              <input
                type="text"
                placeholder="Ej: AB 123 CD"
                value={remitoTransport.patente}
                onChange={e => setRemitoTransport(prev => ({ ...prev, patente: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text2)] mb-1">Nombre del conductor</label>
              <input
                type="text"
                placeholder="Nombre y apellido"
                value={remitoTransport.conductor}
                onChange={e => setRemitoTransport(prev => ({ ...prev, conductor: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text2)] mb-1">DNI del conductor</label>
              <input
                type="text"
                placeholder="Ej: 33.456.789"
                value={remitoTransport.dni}
                onChange={e => setRemitoTransport(prev => ({ ...prev, dni: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
          </div>
          <p className="text-xs text-[var(--text3)]">Los datos se guardan automáticamente para la próxima vez.</p>
          <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-4 border-t border-[var(--border)]">
            <div className="flex justify-end gap-2 flex-wrap">
              <button
                onClick={() => setRemitoFormOpen(false)}
                className="px-4 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => { setRemitoFormOpen(false); printRemitoTraslado(remitoTransport) }}
                className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--accent)] text-white hover:opacity-90 transition-opacity font-medium"
              >
                <Printer size={14} /> Imprimir remito
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Modal: Por cliente ── */}
      <Modal
        open={byClientModal}
        onClose={() => setByClientModal(false)}
        title="Pedidos por cliente"
        size="lg"
      >
        {/* Selector de depósito */}
        {warehouses.length > 1 && (
          <div className="flex gap-2 flex-wrap items-center mb-4">
            <span className="text-xs text-[var(--text3)]">Depósito:</span>
            {warehouses.map(w => (
              <button key={w.id}
                onClick={() => { setPickingWarehouseId(w.id); fetchPickingList(w.id) }}
                className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors ${pickingWarehouseId === w.id
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--surface2)] text-[var(--text2)] hover:bg-[var(--surface3)]'
                  }`}>
                {w.name}
              </button>
            ))}
          </div>
        )}
        {loadingPicking ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : pickingItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-[var(--text3)]">
            <FileText size={32} className="opacity-40" />
            <p className="text-sm">No hay pedidos confirmados pendientes</p>
          </div>
        ) : (() => {
          // Agrupar por cliente
          const byCustomer: Record<string, { name: string; items: { product: string; barcode?: string; unit: string; qty: number }[] }> = {}
          pickingItems.forEach(item => {
            item.orders.forEach(o => {
              if (!byCustomer[o.customer_name]) byCustomer[o.customer_name] = { name: o.customer_name, items: [] }
              byCustomer[o.customer_name].items.push({ product: item.name, barcode: item.barcode, unit: item.unit, qty: o.quantity })
            })
          })
          const customers = Object.values(byCustomer)
          return (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-[var(--text3)]">
                  <span className="font-semibold text-[var(--text)] mono">{customers.length}</span> clientes ·{' '}
                  <span className="font-semibold text-[var(--text)] mono">
                    {new Set(pickingItems.flatMap(i => i.orders.map(o => o.id))).size}
                  </span>{' '}pedidos confirmados
                </p>
                <button
                  onClick={printByClient}
                  className="flex items-center gap-1.5 text-xs text-[var(--text3)] hover:text-[var(--text)] transition-colors"
                >
                  <Printer size={13} /> Imprimir A4
                </button>
              </div>
              <div className="space-y-3">
                {customers.map(customer => (
                  <div key={customer.name} className="border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
                    <div className="px-4 py-2.5 bg-[var(--surface2)] border-b border-[var(--border)]">
                      <p className="font-semibold text-sm text-[var(--text)]">{customer.name}</p>
                      <p className="text-xs text-[var(--text3)]">{customer.items.length} producto{customer.items.length !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="divide-y divide-[var(--border)]">
                      {customer.items.map((item, idx) => (
                        <div key={idx} className="px-4 py-2.5 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-[var(--text)] truncate">{item.product}</p>
                            {item.barcode && <p className="text-xs mono text-[var(--text3)]">{item.barcode}</p>}
                          </div>
                          <div className="flex-shrink-0 text-right">
                            <p className="text-xl font-bold mono text-[var(--accent)]">{item.qty}</p>
                            <p className="text-xs text-[var(--text3)]">{item.unit}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="pb-6" />
            </div>
          )
        })()}
      </Modal>

      {/* ── Modal detalle de venta vinculada ── */}
      <SaleDetailModal
        open={!!saleDetailId}
        onClose={() => { setSaleDetailId(null); setAutoConvertSale(false) }}
        saleId={saleDetailId}
        orderId={detail?.id}
        autoConvert={autoConvertSale}
      />

      <ConvertInvoiceModal
        open={!!convertInvoiceId}
        onClose={() => setConvertInvoiceId(null)}
        invoiceId={convertInvoiceId}
        fallbackCustomerName={detail?.customers?.full_name}
        onSuccess={() => { if (detail) openDetail(detail.id) }}
      />

      {/* ── Confirmación cancelación ── */}
      {cancelConfirmOrder && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setCancelConfirmOrder(null)} />
          <div className="relative bg-[var(--surface)] rounded-[var(--radius-lg)] p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-base font-semibold text-[var(--text)] mb-2">Cancelar pedido</h3>
            <p className="text-sm text-[var(--text2)] mb-1">
              ¿Confirmas la cancelación del pedido de <span className="font-medium text-[var(--text)]">{cancelConfirmOrder.customer_name}</span>?
            </p>
            <p className="text-xs text-[var(--text3)] mb-5">El stock reservado será devuelto al depósito.</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setCancelConfirmOrder(null)}
                className="px-4 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface2)] text-[var(--text2)] border border-[var(--border)]">
                Volver
              </button>
              <button
                onClick={async () => {
                  const { id } = cancelConfirmOrder
                  setCancelConfirmOrder(null)
                  await handleAction(id, 'cancel')
                }}
                className="px-4 py-2 text-sm rounded-[var(--radius-md)] font-medium bg-[var(--danger)] text-white hover:opacity-90">
                Cancelar pedido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmación de confirmar pedido ── */}
      {confirmOrder && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmOrder(null)} />
          <div className="relative bg-[var(--surface)] rounded-[var(--radius-lg)] p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-base font-semibold text-[var(--text)] mb-2">Confirmar pedido</h3>
            <p className="text-sm text-[var(--text2)] mb-5">
              ¿Confirmás el pedido de <span className="font-medium text-[var(--text)]">{confirmOrder.customer_name}</span>?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmOrder(null)}
                className="px-4 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface2)] text-[var(--text2)] border border-[var(--border)]">
                Volver
              </button>
              <button
                onClick={async () => {
                  const { id } = confirmOrder
                  setConfirmOrder(null)
                  await handleAction(id, 'confirm')
                }}
                className="px-4 py-2 text-sm rounded-[var(--radius-md)] font-medium bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]">
                Confirmar pedido
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <OrdersPageInner />
    </Suspense>
  )
}
