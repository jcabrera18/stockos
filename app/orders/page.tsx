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
  ClipboardList, Printer, Receipt, FileText, RefreshCw,
} from 'lucide-react'
import { SaleDetailModal } from '@/components/modules/SaleDetailModal'
import { useAuth } from '@/hooks/useAuth'
import { usePOSSync } from '@/hooks/usePOSSync'
import { searchProductsLocal } from '@/lib/pos-cache'
import { toast } from 'sonner'

// ─── Tipos ────────────────────────────────────────────────
type OrderStatus = 'pending' | 'confirmed' | 'delivered' | 'cancelled'
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
  sale_id?: string
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
  customers?: { full_name: string; current_balance: number; document?: string; phone?: string }
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
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

const STATUS_VARIANTS: Record<OrderStatus, 'default' | 'success' | 'warning' | 'danger'> = {
  pending: 'warning',
  confirmed: 'default',
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
export default function OrdersPage() {
  const router = useRouter()
  const { user: authUser } = useAuth()
  const stockEnabled      = authUser?.business?.stock_enabled ?? false
  const sellerWarehouseId = authUser?.role === 'seller' ? (authUser.warehouse_id ?? null) : null
  const { cacheReady, syncing: cacheSyncing, forceSync } = usePOSSync(null)

  // Lista
  const [orders, setOrders] = useState<OrderSummary[]>([])
  const [pagination, setPagination] = useState<PaginationType>({ total: 0, page: 1, limit: 20, pages: 0 })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('')
  const [search, setSearch] = useState('')
  const [idSearch, setIdSearch] = useState('')

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
  const [saleDetailId, setSaleDetailId] = useState<string | null>(null)
  const [detailInvoice, setDetailInvoice] = useState<{ id: string; invoice_type: string; numero: number } | null>(null)

  // Confirmación cancelación
  const [cancelConfirmOrder, setCancelConfirmOrder] = useState<{ id: string; customer_name: string } | null>(null)

  // Cobro parcial
  const [paymentModal, setPaymentModal] = useState(false)
  const [paymentOrderId, setPaymentOrderId] = useState<string | null>(null)
  const [paymentOrderPending, setPaymentOrderPending] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [registeringPayment, setRegisteringPayment] = useState(false)

  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState<{ id: string; full_name: string; phone?: string; current_balance: number; credit_limit: number }[]>([])
  const [searchingCustomers, setSearchingCustomers] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [selectedCustomerBalance, setSelectedCustomerBalance] = useState<number>(0)
  const [selectedCustomerCreditLimit, setSelectedCustomerCreditLimit] = useState<number>(0)

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
    const win = window.open('', '_blank', 'width=820,height=1000')
    if (!win) return
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
        <td class="col-num">${idx + 1}</td>
        <td>
          <strong>${item.name}</strong>
          ${item.barcode ? `<br><span class="col-barcode">${item.barcode}</span>` : ''}
        </td>
        <td class="col-clients">${item.orders.map(o => `${o.customer_name} <span class="qty-tag">×${o.quantity}</span>`).join('<br>')}</td>
        <td class="col-qty">${item.total_qty}</td>
        <td class="col-unit">${item.unit}</td>
      </tr>`
    ).join('')

    const destRows = Array.from(customerRows.entries()).map(([name, info]) =>
      `<tr>
        <td class="dest-name">${name}</td>
        <td class="dest-addr">${info.address_line || '<span style="color:#ccc">—</span>'}</td>
        <td class="dest-orders">${info.order_ids.join(', ')}</td>
      </tr>`
    ).join('')

    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Remito de Traslado ${docNumber}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0 }
        body { font-family: Arial, sans-serif; padding: 20px 24px; color: #111; font-size: 11px }
        @page { size: A4 portrait; margin: 12mm }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 12px }
        .biz-name { font-size: 17px; font-weight: 700; margin-bottom: 4px }
        .biz-info { font-size: 10px; color: #444; line-height: 1.7 }
        .doc-box { text-align: right }
        .doc-title { font-size: 18px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px }
        .doc-letra { display: inline-block; border: 2px solid #111; padding: 0 7px; font-size: 15px; font-weight: 700; margin-left: 6px; vertical-align: middle }
        .doc-sub { font-size: 10px; color: #666; margin-top: 4px; line-height: 1.8 }
        .section { margin-bottom: 11px }
        .section-title { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: .7px; color: #999; padding-bottom: 3px; border-bottom: 1px solid #e0e0e0; margin-bottom: 7px }
        .transport-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 28px }
        .t-row { display: flex; align-items: baseline; gap: 6px; padding: 2px 0 }
        .t-label { font-size: 9.5px; color: #888; white-space: nowrap; width: 66px; flex-shrink: 0 }
        .t-value { font-size: 10px; font-weight: 600 }
        table { width: 100%; border-collapse: collapse }
        th { background: #f0f0f0; text-align: left; padding: 5px 7px; font-size: 8.5px; text-transform: uppercase; color: #555; border-bottom: 2px solid #ccc; letter-spacing: .3px }
        td { padding: 5px 7px; border-bottom: 1px solid #eee; vertical-align: top; font-size: 10px }
        tr:nth-child(even) td { background: #fafafa }
        .col-num { color: #ccc; width: 20px; font-size: 10px }
        .col-barcode { font-size: 9px; color: #bbb; font-family: monospace; display: block; margin-top: 1px }
        .col-clients { font-size: 9px; color: #666; line-height: 1.7 }
        .qty-tag { color: #1a56db; font-weight: 700 }
        .col-qty { text-align: right; font-size: 14px; font-weight: 700; color: #1a56db; width: 46px }
        .col-unit { font-size: 9px; color: #999; white-space: nowrap; width: 44px }
        .dest-name { font-weight: 600; font-size: 10.5px }
        .dest-addr { font-size: 9.5px; color: #666 }
        .dest-orders { font-size: 9px; color: #999; font-family: monospace; white-space: nowrap }
        .totals-bar { display: flex; justify-content: flex-end; gap: 20px; margin-top: 5px; padding: 5px 8px; background: #f5f5f5; border-radius: 3px; font-size: 10px }
        .totals-bar .lbl { color: #777 }
        .totals-bar .val { font-weight: 700; color: #111; margin-left: 4px }
        .ref-bar { font-size: 9px; color: #aaa; margin-top: 6px; padding: 4px 8px; background: #fafafa; border: 1px solid #eee; border-radius: 3px }
        .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 28px }
        .sign-box { border-top: 1px solid #aaa; padding-top: 6px; text-align: center; font-size: 9px; color: #666; line-height: 1.6 }
        .footer { margin-top: 10px; font-size: 9px; color: #ccc; text-align: center; border-top: 1px solid #f0f0f0; padding-top: 6px }
        @media print { body { padding: 0 } }
      </style>
    </head><body>

    <div class="header">
      <div>
        <div class="biz-name">${biz?.name ?? ''}</div>
        <div class="biz-info">
          ${biz?.cuit ? `CUIT: ${biz.cuit}<br>` : ''}
          ${biz?.address ? `${biz.address}<br>` : ''}
          ${biz?.iva_condition ? `Cond. IVA: ${biz.iva_condition}` : ''}
        </div>
      </div>
      <div class="doc-box">
        <div class="doc-title">Remito de Traslado <span class="doc-letra">X</span></div>
        <div class="doc-sub">
          Pto. Venta 0001 &nbsp;·&nbsp; N° ${docNumber}<br>
          ${dateStr} &nbsp;·&nbsp; ${timeStr}
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Datos del traslado</div>
      <div class="transport-grid">
        <div class="t-row"><span class="t-label">Origen:</span><span class="t-value">${biz?.address ?? '—'}</span></div>
        <div class="t-row"><span class="t-label">Destino:</span><span class="t-value">Varios destinos según detalle</span></div>
        <div class="t-row"><span class="t-label">Patente:</span><span class="t-value">${transport.patente || '—'}</span></div>
        <div class="t-row"><span class="t-label">Conductor:</span><span class="t-value">${transport.conductor || '—'}</span></div>
        <div class="t-row"></div>
        <div class="t-row"><span class="t-label">DNI:</span><span class="t-value">${transport.dni || '—'}</span></div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Mercadería a transportar</div>
      <table>
        <thead><tr>
          <th>#</th><th>Descripción</th><th>Pedidos</th>
          <th style="text-align:right">Cant.</th><th>Unidad</th>
        </tr></thead>
        <tbody>${productRows}</tbody>
      </table>
      <div class="totals-bar">
        <span><span class="lbl">Productos:</span><span class="val">${pickingItems.length}</span></span>
        <span><span class="lbl">Total unidades:</span><span class="val">${totalUnits}</span></span>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Destinos</div>
      <table>
        <thead><tr><th>Cliente</th><th>Dirección</th><th>Pedido(s)</th></tr></thead>
        <tbody>${destRows}</tbody>
      </table>
    </div>

    <div class="ref-bar">Pedidos incluidos: ${allOrderRefs}</div>

    <div class="signatures">
      <div class="sign-box">Firma y aclaración<br>Transportista</div>
      <div class="sign-box">Firma y aclaración<br>Receptor</div>
      <div class="sign-box">Sello y firma<br>Empresa</div>
    </div>

    <div class="footer">Documento no válido como factura &nbsp;·&nbsp; ${biz?.name ?? ''} &nbsp;·&nbsp; StockOS</div>
    </body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 300)
  }

  const printByClient = () => {
    const byCustomer: Record<string, { name: string; items: { product: string; barcode?: string; unit: string; qty: number }[] }> = {}
    pickingItems.forEach(item => {
      item.orders.forEach(o => {
        if (!byCustomer[o.customer_name]) byCustomer[o.customer_name] = { name: o.customer_name, items: [] }
        byCustomer[o.customer_name].items.push({ product: item.name, barcode: item.barcode, unit: item.unit, qty: o.quantity })
      })
    })
    const win = window.open('', '_blank', 'width=820,height=1000')
    if (!win) return
    const date = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const sections = Object.values(byCustomer).map(customer =>
      `<div class="customer">
        <h2>${customer.name}</h2>
        <table>
          <thead><tr><th>Producto</th><th style="text-align:right">Cantidad</th></tr></thead>
          <tbody>${customer.items.map(i =>
        `<tr>
              <td>${i.product}${i.barcode ? `<br><span class="small">${i.barcode}</span>` : ''}</td>
              <td class="qty">${i.qty} <span class="unit">${i.unit}</span></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`
    ).join('')
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Pedidos por cliente</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0 }
        body { font-family: Arial, sans-serif; padding: 24px 28px; color: #111; font-size: 12px }
        @page { size: A4 portrait; margin: 15mm }
        h1 { font-size: 20px; font-weight: 700; margin-bottom: 3px }
        .meta { font-size: 11px; color: #666; margin-bottom: 18px }
        .customer { margin-bottom: 22px; page-break-inside: avoid }
        h2 { font-size: 14px; font-weight: 700; color: #1a56db; border-bottom: 2px solid #1a56db; padding-bottom: 4px; margin-bottom: 6px }
        table { width: 100%; border-collapse: collapse; margin-bottom: 4px }
        th { background: #f0f0f0; text-align: left; padding: 5px 8px; font-size: 10px; text-transform: uppercase; color: #444; border-bottom: 1px solid #ccc }
        td { padding: 5px 8px; border-bottom: 1px solid #eee; vertical-align: top }
        .qty { text-align: right; font-size: 15px; font-weight: 700; color: #1a56db; width: 80px }
        .unit { font-size: 10px; color: #888; font-weight: 400 }
        .small { font-size: 10px; color: #aaa }
        .footer { margin-top: 20px; font-size: 10px; color: #bbb; text-align: right; border-top: 1px solid #eee; padding-top: 8px }
      </style>
    </head><body>
      <h1>Pedidos por cliente</h1>
      <p class="meta">${date} &nbsp;·&nbsp; ${Object.keys(byCustomer).length} clientes &nbsp;·&nbsp; pedidos confirmados</p>
      ${sections}
      <div class="footer">Impreso el ${date} &nbsp;·&nbsp; StockOS</div>
    </body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 300)
  }

  const printRemito = (d: OrderDetail) => {
    const win = window.open('', '_blank', 'width=750,height=700')
    if (!win) return
    const date = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const biz = authUser?.business
    const rows = (d.order_items ?? []).map(i =>
      `<tr>
        <td>${i.products.name}${i.products.barcode ? `<br><span class="small">${i.products.barcode}</span>` : ''}</td>
        <td class="center">${i.quantity}</td>
        <td class="center">${i.products.unit}</td>
      </tr>`
    ).join('')
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Remito</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;padding:32px;color:#111;font-size:13px}
      .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #111}
      .biz-name{font-size:20px;font-weight:700}
      .biz-info{font-size:11px;color:#444;margin-top:4px;line-height:1.6}
      .remito-box{text-align:right}
      .remito-title{font-size:22px;font-weight:700;text-transform:uppercase;letter-spacing:1px}
      .remito-num{font-size:12px;color:#555;margin-top:4px}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
      .box{border:1px solid #ccc;border-radius:4px;padding:12px}
      .box .label{font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;font-weight:700}
      .box p{font-size:13px}
      .box .sub{font-size:12px;color:#555;margin-top:3px}
      table{width:100%;border-collapse:collapse;margin-bottom:24px}
      th{background:#f0f0f0;text-align:left;padding:8px 10px;font-size:11px;text-transform:uppercase;color:#555;border:1px solid #ccc}
      td{padding:9px 10px;border:1px solid #ddd;font-size:13px;vertical-align:top}
      .center{text-align:center}
      .small{font-size:11px;color:#888}
      .footer{margin-top:48px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:32px}
      .sign{border-top:1px solid #aaa;padding-top:8px;font-size:11px;color:#666;text-align:center}
      .note{font-size:10px;color:#888;text-align:center;margin-top:40px}
      @media print{body{padding:20px}}
    </style></head><body>
    <div class="header">
      <div>
        <div class="biz-name">${biz?.name ?? ''}</div>
        <div class="biz-info">
          ${biz?.cuit ? `CUIT: ${biz.cuit}<br>` : ''}
          ${biz?.address ? `${biz.address}<br>` : ''}
          ${biz?.phone ? `Tel: ${biz.phone}` : ''}
        </div>
      </div>
      <div class="remito-box">
        <div class="remito-title">Remito</div>
        <div class="remito-num">N° ${d.id.slice(0, 8).toUpperCase()}<br>${date}</div>
      </div>
    </div>

    <div class="grid">
      <div class="box">
        <div class="label">Destinatario</div>
        <p>${d.customer_name}</p>
        ${d.customers?.document ? `<div class="sub">DNI/CUIT: ${d.customers.document}</div>` : ''}
        ${d.customer_address ? `<div class="sub">${d.customer_address}</div>` : ''}
        ${(d.customer_phone || d.customers?.phone) ? `<div class="sub">Tel: ${d.customer_phone || d.customers?.phone}</div>` : ''}
      </div>
      <div class="box">
        <div class="label">Detalle</div>
        ${d.warehouse_name ? `<div class="sub">Depósito: ${d.warehouse_name}</div>` : ''}
        ${d.seller_name ? `<div class="sub">Vendedor: ${d.seller_name}</div>` : ''}
        <div class="sub">Pedido: ${d.id.slice(0, 8).toUpperCase()}</div>
      </div>
    </div>

    <table>
      <thead><tr><th>Producto</th><th class="center">Cantidad</th><th class="center">Unidad</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>

    ${d.notes ? `<p style="font-size:12px;color:#555;margin-bottom:20px"><em>Observaciones: ${d.notes}</em></p>` : ''}

    <div class="footer">
      <div class="sign">Firma y aclaración<br>Transportista</div>
      <div class="sign">Firma y aclaración<br>Receptor</div>
      <div class="sign">Sello y firma<br>Empresa</div>
    </div>
    <div class="note">Documento no válido como factura · ${biz?.name ?? ''}</div>
    </body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 300)
  }

  const printOrder = (d: OrderDetail) => {
    const win = window.open('', '_blank', 'width=750,height=700')
    if (!win) return
    const date = new Date(d.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const pending = Math.max(0, Number(d.total) - Number(d.paid_amount))
    const paymentLabel: Record<string, string> = {
      efectivo: 'Efectivo', transferencia: 'Transferencia', debito: 'Débito',
      credito: 'Crédito', qr: 'QR', cuenta_corriente: 'Cuenta corriente',
    }
    const rows = (d.order_items ?? []).map(i =>
      `<tr>
        <td>${i.products.name}${i.products.barcode ? `<br><span class="small">${i.products.barcode}</span>` : ''}</td>
        <td class="center">${i.quantity} ${i.products.unit}</td>
        <td class="right">${Number(i.unit_price).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</td>
        <td class="right">${Number(i.subtotal).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</td>
      </tr>`
    ).join('')
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Pedido</title>
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
      tfoot td{border-top:2px solid #ddd;border-bottom:none;font-weight:600}
      tfoot .total-row td{font-size:15px;color:#1a56db;padding-top:10px}
      .saldo{background:#fff8e1;border:1px solid #f59e0b;border-radius:6px;padding:12px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center}
      .saldo .amt{font-size:20px;font-weight:700;color:#b45309}
      .footer{margin-top:40px;display:grid;grid-template-columns:1fr 1fr;gap:40px}
      .sign{border-top:1px solid #aaa;padding-top:8px;font-size:11px;color:#666;text-align:center}
      @media print{button{display:none}}
    </style></head><body>
    <h1>Pedido de venta</h1>
    <p class="num">N° ${d.id.slice(0, 8).toUpperCase()} · ${date}${d.warehouse_name ? ` · Depósito: ${d.warehouse_name}` : ''}</p>

    <div class="grid">
      <div class="box">
        <div class="label">Cliente</div>
        <p>${d.customer_name}</p>
        ${d.customers?.document ? `<p class="sub">DNI: ${d.customers.document}</p>` : ''}
        ${(d.customer_phone || d.customers?.phone) ? `<p class="sub">Tel: ${d.customer_phone || d.customers?.phone}</p>` : ''}
        ${d.customer_address ? `<p class="sub">${d.customer_address}</p>` : ''}
        ${d.customers?.current_balance !== undefined ? `<p class="sub" style="margin-top:6px;color:${Number(d.customers.current_balance) > 0 ? '#dc2626' : '#16a34a'}"><strong>Saldo en cuenta: ${Number(d.customers.current_balance).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</strong></p>` : ''}
      </div>
      <div class="box">
        <div class="label">Estado del pago</div>
        <p>${PAYMENT_STATUS_LABELS[d.payment_status as PaymentStatus] ?? d.payment_status}</p>
        ${d.payment_method ? `<p class="sub">${paymentLabel[d.payment_method] ?? d.payment_method}</p>` : ''}
        ${Number(d.paid_amount) > 0 ? `<p class="sub">Cobrado: ${Number(d.paid_amount).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</p>` : ''}
      </div>
    </div>

    <table>
      <thead><tr><th>Producto</th><th class="center">Cant.</th><th class="right">Precio unit.</th><th class="right">Subtotal</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        ${Number(d.discount) > 0 ? `<tr><td colspan="3">Descuento</td><td class="right">− ${Number(d.discount).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</td></tr>` : ''}
        <tr class="total-row"><td colspan="3"><strong>Total</strong></td><td class="right"><strong>${Number(d.total).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</strong></td></tr>
      </tfoot>
    </table>

    ${pending > 0 ? `<div class="saldo"><span>Saldo pendiente de cobro de este pedido</span><span class="amt">${pending.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</span></div>` : ''}
    ${d.notes ? `<p style="font-size:12px;color:#555;margin-bottom:20px"><em>Notas: ${d.notes}</em></p>` : ''}
    ${d.seller_name ? `<p style="font-size:11px;color:#888">Vendedor: ${d.seller_name}</p>` : ''}

    <div class="footer">
      <div class="sign">Firma cliente</div>
      <div class="sign">Firma vendedor</div>
    </div>
    </body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 300)
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
      if (sellerWarehouseId) {
        setWarehouseId(sellerWarehouseId)
      } else {
        const def = wh.find(w => w.is_default)
        if (def) setWarehouseId(def.id)
      }
    }).catch(() => { })
  }, [])

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
        } catch { setProductResults([]) }
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
    if (!customerQuery.trim() || customerQuery.length < 2) { setCustomerResults([]); return }
    const timer = setTimeout(async () => {
      setSearchingCustomers(true)
      try {
        const data = await api.get<{ id: string; full_name: string; phone?: string; current_balance: number; credit_limit: number }[]>(
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
    setDetailInvoice(null)
    try {
      const d = await api.get<OrderDetail>(`/api/orders/${id}`)
      setDetail(d)
      if (d.sale_id) {
        api.get<{ id: string; invoice_type: string; numero: number } | null>(`/api/invoices/sale/${d.sale_id}`)
          .then(inv => { if (inv) setDetailInvoice(inv) })
          .catch(() => { })
      }
    } catch { toast.error('Error al cargar el pedido') }
    finally { setLoadingDetail(false) }
  }

  const addToCart = (product: Product) => {
    const list = priceLists.find(pl => pl.id === priceListId)
    const price = list && product.cost_price
      ? Math.round(product.cost_price * (1 + list.margin_pct / 100) * 100) / 100
      : (product.sell_price || product.cost_price || 0)
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
  const discountPct = Math.min(100, Math.max(0, Number(orderDiscount) || 0))
  const cartDiscount = Math.round(cartSubtotal * discountPct / 100 * 100) / 100
  const cartTotal = Math.max(0, cartSubtotal - cartDiscount)

  const resetOrderForm = () => {
    setOrderNotes(''); setOrderDiscount(''); setCart([])
    setPayAlreadyCollected(false); setCollectedAmount(''); setCollectedMethod('efectivo')
    setCustomerQuery(''); setCustomerResults([]); setSelectedCustomerId(null)
    setSelectedCustomerBalance(0); setSelectedCustomerCreditLimit(0)
  }

  const cartStockIssues = stockEnabled ? cart.filter(i => i.quantity > (i.product.stock_current ?? 0)) : []

  const handleCreateOrder = async () => {
    if (!selectedCustomerId) { toast.error('Seleccioná un cliente de la lista'); return }
    if (selectedCustomerCreditLimit > 0 && selectedCustomerBalance >= selectedCustomerCreditLimit) {
      toast.error(`${customerName} superó su límite de crédito (${formatCurrency(selectedCustomerCreditLimit)}). Saldo actual: ${formatCurrency(selectedCustomerBalance)}`)
      return
    }
    if (cart.length === 0) { toast.error('Agregá al menos un producto'); return }
    if (cartStockIssues.length > 0) { toast.error('Hay productos con stock insuficiente'); return }

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
      fetchOrders()
      if (detail?.id === id) {
        const updated = await api.get<OrderDetail>(`/api/orders/${id}`)
        setDetail(updated)
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
      const closedOrderId = paymentOrderId
      setPaymentOrderId(null)
      setPaymentAmount('')
      fetchOrders()
      if (detail?.id === closedOrderId) {
        const updated = await api.get<OrderDetail>(`/api/orders/${closedOrderId}`)
        setDetail(updated)
      }
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
      actions.push({ label: 'Confirmar entrega', action: 'deliver_modal', variant: 'success' as const })
    }
    if (['unpaid', 'partial'].includes(order.payment_status) && order.status !== 'cancelled') {
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
            <Button variant="secondary" onClick={openByClientList}>
              <FileText size={15} /> <span className="hidden sm:inline">Por cliente</span>
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
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
            <input value={idSearch} onChange={e => setIdSearch(e.target.value)}
              placeholder="N° remito..."
              className="pl-7 pr-3 py-1.5 text-xs rounded-full bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] w-32 font-mono"
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden sm:table-cell">N° Remito</th>
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
                  {orders.filter(o => !idSearch || o.id.slice(0, 8).toUpperCase().includes(idSearch.toUpperCase())).map(order => {
                    const actions = getActions(order)
                    return (
                      <tr key={order.id}
                        onClick={() => openDetail(order.id)}
                        className="hover:bg-[var(--surface2)] transition-colors cursor-pointer group">
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className="font-mono text-xs text-[var(--text2)] tracking-wider">{order.id.slice(0, 8).toUpperCase()}</span>
                        </td>
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
                                    setPaymentOrderId(order.id)
                                    setPaymentOrderPending(Math.max(0, Number(order.total) - Number(order.paid_amount)))
                                    setPaymentModal(true)
                                  } else if (a.action === 'cancel') {
                                    setCancelConfirmOrder({ id: order.id, customer_name: order.customer_name })
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
            </div>
            <Pagination pagination={pagination} onPageChange={handlePageChange} />
          </div>
        )}
      </div>

      {/* ── Modal detalle ── */}
      <Modal open={detailModal} onClose={() => { setDetailModal(false); setDetail(null); setDetailInvoice(null) }}
        title="Detalle del pedido" size="lg">
        {loadingDetail ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
          </div>
        ) : detail && (
          <div className="space-y-4">
            {/* Status timeline */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {detail.status === 'cancelled' ? (
                <>
                  {(['pending', 'confirmed', 'delivered'] as OrderStatus[]).map((s, i) => (
                    <div key={s} className="flex items-center gap-1 flex-shrink-0">
                      <div className="px-2 py-1 rounded text-xs font-medium bg-[var(--surface2)] text-[var(--text3)]">
                        {STATUS_LABELS[s]}
                      </div>
                      {i < 2 && <ChevronRight size={12} className="text-[var(--text3)] flex-shrink-0" />}
                    </div>
                  ))}
                  <ChevronRight size={12} className="text-[var(--text3)] flex-shrink-0" />
                  <div className="px-2 py-1 rounded text-xs font-medium bg-[var(--danger-subtle)] text-[var(--danger)]">
                    Cancelado
                  </div>
                </>
              ) : (
                (['pending', 'confirmed', 'delivered'] as OrderStatus[]).map((s, i) => {
                  const statuses: OrderStatus[] = ['pending', 'confirmed', 'delivered']
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
                      {i < 2 && <ChevronRight size={12} className="text-[var(--text3)] flex-shrink-0" />}
                    </div>
                  )
                })
              )}
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
              <span>· Remito: <strong className="mono">{detail.id.slice(0, 8).toUpperCase()}</strong></span>
              {detail.sale_id && (
                <span>· Venta: <strong className="text-[var(--accent)]">#{detail.sale_id.slice(0, 8).toUpperCase()}</strong></span>
              )}
              {detailInvoice && (
                <span>· Comprobante: <strong className="text-[var(--accent)]">{detailInvoice.invoice_type}-{String(detailInvoice.numero).padStart(5, '0')}</strong></span>
              )}
            </div>

            {/* Tabla de ítems */}
            <div className="bg-[var(--surface2)] rounded-[var(--radius-lg)] mb-4">
              <div className="hidden sm:block overflow-x-auto">
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
                    {detail.order_items?.map(item => (
                      <tr key={item.id}>
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-[var(--text)]">{item.products?.name ?? '(producto eliminado)'}</p>
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
                      <td colSpan={3} className="px-3 py-2.5 text-sm font-semibold">Total</td>
                      <td className="px-3 py-2.5 text-right mono font-bold text-[var(--accent)]">{formatCurrency(detail.total)}</td>
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
                  <div className="space-y-3 divide-y divide-[var(--border)]">
                    {detail.order_items?.map(item => (
                      <div key={item.id} className="space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-[var(--text)]">{item.products?.name ?? '(producto eliminado)'}</p>
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
            <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-4 border-t border-[var(--border)]">
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => printOrder(detail)}
                    className="flex flex-1 min-w-[150px] items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-[var(--radius-md)] text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors border border-[var(--border)]">
                    <Printer size={14} /> Imprimir
                  </button>
                  <button
                    onClick={() => printRemito(detail)}
                    className="flex flex-1 min-w-[150px] items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-[var(--radius-md)] text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors border border-[var(--border)]">
                    <FileText size={14} /> Remito
                  </button>
                  {detail.sale_id && (
                    <button
                      onClick={() => setSaleDetailId(detail.sale_id!)}
                      className="flex flex-1 min-w-[150px] items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-[var(--radius-md)] text-[var(--text3)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors border border-[var(--border)]">
                      <Receipt size={14} /> Ver venta
                    </button>
                  )}
                  {detailInvoice && (
                    <button
                      onClick={() => router.push(`/invoices?open=${detailInvoice.id}`)}
                      className="flex flex-1 min-w-[150px] items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-[var(--radius-md)] text-[var(--text3)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors border border-[var(--border)]">
                      <FileText size={14} /> Comprobante {detailInvoice.invoice_type}-{String(detailInvoice.numero).padStart(5, '0')}
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                  {getActions(detail).map(a => (
                    <button key={a.action}
                      onClick={() => {
                        if (a.action === 'deliver_modal') {
                          setDeliverOrderId(detail.id); setDeliverModal(true)
                        } else if (a.action === 'payment_modal') {
                          setPaymentOrderId(detail.id)
                          setPaymentOrderPending(Math.max(0, Number(detail.total) - Number(detail.paid_amount)))
                          setPaymentModal(true)
                        } else if (a.action === 'cancel') {
                          setCancelConfirmOrder({ id: detail.id, customer_name: detail.customer_name })
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
            </div>
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
                      placeholder="Buscar y seleccionar cliente..."
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
                            setSelectedCustomerBalance(Number(c.current_balance))
                            setSelectedCustomerCreditLimit(Number(c.credit_limit))
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
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Depósito + lista de precio */}
          <div className={`grid gap-3 ${sellerWarehouseId ? 'grid-cols-1' : 'grid-cols-2'}`}>
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
                    setCart(prev => prev.map(i => ({
                      ...i,
                      unit_price: list && i.product.cost_price
                        ? Math.round(i.product.cost_price * (1 + list.margin_pct / 100) * 100) / 100
                        : (i.product.sell_price || i.product.cost_price || i.unit_price),
                    })))
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
                  {cart.map(item => {
                    const hasStockIssue = stockEnabled && item.quantity > (item.product.stock_current ?? 0)
                    return (
                      <tr key={item.product.id} className={hasStockIssue ? 'bg-[var(--danger-subtle)]' : ''}>
                        <td className="px-3 py-2">
                          <p className="font-medium text-[var(--text)]">{item.product.name}</p>
                          {hasStockIssue && (
                            <p className="text-xs text-[var(--danger)] font-medium mt-0.5">
                              ⚠ Stock disponible: {item.product.stock_current ?? 0}
                            </p>
                          )}
                        </td>
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
                    )
                  })}
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
        onClose={() => setSaleDetailId(null)}
        saleId={saleDetailId}
        orderId={detail?.id}
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
    </AppShell>
  )
}
