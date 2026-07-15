'use client'
import { useEffect, useState, useCallback, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { HelpBanner } from '@/components/ui/HelpBanner'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { MoneyInput } from '@/components/ui/MoneyInput'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoader } from '@/components/ui/Spinner'
import { Pagination } from '@/components/ui/Pagination'
import { api } from '@/lib/api'
import { formatCurrency, formatDateTime, cn } from '@/lib/utils'
import { printDocument, partiesGrid, totalsBox, highlightBox, fmtARS } from '@/lib/printDocument'
import type { Product, Pagination as PaginationType } from '@/types'
import type { PriceList } from '@/app/price-lists/page'
import {
  Plus, Search, FileText, X, Minus, Trash2, ChevronRight,
  AlertCircle, Printer, RefreshCw, Clock, ShoppingCart, Copy,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useWorkstation } from '@/hooks/useWorkstation'
import { usePOSSync } from '@/hooks/usePOSSync'
import { CashRegisterPicker, type RegisterWithBranch } from '@/components/modules/CashRegisterPicker'

const CONVERT_PAYMENT_METHODS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'debito', label: 'Débito' },
  { value: 'credito', label: 'Crédito' },
  { value: 'qr', label: 'QR' },
]
import { useCollapseSidebar } from '@/contexts/SidePanelContext'
import { searchProductsLocal, searchCustomersLocal } from '@/lib/pos-cache'
import { QuickCustomerModal } from '@/components/modules/QuickCustomerModal'
import { makeOptimisticState, reconcileList, clearOptimisticState } from '@/lib/optimistic-reconcile'
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
  iso ? new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null

