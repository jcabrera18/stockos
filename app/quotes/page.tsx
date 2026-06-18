'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
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
import { Pagination } from '@/components/ui/Pagination'
import { api } from '@/lib/api'
import { formatCurrency, formatDateTime, cn } from '@/lib/utils'
import type { Product, Pagination as PaginationType } from '@/types'
import type { PriceList } from '@/app/price-lists/page'
import {
  Plus, Search, FileText, X, Minus, Trash2, ChevronRight,
  AlertCircle, Printer, RefreshCw, Clock, ShoppingCart,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePOSSync } from '@/hooks/usePOSSync'
import { useCollapseSidebar } from '@/contexts/SidePanelContext'
import { searchProductsLocal, searchCustomersLocal } from '@/lib/pos-cache'
import { toast } from 'sonner'

// ─── Tipos ────────────────────────────────────────────────
type QuoteStatus = 'draft' | 'converted' | 'cancelled'

interface QuoteSummary {
  id: string
  customer_name: string
  customer_phone?: string
  customer_address?: string
  status: QuoteStatus
  subtotal: number
  discount: number
  total: number
  valid_until?: string | null
  item_count: number
  total_units: number
  seller_name?: string
  price_list_name?: string
  notes?: string
  converted_order_id?: string | null
  created_at: string
}

interface QuoteDetail extends QuoteSummary {
  customer_id?: string | null
  price_list_id?: string | null
  quote_items: {
    id: string
    product_id: string
    product_name?: string
    quantity: number
    unit_price: number
    discount: number
    subtotal: number
    products: { name: string; barcode?: string; unit: string } | null
  }[]
  users?: { full_name: string }
  price_lists?: { name: string; margin_pct: number }
  customers?: { full_name: string; current_balance: number; document?: string; phone?: string }
  orders?: { id: string; status: string } | null
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
const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'Borrador',
  converted: 'Convertido',
  cancelled: 'Anulado',
}

const STATUS_VARIANTS: Record<QuoteStatus, 'default' | 'success' | 'warning' | 'danger'> = {
  draft: 'warning',
  converted: 'success',
  cancelled: 'danger',
}