// ─── Componente principal ─────────────────────────────────
export default function QuotesPage() {
  const router = useRouter()
  const { user: authUser } = useAuth()
  const { workstation } = useWorkstation()
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
  const [isMac, setIsMac] = useState(true)
  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad|iPod/.test(navigator.platform) || /Mac/.test(navigator.userAgent))
  }, [])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [priceLists, setPriceLists] = useState<PriceList[]>([])
  const priceOverridesRef = useRef<Map<string, Map<string, number>>>(new Map())
  // Depósito del usuario primero en el dropdown (el que usa siempre).
  const preferredWarehouseId = authUser?.warehouse_id ?? null
  const orderedWarehouses = [...warehouses].sort((a, b) => {
    const rank = (w: Warehouse) => w.id === preferredWarehouseId ? 0 : w.is_default ? 1 : 2
    return rank(a) - rank(b) || a.name.localeCompare(b.name)
  })

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
  const [productHighlight, setProductHighlight] = useState(0)
  const [searchingProducts, setSearchingProducts] = useState(false)
  const [savingQuote, setSavingQuote] = useState(false)

  // Cliente (opcional — se permite prospecto suelto)
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState<{ id: string; full_name: string; phone?: string; document?: string; current_balance: number; credit_limit: number }[]>([])
  const [searchingCustomers, setSearchingCustomers] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [customerHighlight, setCustomerHighlight] = useState(0)
  const customerSearchRequestRef = useRef(0)

  // Anulación
  const [cancelConfirm, setCancelConfirm] = useState<{ id: string; customer_name: string } | null>(null)

  // Conversión a pedido
  const [convertModal, setConvertModal] = useState(false)
  const [convertCustomerId, setConvertCustomerId] = useState<string | null>(null)
  const [convertCustomerName, setConvertCustomerName] = useState('')
  const [convertCustomerQuery, setConvertCustomerQuery] = useState('')
  const [convertCustomerResults, setConvertCustomerResults] = useState<{ id: string; full_name: string; phone?: string }[]>([])
  const [convertCustomerHighlight, setConvertCustomerHighlight] = useState(0)
  const [convertQuickCustomerOpen, setConvertQuickCustomerOpen] = useState(false)
  const [convertWarehouseId, setConvertWarehouseId] = useState('')
  const [converting, setConverting] = useState(false)
  // Cobro opcional al convertir (seña o total) + selector de caja.
  const [convertCollectNow, setConvertCollectNow] = useState(false)
  const [convertCollectMethod, setConvertCollectMethod] = useState('efectivo')
  const [convertCollectAmount, setConvertCollectAmount] = useState('')
  const [allRegisters, setAllRegisters] = useState<RegisterWithBranch[]>([])
  const [collectBranchId, setCollectBranchId] = useState<string | null>(null)
  const [collectRegisterId, setCollectRegisterId] = useState<string | null>(null)
  const collectDefaultsSet = useRef(false)

  const statusFilterRef = useRef(statusFilter)
  const searchRef = useRef(search)
  const pageRef = useRef(page)
  useEffect(() => { statusFilterRef.current = statusFilter }, [statusFilter])
  useEffect(() => { searchRef.current = search }, [search])

  // Cajas del negocio para el selector de cobro al convertir.
  useEffect(() => {
    api.get<RegisterWithBranch[]>('/api/branches/all-registers')
      .then(regs => setAllRegisters(regs ?? []))
      .catch(() => {})
  }, [])

  // Precarga sucursal/caja con el workstation del usuario logueado (una sola vez).
  useEffect(() => {
    if (collectDefaultsSet.current || allRegisters.length === 0) return
    collectDefaultsSet.current = true
    const branchIds = new Set(allRegisters.map(r => r.branches?.id).filter(Boolean))
    const defBranch = (workstation?.branch_id && branchIds.has(workstation.branch_id))
      ? workstation.branch_id
      : allRegisters.find(r => r.is_open)?.branches?.id
      ?? allRegisters[0]?.branches?.id ?? null
    setCollectBranchId(defBranch)
    const wsReg = allRegisters.find(r => r.id === workstation?.register_id)
    setCollectRegisterId(wsReg?.is_open ? wsReg.id : null)
  }, [allRegisters, workstation?.branch_id, workstation?.register_id])

  const handleCollectBranchChange = useCallback((bid: string | null) => {
    setCollectBranchId(bid)
    setCollectRegisterId(prev => {
      const reg = allRegisters.find(r => r.id === prev)
      return reg && reg.branches?.id === bid ? prev : null
    })
  }, [allRegisters])

  // Estado optimista que el replica del server puede no reflejar aún (lag
  // read-after-write). El re-fetch lo reconcilia en vez de pisarlo.
  const optimisticRef = useRef(makeOptimisticState<QuoteSummary>())
  const reconcileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconcileCountRef = useRef(0)

  const fetchQuotes = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const params: Record<string, string | number | undefined> = { page: pageRef.current, limit: 20 }
      if (statusFilterRef.current) params.status = statusFilterRef.current
      if (searchRef.current) params.search = searchRef.current
      const res = await api.get<{ data: QuoteSummary[]; pagination: PaginationType }>('/api/quotes', params)
      const { data, pending } = reconcileList(res.data, optimisticRef.current)
      setQuotes(data)
      setPagination(res.pagination)
      if (pending && reconcileCountRef.current < 4) {
        reconcileCountRef.current += 1
        if (reconcileTimerRef.current) clearTimeout(reconcileTimerRef.current)
        reconcileTimerRef.current = setTimeout(() => fetchQuotes(true), 1500)
      } else {
        reconcileCountRef.current = 0
      }
    } catch (err) { console.error(err) }
    finally { if (!silent) setLoading(false) }
  }, [])

  // Refetch del detalle con guarda de staleness (igual que en pedidos).
  const detailRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refetchDetail = useCallback((id: string, expect?: Partial<QuoteDetail>, tries = 0) => {
    api.get<QuoteDetail>(`/api/quotes/${id}`).then(updated => {
      const stale = !!expect && Object.keys(expect).some(
        k => (updated as unknown as Record<string, unknown>)[k] !== (expect as Record<string, unknown>)[k],
      )
      setDetail(prev => prev && prev.id === id ? { ...updated, ...(stale && expect ? expect : {}) } : prev)
      if (stale && tries < 4) {
        if (detailRetryRef.current) clearTimeout(detailRetryRef.current)
        detailRetryRef.current = setTimeout(() => refetchDetail(id, expect, tries + 1), 1500)
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    pageRef.current = 1
    setPage(1)
    clearOptimisticState(optimisticRef.current)
    reconcileCountRef.current = 0
    fetchQuotes()
  }, [statusFilter, search, fetchQuotes])

  useEffect(() => () => {
    if (reconcileTimerRef.current) clearTimeout(reconcileTimerRef.current)
    if (detailRetryRef.current) clearTimeout(detailRetryRef.current)
  }, [])

  const handlePageChange = useCallback((newPage: number) => {
    pageRef.current = newPage
    setPage(newPage)
    fetchQuotes()
  }, [fetchQuotes])

  // No hay realtime/polling: un presupuesto creado en otra PC no llega solo.
  // Refrescamos al volver el foco a la pestaña para que aparezca sin recargar.
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === 'visible') fetchQuotes() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
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
        id: c.id, full_name: c.full_name, phone: c.phone, document: c.document,
        current_balance: c.current_balance, credit_limit: c.credit_limit,
      }))
      if (customerSearchRequestRef.current === requestId && local.length > 0) setCustomerResults(local)
      setSearchingCustomers(true)
      try {
        const data = await api.get<{ id: string; full_name: string; phone?: string; document?: string; current_balance: number; credit_limit: number }[]>(
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
  useEffect(() => { setCustomerHighlight(0) }, [customerResults])
  useEffect(() => { setProductHighlight(0) }, [productResults])

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
  useEffect(() => { setConvertCustomerHighlight(0) }, [convertCustomerResults])

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
      const created = await api.post<QuoteSummary>('/api/quotes', {
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
      // Optimista: el presupuesto nuevo (status 'draft') encabeza la página 1.
      // Lo prependemos al instante si el filtro actual no lo excluye; el re-fetch
      // reconcilia item_count/total_units y demás campos calculados por el view.
      const noExcludingFilter = (!statusFilterRef.current || statusFilterRef.current === 'draft') && !searchRef.current
      if (created?.id && noExcludingFilter) {
        const optimistic: QuoteSummary = {
          ...created,
          item_count: created.item_count ?? cart.length,
          total_units: created.total_units ?? cart.reduce((s, i) => s + i.quantity, 0),
          seller_name: created.seller_name ?? authUser?.full_name,
        }
        setQuotes(prev => [optimistic, ...prev.filter(q => q.id !== optimistic.id)])
        // Mantenerlo prependeado en los re-fetch hasta que el server lo liste.
        reconcileCountRef.current = 0
        optimisticRef.current.created = [optimistic, ...optimisticRef.current.created.filter(q => q.id !== optimistic.id)]
      }
      resetForm()
      // Volvemos a la página 1 antes de refrescar para que aparezca al instante
      // aunque estuvieras paginando.
      pageRef.current = 1
      setPage(1)
      fetchQuotes()
      // Abrimos el detalle del presupuesto recién creado para tener Imprimir /
      // WhatsApp a un click, sin tener que volver a buscarlo y reabrirlo.
      if (created?.id) openDetail(created.id)
      else setNewQuoteModal(false)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al crear el presupuesto')
    } finally { setSavingQuote(false) }
  }

  // Ctrl/Cmd + Enter dispara "Crear presupuesto" mientras el panel está abierto.
  const handleCreateQuoteRef = useRef(handleCreateQuote)
  handleCreateQuoteRef.current = handleCreateQuote
  useEffect(() => {
    if (!newQuoteModal) return
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        if (!savingQuote && cart.length > 0) handleCreateQuoteRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [newQuoteModal, savingQuote, cart.length])

  const handleCancel = async (id: string) => {
    try {
      await api.post(`/api/quotes/${id}/cancel`, {})
      toast.success('Presupuesto anulado')
      // Optimista: reflejar el estado al instante; el re-fetch reconcilia.
      setQuotes(prev => prev.map(q => q.id === id ? { ...q, status: 'cancelled' } : q))
      setDetail(prev => prev && prev.id === id ? { ...prev, status: 'cancelled' } : prev)
      reconcileCountRef.current = 0
      optimisticRef.current.patches.set(id, { status: 'cancelled' })
      fetchQuotes()
      if (detail?.id === id) {
        refetchDetail(id, { status: 'cancelled' })
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
    // Preferir el depósito del usuario (asignado al crearlo); si no, el default.
    const preferred = warehouses.find(w => w.id === (authUser?.warehouse_id ?? ''))
    const defWh = warehouses.find(w => w.is_default)
    setConvertWarehouseId(preferred?.id ?? defWh?.id ?? warehouses[0]?.id ?? '')
    setConvertCollectNow(false); setConvertCollectMethod('efectivo'); setConvertCollectAmount('')
    setConvertModal(true)
  }

  const handleConvert = async () => {
    if (!detail) return
    if (!convertCustomerId) { toast.error('Seleccioná un cliente registrado para el pedido'); return }
    setConverting(true)
    const quoteTotal = Number(detail.total) || 0
    const collectingNow = convertCollectNow && convertCollectMethod !== 'cuenta_corriente'
      && (Number(convertCollectAmount) || quoteTotal) > 0
    try {
      const res = await api.post<{ order_id: string }>(`/api/quotes/${detail.id}/convert`, {
        customer_id: convertCustomerId,
        warehouse_id: convertWarehouseId || null,
        branch_id: collectBranchId,
        register_id: collectRegisterId,
        payment_method: collectingNow ? convertCollectMethod : null,
        paid_amount: collectingNow ? Number(convertCollectAmount) || quoteTotal : 0,
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
    const date = new Date(d.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const biz = authUser?.business
    const rows = (d.quote_items ?? []).map(i =>
      `<tr>
        <td>${i.products?.name ?? i.product_name ?? '(producto eliminado)'}${i.products?.barcode ? `<div class="item-sub">${i.products.barcode}</div>` : ''}</td>
        <td class="c">${i.quantity} ${i.products?.unit ?? ''}</td>
        <td class="r">${fmtARS(Number(i.unit_price))}</td>
        <td class="r">${fmtARS(Number(i.subtotal))}</td>
      </tr>`
    ).join('')

    const body = `
      ${partiesGrid([
        {
          title: 'Emisor',
          name: biz?.name ?? '',
          rows: [
            biz?.cuit ? `CUIT: ${biz.cuit}` : '',
            biz?.address ?? '',
            biz?.phone ? `Tel: ${biz.phone}` : '',
          ],
        },
        {
          title: 'Cliente',
          name: d.customer_name,
          rows: [
            d.customers?.document ? `DNI/CUIT: ${d.customers.document}` : '',
            (d.customer_phone || d.customers?.phone) ? `Tel: ${d.customer_phone || d.customers?.phone}` : '',
          ],
        },
      ])}
      ${d.valid_until ? highlightBox({ tone: 'warn', label: `Presupuesto válido hasta el ${formatDate(d.valid_until)}. Precios sujetos a modificación luego de esa fecha.` }) : ''}
      <table>
        <thead><tr><th>Producto</th><th class="c" style="width:80px">Cant.</th><th class="r" style="width:120px">Precio unit.</th><th class="r" style="width:130px">Subtotal</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${totalsBox([
        ...(Number(d.discount) > 0 ? [{ label: 'Descuento', value: `− ${fmtARS(Number(d.discount))}` }] : []),
        { label: 'Total', value: fmtARS(Number(d.total)), grand: true },
      ])}
      ${d.notes ? `<div class="note-line">Notas: ${d.notes}</div>` : ''}`

    printDocument({
      title: 'Presupuesto',
      docLabel: 'Presupuesto',
      docNumber: `N° ${d.id.slice(0, 8).toUpperCase()}`,
      docMeta: [date],
      biz,
      bodyHtml: body,
      signatures: ['Firma cliente', 'Firma emisor'],
      footerNote: 'Presupuesto sin validez fiscal',
    })
  }

  // ─── Copiar presupuesto para WhatsApp ────────────────────
  // Armamos el presupuesto como texto formateado (negritas estilo WhatsApp) y
  // lo copiamos al portapapeles. El usuario lo pega en el chat que ya tiene
  // abierto con el cliente, sin abrir pestañas nuevas. Para el PDF formal está
  // el botón Imprimir (guardar como PDF y adjuntar).
  const copyQuoteText = async (d: QuoteDetail) => {
    const biz = authUser?.business
    const num = d.id.slice(0, 8).toUpperCase()
    const firstName = d.customer_name?.trim().split(/\s+/)[0] ?? ''
    const lines: string[] = []
    lines.push(`*Presupuesto N° ${num}*`)
    if (biz?.name) lines.push(biz.name)
    lines.push('')
    lines.push(firstName ? `Hola ${firstName}! Te paso el presupuesto:` : 'Te paso el presupuesto:')
    lines.push('')
    for (const i of d.quote_items ?? []) {
      const name = i.products?.name ?? i.product_name ?? '(producto)'
      lines.push(`• ${i.quantity} × ${name} — ${formatCurrency(i.subtotal)}`)
    }
    lines.push('')
    if (Number(d.discount) > 0) lines.push(`Descuento: −${formatCurrency(d.discount)}`)
    lines.push(`*Total: ${formatCurrency(d.total)}*`)
    if (d.valid_until) lines.push(`\nVálido hasta el ${formatDate(d.valid_until)}.`)
    if (d.notes) lines.push(`\n${d.notes}`)

    const text = lines.join('\n')
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Presupuesto copiado — pegalo en el chat del cliente')
    } catch {
      // Fallback para navegadores sin permiso de Clipboard API (o contexto no seguro).
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
        toast.success('Presupuesto copiado — pegalo en el chat del cliente')
      } catch { toast.error('No se pudo copiar el presupuesto') }
      document.body.removeChild(ta)
    }
  }

  const sidePanelOpen = detailModal || newQuoteModal
  useCollapseSidebar(sidePanelOpen)
  const trimmedCustomerQuery = customerQuery.trim()
  const showCustomerDropdown = !selectedCustomerId && trimmedCustomerQuery.length >= 2

  const selectCustomer = (c: { id: string; full_name: string }) => {
    setSelectedCustomerId(c.id)
    setCustomerName(c.full_name)
    setCustomerQuery('')
    setCustomerResults([])
  }
  // Navegación con teclado del dropdown de clientes (↑/↓ + Enter, Esc para cerrar)
  const handleCustomerKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!showCustomerDropdown || customerResults.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCustomerHighlight(h => Math.min(h + 1, customerResults.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCustomerHighlight(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const c = customerResults[customerHighlight]
      if (c) selectCustomer(c)
    } else if (e.key === 'Escape') {
      setCustomerResults([])
    }
  }

  // Selección de cliente en el modal de conversión (click / Enter / recién creado)
  const selectConvertCustomer = (c: { id: string; full_name: string; phone?: string }) => {
    setConvertCustomerId(c.id)
    setConvertCustomerName(c.full_name)
    setConvertCustomerQuery('')
    setConvertCustomerResults([])
  }
  // Navegación con teclado del dropdown de clientes del modal de conversión
  const handleConvertCustomerKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (convertCustomerResults.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setConvertCustomerHighlight(h => Math.min(h + 1, convertCustomerResults.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setConvertCustomerHighlight(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const c = convertCustomerResults[convertCustomerHighlight]
      if (c) selectConvertCustomer(c)
    } else if (e.key === 'Escape') {
      setConvertCustomerResults([])
    }
  }

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
                        <button
                          onClick={() => copyQuoteText(detail)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-[var(--radius-md)] text-[var(--text2)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors">
                          <Copy size={14} /> Copiar para WhatsApp
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
                        onKeyDown={handleCustomerKeyDown}
                        placeholder="Buscar cliente o escribir nombre del prospecto..."
                        className="w-full pl-9 pr-4 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                    <p className="text-[11px] text-[var(--text3)] mt-1">Si no seleccionás un cliente registrado, se cotiza como prospecto.</p>
                    {showCustomerDropdown && customerResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-lg z-20 overflow-hidden">
                        {customerResults.map((c, idx) => (
                          <button key={c.id}
                            onClick={() => selectCustomer(c)}
                            onMouseEnter={() => setCustomerHighlight(idx)}
                            className={`w-full flex items-center justify-between px-3 py-2.5 transition-colors text-left border-b border-[var(--border)] last:border-0 ${customerHighlight === idx ? 'bg-[var(--surface2)]' : ''}`}>
                            <div>
                              <p className="text-sm font-medium text-[var(--text)]">{c.full_name}</p>
                              {c.document && <p className="text-xs text-[var(--text3)]">DNI {c.document}</p>}
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
                <div>
                  <Input label="Válido hasta" type="date" value={validUntil}
                    onChange={e => setValidUntil(e.target.value)} hint="Aparece en el PDF" />
                  <div className="flex gap-1.5 mt-2">
                    {[7, 15, 30].map(days => (
                      <button key={days} type="button"
                        onClick={() => {
                          const d = new Date()
                          d.setDate(d.getDate() + days)
                          setValidUntil(d.toISOString().slice(0, 10))
                        }}
                        className="px-2.5 py-1 text-xs rounded-md border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)] hover:border-[var(--brand)] transition-colors">
                        {days} días
                      </button>
                    ))}
                  </div>
                </div>
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
                            <MoneyInput unstyled value={item.unit_price}
                              onChange={v => updateCartPrice(item.product.id, v)}
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
                    <kbd className="ml-2 hidden sm:inline-block text-[10px] font-medium px-1.5 py-0.5 rounded border border-white/30 text-white/80">{isMac ? '⌘ + ↵' : 'Ctrl + ↵'}</kbd>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal conversión a pedido ── */}
      <Modal open={convertModal} onClose={() => setConvertModal(false)} title="Convertir en pedido" size="md">
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
                  onKeyDown={handleConvertCustomerKeyDown}
                  placeholder="Buscar cliente..."
                  className="w-full pl-9 pr-4 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-[11px] text-[var(--text3)]">El pedido requiere un cliente registrado.</p>
                <button
                  onClick={() => setConvertQuickCustomerOpen(true)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--accent)] hover:underline">
                  <Plus size={12} /> Nuevo cliente
                </button>
              </div>
              {convertCustomerResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-lg z-20 overflow-hidden max-h-52 overflow-y-auto">
                  {convertCustomerResults.map((c, idx) => (
                    <button key={c.id}
                      onClick={() => selectConvertCustomer(c)}
                      onMouseEnter={() => setConvertCustomerHighlight(idx)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 transition-colors text-left border-b border-[var(--border)] last:border-0 ${convertCustomerHighlight === idx ? 'bg-[var(--surface2)]' : ''}`}>
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
              options={orderedWarehouses.map(w => ({ value: w.id, label: w.is_default ? `${w.name} (default)` : w.name }))}
              value={convertWarehouseId} onChange={e => setConvertWarehouseId(e.target.value)} />
          )}

          {/* ¿Cobrás ahora? (seña o total). Opcional: si no, nace a cuenta corriente. */}
          <div className="border border-[var(--border)] rounded-[var(--radius-md)] p-3 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={convertCollectNow}
                onChange={e => setConvertCollectNow(e.target.checked)}
                className="w-4 h-4 accent-[var(--accent)]" />
              <span className="text-sm font-medium text-[var(--text)]">Cobrar ahora (seña o total)</span>
            </label>
            {convertCollectNow && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <Select label="Método de cobro"
                    options={CONVERT_PAYMENT_METHODS}
                    value={convertCollectMethod}
                    onChange={e => setConvertCollectMethod(e.target.value)} />
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label htmlFor="monto-cobrado-quote" className="text-sm font-medium text-[var(--text2)]">Monto cobrado</label>
                      {!!detail?.total && (
                        <button type="button"
                          onClick={() => setConvertCollectAmount(String(Math.round(Number(detail.total) * 100) / 100))}
                          className="text-xs font-medium text-[var(--accent)] hover:underline">
                          Total: {formatCurrency(Number(detail.total))}
                        </button>
                      )}
                    </div>
                    <MoneyInput id="monto-cobrado-quote"
                      value={convertCollectAmount} placeholder={String(Math.round((Number(detail?.total) || 0) * 100) / 100)}
                      onChange={v => setConvertCollectAmount(v)} />
                  </div>
                </div>
                <CashRegisterPicker
                  registers={allRegisters}
                  branchId={collectBranchId}
                  registerId={collectRegisterId}
                  onBranchChange={handleCollectBranchChange}
                  onRegisterChange={setCollectRegisterId}
                />
              </>
            )}
          </div>

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

      {/* Alta rápida de cliente desde el modal de conversión */}
      <QuickCustomerModal
        open={convertQuickCustomerOpen}
        onClose={() => setConvertQuickCustomerOpen(false)}
        initialName={convertCustomerQuery.trim()}
        onCreated={(c) => selectConvertCustomer({ id: c.id, full_name: c.full_name, phone: c.phone ?? undefined })}
      />

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