const formatDate = (iso?: string | null) =>
  iso ? new Date(iso + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null

// ─── Componente principal ─────────────────────────────────
export default function QuotesPage() {
  const router = useRouter()
  const { user: authUser } = useAuth()
  const { cacheReady, syncing: cacheSyncing, forceSync } = usePOSSync(null)

  // Lista
  const [quotes, setQuotes] = useState<QuoteSummary[]>([])
  const [pagination, setPagination] = useState<PaginationType>({ total: 0, page: 1, limit: 20, pages: 0 })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | ''>('')
  const [search, setSearch] = useState('')

  // Detalle
  const [detailModal, setDetailModal] = useState(false)
  const [detail, setDetail] = useState<QuoteDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Nuevo presupuesto
  const [newQuoteModal, setNewQuoteModal] = useState(false)
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [priceLists, setPriceLists] = useState<PriceList[]>([])
  const priceOverridesRef = useRef<Map<string, Map<string, number>>>(new Map())

  // Form
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [priceListId, setPriceListId] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [quoteNotes, setQuoteNotes] = useState('')
  const [quoteDiscount, setQuoteDiscount] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [productQuery, setProductQuery] = useState('')
  const [productResults, setProductResults] = useState<Product[]>([])
  const [searchingProducts, setSearchingProducts] = useState(false)
  const [savingQuote, setSavingQuote] = useState(false)

  // Cliente (opcional — se permite prospecto suelto)
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState<{ id: string; full_name: string; phone?: string; current_balance: number; credit_limit: number }[]>([])
  const [searchingCustomers, setSearchingCustomers] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const customerSearchRequestRef = useRef(0)

  // Anulación
  const [cancelConfirm, setCancelConfirm] = useState<{ id: string; customer_name: string } | null>(null)

  // Conversión a pedido
  const [convertModal, setConvertModal] = useState(false)
  const [convertCustomerId, setConvertCustomerId] = useState<string | null>(null)
  const [convertCustomerName, setConvertCustomerName] = useState('')
  const [convertCustomerQuery, setConvertCustomerQuery] = useState('')
  const [convertCustomerResults, setConvertCustomerResults] = useState<{ id: string; full_name: string; phone?: string }[]>([])
  const [convertWarehouseId, setConvertWarehouseId] = useState('')
  const [converting, setConverting] = useState(false)

  const statusFilterRef = useRef(statusFilter)
  const searchRef = useRef(search)
  const pageRef = useRef(page)
  useEffect(() => { statusFilterRef.current = statusFilter }, [statusFilter])
  useEffect(() => { searchRef.current = search }, [search])

  const fetchQuotes = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number | undefined> = { page: pageRef.current, limit: 20 }
      if (statusFilterRef.current) params.status = statusFilterRef.current
      if (searchRef.current) params.search = searchRef.current
      const res = await api.get<{ data: QuoteSummary[]; pagination: PaginationType }>('/api/quotes', params)
      setQuotes(res.data)
      setPagination(res.pagination)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    pageRef.current = 1
    setPage(1)
    fetchQuotes()
  }, [statusFilter, search, fetchQuotes])

  const handlePageChange = useCallback((newPage: number) => {
    pageRef.current = newPage
    setPage(newPage)
    fetchQuotes()
  }, [fetchQuotes])

  // Cargar depósitos, listas de precio y overrides una vez
  useEffect(() => {
    Promise.all([
      api.get<Warehouse[]>('/api/warehouses'),
      api.get<PriceList[]>('/api/price-lists'),
      api.get<{ product_id: string; price_list_id: string; price: number }[]>('/api/products/price-overrides').catch(() => []),
    ]).then(([wh, pl, ovRaw]) => {
      setWarehouses(wh)
      setPriceLists(pl)
      setPriceListId(current => current || pl.find(list => list.is_default)?.id || pl[0]?.id || '')
      const ovMap = new Map<string, Map<string, number>>()
      for (const ov of ovRaw) {
        let inner = ovMap.get(ov.product_id)
        if (!inner) { inner = new Map(); ovMap.set(ov.product_id, inner) }
        inner.set(ov.price_list_id, ov.price)
      }
      priceOverridesRef.current = ovMap
    }).catch(() => { })
  }, [])

  // Búsqueda de productos (cache local / API fallback) — sin stock, es solo una cotización
  useEffect(() => {
    if (!productQuery.trim()) { setProductResults([]); return }

    if (cacheReady) {
      let cancelled = false
      searchProductsLocal(productQuery.trim(), 8).then(results => {
        if (!cancelled) setProductResults(results.filter(p => !cart.find(c => c.product.id === p.id)))
      })
      return () => { cancelled = true }
    }

    const timer = setTimeout(async () => {
      setSearchingProducts(true)
      try {
        const res = await api.get<{ data: Product[] }>('/api/products', { search: productQuery.trim(), limit: 6 })
        setProductResults(res.data.filter(p => !cart.find(c => c.product.id === p.id)))
      } catch { setProductResults([]) }
      finally { setSearchingProducts(false) }
    }, 300)
    return () => clearTimeout(timer)
  }, [productQuery, cart, cacheReady])

  // Búsqueda de clientes (cache local + server) para el form nuevo
  useEffect(() => {
    const query = customerQuery.trim()
    if (query.length < 2 || selectedCustomerId) {
      customerSearchRequestRef.current += 1
      setCustomerResults([])
      setSearchingCustomers(false)
      return
    }
    const requestId = ++customerSearchRequestRef.current
    const timer = setTimeout(async () => {
      const local = (await searchCustomersLocal(query)).map(c => ({
        id: c.id, full_name: c.full_name, phone: c.phone,
        current_balance: c.current_balance, credit_limit: c.credit_limit,
      }))
      if (customerSearchRequestRef.current === requestId && local.length > 0) setCustomerResults(local)
      setSearchingCustomers(true)
      try {
        const data = await api.get<{ id: string; full_name: string; phone?: string; current_balance: number; credit_limit: number }[]>(
          `/api/customers/search?q=${encodeURIComponent(query)}`
        )
        if (customerSearchRequestRef.current === requestId) setCustomerResults(data)
      } catch {
        if (customerSearchRequestRef.current === requestId && local.length === 0) setCustomerResults([])
      } finally {
        if (customerSearchRequestRef.current === requestId) setSearchingCustomers(false)
      }
    }, 180)
    return () => clearTimeout(timer)
  }, [customerQuery, selectedCustomerId])

  // Búsqueda de clientes para el modal de conversión
  useEffect(() => {
    const query = convertCustomerQuery.trim()
    if (query.length < 2 || convertCustomerId) { setConvertCustomerResults([]); return }
    const timer = setTimeout(async () => {
      try {
        const data = await api.get<{ id: string; full_name: string; phone?: string }[]>(
          `/api/customers/search?q=${encodeURIComponent(query)}`
        )
        setConvertCustomerResults(data)
      } catch { setConvertCustomerResults([]) }
    }, 180)
    return () => clearTimeout(timer)
  }, [convertCustomerQuery, convertCustomerId])

  const openDetail = async (id: string) => {
    setNewQuoteModal(false)
    setDetailModal(true)
    setLoadingDetail(true)
    try {
      const d = await api.get<QuoteDetail>(`/api/quotes/${id}`)
      setDetail(d)
    } catch { toast.error('Error al cargar el presupuesto') }
    finally { setLoadingDetail(false) }
  }

  // ─── Carrito ─────────────────────────────────────────────
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

  const updateCartQty = (id: string, delta: number) =>
    setCart(prev => prev.map(i => i.product.id === id
      ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i))

  const setCartQty = (id: string, value: string) => {
    const n = parseInt(value, 10)
    if (!value) setCart(prev => prev.map(i => i.product.id === id ? { ...i, quantity: 0 } : i))
    else if (!isNaN(n) && n >= 1) setCart(prev => prev.map(i => i.product.id === id ? { ...i, quantity: n } : i))
  }

  const normalizeCartQty = (id: string) =>
    setCart(prev => prev.map(i => i.product.id === id ? { ...i, quantity: Math.max(1, i.quantity) } : i))

  const updateCartPrice = (id: string, value: string) =>
    setCart(prev => prev.map(i => i.product.id === id ? { ...i, unit_price: Math.max(0, Number(value) || 0) } : i))

  const removeFromCart = (id: string) =>
    setCart(prev => prev.filter(i => i.product.id !== id))

  const cartSubtotal = cart.reduce((a, i) => a + i.unit_price * i.quantity - i.discount, 0)
  const discountPct = Math.min(100, Math.max(0, Number(quoteDiscount) || 0))
  const cartDiscount = Math.round(cartSubtotal * discountPct / 100 * 100) / 100
  const cartTotal = Math.max(0, cartSubtotal - cartDiscount)

  const getPriceListLabel = (id?: string | null) => {
    if (!id) return null
    const list = priceLists.find(pl => pl.id === id)
    return list ? `${list.name} (+${list.margin_pct}%)` : id.slice(0, 8).toUpperCase()
  }

  const resetForm = () => {
    setCustomerName(''); setCustomerPhone(''); setQuoteNotes(''); setQuoteDiscount('')
    setValidUntil(''); setCart([])
    setCustomerQuery(''); setCustomerResults([]); setSelectedCustomerId(null)
    setPriceListId(priceLists.find(pl => pl.is_default)?.id ?? priceLists[0]?.id ?? '')
  }

  const openNewQuote = () => {
    setDetailModal(false); setDetail(null)
    setNewQuoteModal(true)
  }

  const handleCreateQuote = async () => {
    if (!customerName.trim()) { toast.error('Ingresá un cliente o nombre de prospecto'); return }
    if (cart.length === 0) { toast.error('Agregá al menos un producto'); return }
    setSavingQuote(true)
    try {
      await api.post('/api/quotes', {
        customer_id: selectedCustomerId ?? null,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim() || null,
        price_list_id: priceListId || null,
        discount: cartDiscount,
        valid_until: validUntil || null,
        notes: quoteNotes.trim() || null,
        items: cart.map(i => ({
          product_id: i.product.id,
          quantity: i.quantity,
          unit_price: i.unit_price,
          discount: i.discount,
        })),
      })
      toast.success('Presupuesto creado')
      resetForm()
      setNewQuoteModal(false)
      fetchQuotes()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al crear el presupuesto')
    } finally { setSavingQuote(false) }
  }

  const handleCancel = async (id: string) => {
    try {
      await api.post(`/api/quotes/${id}/cancel`, {})
      toast.success('Presupuesto anulado')
      fetchQuotes()
      if (detail?.id === id) {
        const updated = await api.get<QuoteDetail>(`/api/quotes/${id}`)
        setDetail(updated)
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al anular')
    }
  }

  // ─── Conversión a pedido ─────────────────────────────────
  const openConvert = () => {
    if (!detail) return
    setConvertCustomerId(detail.customer_id ?? null)
    setConvertCustomerName(detail.customer_id ? detail.customer_name : '')
    setConvertCustomerQuery('')
    setConvertCustomerResults([])
    const defWh = warehouses.find(w => w.is_default)
    setConvertWarehouseId(defWh?.id ?? warehouses[0]?.id ?? '')
    setConvertModal(true)
  }

  const handleConvert = async () => {
    if (!detail) return
    if (!convertCustomerId) { toast.error('Seleccioná un cliente registrado para el pedido'); return }
    setConverting(true)
    try {
      const res = await api.post<{ order_id: string }>(`/api/quotes/${detail.id}/convert`, {
        customer_id: convertCustomerId,
        warehouse_id: convertWarehouseId || null,
      })
      toast.success('Presupuesto convertido en pedido')
      setConvertModal(false)
      fetchQuotes()
      router.push(`/orders?open=${res.order_id}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al convertir'
      msg.split('\n').forEach((line, i) => setTimeout(() => toast.error(line), i * 150))
    } finally { setConverting(false) }
  }

  // ─── Impresión ───────────────────────────────────────────
  const printQuote = (d: QuoteDetail) => {
    const win = window.open('', '_blank', 'width=750,height=700')
    if (!win) return
    const date = new Date(d.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const biz = authUser?.business
    const rows = (d.quote_items ?? []).map(i =>
      `<tr>
        <td>${i.products?.name ?? i.product_name ?? '(producto eliminado)'}${i.products?.barcode ? `<br><span class="small">${i.products.barcode}</span>` : ''}</td>
        <td class="center">${i.quantity} ${i.products?.unit ?? ''}</td>
        <td class="right">${Number(i.unit_price).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</td>
        <td class="right">${Number(i.subtotal).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</td>
      </tr>`
    ).join('')
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Presupuesto</title>
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
      .valid{background:#fff8e1;border:1px solid #f59e0b;border-radius:6px;padding:10px 14px;margin-bottom:20px;font-size:12px;color:#b45309}
      .footer{margin-top:40px;display:grid;grid-template-columns:1fr 1fr;gap:40px}
      .sign{border-top:1px solid #aaa;padding-top:8px;font-size:11px;color:#666;text-align:center}
      @media print{button{display:none}}
    </style></head><body>
    <h1>Presupuesto</h1>
    <p class="num">N° ${d.id.slice(0, 8).toUpperCase()} · ${date}</p>

    <div class="grid">
      <div class="box">
        <div class="label">Emisor</div>
        <p>${biz?.name ?? ''}</p>
        ${biz?.cuit ? `<p class="sub">CUIT: ${biz.cuit}</p>` : ''}
        ${biz?.address ? `<p class="sub">${biz.address}</p>` : ''}
        ${biz?.phone ? `<p class="sub">Tel: ${biz.phone}</p>` : ''}
      </div>
      <div class="box">
        <div class="label">Cliente</div>
        <p>${d.customer_name}</p>
        ${d.customers?.document ? `<p class="sub">DNI/CUIT: ${d.customers.document}</p>` : ''}
        ${(d.customer_phone || d.customers?.phone) ? `<p class="sub">Tel: ${d.customer_phone || d.customers?.phone}</p>` : ''}
      </div>
    </div>

    ${d.valid_until ? `<div class="valid">Presupuesto válido hasta el <strong>${formatDate(d.valid_until)}</strong>. Precios sujetos a modificación luego de esa fecha.</div>` : ''}

    <table>
      <thead><tr><th>Producto</th><th class="center">Cant.</th><th class="right">Precio unit.</th><th class="right">Subtotal</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        ${Number(d.discount) > 0 ? `<tr><td colspan="3">Descuento</td><td class="right">− ${Number(d.discount).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</td></tr>` : ''}
        <tr class="total-row"><td colspan="3"><strong>Total</strong></td><td class="right"><strong>${Number(d.total).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</strong></td></tr>
      </tfoot>
    </table>

    ${d.notes ? `<p style="font-size:12px;color:#555;margin-bottom:20px"><em>Notas: ${d.notes}</em></p>` : ''}

    <div class="footer">
      <div class="sign">Firma cliente</div>
      <div class="sign">Firma emisor</div>
    </div>
    <div style="font-size:10px;color:#aaa;text-align:center;margin-top:24px">Presupuesto sin validez fiscal · ${biz?.name ?? ''} · StockOS</div>
    </body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 300)
  }

  const sidePanelOpen = detailModal || newQuoteModal
  useCollapseSidebar(sidePanelOpen)
  const trimmedCustomerQuery = customerQuery.trim()
  const showCustomerDropdown = !selectedCustomerId && trimmedCustomerQuery.length >= 2

  return (
    <AppShell>
      <div className="flex h-full overflow-hidden">
        <div className={cn(
          'flex flex-col overflow-hidden transition-all',
          sidePanelOpen ? 'hidden md:flex md:w-[30%] md:border-r md:border-[var(--border)]' : 'w-full flex'
        )}>
          <div className="shrink-0">
            <PageHeader
              title="Presupuestos"
              description={`${pagination.total} presupuestos`}
              action={
                !newQuoteModal && (
                  <Button onClick={openNewQuote}>
                    <Plus size={15} /> <span className={cn(detailModal && 'hidden lg:inline')}>Nuevo presupuesto</span>
                  </Button>
                )
              }
            />
          </div>

          <div className="overflow-y-auto flex-1 p-5 space-y-4">
            <HelpBanner id="quotes" title="¿Cómo funcionan los presupuestos?">
              <p>Cotizá productos a un cliente o prospecto sin afectar el stock. Cuando el cliente acepta, <strong>convertí el presupuesto en pedido</strong> con un click — ahí recién se reserva/descuenta el stock.</p>
            </HelpBanner>

            {/* Filtros */}
            <div className="space-y-2">
              <div className="flex items-center gap-1 rounded-full bg-[var(--surface2)] border border-[var(--border)] p-0.5 w-fit max-w-full overflow-x-auto">
                {([['', 'Todos'], ['draft', 'Borradores'], ['converted', 'Convertidos'],
                ['cancelled', 'Anulados']] as [string, string][]).map(([val, label]) => (
                  <button key={val} onClick={() => setStatusFilter(val as QuoteStatus | '')}
                    className={`px-3 py-1 text-xs rounded-full font-medium whitespace-nowrap transition-colors ${statusFilter === val
                      ? 'bg-[var(--accent)] text-white'
                      : 'text-[var(--text2)] hover:text-[var(--text)]'
                      }`}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar cliente..."
                  className="w-full pl-7 pr-3 py-1.5 text-xs rounded-full bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>

            {/* Tabla */}
            {loading ? <PageLoader /> : quotes.length === 0 ? (
              <EmptyState icon={FileText} title="Sin presupuestos"
                description="Creá una cotización con el botón 'Nuevo presupuesto'."
                action={<Button onClick={openNewQuote}><Plus size={15} />Nuevo presupuesto</Button>}
              />
            ) : (
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className={cn('w-full text-sm', !sidePanelOpen && 'min-w-[640px]')}>
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        {!sidePanelOpen && <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden sm:table-cell">N°</th>}
                        <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)]">Cliente</th>
                        {!sidePanelOpen && <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden md:table-cell">Vendedor</th>}
                        <th className="text-center px-4 py-3 text-xs font-medium text-[var(--text3)]">Estado</th>
                        {!sidePanelOpen && <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden lg:table-cell">Válido hasta</th>}
                        <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)]">Total</th>
                        {!sidePanelOpen && <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden sm:table-cell">Fecha</th>}
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {quotes.map(quote => (
                        <tr key={quote.id}
                          onClick={() => openDetail(quote.id)}
                          className={cn(
                            'hover:bg-[var(--surface2)] transition-colors cursor-pointer group',
                            detail?.id === quote.id && 'bg-[var(--accent)]/8 hover:bg-[var(--accent)]/12'
                          )}>
                          {!sidePanelOpen && (
                            <td className="px-4 py-3 hidden sm:table-cell">
                              <span className="font-mono text-xs text-[var(--text2)] tracking-wider">{quote.id.slice(0, 8).toUpperCase()}</span>
                            </td>
                          )}
                          <td className="px-4 py-3">
                            <p className="font-medium text-[var(--text)]">{quote.customer_name}</p>
                            {quote.customer_phone && (
                              <p className="text-xs text-[var(--text3)] truncate max-w-[160px]">{quote.customer_phone}</p>
                            )}
                          </td>
                          {!sidePanelOpen && <td className="px-4 py-3 text-[var(--text2)] hidden md:table-cell">{quote.seller_name ?? '—'}</td>}
                          <td className="px-4 py-3 text-center">
                            <Badge variant={STATUS_VARIANTS[quote.status]}>{STATUS_LABELS[quote.status]}</Badge>
                          </td>
                          {!sidePanelOpen && (
                            <td className="px-4 py-3 text-xs text-[var(--text3)] hidden lg:table-cell">
                              {formatDate(quote.valid_until) ?? '—'}
                            </td>
                          )}
                          <td className="px-4 py-3 text-right mono font-semibold text-[var(--text)]">
                            {formatCurrency(quote.total)}
                          </td>
                          {!sidePanelOpen && (
                            <td className="px-4 py-3 text-xs text-[var(--text3)] hidden sm:table-cell">
                              {formatDateTime(quote.created_at)}
                            </td>
                          )}
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                              <ChevronRight size={14} className="text-[var(--text3)]" />
                            </div>
                          </td>
                        </tr>
                      ))}
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
              <h2 className="text-sm font-semibold text-[var(--text)]">Detalle del presupuesto</h2>
              <button
                onClick={() => { setDetailModal(false); setDetail(null) }}
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
                  {/* Estado + fechas */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={STATUS_VARIANTS[detail.status]}>{STATUS_LABELS[detail.status]}</Badge>
                    <span className="text-[11px] text-[var(--text3)]">Creado <span className="font-medium text-[var(--text2)]">{formatDateTime(detail.created_at)}</span></span>
                    {detail.valid_until && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text3)]">
                        <Clock size={11} /> Válido hasta <span className="font-medium text-[var(--text2)]">{formatDate(detail.valid_until)}</span>
                      </span>
                    )}
                  </div>

                  {detail.status === 'converted' && detail.converted_order_id && (
                    <button
                      onClick={() => router.push(`/orders?open=${detail.converted_order_id}`)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-[var(--radius-md)] bg-[var(--accent-subtle)] border border-[var(--accent)] text-[var(--accent)] hover:opacity-90 transition-opacity">
                      <span className="text-sm font-medium flex items-center gap-1.5">
                        <ShoppingCart size={14} /> Pedido generado #{detail.converted_order_id.slice(0, 8).toUpperCase()}
                      </span>
                      <ChevronRight size={15} />
                    </button>
                  )}

                  {/* Cliente */}
                  <div className="bg-[var(--surface2)] rounded-[var(--radius-md)] p-3.5 flex flex-col gap-1.5">
                    <p className="text-xs text-[var(--text3)]">Cliente</p>
                    <p className="text-sm font-semibold text-[var(--text)] leading-tight">{detail.customer_name}</p>
                    <div className="flex flex-col gap-0.5 text-xs text-[var(--text2)]">
                      {!detail.customer_id && <span className="text-[var(--text3)] italic">Prospecto (sin cuenta registrada)</span>}
                      {detail.customers?.document && <span>DNI/CUIT: <span className="mono">{detail.customers.document}</span></span>}
                      {(detail.customer_phone || detail.customers?.phone) && <span>Tel: {detail.customer_phone || detail.customers?.phone}</span>}
                    </div>
                  </div>

                  {/* Chips */}
                  <div className="flex gap-1.5 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-[var(--radius-md)] bg-[var(--surface2)] text-[11px] text-[var(--text3)]">
                      N° <strong className="mono font-semibold text-[var(--text2)]">{detail.id.slice(0, 8).toUpperCase()}</strong>
                    </span>
                    {detail.price_list_id && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-[var(--radius-md)] bg-[var(--surface2)] text-[11px] text-[var(--text3)]">
                        Lista <strong className="font-semibold text-[var(--text2)]">{detail.price_lists ? `${detail.price_lists.name} (+${detail.price_lists.margin_pct}%)` : getPriceListLabel(detail.price_list_id)}</strong>
                      </span>
                    )}
                    {(detail.seller_name || detail.users?.full_name) && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-[var(--radius-md)] bg-[var(--surface2)] text-[11px] text-[var(--text3)]">
                        Vendedor <strong className="font-semibold text-[var(--text2)]">{detail.seller_name || detail.users?.full_name}</strong>
                      </span>
                    )}
                  </div>

                  {/* Items */}
                  <div className="bg-[var(--surface2)] rounded-[var(--radius-lg)] mb-4">
                    <div className="overflow-auto max-h-[320px]">
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
                          {detail.quote_items?.map(item => (
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
                              Total <span className="font-normal text-[var(--text3)]">· {detail.quote_items?.length ?? 0} {(detail.quote_items?.length ?? 0) === 1 ? 'ítem' : 'ítems'}</span>
                            </td>
                            <td className="px-3 py-2.5 text-right mono font-bold text-[var(--accent)] sticky bottom-0 bg-[var(--surface2)]">{formatCurrency(detail.total)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {detail.notes && (
                    <div className="bg-[var(--surface2)] rounded-[var(--radius-md)] p-3 space-y-1">
                      <p className="text-xs text-[var(--text3)]">Nota</p>
                      <p className="text-sm text-[var(--text2)] italic">&quot;{detail.notes}&quot;</p>
                    </div>
                  )}

                  {/* Acciones */}
                  <div className="sticky bottom-0 z-10 -mx-5 mt-4 border-t border-[var(--border)] bg-[var(--surface)] px-5 pt-4 pb-5">
                    <div className="flex flex-wrap items-center gap-2 justify-between">
                      <div className="flex flex-wrap gap-1">
                        <button
                          onClick={() => printQuote(detail)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-[var(--radius-md)] text-[var(--text2)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors">
                          <Printer size={14} /> Imprimir
                        </button>
                        {detail.status === 'draft' && (
                          <button
                            onClick={() => setCancelConfirm({ id: detail.id, customer_name: detail.customer_name })}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-[var(--radius-md)] text-[var(--text2)] hover:text-[var(--danger)] hover:bg-[var(--surface2)] transition-colors">
                            <Trash2 size={14} /> Anular
                          </button>
                        )}
                      </div>
                      {detail.status === 'draft' && (
                        <Button onClick={openConvert}>
                          <ShoppingCart size={15} /> Convertir en pedido
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Panel nuevo presupuesto ── */}
        {newQuoteModal && (
          <div className="w-full md:flex-1 overflow-y-auto flex flex-col">
            <div className="shrink-0 flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-[var(--border)] sticky top-0 bg-[var(--surface)] z-10">
              <h2 className="text-sm font-semibold text-[var(--text)]">Nuevo presupuesto</h2>
              <button
                onClick={() => setNewQuoteModal(false)}
                className="p-1.5 rounded-md text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 p-4 sm:p-5 space-y-4">

              {/* Cliente (opcional) */}
              <div className="relative">
                <label className="text-sm font-medium text-[var(--text2)] block mb-1">Cliente o prospecto *</label>
                {selectedCustomerId ? (
                  <div className="flex items-center justify-between px-3 py-2.5 rounded-[var(--radius-md)] border bg-[var(--accent-subtle)] border-[var(--accent)]">
                    <p className="text-xs font-semibold text-[var(--accent)]">{customerName}</p>
                    <button
                      onClick={() => { setSelectedCustomerId(null); setCustomerName(''); setCustomerQuery('') }}
                      className="text-xs text-[var(--text3)] hover:text-[var(--danger)]">✕</button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                      {searchingCustomers && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
                      )}
                      <input
                        value={customerName}
                        onChange={e => { setCustomerName(e.target.value); setCustomerQuery(e.target.value) }}
                        placeholder="Buscar cliente o escribir nombre del prospecto..."
                        className="w-full pl-9 pr-4 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                    <p className="text-[11px] text-[var(--text3)] mt-1">Si no seleccionás un cliente registrado, se cotiza como prospecto.</p>
                    {showCustomerDropdown && customerResults.length > 0 && (
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
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Teléfono (solo prospecto) + Válido hasta */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {!selectedCustomerId && (
                  <Input label="Teléfono (opcional)" value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value)} placeholder="11-1234-5678" />
                )}
                <Input label="Válido hasta" type="date" value={validUntil}
                  onChange={e => setValidUntil(e.target.value)} hint="Aparece en el PDF" />
              </div>

              {/* Lista de precio */}
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
                        <p className="text-xs mono font-medium text-[var(--accent)]">{formatCurrency(
                          (() => {
                            const list = priceLists.find(pl => pl.id === priceListId)
                            return list && p.cost_price
                              ? Math.round(p.cost_price * (1 + list.margin_pct / 100) * 100) / 100
                              : (p.sell_price || p.cost_price || 0)
                          })()
                        )}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Carrito */}
              {cart.length > 0 && (
                <div className="bg-[var(--surface2)] rounded-[var(--radius-lg)] overflow-hidden mb-4">
                  <div className="divide-y divide-[var(--border)]">
                    {cart.map(item => (
                      <div key={item.product.id} className="p-3">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="font-medium text-[var(--text)] text-sm leading-tight min-w-0">{item.product.name}</p>
                          <button onClick={() => removeFromCart(item.product.id)}
                            className="p-1 -m-1 text-[var(--text3)] hover:text-[var(--danger)] flex-shrink-0">
                            <Trash2 size={15} />
                          </button>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex items-center gap-1">
                            <button onClick={() => updateCartQty(item.product.id, -1)}
                              className="w-7 h-7 flex items-center justify-center rounded-md bg-[var(--surface)] border border-[var(--border)] hover:text-[var(--accent)] transition-colors">
                              <Minus size={13} />
                            </button>
                            <input
                              type="number" min="1" value={item.quantity || ''}
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
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-[var(--text3)]">$</span>
                            <input type="number" min="0" step="0.01" value={item.unit_price}
                              onChange={e => updateCartPrice(item.product.id, e.target.value)}
                              className="w-24 h-7 text-sm mono text-right bg-[var(--surface)] border border-[var(--border)] rounded-md px-2 focus:outline-none focus:border-[var(--accent)]"
                            />
                          </div>
                          <span className="mono text-sm font-semibold text-[var(--text)] ml-auto whitespace-nowrap">
                            {formatCurrency(item.unit_price * item.quantity)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="px-3 py-2 border-t border-[var(--border)] flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--text3)]">Descuento:</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number" min="0" max="100" step="0.5" value={quoteDiscount}
                          onChange={e => setQuoteDiscount(e.target.value)}
                          onFocus={e => e.target.select()} placeholder="0"
                          className="w-16 text-xs mono text-right bg-[var(--surface)] border border-[var(--border)] rounded px-1.5 py-1 focus:outline-none focus:border-[var(--accent)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <span className="text-xs text-[var(--text3)]">%</span>
                      </div>
                      {cartDiscount > 0 && (
                        <span className="text-xs text-[var(--danger)] mono">−{formatCurrency(cartDiscount)}</span>
                      )}
                    </div>
                    <p className="text-lg font-bold mono text-[var(--accent)]">{formatCurrency(cartTotal)}</p>
                  </div>
                </div>
              )}

              <Input label="Notas" value={quoteNotes}
                onChange={e => setQuoteNotes(e.target.value)}
                placeholder="Condiciones, observaciones..." />

              <div className="sticky bottom-0 -mx-4 sm:-mx-5 px-4 sm:px-5 bg-[var(--surface)] pt-3 pb-4 mt-2 border-t border-[var(--border)]">
                <div className="flex gap-2">
                  <Button variant="secondary" className="flex-1 sm:flex-none" onClick={() => { resetForm(); setNewQuoteModal(false) }} disabled={savingQuote}>
                    Descartar
                  </Button>
                  <Button className="flex-1" onClick={handleCreateQuote} loading={savingQuote} disabled={cart.length === 0}>
                    Crear presupuesto {cart.length > 0 ? `· ${formatCurrency(cartTotal)}` : ''}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal conversión a pedido ── */}
      <Modal open={convertModal} onClose={() => setConvertModal(false)} title="Convertir en pedido" size="sm">
        <div className="space-y-4">
          <div className="px-3 py-2.5 bg-[var(--accent-subtle)] border border-[var(--accent)] rounded-[var(--radius-md)] text-xs text-[var(--accent)]">
            Se creará un pedido con los precios de este presupuesto. Si tenés stock habilitado, se descontará del depósito elegido.
          </div>

          {/* Cliente — requerido para el pedido */}
          {convertCustomerId ? (
            <div className="flex items-center justify-between px-3 py-2.5 rounded-[var(--radius-md)] border bg-[var(--accent-subtle)] border-[var(--accent)]">
              <div>
                <p className="text-xs text-[var(--text3)]">Cliente del pedido</p>
                <p className="text-sm font-semibold text-[var(--accent)]">{convertCustomerName}</p>
              </div>
              {/* Permitir cambiar solo si el presupuesto no tenía cliente fijo */}
              {!detail?.customer_id && (
                <button onClick={() => { setConvertCustomerId(null); setConvertCustomerName('') }}
                  className="text-xs text-[var(--text3)] hover:text-[var(--danger)]">✕</button>
              )}
            </div>
          ) : (
            <div className="relative">
              <label className="text-sm font-medium text-[var(--text2)] block mb-1">Cliente registrado *</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                <input
                  value={convertCustomerQuery}
                  onChange={e => setConvertCustomerQuery(e.target.value)}
                  placeholder="Buscar cliente..."
                  className="w-full pl-9 pr-4 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
              <p className="text-[11px] text-[var(--text3)] mt-1">El pedido requiere un cliente registrado. Creá uno desde Clientes si no existe.</p>
              {convertCustomerResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-lg z-20 overflow-hidden max-h-52 overflow-y-auto">
                  {convertCustomerResults.map(c => (
                    <button key={c.id}
                      onClick={() => { setConvertCustomerId(c.id); setConvertCustomerName(c.full_name); setConvertCustomerQuery(''); setConvertCustomerResults([]) }}
                      className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-[var(--surface2)] transition-colors text-left border-b border-[var(--border)] last:border-0">
                      <p className="text-sm font-medium text-[var(--text)]">{c.full_name}</p>
                      {c.phone && <p className="text-xs text-[var(--text3)]">{c.phone}</p>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {warehouses.length > 0 && (
            <Select label="Depósito"
              options={warehouses.map(w => ({ value: w.id, label: w.name }))}
              value={convertWarehouseId} onChange={e => setConvertWarehouseId(e.target.value)} />
          )}

          <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-4 border-t border-[var(--border)]">
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConvertModal(false)} disabled={converting}>
                Cancelar
              </Button>
              <Button onClick={handleConvert} loading={converting} disabled={!convertCustomerId}>
                Convertir en pedido
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Confirmación anulación ── */}
      {cancelConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setCancelConfirm(null)} />
          <div className="relative bg-[var(--surface)] rounded-[var(--radius-lg)] p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-base font-semibold text-[var(--text)] mb-2">Anular presupuesto</h3>
            <p className="text-sm text-[var(--text2)] mb-5">
              ¿Anular el presupuesto de <span className="font-medium text-[var(--text)]">{cancelConfirm.customer_name}</span>?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setCancelConfirm(null)}
                className="px-4 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface2)] text-[var(--text2)] border border-[var(--border)]">
                Volver
              </button>
              <button
                onClick={async () => { const { id } = cancelConfirm; setCancelConfirm(null); await handleCancel(id) }}
                className="px-4 py-2 text-sm rounded-[var(--radius-md)] font-medium bg-[var(--danger)] text-white hover:opacity-90">
                Anular
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}
