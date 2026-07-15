'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import type { Product } from '@/types'
import type { CustomerSummary } from '@/app/customers/page'
import type { PriceList } from '@/app/price-lists/page'
import { Search, Plus, Minus, X, ShoppingCart, Zap, ChevronLeft, Users, AlertTriangle, RefreshCw, Truck, Banknote, CreditCard, ArrowRightLeft, QrCode, BookOpen, Pencil, Trash2, Check, Info, Printer, Layers } from 'lucide-react'
import { toast } from 'sonner'
import { POSTicket } from '@/components/modules/POSTicket'
import { HelpBanner } from '@/components/ui/HelpBanner'
import { PrintSettingsModal } from '@/components/modules/PrintSettingsModal'
import { QuickCustomerModal } from '@/components/modules/QuickCustomerModal'
import { useWorkstation } from '@/hooks/useWorkstation'
import { usePrintSettings } from '@/hooks/usePrintSettings'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { evaluatePromo, type Promotion } from '@/lib/promoUtils'
import { Modal } from '@/components/ui/Modal'
import { Drawer } from '@/components/ui/Drawer'
import { MoneyInput } from '@/components/ui/MoneyInput'
import { usePOSSync } from '@/hooks/usePOSSync'
import {
  resolveBarcode,
  computeLocalPrice,
  priceForProductList,
  setForcedPriceList,
  searchProductsLocal,
  searchCustomersLocal,
  cacheProductFromScan,
  syncPromotions,
  getLocalPromotions,
  getLastSyncTime,
  getVariablePriceProducts,
  type PricingResult,
  type ScanResult,
} from '@/lib/pos-cache'
import { queueSale, syncPendingSales, pushSale, getPendingSalesCount, isNetworkError } from '@/lib/sales-queue'

// Mínimo de caracteres para disparar búsqueda de texto (no aplica a códigos de barra)
const MIN_SEARCH_LEN = 3
// Tope de resultados mostrados en la búsqueda del POS
const SEARCH_RESULT_LIMIT = 8

interface CartItem {
  product: Product
  quantity: number
  unit_price: number
  discount: number
  applied_list?: string
  applied_margin?: number
  promo_label?: string
  promotion_id?: string | null
  status?: 'pending' | 'resolved' | 'error'
  price_overridden?: boolean
}

interface PaymentSplit {
  method: string
  amount: number
  installments: number
  received?: number  // solo efectivo: cuánto entregó el cliente
}

// Sugiere denominaciones de billetes redondeando hacia arriba del importe
function suggestReceived(amount: number): number[] {
  const candidates = [
    Math.ceil(amount),
    Math.ceil(amount / 10)   * 10,
    Math.ceil(amount / 50)   * 50,
    Math.ceil(amount / 100)  * 100,
    Math.ceil(amount / 200)  * 200,
    Math.ceil(amount / 500)  * 500,
    Math.ceil(amount / 1000) * 1000,
    Math.ceil(amount / 2000) * 2000,
    Math.ceil(amount / 5000) * 5000,
  ]
  return [...new Set(candidates)]
    .filter(v => v > amount)
    .sort((a, b) => a - b)
    .slice(0, 4)
}

// Sugiere montos parciales "redondos" por debajo del saldo, útiles en pagos mixtos
function suggestPartialAmounts(remaining: number): number[] {
  if (remaining <= 0) return []
  const opts = new Set<number>()
  ;[1000, 2000, 5000, 10000].forEach(step => {
    const v = Math.floor(remaining / step) * step
    if (v > 0 && v < remaining) opts.add(v)
  })
  const half = Math.round(remaining / 2)
  if (half > 0 && half < remaining) opts.add(half)
  return [...opts].sort((a, b) => a - b).slice(0, 3)
}

interface CompletedSale {
  id: string
  total: number
  subtotal: number
  discount: number
  shipping_amount: number
  payment_method: string
  installments: number
  payment_splits?: PaymentSplit[]
  items: CartItem[]
  created_at: string
  invoice_id?: string
  ticket_code?: string | null
}

const PAYMENT_METHODS = [
  { value: 'efectivo', label: 'Efectivo', Icon: Banknote },
  { value: 'debito', label: 'Débito', Icon: CreditCard },
  { value: 'credito', label: 'Crédito', Icon: CreditCard },
  { value: 'transferencia', label: 'Transferencia', Icon: ArrowRightLeft },
  { value: 'qr', label: 'QR', Icon: QrCode },
  { value: 'cuenta_corriente', label: 'Cta. Cte.', Icon: BookOpen },
]


const POS_CART_KEY = 'stockos_pos_cart'

export default function POSPage() {
  const router = useRouter()

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [searching, setSearching] = useState(false)
  const [activeResultIndex, setActiveResultIndex] = useState(-1)
  const searchRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isAddingRef = useRef(false)

  const [pendingQty, setPendingQty] = useState(1)
  const pendingQtyRef = useRef(1)
  const qtyRef = useRef<HTMLInputElement>(null)

  const [cart, setCart] = useState<CartItem[]>([])
  const [saleDiscountPct, setSaleDiscountPct] = useState(0)
  const [customPriceFocusId, setCustomPriceFocusId] = useState<string | null>(null)
  const priceInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // Cart keyboard navigation
  const [focusedCartIndex, setFocusedCartIndexState] = useState(-1)
  const focusedCartIndexRef = useRef(-1)
  const setFocusedCartIndex = useCallback((v: number | ((p: number) => number)) => {
    const next = typeof v === 'function' ? v(focusedCartIndexRef.current) : v
    focusedCartIndexRef.current = next
    setFocusedCartIndexState(next)
  }, [])
  const cartItemRefs = useRef<(HTMLDivElement | null)[]>([])
  const resultItemRefs = useRef<(HTMLButtonElement | null)[]>([])

  const [step, setStep] = useState<'cart' | 'ticket'>('cart')
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  // Pagos ya aplicados (ledger) + el pago que se está componiendo (draft)
  const [applied, setApplied] = useState<PaymentSplit[]>([])
  const [draft, setDraft] = useState<PaymentSplit>({ method: 'efectivo', amount: 0, installments: 1 })
  const [selectedApplied, setSelectedApplied] = useState<number | null>(null)
  // Modo "varios medios": cuando es false, se asume que paga todo con el medio elegido
  // y el input de monto queda oculto. Se activa al tocar "¿Paga con varios medios?".
  const [splitMode, setSplitMode] = useState(false)
  const draftAmountRef   = useRef<HTMLInputElement | null>(null)
  const draftReceivedRef = useRef<HTMLInputElement | null>(null)
  const customerSearchRef = useRef<HTMLInputElement | null>(null)
  const [processing, setProcessing] = useState(false)
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null)

  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState<CustomerSummary[]>([])
  const [customerActiveIndex, setCustomerActiveIndex] = useState(0)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSummary | null>(null)
  const [searchingCustomer, setSearchingCustomer] = useState(false)
  const [quickCustomerModal, setQuickCustomerModal] = useState(false)

  const [priceLists, setPriceLists] = useState<PriceList[]>([])
  const [selectedList, setSelectedList] = useState<PriceList | null>(null)
  const priceListsRef = useRef<PriceList[]>([])
  useEffect(() => { priceListsRef.current = priceLists }, [priceLists])

  // Vuelve al modo automático: limpia la lista fijada y deja seleccionada la default.
  const resetToAutoList = useCallback(() => {
    setForcedPriceList(null)
    const def = priceListsRef.current.find(l => l.is_default) ?? priceListsRef.current[0] ?? null
    setSelectedList(def)
  }, [])

  const [warehouses, setWarehouses] = useState<{ id: string; name: string; is_default: boolean }[]>([])
  const [selectedWarehouse, setSelectedWarehouse] = useState<{ id: string; name: string } | null>(null)
  const selectedWarehouseRef = useRef<{ id: string; name: string } | null>(null)
  useEffect(() => { selectedWarehouseRef.current = selectedWarehouse }, [selectedWarehouse])

  const [shippingEnabled, setShippingEnabled] = useState(false)
  const [shippingAmount, setShippingAmount] = useState(0)

  const [f3PickerOpen, setF3PickerOpen] = useState(false)
  const [variableProducts, setVariableProducts] = useState<Product[]>([])
  const [f3ActiveIndex, setF3ActiveIndex] = useState(0)

  const [cajaWarning, setCajaWarning] = useState(false)
  const [invoiceModal, setInvoiceModal] = useState(false)
  const [mobileView, setMobileView] = useState<'search' | 'cart'>('search')

  const [branches, setBranches] = useState<{ id: string; name: string; warehouse_id?: string; registers: { id: string; name: string }[] }[]>([])
  const [loadingBranches, setLoadingBranches] = useState(true)
  const [selectingWorkstation, setSelectingWorkstation] = useState(false)
  const [tempBranchId, setTempBranchId] = useState('')
  const [tempRegisterId, setTempRegisterId] = useState('')

  const { workstation, setWorkstation, loaded } = useWorkstation()
  const { settings: printSettings } = usePrintSettings()
  const [showPrintSettings, setShowPrintSettings] = useState(false)
  const { user } = useAuth()
  const stockEnabled    = user?.business?.stock_enabled ?? false
  const stockEnabledRef = useRef(stockEnabled)
  useEffect(() => { stockEnabledRef.current = user?.business?.stock_enabled ?? false }, [user?.business?.stock_enabled])
  const { cacheReady, syncing: cacheSyncing, forceSync } = usePOSSync(selectedWarehouse?.id)

  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)
  const [pendingCount, setPendingCount] = useState(0)

  const refreshVariableProducts = useCallback(async () => {
    const products = await getVariablePriceProducts()
    setVariableProducts(products)
  }, [])

  // Leer timestamp de última sync desde IndexedDB cuando el cache esté listo
  useEffect(() => {
    if (!cacheReady) return
    getLastSyncTime().then(t => setLastSyncedAt(t)).catch(() => {})
    getPendingSalesCount().then(setPendingCount).catch(() => {})
    refreshVariableProducts().catch(() => {})
  }, [cacheReady, refreshVariableProducts])

  // Sincronizar ventas offline cuando se recupera la conexión
  useEffect(() => {
    const handleOnline = () => {
      syncPendingSales()
        .then(({ synced, failed }) => {
          if (synced > 0) toast.success(`${synced} venta${synced > 1 ? 's' : ''} sincronizada${synced > 1 ? 's' : ''}`)
          if (failed > 0) toast.error(`${failed} venta${failed > 1 ? 's' : ''} no se pudieron sincronizar`)
          getPendingSalesCount().then(setPendingCount).catch(() => {})
        })
        .catch(() => {})
    }
    window.addEventListener('online', handleOnline)
    // También intentar al montar por si había ventas pendientes de sesiones anteriores
    handleOnline()
    return () => window.removeEventListener('online', handleOnline)
  }, [])

  // Reintento periódico mientras haya ventas pendientes. Cubre el caso en que el
  // backend (Railway) estuvo caído pero el equipo nunca perdió internet: el evento
  // 'online' del navegador no dispara, así que sin esto las ventas no se
  // sincronizarían solas al recuperarse el servidor.
  useEffect(() => {
    if (pendingCount === 0) return
    const id = setInterval(() => {
      syncPendingSales()
        .then(({ synced }) => {
          if (synced > 0) toast.success(`${synced} venta${synced > 1 ? 's' : ''} sincronizada${synced > 1 ? 's' : ''}`)
          getPendingSalesCount().then(setPendingCount).catch(() => {})
        })
        .catch(() => {})
    }, 30_000)
    return () => clearInterval(id)
  }, [pendingCount])

  // Re-renderizar cada minuto para mantener el "hace X min" actualizado
  useEffect(() => {
    const id = setInterval(() => setLastSyncedAt(prev => prev ? new Date(prev) : prev), 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (user?.business?.shipping_price_default) {
      setShippingAmount(user.business.shipping_price_default)
    }
  }, [user?.business?.shipping_price_default])

  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [promosCached, setPromosCached] = useState(false)
  const promotionsRef = useRef<Promotion[]>([])
  useEffect(() => { promotionsRef.current = promotions }, [promotions])

  const barcodeMapRef = useRef<Map<string, string>>(new Map())
  const pendingBarcodesRef = useRef<Map<string, string>>(new Map())

  const cartRef = useRef(cart)
  useEffect(() => { cartRef.current = cart }, [cart])

  // Reset focused index if it's out of bounds
  useEffect(() => {
    if (focusedCartIndex >= cart.length && cart.length > 0) {
      setFocusedCartIndex(cart.length - 1)
    } else if (cart.length === 0 && focusedCartIndex >= 0) {
      setFocusedCartIndex(-1)
      searchRef.current?.focus()
    }
  }, [cart.length, focusedCartIndex, setFocusedCartIndex])

  // Auto-scroll focused cart item into view
  useEffect(() => {
    if (focusedCartIndex >= 0) {
      cartItemRefs.current[focusedCartIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [focusedCartIndex])

  // Auto-scroll highlighted search result into view (al navegar con flechas)
  useEffect(() => {
    if (activeResultIndex >= 0) {
      resultItemRefs.current[activeResultIndex]?.scrollIntoView({ block: 'nearest' })
    }
  }, [activeResultIndex])

  // Auto-focus price input on custom price products
  useEffect(() => {
    if (!customPriceFocusId) return
    const el = priceInputRefs.current[customPriceFocusId]
    if (el) {
      el.focus()
      el.select()
      setCustomPriceFocusId(null)
    }
  }, [customPriceFocusId, cart])

  // Restore saved cart
  useEffect(() => {
    try {
      const saved = localStorage.getItem(POS_CART_KEY)
      if (saved) {
        const { cart: c, saleDiscountPct: d, selectedCustomer: sc } = JSON.parse(saved)
        if (c?.length > 0) {
          setCart(c)
          if (d) setSaleDiscountPct(d)
          if (sc) setSelectedCustomer(sc)
        }
      }
    } catch { }
  }, [])

  // Persist cart
  useEffect(() => {
    const t = setTimeout(() => {
      if (cart.length > 0) {
        localStorage.setItem(POS_CART_KEY, JSON.stringify({ cart, saleDiscountPct, selectedCustomer }))
      } else {
        localStorage.removeItem(POS_CART_KEY)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [cart, saleDiscountPct, selectedCustomer])

  useEffect(() => { searchRef.current?.focus() }, [])

  useEffect(() => {
    setLoadingBranches(true)
    api.get<{ id: string; name: string; registers: { id: string; name: string }[] }[]>('/api/branches')
      .then(setBranches)
      .catch(() => { })
      .finally(() => setLoadingBranches(false))
  }, [])

  useEffect(() => {
    // Arrancamos en modo automático (las reglas de cantidad deciden). El cajero
    // fija una lista tocándola en el selector.
    setForcedPriceList(null)
    api.get<PriceList[]>('/api/price-lists').then(lists => {
      setPriceLists(lists)
      const def = lists.find(l => l.is_default)
      if (def) setSelectedList(def)
    }).catch(() => { })
  }, [])

  useEffect(() => {
    if (!workstation?.branch_id) return
    api.get<{ id: string; name: string; is_default: boolean }[]>(
      `/api/warehouses?branch_id=${workstation.branch_id}`
    ).then(data => {
      setWarehouses(data)
      setSelectedWarehouse(data.find(w => w.is_default) ?? data[0] ?? null)
    }).catch(() => { })
  }, [workstation?.branch_id])

  useEffect(() => {
    const params = workstation?.register_id ? `?register_id=${workstation.register_id}` : ''
    api.get(`/api/cash-register/current${params}`)
      .then((data: unknown) => { if (!data) setCajaWarning(true) })
      .catch(() => { })
  }, [workstation?.register_id])

  const loadPromotions = useCallback(async (showFeedback = false) => {
    try {
      // Cargar desde cache local primero (instantáneo si ya está sincronizado)
      const cached = await getLocalPromotions()
      if (cached.length > 0) {
        setPromotions(cached)
        promotionsRef.current = cached
        setPromosCached(true)
      }
      // Sync desde server y actualizar
      await syncPromotions()
      const fresh = await getLocalPromotions()
      setPromotions(fresh)
      promotionsRef.current = fresh
      setPromosCached(true)
      if (showFeedback) toast.success('Promociones actualizadas')
    } catch { }
  }, [])

  useEffect(() => { loadPromotions() }, [loadPromotions])

  // Keyboard handler (uses ref to avoid stale closures)
  const kbHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null)
  useEffect(() => {
    kbHandlerRef.current = (e: KeyboardEvent) => {
      // Mientras el modal de ticket está abierto, POSTicket maneja el teclado
      // (Enter = nueva venta). No procesar atajos del POS detrás del modal.
      if (step === 'ticket') return

      const active = document.activeElement
      const inSearch = active === searchRef.current
      const inInput = active?.tagName === 'INPUT' || active?.tagName === 'SELECT' || active?.tagName === 'TEXTAREA'

      // F3: picker de productos precio libre
      if (e.key === 'F3') {
        e.preventDefault()
        setF3PickerOpen(v => {
          if (!v) { refreshVariableProducts(); setF3ActiveIndex(0) }
          return !v
        })
        return
      }

      // Navegación del picker F3
      if (f3PickerOpen) {
        if (e.key === 'Escape') {
          e.preventDefault()
          setF3PickerOpen(false)
          return
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setF3ActiveIndex(i => Math.min(i + 1, variableProducts.length - 1))
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setF3ActiveIndex(i => Math.max(i - 1, 0))
          return
        }
        if (e.key === 'Enter' && variableProducts.length > 0) {
          e.preventDefault()
          const picked = variableProducts[f3ActiveIndex]
          if (picked) {
            setF3PickerOpen(false)
            addToCart(picked, pendingQtyRef.current)
          }
          return
        }
        return
      }

      // F2: enter cart navigation from anywhere
      if (e.key === 'F2') {
        e.preventDefault()
        if (cartRef.current.length > 0) {
          const idx = focusedCartIndexRef.current >= 0 ? focusedCartIndexRef.current : 0
          setFocusedCartIndex(idx)
          searchRef.current?.blur()
        }
        return
      }

      // F5: abrir modal de cobro
      if (e.key === 'F5') {
        e.preventDefault()
        if (cartRef.current.length > 0) {
          // No abrir el cobro con items sin resolver (barcode pendiente/erróneo) o
          // sin precio: el payload llevaría datos inválidos y la venta fallaría.
          if (cartRef.current.some(i => i.status === 'error')) {
            toast.error('Quitá los productos sin identificar (¿?) para poder cobrar')
            return
          }
          if (cartRef.current.some(i => i.status === 'pending')) {
            toast.info('Esperá a que se resuelvan los productos...')
            return
          }
          if (cartRef.current.some(i => i.product.price_mode === 'custom' && i.unit_price === 0)) {
            toast.error('Ingresá el precio de los productos de precio libre')
            return
          }
          const currentTotal = cartRef.current.reduce((a, i) => a + i.unit_price * i.quantity - i.discount, 0)
          setApplied([])
          setDraft({ method: 'efectivo', amount: currentTotal, installments: 1 })
          setSelectedApplied(null)
          setPaymentModalOpen(true)
        }
        return
      }

      // Don't intercept inputs other than search
      if (inInput && !inSearch) return

      const idx = focusedCartIndexRef.current

      if (idx >= 0) {
        switch (e.key) {
          case 'ArrowDown': {
            e.preventDefault()
            setFocusedCartIndex(i => Math.min(i + 1, cartRef.current.length - 1))
            break
          }
          case 'ArrowUp': {
            e.preventDefault()
            if (idx === 0) {
              setFocusedCartIndex(-1)
              searchRef.current?.focus()
            } else {
              setFocusedCartIndex(i => i - 1)
            }
            break
          }
          case '+':
          case '=': {
            e.preventDefault()
            const itemPlus = cartRef.current[idx]
            if (itemPlus) updateQty(itemPlus.product.id, 1)
            break
          }
          case '-': {
            e.preventDefault()
            const itemMinus = cartRef.current[idx]
            if (itemMinus) updateQty(itemMinus.product.id, -1)
            break
          }
          case 'Delete': {
            e.preventDefault()
            const currentCart = cartRef.current
            const itemDel = currentCart[idx]
            if (itemDel) {
              removeItem(itemDel.product.id)
              const newLen = currentCart.length - 1
              setFocusedCartIndex(newLen <= 0 ? -1 : Math.min(idx, newLen - 1))
            }
            break
          }
          case 'Escape': {
            e.preventDefault()
            setFocusedCartIndex(-1)
            searchRef.current?.focus()
            break
          }
          case 'p':
          case 'P': {
            if (!inInput) {
              e.preventDefault()
              const itemP = cartRef.current[idx]
              if (itemP) priceInputRefs.current[itemP.product.id]?.focus()
            }
            break
          }
        }
      } else if (inSearch) {
        // ArrowDown from empty search → enter cart
        if (e.key === 'ArrowDown' && !query.trim() && cartRef.current.length > 0 && results.length === 0) {
          e.preventDefault()
          setFocusedCartIndex(0)
          searchRef.current?.blur()
        }
      }
    }
  })

  useEffect(() => {
    const handler = (e: KeyboardEvent) => kbHandlerRef.current?.(e)
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Search / barcode logic
  useEffect(() => {
    const trimmed   = query.trim()
    if (!trimmed) { setResults([]); setActiveResultIndex(-1); return }

    const isBarcode = /^\d{8,14}$/.test(trimmed)
    // Búsqueda de texto: exigir mínimo 3 caracteres. Con 1-2 letras el catálogo
    // devuelve demasiadas coincidencias y el producto buscado nunca aparece por
    // el límite de resultados. Los códigos de barra (isBarcode) no se ven
    // afectados: se resuelven al instante sin importar la longitud.
    if (!isBarcode && trimmed.length < MIN_SEARCH_LEN) { setResults([]); setActiveResultIndex(-1); return }

    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      if (isBarcode) {
        const knownProductId = barcodeMapRef.current.get(trimmed)
        if (knownProductId) {
          const existingItem = cartRef.current.find(i => i.product.id === knownProductId)
          if (existingItem) {
            const qty    = pendingQtyRef.current
            const newQty = existingItem.quantity + qty
            if (existingItem.product.price_mode !== 'custom' && stockEnabledRef.current && newQty > (existingItem.product.stock_current ?? 0)) {
              toast.error(`Stock máximo: ${existingItem.product.stock_current ?? 0}`)
              setPendingQty(1); pendingQtyRef.current = 1
              setQuery(''); setResults([])
              return
            }
            setCart(prev => prev.map(i => i.product.id === knownProductId ? { ...i, quantity: newQty } : i))
            setPendingQty(1); pendingQtyRef.current = 1
            setQuery(''); setResults([])
            setTimeout(() => searchRef.current?.focus(), 50)
            if (existingItem.product.price_mode !== 'custom' && !existingItem.price_overridden) {
              const pricing = computeLocalPrice(existingItem.product, newQty)
              const promo = evaluatePromo(existingItem.product as Parameters<typeof evaluatePromo>[0], newQty, pricing.price, promotionsRef.current)
              if (existingItem.product.use_fixed_sell_price) {
                setCart(prev => prev.map(i => i.product.id === knownProductId ? { ...i, quantity: newQty, discount: promo.discount, promo_label: promo.promo_label, promotion_id: promo.promotion_id } : i))
              } else {
                setCart(prev => prev.map(i =>
                  i.product.id === knownProductId
                    ? { ...i, quantity: newQty, unit_price: pricing.price, applied_list: pricing.list_name, applied_margin: pricing.margin_pct, discount: promo.discount, promo_label: promo.promo_label, promotion_id: promo.promotion_id }
                    : i,
                ))
              }
            }
            return
          }
        }

        const existingPendingId = pendingBarcodesRef.current.get(trimmed)
        if (existingPendingId) {
          const qty = pendingQtyRef.current
          setCart(prev => prev.map(i => i.product.id === existingPendingId ? { ...i, quantity: i.quantity + qty } : i))
          setPendingQty(1); pendingQtyRef.current = 1
          setQuery(''); setResults([])
          setTimeout(() => searchRef.current?.focus(), 50)
          return
        }

        // Buscar en cache local — sub-5ms si el catálogo está cargado
        const localResult = await resolveBarcode(trimmed, pendingQtyRef.current)
        if (localResult) {
          const isCustomLocal = localResult.product.price_mode === 'custom'
          const stockLocal = localResult.product.stock_current ?? 0
          if (stockEnabledRef.current && !isCustomLocal && stockLocal <= 0) {
            toast.error(`${localResult.product.name} sin stock`)
            setPendingQty(1); pendingQtyRef.current = 1
            setQuery(''); setResults([])
            return
          }
          barcodeMapRef.current.set(trimmed, localResult.product.id)
          const existingLocal = cartRef.current.find(i => i.product.id === localResult.product.id)
          const qty = pendingQtyRef.current
          if (existingLocal) {
            const newQty = existingLocal.quantity + qty
            if (stockEnabledRef.current && !isCustomLocal && newQty > stockLocal) {
              toast.error(`Stock máximo: ${stockLocal}`)
              setPendingQty(1); pendingQtyRef.current = 1
              setQuery(''); setResults([])
              return
            }
            const promo = evaluatePromo(localResult.product as Parameters<typeof evaluatePromo>[0], newQty, localResult.pricing.price, promotionsRef.current)
            setCart(prev => prev.map(i =>
              i.product.id === localResult.product.id
                ? { ...i, quantity: newQty, ...(i.price_overridden ? {} : { unit_price: localResult.pricing.price, applied_list: localResult.pricing.list_name, applied_margin: localResult.pricing.margin_pct }), discount: promo.discount, promo_label: promo.promo_label, promotion_id: promo.promotion_id }
                : i,
            ))
          } else {
            const promo = evaluatePromo(localResult.product as Parameters<typeof evaluatePromo>[0], qty, localResult.pricing.price, promotionsRef.current)
            setCart(prev => [{
              product: localResult.product,
              quantity: qty,
              unit_price: localResult.pricing.price,
              applied_list: localResult.pricing.list_name,
              applied_margin: localResult.pricing.margin_pct,
              discount: promo.discount,
              promo_label: promo.promo_label,
              promotion_id: promo.promotion_id,
              status: 'resolved' as const,
            }, ...prev])
          }
          setPendingQty(1); pendingQtyRef.current = 1
          setQuery(''); setResults([])
          setTimeout(() => searchRef.current?.focus(), 50)
          return
        }

        const tempId  = `pending_${trimmed}_${Date.now()}`
        const qty     = pendingQtyRef.current
        const tempItem: CartItem = {
          product: {
            id: tempId, name: trimmed, barcode: trimmed,
            sell_price: 0, cost_price: 0, stock_current: 999,
            price_mode: 'fixed', unit: 'un', is_active: true,
          } as Product,
          quantity: qty, unit_price: 0, discount: 0, status: 'pending',
        }

        pendingBarcodesRef.current.set(trimmed, tempId)
        setCart(prev => [tempItem, ...prev])
        setPendingQty(1); pendingQtyRef.current = 1
        setQuery(''); setResults([])
        setTimeout(() => searchRef.current?.focus(), 50)

        api.post<ScanResult>('/api/pos/scan', {
          barcode: trimmed, warehouse_id: selectedWarehouse?.id ?? null, quantity: qty,
        }).then(result => {
          barcodeMapRef.current.set(trimmed, result.product.id)
          pendingBarcodesRef.current.delete(trimmed)
          cacheProductFromScan(result.product)
          if (stockEnabledRef.current && result.product.price_mode !== 'custom' && (result.product.stock_current ?? 0) <= 0) {
            toast.error(`${result.product.name} sin stock`)
            setCart(prev => prev.filter(i => i.product.id !== tempId))
            return
          }
          setCart(prev => {
            const alreadyExists = prev.find(i => i.product.id === result.product.id)
            if (alreadyExists) {
              return prev
                .filter(i => i.product.id !== tempId)
                .map(i => i.product.id === result.product.id ? { ...i, quantity: i.quantity + qty } : i)
            }
            const pendingItem = prev.find(i => i.product.id === tempId)
            const priceOverridden = pendingItem?.price_overridden ?? false
            const promo = evaluatePromo(result.product as Parameters<typeof evaluatePromo>[0], qty, result.pricing.price, promotionsRef.current)
            return prev.map(i => i.product.id === tempId ? {
              ...i,
              product: result.product,
              ...(priceOverridden ? {} : {
                unit_price: result.pricing.price,
                applied_list: result.pricing.list_name,
                applied_margin: result.pricing.margin_pct,
              }),
              discount: promo.discount,
              promo_label: promo.promo_label,
              promotion_id: promo.promotion_id,
              status: 'resolved',
            } : i)
          })
        }).catch(() => {
          pendingBarcodesRef.current.delete(trimmed)
          setCart(prev => prev.map(i => i.product.id === tempId ? { ...i, status: 'error' } : i))
        })
        return
      }

      const currentWarehouse = selectedWarehouseRef.current
      if (!currentWarehouse || !stockEnabledRef.current) {
        const localResults = await searchProductsLocal(trimmed, SEARCH_RESULT_LIMIT)
        if (localResults.length > 0) {
          setResults(localResults)
          setActiveResultIndex(0)
          return
        }
      }
      setSearching(true)
      try {
        const res = await api.get<{ data: Product[] }>('/api/products', {
          search: trimmed, limit: SEARCH_RESULT_LIMIT,
          ...(currentWarehouse?.id && stockEnabledRef.current ? { warehouse_id: currentWarehouse.id } : {}),
        })
        setResults(res.data)
        setActiveResultIndex(res.data.length > 0 ? 0 : -1)
      } catch { setResults([]); setActiveResultIndex(-1) }
      finally { setSearching(false) }
    // Para barcodes usamos un debounce muy corto (no 0ms): un EAN-13 se teclea
    // dígito a dígito y la regex matchea ya con 8 dígitos, así que con 0ms se
    // procesaba un código parcial (ej. "77992190") antes de completar el scan,
    // duplicando el item. 35ms es imperceptible para el cajero pero ~3x el gap
    // entre caracteres de un scanner (<15ms), así que la próxima tecla cancela
    // el timer del valor parcial. Si el scanner manda Enter, ese handler limpia
    // este timer y procesa al instante (latencia 0).
    }, isBarcode ? 35 : 300)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const q = customerQuery.trim()
    if (!q || q.length < 2) { setCustomerResults([]); return }
    let cancelled = false
    const timer = setTimeout(async () => {
      // Cache local primero → resultados instantáneos y soporte offline
      const local = await searchCustomersLocal(q)
      if (!cancelled && local.length > 0) setCustomerResults(local)

      setSearchingCustomer(true)
      try {
        // Refresca con el server para tener saldos al día
        const data = await api.get<CustomerSummary[]>(`/api/customers/search?q=${encodeURIComponent(q)}`)
        if (!cancelled) setCustomerResults(data)
      } catch {
        // Sin red → quedarse con los resultados del cache local
        if (!cancelled && local.length === 0) setCustomerResults([])
      } finally {
        if (!cancelled) setSearchingCustomer(false)
      }
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [customerQuery])

  // Al cambiar los resultados, resaltar el primero para que Enter lo elija directo
  useEffect(() => { setCustomerActiveIndex(0) }, [customerResults])

  // Navegación con flechas + Enter en el listado de clientes (Cta. Cte.)
  const handleCustomerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (customerQuery.trim().length < 2) return
    const itemCount = customerResults.length + 1  // +1 por la opción "Crear"
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCustomerActiveIndex(i => Math.min(itemCount - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCustomerActiveIndex(i => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault(); e.stopPropagation()
      if (customerActiveIndex < customerResults.length) {
        const c = customerResults[customerActiveIndex]
        if (c) { setSelectedCustomer(c); setCustomerQuery(''); setCustomerResults([]) }
      } else {
        setQuickCustomerModal(true)
      }
    }
  }

  useEffect(() => {
    if (workstation === null && loaded) setSelectingWorkstation(true)
  }, [workstation, loaded])

  const addToCart = useCallback(async (product: Product, qty?: number, prefetchedPricing?: PricingResult) => {
    if (isAddingRef.current) return
    isAddingRef.current = true

    const quantity       = qty ?? pendingQtyRef.current
    const isCustomPrice  = product.price_mode === 'custom'
    const stockAvailable = product.stock_current ?? 0

    if (stockEnabledRef.current && !isCustomPrice && stockAvailable <= 0) {
      toast.error(`${product.name} sin stock`)
      isAddingRef.current = false
      return
    }

    const existing = cartRef.current.find(i => i.product.id === product.id)
    const newQty   = existing ? existing.quantity + quantity : quantity

    if (stockEnabledRef.current && !isCustomPrice && newQty > stockAvailable) {
      toast.error(`Stock máximo: ${stockAvailable}`)
      isAddingRef.current = false
      return
    }

    if (product.barcode) barcodeMapRef.current.set(product.barcode, product.id)
    ;(product as Product & { product_barcodes?: { barcode: string }[] }).product_barcodes
      ?.forEach(b => barcodeMapRef.current.set(b.barcode, product.id))

    const pricing      = prefetchedPricing
    const initialPrice = isCustomPrice ? 0 : (pricing?.price ?? product.sell_price)

    if (existing) {
      setCart(prev => prev.map(i => i.product.id === product.id ? { ...i, quantity: newQty } : i))
    } else {
      setCart(prev => [{
        product, quantity, unit_price: initialPrice, discount: 0,
        applied_list:   pricing?.list_name,
        applied_margin: pricing?.margin_pct,
        promo_label: undefined, promotion_id: null,
      }, ...prev])
    }

    setPendingQty(1); pendingQtyRef.current = 1
    setResults([]); setQuery('')

    if (isCustomPrice && !existing) {
      setCustomPriceFocusId(product.id)
    } else {
      setTimeout(() => searchRef.current?.focus(), 50)
    }

    isAddingRef.current = false
    if (isCustomPrice) return

    try {
      const resolvedPricing = pricing ?? computeLocalPrice(product, newQty)
      const promo = evaluatePromo(
        product as Parameters<typeof evaluatePromo>[0],
        newQty,
        resolvedPricing.price,
        promotionsRef.current,
      )
      setCart(prev => prev.map(i =>
        i.product.id === product.id
          ? {
              ...i,
              ...(i.price_overridden ? {} : {
                unit_price:     resolvedPricing.price,
                applied_list:   resolvedPricing.list_name,
                applied_margin: resolvedPricing.margin_pct,
              }),
              discount:       promo.discount,
              promo_label:    promo.promo_label,
              promotion_id:   promo.promotion_id,
            }
          : i,
      ))
    } catch { }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const updateQty = useCallback((id: string, delta: number) => {
    const item = cartRef.current.find(i => i.product.id === id)
    if (!item) return
    const newQty = Math.max(1, item.quantity + delta)
    setCart(prev => prev.map(i => i.product.id === id ? { ...i, quantity: newQty } : i))
    if (item.product.price_mode === 'custom' || item.price_overridden) return
    const pricing = computeLocalPrice(item.product, newQty)
    const promo = evaluatePromo(
      item.product as Parameters<typeof evaluatePromo>[0],
      newQty, pricing.price, promotionsRef.current,
    )
    if (item.product.use_fixed_sell_price) {
      setCart(prev => prev.map(i => i.product.id === id ? { ...i, quantity: newQty, discount: promo.discount, promo_label: promo.promo_label, promotion_id: promo.promotion_id } : i))
    } else {
      setCart(prev => prev.map(i =>
        i.product.id === id
          ? { ...i, quantity: newQty, unit_price: pricing.price, applied_list: pricing.list_name, applied_margin: pricing.margin_pct, discount: promo.discount, promo_label: promo.promo_label, promotion_id: promo.promotion_id }
          : i,
      ))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const updateItemPrice = useCallback((id: string, v: string) =>
    setCart(prev => prev.map(i => i.product.id === id ? { ...i, unit_price: Math.max(0, Number(v) || 0), price_overridden: true } : i)), [])

  const removeItem = useCallback((id: string) =>
    setCart(prev => prev.filter(i => i.product.id !== id)), [])

  const handleSync = useCallback(async () => {
    await Promise.all([loadPromotions(), forceSync()])
    getLastSyncTime().then(t => setLastSyncedAt(t)).catch(() => {})
    refreshVariableProducts().catch(() => {})
  }, [loadPromotions, forceSync, refreshVariableProducts])

  const relativeTime = (date: Date): string => {
    const min = Math.floor((Date.now() - date.getTime()) / 60_000)
    if (min < 1) return 'Justo ahora'
    if (min < 60) return `hace ${min} min`
    return `hace ${Math.floor(min / 60)} hs`
  }

  const subtotal           = cart.reduce((a, i) => a + i.unit_price * i.quantity - i.discount, 0)
  const saleDiscountAmount = Math.round(subtotal * saleDiscountPct / 100 * 100) / 100
  const shipping           = shippingEnabled ? shippingAmount : 0
  const total              = Math.round((Math.max(0, subtotal - saleDiscountAmount) + shipping) * 100) / 100
  const hasMissingCustomPrice = cart.some(i => i.product.price_mode === 'custom' && i.unit_price === 0)
  const hasPendingItems       = cart.some(i => i.status === 'pending')
  const hasErrorItems         = cart.some(i => i.status === 'error')
  // Items sin resolver (barcode aún en el server o que falló): no se puede cobrar
  // porque el payload llevaría un product_id temporal (pending_*) inexistente.
  const hasUnresolvedItems    = hasPendingItems || hasErrorItems

  // Total ya cubierto por los pagos aplicados, y saldo pendiente real (sin contar el draft)
  const totalApplied = Math.round(applied.reduce((a, s) => a + (s.amount || 0), 0) * 100) / 100
  const remaining    = Math.round((total - totalApplied) * 100) / 100
  const fullyApplied = remaining < 0.01

  // El modo dividido está activo si el usuario lo pidió o si ya hay pagos aplicados.
  const splitActive = splitMode || applied.length > 0

  // Estado del pago que se está componiendo (draft)
  const draftAmount  = draft.amount || 0
  const draftReceivedInvalid =
    draft.method === 'efectivo' && draft.received !== undefined && draft.received > 0 && draft.received < draftAmount
  const draftChange =
    draft.method === 'efectivo' && (draft.received ?? 0) > draftAmount
      ? Math.ceil((draft.received ?? 0) - draftAmount) : 0
  const canApplyDraft = draftAmount > 0 && draftAmount <= remaining + 0.01 && !draftReceivedInvalid
  const draftCovers   = draftAmount >= remaining - 0.01   // el draft salda todo lo que falta

  const ccInPlay      = draft.method === 'cuenta_corriente' || applied.some(s => s.method === 'cuenta_corriente')
  const needsCustomer = ccInPlay && !selectedCustomer

  // Validación del modo dividido (columnas): ninguna columna vacía, sin sobrepago y
  // sin efectivo donde lo recibido sea menor al monto de esa columna.
  const splitBad = splitActive && (
    applied.some(s => (s.amount || 0) <= 0) ||
    totalApplied > total + 0.01 ||
    applied.some(s => s.method === 'efectivo' && (s.received ?? 0) > 0 && (s.received ?? 0) < s.amount)
  )

  // La acción principal aplica el draft; si con eso se cubre el total, además confirma la venta.
  const canMainAction      = !needsCustomer && !hasMissingCustomPrice && !hasUnresolvedItems && !splitBad && (fullyApplied || canApplyDraft)
  const mainActionConfirms = fullyApplied || (canApplyDraft && draftCovers)

  // Refs para los atajos de teclado (se actualizan en cada render, ver useEffect más abajo)
  const processingRef      = useRef(processing)
  const fullyAppliedRef    = useRef(fullyApplied)
  const splitActiveRef     = useRef(splitActive)
  const selectedAppliedRef = useRef(selectedApplied)
  const mainActionRef      = useRef<() => void>(() => {})
  const removeAppliedRef   = useRef<(i: number) => void>(() => {})
  const ccSearchAvailRef   = useRef(false)
  useEffect(() => { processingRef.current = processing }, [processing])

  const setDraftMethod = useCallback((method: string) =>
    setDraft(d => ({ ...d, method, received: undefined })), [])
  const setDraftAmount = useCallback((val: string) =>
    setDraft(d => ({ ...d, amount: Math.max(0, Number(val) || 0) })), [])
  const setDraftInstallments = useCallback((n: number) =>
    setDraft(d => ({ ...d, installments: n })), [])
  const setDraftReceived = useCallback((val: number) =>
    setDraft(d => ({ ...d, received: val })), [])

  // Pasar a "varios medios": el cobro se edita como columnas (una por medio).
  // Cada columna es un PaymentSplit dentro de `applied`. Arrancamos con dos.
  const enableSplit = useCallback(() => {
    setSplitMode(true)
    // El draft no se usa en modo dividido; lo dejamos neutro para que no afecte
    // ni la validación (canApplyDraft) ni el flag de cuenta corriente (ccInPlay).
    setDraft({ method: 'efectivo', amount: 0, installments: 1 })
    setApplied([
      { method: 'efectivo', amount: 0, installments: 1 },
      { method: 'debito',   amount: 0, installments: 1 },
    ])
  }, [])

  // Editar una columna (medio, monto, recibido, cuotas…)
  const setSplitColumn = useCallback((i: number, patch: Partial<PaymentSplit>) =>
    setApplied(arr => arr.map((s, idx) => idx === i ? { ...s, ...patch } : s)), [])

  // Agregar otra columna (otro medio de pago)
  const addSplitColumn = useCallback(() =>
    setApplied(arr => [...arr, { method: 'efectivo', amount: 0, installments: 1 }]), [])

  // Quitar una columna; si queda una sola, se vuelve a modo simple (lo maneja el efecto de abajo)
  const removeSplitColumn = useCallback((i: number) =>
    setApplied(arr => arr.filter((_, idx) => idx !== i)), [])

  // Si en modo dividido queda una sola columna (o ninguna), volvemos a modo simple
  // conservando el medio de la columna restante.
  useEffect(() => {
    if (splitMode && applied.length <= 1) {
      const keep = applied[0]
      setSplitMode(false)
      setApplied([])
      if (keep) setDraft(d => ({ ...d, method: keep.method, installments: keep.installments }))
    }
  }, [splitMode, applied])

  // Al abrir el modal arrancamos siempre en modo simple (un solo medio).
  // Movemos el foco al monto para que el buscador de productos detrás no
  // intercepte el Enter (si el search retiene el foco, el Enter cae en su
  // onKeyDown en vez de confirmar la venta).
  useEffect(() => {
    if (paymentModalOpen) {
      setSplitMode(false)
      searchRef.current?.blur()
      setTimeout(() => draftAmountRef.current?.focus(), 50)
    }
  }, [paymentModalOpen])

  // En modo simple el monto siempre es el saldo pendiente (paga todo con un medio).
  useEffect(() => {
    if (!splitActive && !fullyApplied) {
      setDraft(d => d.amount === remaining ? d : ({ ...d, amount: remaining }))
    }
  }, [splitActive, remaining, fullyApplied])

  // Shortcuts globales del modal. Usan preventDefault() para que las letras no
  // escriban en inputs numéricos y funcionan sin importar dónde esté el foco.
  useEffect(() => {
    if (!paymentModalOpen) return
    const METHOD_KEYS: Record<string, string> = {
      e: 'efectivo', d: 'debito', c: 'credito',
      t: 'transferencia', q: 'qr', a: 'cuenta_corriente',
    }
    const handler = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') { setPaymentModalOpen(false); return }

      const active = document.activeElement as HTMLElement | null
      const inTextInput = active?.tagName === 'INPUT' && (active as HTMLInputElement).type !== 'number'
      const inAnyField  = active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA'
      if (inTextInput) return  // no interceptar el buscador de cliente

      // Enter: aplicar pago o confirmar venta (lo decide handleMainAction)
      if (ev.key === 'Enter') {
        ev.preventDefault()
        if (!processingRef.current) mainActionRef.current()
        return
      }

      // Backspace/Delete sobre un pago aplicado seleccionado lo elimina
      if ((ev.key === 'Backspace' || ev.key === 'Delete') && !inAnyField && selectedAppliedRef.current != null) {
        ev.preventDefault()
        removeAppliedRef.current(selectedAppliedRef.current)
        return
      }

      // F → ir directo a buscar el cliente de cuenta corriente
      if ((ev.key === 'f' || ev.key === 'F') && ccSearchAvailRef.current) {
        ev.preventDefault()
        customerSearchRef.current?.focus()
        return
      }

      // E/D/C/T/Q/A → medio de pago del draft
      const method = METHOD_KEYS[ev.key.toLowerCase()]
      if (method && !fullyAppliedRef.current) {
        ev.preventDefault()
        setDraftMethod(method)
        setTimeout(() => draftAmountRef.current?.focus(), 30)
        return
      }

      // N / + → dividir el cobro; si ya está dividido, agrega otra columna
      if ((ev.key === 'n' || ev.key === 'N' || ev.key === '+') && !fullyAppliedRef.current) {
        ev.preventDefault()
        if (splitActiveRef.current) addSplitColumn()
        else enableSplit()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [paymentModalOpen, setDraftMethod, enableSplit, addSplitColumn])

  // V (de "vuelto") sobre el input de monto salta al campo "paga con" (solo efectivo).
  // Enter lo maneja el listener global.
  const handleDraftAmountKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'v' || e.key === 'V') && draft.method === 'efectivo') {
      e.preventDefault(); e.stopPropagation()
      setTimeout(() => draftReceivedRef.current?.focus(), 30)
    }
  }

  const handleConfirm = async (finalSplits: PaymentSplit[]) => {
    if (cart.length === 0) return
    setProcessing(true)
    try {
      const isSingleSplit        = finalSplits.length === 1
      const ccSplit              = finalSplits.find(s => s.method === 'cuenta_corriente')
      const singleSplit          = finalSplits[0]
      const effectiveMethod      = isSingleSplit ? singleSplit.method : 'mixto'
      const effectiveInstallments = isSingleSplit && singleSplit.method === 'credito' ? singleSplit.installments : 1

      const payload = {
        items: cart.map(i => ({
          product_id: i.product.id,
          quantity:   i.quantity,
          unit_price: i.unit_price,
          discount:   i.discount,
          subtotal:   i.unit_price * i.quantity - i.discount,
        })),
        discount:         saleDiscountAmount,
        shipping_amount:  shipping,
        payment_method:   effectiveMethod,
        installments:     effectiveInstallments,
        price_list_id:    selectedList?.id ?? null,
        warehouse_id:     selectedWarehouse?.id ?? null,
        branch_id:        workstation?.branch_id ?? null,
        register_id:      workstation?.register_id ?? null,
        customer_id:      selectedCustomer?.id ?? null,
        ...(!isSingleSplit ? { payment_splits: finalSplits } : {}),
      }
      // Validación de cuenta corriente sin red: chequeo optimista contra el
      // cliente cacheado (no bloqueamos la venta con un fetch al backend).
      if (ccSplit) {
        if (!selectedCustomer) throw new Error('Seleccioná un cliente para cuenta corriente')
        if (selectedCustomer.credit_limit > 0) {
          const available = selectedCustomer.available_credit ?? (selectedCustomer.credit_limit - selectedCustomer.current_balance)
          if (available < ccSplit.amount) {
            throw new Error(
              `Límite de cuenta corriente insuficiente. Disponible: ${formatCurrency(available)} — Monto CC: ${formatCurrency(ccSplit.amount)}`
            )
          }
        }
      }

      const localId   = crypto.randomUUID()
      const createdAt = new Date().toISOString()

      // 1. Guardar la venta en la cola local (IndexedDB) — durable y rápido.
      await queueSale({
        id: localId,
        created_at: createdAt,
        payload,
        ...(ccSplit && selectedCustomer ? { customer_charge: { customer_id: selectedCustomer.id, amount: ccSplit.amount } } : {}),
      })

      // 2. Mostrar el ticket de inmediato, sin esperar al backend.
      const localSale: CompletedSale = {
        id: localId,
        total,
        subtotal,
        discount: saleDiscountAmount,
        shipping_amount: shipping,
        payment_method: effectiveMethod,
        installments: effectiveInstallments,
        ...(isSingleSplit ? {} : { payment_splits: finalSplits }),
        items: cart,
        created_at: createdAt,
      }
      setCompletedSale(localSale)
      localStorage.removeItem(POS_CART_KEY)
      setCart([]); setSaleDiscountPct(0); setShippingEnabled(false); setSelectedCustomer(null); setCustomerQuery('')
      setApplied([])
      resetToAutoList()
      setPaymentModalOpen(false); setStep('ticket')

      // 3. Sincronizar en segundo plano. Si hay red, mandamos la venta ya mismo
      // y parcheamos el ticket con los ids reales (venta + comprobante). Si no,
      // queda en la cola y el listener de reconexión la sincroniza más tarde.
      if (navigator.onLine) {
        pushSale(localId)
          .then(res => {
            getPendingSalesCount().then(setPendingCount).catch(() => {})
            if (res) {
              setCompletedSale(prev => prev?.id === localId
                ? { ...prev, id: res.saleId, ticket_code: res.ticketCode, invoice_id: res.invoiceId ?? undefined }
                : prev)
            }
          })
          .catch(err => {
            getPendingSalesCount().then(setPendingCount).catch(() => {})
            if (isNetworkError(err)) {
              // El backend no respondió (timeout / caído). La venta está a salvo
              // en la cola y se reintenta sola; no alarmamos con un error.
              toast.warning('Servidor sin respuesta — la venta quedó guardada y se sincroniza sola')
            } else {
              // Error de negocio: requiere atención del operador.
              toast.error(err instanceof Error ? err.message : 'La venta no se pudo registrar')
            }
          })
        toast.success('Venta registrada')
      } else {
        setPendingCount(c => c + 1)
        toast.info('Sin conexión — venta guardada, se sincronizará automáticamente')
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al procesar la venta')
    } finally { setProcessing(false) }
  }
  // Construye la fila de pago a partir del draft (o null si es inválido)
  const buildDraftRow = (): PaymentSplit | null => {
    if (!canApplyDraft) return null
    return {
      method: draft.method,
      amount: Math.round(draftAmount * 100) / 100,
      installments: draft.method === 'credito' ? (draft.installments ?? 1) : 1,
      ...(draft.method === 'efectivo' && draft.received ? { received: draft.received } : {}),
    }
  }

  // Acción principal: aplica el draft al ledger; si así se cubre el total, confirma la venta.
  const handleMainAction = () => {
    if (processing) return
    if (needsCustomer) { toast.error('Seleccioná un cliente para cuenta corriente'); return }
    if (fullyApplied) { handleConfirm(applied); return }
    const row = buildDraftRow()
    if (!row) return
    const next = [...applied, row]
    if (draftCovers) { handleConfirm(next); return }
    // Pago parcial: queda en el ledger y el formulario se re-arma con el saldo restante
    setApplied(next)
    const rem = Math.round((total - next.reduce((a, s) => a + s.amount, 0)) * 100) / 100
    setDraft({ method: 'efectivo', amount: Math.max(0, rem), installments: 1 })
    setSelectedApplied(null)
    setTimeout(() => draftAmountRef.current?.focus(), 50)
  }

  const removeAppliedAt = (i: number) => {
    const next = applied.filter((_, idx) => idx !== i)
    setApplied(next)
    setSelectedApplied(null)
    const rem = Math.round((total - next.reduce((a, s) => a + s.amount, 0)) * 100) / 100
    // Reabrir el formulario con el saldo liberado para que sea fácil reemplazarlo
    if (next.length === 0) setDraft({ method: 'efectivo', amount: Math.max(0, rem), installments: 1 })
    else setDraft(d => ({ ...d, amount: Math.max(0, rem) }))
  }

  // Editar = sacar el pago del ledger y volver a cargarlo en el formulario
  const editAppliedAt = (i: number) => {
    const row = applied[i]
    setApplied(applied.filter((_, idx) => idx !== i))
    setDraft({ ...row })
    setSelectedApplied(null)
    setTimeout(() => draftAmountRef.current?.focus(), 30)
  }

  // Mantener refs actualizados para los handlers de teclado del modal
  useEffect(() => {
    mainActionRef.current     = handleMainAction
    removeAppliedRef.current  = removeAppliedAt
    fullyAppliedRef.current   = fullyApplied
    splitActiveRef.current    = splitActive
    selectedAppliedRef.current = selectedApplied
    ccSearchAvailRef.current  = ccInPlay && !selectedCustomer
  })

  const handleNewSale = () => {
    localStorage.removeItem(POS_CART_KEY)
    setCart([]); setSaleDiscountPct(0); setShippingEnabled(false)
    setApplied([])
    resetToAutoList()
    setDraft({ method: 'efectivo', amount: 0, installments: 1 })
    setSelectedApplied(null)
    setPaymentModalOpen(false)
    setCompletedSale(null); setSelectedCustomer(null); setCustomerQuery('')
    setStep('cart')
    setTimeout(() => searchRef.current?.focus(), 100)
  }

  // Navegación saliente del POS protegida: sin internet, salir dispara un fetch de
  // RSC que falla y deja al usuario en la pantalla del dino del navegador. Mientras
  // no haya Service Worker, bloqueamos la salida y mantenemos al cajero en el POS.
  const leavePOS = useCallback((path: string) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast.warning('Sin conexión — seguís en el POS. Podés vender; se sincroniza al volver internet.')
      return
    }
    router.push(path)
  }, [router])

  const cartItemCount = cart.reduce((a, i) => a + i.quantity, 0)

  return (
    <div className="flex flex-col sm:flex-row h-screen bg-[var(--bg)] overflow-hidden">

      {/* ── Panel izquierdo — búsqueda ── */}
      <div className={`sm:w-[380px] flex-shrink-0 flex flex-col min-w-0 border-r border-[var(--border)] pb-14 sm:pb-0 ${mobileView === 'cart' ? 'hidden sm:flex' : 'flex'}`}>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] bg-[var(--surface)]">
          <button onClick={() => leavePOS('/sales')}
            className="p-1.5 rounded-[var(--radius-md)] hover:bg-[var(--surface2)] text-[var(--text3)] hover:text-[var(--text)] transition-colors">
            <ChevronLeft size={18} />
          </button>
          <div className="w-6 h-6 rounded-md bg-[var(--accent)] flex items-center justify-center flex-shrink-0">
            <Zap size={13} className="text-white" />
          </div>
          <span className="text-sm font-bold text-[var(--text)]">StockOS POS</span>
          <div className="ml-auto flex items-center gap-2">
            {workstation && (
              <>
                <span className="text-xs text-[var(--text3)] hidden sm:block">
                  {workstation.branch_name} · {workstation.register_name}
                </span>
                <button
                  onClick={() => {
                    setTempBranchId(workstation.branch_id)
                    setTempRegisterId(workstation.register_id)
                    setSelectingWorkstation(true)
                  }}
                  className="text-xs text-[var(--text3)] hover:text-[var(--accent)] underline transition-colors"
                >
                  Cambiar
                </button>
              </>
            )}
            <button
              onClick={() => setShowPrintSettings(true)}
              title="Configuración de impresión"
              className="p-1.5 rounded-[var(--radius-md)] text-[var(--text3)] hover:text-[var(--accent)] hover:bg-[var(--surface2)] transition-colors"
            >
              <Printer size={16} />
            </button>
          </div>
        </div>

        {/* Banner caja cerrada */}
        {cajaWarning && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-[var(--danger-subtle)] border-b border-[var(--danger)]">
            <div className="flex items-center gap-2 text-xs text-[var(--danger)]">
              <AlertTriangle size={14} className="flex-shrink-0" />
              <span className="font-medium">La caja no está abierta.</span>
            </div>
            <button onClick={() => leavePOS('/cash-register')}
              className="text-xs font-semibold text-[var(--danger)] underline flex-shrink-0">
              Abrir caja →
            </button>
          </div>
        )}


        {/* Banner ventas offline pendientes */}
        {pendingCount > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-yellow-50 dark:bg-yellow-950/30 border-b border-yellow-300 dark:border-yellow-700">
            <div className="flex items-center gap-2 text-xs text-yellow-700 dark:text-yellow-400">
              <AlertTriangle size={14} className="flex-shrink-0" />
              <span className="font-medium">{pendingCount} venta{pendingCount > 1 ? 's' : ''} sin sincronizar</span>
            </div>
            <button
              onClick={() => {
                syncPendingSales({ includeFailed: true })
                  .then(({ synced, failed }) => {
                    if (synced > 0) toast.success(`${synced} venta${synced > 1 ? 's' : ''} sincronizada${synced > 1 ? 's' : ''}`)
                    if (failed > 0) toast.error(`${failed} no se pudieron sincronizar`)
                    getPendingSalesCount().then(setPendingCount).catch(() => {})
                  })
                  .catch(() => {})
              }}
              className="text-xs font-semibold text-yellow-700 dark:text-yellow-400 underline flex-shrink-0"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Selector de depósito */}
        {warehouses.length > 1 && workstation && !workstation.warehouse_id && !branches.find(b => b.id === workstation.branch_id)?.warehouse_id && (
          <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--surface2)]">
            <div className="flex items-center gap-2 overflow-x-auto">
              <span className="text-xs text-[var(--text3)] flex-shrink-0">Depósito:</span>
              {warehouses.map(w => (
                <button key={w.id} onClick={() => setSelectedWarehouse(w)}
                  className={`px-3 py-1 text-xs rounded-full font-medium flex-shrink-0 transition-colors ${selectedWarehouse?.id === w.id ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text2)]'}`}>
                  {w.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Cantidad + Buscador */}
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <div className="flex gap-2">
            <div className="relative flex-shrink-0 group">
              <input ref={qtyRef} type="number" min="1" max="999" value={pendingQty}
                onChange={e => { const val = Math.max(1, Number(e.target.value) || 1); setPendingQty(val); pendingQtyRef.current = val }}
                onFocus={e => e.target.select()}
                onBlur={e => { if (!e.target.value || Number(e.target.value) < 1) { setPendingQty(1); pendingQtyRef.current = 1 } }}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); searchRef.current?.focus(); return }
                  if (!/^\d$/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault()
                }}
                title="Cantidad"
                className={`w-14 text-center text-sm font-bold mono py-3 rounded-[var(--radius-lg)] bg-[var(--surface2)] border-2 focus:outline-none cursor-pointer transition-colors ${pendingQty > 1 ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-[var(--border)] text-[var(--text3)] focus:border-[var(--accent)] focus:text-[var(--accent)]'}`}
              />
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[10px] text-[var(--text3)] bg-[var(--bg)] px-1 whitespace-nowrap">×</span>
            </div>
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
              {searching && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />}
              <input ref={searchRef} value={query}
                disabled={step === 'ticket'}
                onChange={e => { setQuery(e.target.value); setActiveResultIndex(-1) }}
                onKeyDown={async e => {
                  if (e.key === ' ' && !query.trim()) { e.preventDefault(); qtyRef.current?.focus(); return }
                  if (e.key === 'ArrowDown' && results.length === 0 && !query.trim() && cart.length > 0) {
                    e.preventDefault(); setFocusedCartIndex(0); searchRef.current?.blur(); return
                  }
                  if (e.key === 'ArrowDown') { e.preventDefault(); setActiveResultIndex(prev => Math.min(prev + 1, results.length - 1)); return }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setActiveResultIndex(prev => Math.max(prev - 1, -1)); return }
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
                    if (activeResultIndex >= 0 && results[activeResultIndex]) { addToCart(results[activeResultIndex], pendingQtyRef.current); setActiveResultIndex(-1); return }
                    if (results.length === 1) { addToCart(results[0], pendingQtyRef.current); setActiveResultIndex(-1); return }
                    if (query.trim()) {
                      const trimmedQ = query.trim()
                      if (/^\d{8,14}$/.test(trimmedQ)) {
                        const knownId = barcodeMapRef.current.get(trimmedQ)
                        if (knownId) {
                          const existing = cartRef.current.find(i => i.product.id === knownId)
                          if (existing) {
                            const newQty = existing.quantity + pendingQtyRef.current
                            setCart(prev => prev.map(i => i.product.id === knownId ? { ...i, quantity: newQty } : i))
                            setPendingQty(1); pendingQtyRef.current = 1; setQuery('')
                            return
                          }
                        }
                        const existingPendingIdEnter = pendingBarcodesRef.current.get(trimmedQ)
                        if (existingPendingIdEnter) {
                          setCart(prev => prev.map(i => i.product.id === existingPendingIdEnter ? { ...i, quantity: i.quantity + pendingQtyRef.current } : i))
                          setPendingQty(1); pendingQtyRef.current = 1; setQuery('')
                          return
                        }
                        // Buscar en cache local antes de crear temp item
                        const localResultEnter = await resolveBarcode(trimmedQ, pendingQtyRef.current)
                        if (localResultEnter) {
                          const isCustomLocalEnter = localResultEnter.product.price_mode === 'custom'
                          const stockLocalEnter = localResultEnter.product.stock_current ?? 0
                          if (stockEnabledRef.current && !isCustomLocalEnter && stockLocalEnter <= 0) {
                            toast.error(`${localResultEnter.product.name} sin stock`)
                            setPendingQty(1); pendingQtyRef.current = 1; setQuery('')
                            return
                          }
                          barcodeMapRef.current.set(trimmedQ, localResultEnter.product.id)
                          const existingLocalEnter = cartRef.current.find(i => i.product.id === localResultEnter.product.id)
                          const qtyLocal = pendingQtyRef.current
                          if (existingLocalEnter) {
                            const newQtyLocal = existingLocalEnter.quantity + qtyLocal
                            if (stockEnabledRef.current && !isCustomLocalEnter && newQtyLocal > stockLocalEnter) {
                              toast.error(`Stock máximo: ${stockLocalEnter}`)
                              setPendingQty(1); pendingQtyRef.current = 1; setQuery('')
                              return
                            }
                            const promoLocal = evaluatePromo(localResultEnter.product as Parameters<typeof evaluatePromo>[0], newQtyLocal, localResultEnter.pricing.price, promotionsRef.current)
                            setCart(prev => prev.map(i =>
                              i.product.id === localResultEnter.product.id
                                ? { ...i, quantity: newQtyLocal, ...(i.price_overridden ? {} : { unit_price: localResultEnter.pricing.price, applied_list: localResultEnter.pricing.list_name, applied_margin: localResultEnter.pricing.margin_pct }), discount: promoLocal.discount, promo_label: promoLocal.promo_label, promotion_id: promoLocal.promotion_id }
                                : i,
                            ))
                          } else {
                            const promoLocal = evaluatePromo(localResultEnter.product as Parameters<typeof evaluatePromo>[0], qtyLocal, localResultEnter.pricing.price, promotionsRef.current)
                            setCart(prev => [{
                              product: localResultEnter.product,
                              quantity: qtyLocal,
                              unit_price: localResultEnter.pricing.price,
                              applied_list: localResultEnter.pricing.list_name,
                              applied_margin: localResultEnter.pricing.margin_pct,
                              discount: promoLocal.discount,
                              promo_label: promoLocal.promo_label,
                              promotion_id: promoLocal.promotion_id,
                              status: 'resolved' as const,
                            }, ...prev])
                          }
                          setPendingQty(1); pendingQtyRef.current = 1; setQuery('')
                          setTimeout(() => searchRef.current?.focus(), 50)
                          return
                        }

                        const tempIdEnter = `pending_${trimmedQ}_${Date.now()}`
                        const qtyEnter = pendingQtyRef.current
                        pendingBarcodesRef.current.set(trimmedQ, tempIdEnter)
                        setCart(prev => [{
                          product: { id: tempIdEnter, name: trimmedQ, barcode: trimmedQ, sell_price: 0, cost_price: 0, stock_current: 999, price_mode: 'fixed', unit: 'un', is_active: true } as Product,
                          quantity: qtyEnter, unit_price: 0, discount: 0, status: 'pending',
                        }, ...prev])
                        setPendingQty(1); pendingQtyRef.current = 1; setQuery('')
                        api.post<ScanResult>('/api/pos/scan', { barcode: trimmedQ, warehouse_id: selectedWarehouse?.id ?? null, quantity: qtyEnter })
                          .then(result => {
                            barcodeMapRef.current.set(trimmedQ, result.product.id)
                            pendingBarcodesRef.current.delete(trimmedQ)
                            cacheProductFromScan(result.product)
                            if (stockEnabledRef.current && result.product.price_mode !== 'custom' && (result.product.stock_current ?? 0) <= 0) {
                              toast.error(`${result.product.name} sin stock`)
                              setCart(prev => prev.filter(i => i.product.id !== tempIdEnter))
                              return
                            }
                            setCart(prev => {
                              const alreadyExists = prev.find(i => i.product.id === result.product.id)
                              if (alreadyExists) return prev.filter(i => i.product.id !== tempIdEnter).map(i => i.product.id === result.product.id ? { ...i, quantity: i.quantity + qtyEnter } : i)
                              const pendingItemEnter = prev.find(i => i.product.id === tempIdEnter)
                              const priceOverriddenEnter = pendingItemEnter?.price_overridden ?? false
                              const promo = evaluatePromo(result.product as Parameters<typeof evaluatePromo>[0], qtyEnter, result.pricing.price, promotionsRef.current)
                              return prev.map(i => i.product.id === tempIdEnter ? { ...i, product: result.product, ...(priceOverriddenEnter ? {} : { unit_price: result.pricing.price, applied_list: result.pricing.list_name, applied_margin: result.pricing.margin_pct }), discount: promo.discount, promo_label: promo.promo_label, promotion_id: promo.promotion_id, status: 'resolved' } : i)
                            })
                          })
                          .catch(() => { pendingBarcodesRef.current.delete(trimmedQ); setCart(prev => prev.map(i => i.product.id === tempIdEnter ? { ...i, status: 'error' } : i)) })
                        return
                      }
                      // Texto: exigir mínimo de caracteres también al presionar Enter
                      if (trimmedQ.length < MIN_SEARCH_LEN) {
                        toast.error(`Escribí al menos ${MIN_SEARCH_LEN} caracteres para buscar`)
                        return
                      }
                      const currentWarehouseEnter = selectedWarehouseRef.current
                      if (!currentWarehouseEnter || !stockEnabledRef.current) {
                        const localSearchResults = await searchProductsLocal(trimmedQ, SEARCH_RESULT_LIMIT)
                        if (localSearchResults.length > 0) {
                          setResults(localSearchResults)
                          if (localSearchResults.length === 1) addToCart(localSearchResults[0], pendingQtyRef.current)
                          return
                        }
                      }
                      setSearching(true)
                      try {
                        const res = await api.get<{ data: Product[] }>('/api/products', { search: trimmedQ, limit: SEARCH_RESULT_LIMIT, ...(currentWarehouseEnter?.id && stockEnabledRef.current ? { warehouse_id: currentWarehouseEnter.id } : {}) })
                        setResults(res.data)
                        if (res.data.length === 1) addToCart(res.data[0], pendingQtyRef.current)
                      } catch { setResults([]) } finally { setSearching(false) }
                    }
                  }
                }}
                placeholder="Buscar o escanear código de barras..."
                className="w-full pl-10 pr-4 py-3 text-sm rounded-[var(--radius-lg)] bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)] focus:bg-[var(--surface)] transition-all"
              />
            </div>
          </div>
          {pendingQty > 1 && (
            <p className="mt-1.5 text-xs text-[var(--accent)] font-medium pl-1">Próximo escaneo: ×{pendingQty} unidades</p>
          )}
          {pendingQty === 1 && (
            <p className="mt-1 text-[10px] text-[var(--text3)] pl-1">
              <kbd className="px-1 py-0.5 bg-[var(--surface2)] border border-[var(--border)] rounded text-[10px] font-mono">Espacio</kbd> cantidad ·{' '}
              <kbd className="px-1 py-0.5 bg-[var(--surface2)] border border-[var(--border)] rounded text-[10px] font-mono">↓</kbd> ir al carrito ·{' '}
              <kbd className="px-1 py-0.5 bg-[var(--surface2)] border border-[var(--border)] rounded text-[10px] font-mono">F2</kbd> carrito ·{' '}
              <kbd className="px-1 py-0.5 bg-[var(--surface2)] border border-[var(--border)] rounded text-[10px] font-mono">F3</kbd> precio libre
            </p>
          )}
        </div>

        {/* Resultados */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-3">
            <HelpBanner id="pos" title="¿Cómo cobrar en el POS?">
              <p>Escaneá el código de barras o buscá el producto para sumarlo al ticket. Aplicá descuentos y promociones, elegí la forma de pago (efectivo, tarjeta o cuenta corriente) y cobrá. Necesitás una caja abierta para registrar la venta.</p>
            </HelpBanner>
          </div>
          {results.length > 0 ? (
            <div className="space-y-1">
              {results.map((product, index) => (
                <button key={product.id}
                  ref={el => { resultItemRefs.current[index] = el }}
                  onClick={() => { addToCart(product, pendingQtyRef.current); setActiveResultIndex(-1) }}
                  disabled={stockEnabled && product.price_mode !== 'custom' && product.stock_current <= 0}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-[var(--radius-md)] bg-[var(--surface)] border transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed group ${index === activeResultIndex ? 'ring-2 ring-[var(--accent)] border-[var(--accent)]' : 'border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--accent-subtle)]'}`}>
                  <div>
                    <p className="text-sm font-medium text-[var(--text)] group-hover:text-[var(--accent)]">{product.name}</p>
                    <p className="text-xs text-[var(--text3)]">
                      {product.barcode && <span className="mono mr-2">{product.barcode}</span>}
                      Stock: <span className={product.stock_current <= 0 ? 'text-[var(--danger)]' : 'text-[var(--accent)]'}>{product.stock_current}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold mono text-[var(--text)]">{formatCurrency(product.price_mode === 'custom' ? product.sell_price : computeLocalPrice(product, 1).price)}</p>
                    <p className="text-xs text-[var(--text3)]">{product.unit}</p>
                  </div>
                </button>
              ))}
              {results.length >= SEARCH_RESULT_LIMIT && (
                <p className="pt-2 pb-1 text-center text-xs text-[var(--text3)]">
                  Mostrando los primeros {SEARCH_RESULT_LIMIT} — escribí más para afinar la búsqueda
                </p>
              )}
            </div>
          ) : query.trim() && query.trim().length < MIN_SEARCH_LEN && !/^\d{8,14}$/.test(query.trim()) ? (
            <div className="flex flex-col items-center justify-center h-40 text-[var(--text3)]">
              <Search size={28} className="mb-2 opacity-40" />
              <p className="text-sm">Seguí escribiendo… (mín. {MIN_SEARCH_LEN} letras)</p>
            </div>
          ) : query && !searching ? (
            <div className="flex flex-col items-center justify-center h-40 text-[var(--text3)]">
              <Search size={28} className="mb-2 opacity-40" />
              <p className="text-sm">Sin resultados para "{query}"</p>
            </div>
          ) : !query ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text3)] pb-10">
              <ShoppingCart size={40} className="mb-3 opacity-20" />
              <p className="text-sm">Buscá un producto o escaneá el código</p>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Panel derecho — carrito ── */}
      <div className={`flex-1 flex flex-col min-h-0 bg-[var(--surface)] pb-14 sm:pb-0 ${mobileView === 'search' ? 'hidden sm:flex' : 'flex'}`}>

        {/* Listas de precio + botón sync */}
        <div className="px-3 py-3 border-b border-[var(--border)] flex-shrink-0 bg-[var(--surface)]">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 flex items-center gap-2 overflow-x-auto">
              {priceLists.length > 1 ? (
                <>
                  <span className="text-xs text-[var(--text3)] flex-shrink-0">Lista:</span>
                  {priceLists.map(list => (
                    <button key={list.id}
                      onClick={() => {
                        // Fijar la lista: pisa las reglas de cantidad para todos los ítems
                        // (y para los que se agreguen después), hasta que se limpie el carrito.
                        setForcedPriceList(list.id)
                        setSelectedList(list)
                        setCart(prev => prev.map(item =>
                          (item.price_overridden || item.product.price_mode === 'custom')
                            ? item
                            : { ...item, unit_price: priceForProductList(item.product, list), applied_list: list.name, applied_margin: list.margin_pct }
                        ))
                      }}
                      className={`px-3 py-1 text-xs rounded-full font-medium flex-shrink-0 transition-colors ${selectedList?.id === list.id ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface2)] border border-[var(--border)] text-[var(--text2)]'}`}>
                      {list.name} (+{list.margin_pct}%)
                    </button>
                  ))}
                </>
              ) : priceLists.length === 1 ? (
                <span className="text-xs text-[var(--text3)]">{selectedList?.name ?? priceLists[0].name}</span>
              ) : null}
            </div>
            <button
              onClick={handleSync}
              disabled={cacheSyncing}
              title="Actualizar catálogo, precios y promociones"
              className="flex-shrink-0 flex flex-col items-center gap-0.5 px-2 py-1 rounded-[var(--radius-md)] text-[var(--text3)] hover:text-[var(--accent)] hover:bg-[var(--surface2)] transition-colors disabled:opacity-50"
            >
              <RefreshCw size={13} className={cacheSyncing ? 'animate-spin text-[var(--accent)]' : ''} />
              <span className="text-[9px] leading-none whitespace-nowrap">
                {cacheSyncing ? 'Sync...' : lastSyncedAt ? relativeTime(lastSyncedAt) : '—'}
              </span>
            </button>
          </div>
        </div>

        <QuickCustomerModal open={quickCustomerModal} onClose={() => setQuickCustomerModal(false)}
          onCreated={(customer) => { setSelectedCustomer(customer); setCustomerQuery(''); setCustomerResults([]) }}
          initialName={customerQuery}
        />

        {/* Header carrito */}
        <div className="px-4 py-2 border-b border-[var(--border)] flex items-center justify-between flex-shrink-0">
          <h2 className="text-sm font-semibold text-[var(--text)]">
            Carrito
            {cart.length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 text-xs bg-[var(--accent)] text-white rounded-full">
                {cartItemCount} uds · {cart.length} items
              </span>
            )}
          </h2>
          {cart.length > 0 && (
            <button onClick={() => { setCart([]); setFocusedCartIndex(-1); resetToAutoList() }}
              className="text-xs text-[var(--text3)] hover:text-[var(--danger)] transition-colors">
              Limpiar
            </button>
          )}
        </div>

        {/* Keyboard hint bar */}
        {focusedCartIndex >= 0 ? (
          <div className="px-3 py-1.5 bg-[var(--accent-subtle)] border-b border-[var(--accent)] text-[10px] text-[var(--accent)] font-medium flex items-center gap-3 flex-shrink-0 flex-wrap">
            <span className="font-semibold">Modo carrito</span>
            <span>↑↓ navegar</span>
            <span>+ / − cantidad</span>
            <span>Del eliminar</span>
            <span>P editar precio</span>
            <span>Esc → buscador</span>
          </div>
        ) : cart.length > 0 ? (
          <div className="px-3 py-1 border-b border-[var(--border)] text-[10px] text-[var(--text3)] flex-shrink-0">
            <kbd className="px-1 py-0.5 bg-[var(--surface2)] border border-[var(--border)] rounded font-mono">F2</kbd>
            {' '}o{' '}
            <kbd className="px-1 py-0.5 bg-[var(--surface2)] border border-[var(--border)] rounded font-mono">↓</kbd>
            {' '}desde el buscador para navegar con teclado
          </div>
        ) : null}

        {/* Columnas de tabla */}
        {cart.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--border)] bg-[var(--surface2)] flex-shrink-0">
            <div className="w-[88px] text-[10px] font-semibold text-[var(--text3)] uppercase tracking-wide text-center">Cant.</div>
            <div className="flex-1 text-[10px] font-semibold text-[var(--text3)] uppercase tracking-wide">Producto</div>
            <div className="w-[84px] text-[10px] font-semibold text-[var(--text3)] uppercase tracking-wide text-right">Precio unit.</div>
            <div className="w-[88px] text-[10px] font-semibold text-[var(--text3)] uppercase tracking-wide text-right">Subtotal</div>
            <div className="w-7" />
          </div>
        )}

        {/* Items */}
        <div className="flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text3)] pb-10">
              <ShoppingCart size={32} className="mb-2 opacity-20" />
              <p className="text-xs">El carrito está vacío</p>
            </div>
          ) : (
            cart.map((item, index) => {
              const isFocused = focusedCartIndex === index
              return (
                <div
                  key={item.product.id}
                  ref={el => { cartItemRefs.current[index] = el }}
                  onClick={() => setFocusedCartIndex(index)}
                  className={`group flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] cursor-default select-none transition-colors ${
                    item.status === 'error'
                      ? 'bg-[var(--danger-subtle,#fee2e2)]'
                      : isFocused
                        ? 'bg-[var(--accent-subtle)] outline outline-1 outline-inset outline-[var(--accent)]'
                        : 'hover:bg-[var(--surface2)]'
                  }`}
                >
                  {/* Qty controls */}
                  <div className="flex items-center flex-shrink-0 rounded border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                    <button
                      onClick={e => { e.stopPropagation(); updateQty(item.product.id, -1) }}
                      className="w-7 h-8 flex items-center justify-center hover:bg-[var(--surface2)] hover:text-[var(--accent)] transition-colors"
                    >
                      <Minus size={11} />
                    </button>
                    <span className="w-8 text-center text-sm font-bold mono">{item.quantity}</span>
                    <button
                      onClick={e => { e.stopPropagation(); updateQty(item.product.id, 1) }}
                      className="w-7 h-8 flex items-center justify-center hover:bg-[var(--surface2)] hover:text-[var(--accent)] transition-colors"
                    >
                      <Plus size={11} />
                    </button>
                  </div>

                  {/* Name + badges */}
                  <div className="flex-1 min-w-0 flex items-center gap-1.5">
                    {item.status === 'pending' && (
                      <span className="w-3 h-3 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin flex-shrink-0" />
                    )}
                    <span className={`text-sm font-medium truncate ${item.status === 'error' ? 'text-[var(--danger)]' : 'text-[var(--text)]'}`}>
                      {item.status === 'error' ? `¿? ${item.product.name}` : item.product.name}
                    </span>
                    {item.promo_label && (
                      <span className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-[var(--warning-subtle,#fef3c7)] text-[var(--warning)] font-medium whitespace-nowrap">
                        🎉 {item.promo_label}
                      </span>
                    )}
                    {item.product.price_mode === 'custom' && item.unit_price === 0 && (
                      <span className="flex-shrink-0 text-[10px] text-[var(--warning)] font-medium whitespace-nowrap">← precio</span>
                    )}
                  </div>

                  {/* Unit price — editable inline */}
                  <div className="w-[84px] flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <MoneyInput
                      unstyled
                      ref={el => { priceInputRefs.current[item.product.id] = el }}
                      value={item.unit_price}
                      onChange={v => updateItemPrice(item.product.id, v)}
                      onFocus={e => { e.target.select(); setFocusedCartIndex(index) }}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); searchRef.current?.focus() } }}
                      className={`w-full text-sm mono text-right bg-transparent border-b-2 px-1 py-0.5 focus:outline-none transition-colors rounded-t ${
                        item.product.price_mode === 'custom' && item.unit_price === 0
                          ? 'border-[var(--warning)] text-[var(--warning)]'
                          : 'border-transparent focus:border-[var(--accent)] focus:bg-[var(--surface)]'
                      }`}
                    />
                  </div>

                  {/* Subtotal */}
                  <div className="w-[88px] flex-shrink-0 text-right">
                    <span className="text-sm font-bold mono text-[var(--text)]">
                      {formatCurrency(item.unit_price * item.quantity - item.discount)}
                    </span>
                  </div>

                  {/* Remove */}
                  <button
                    onClick={e => { e.stopPropagation(); removeItem(item.product.id); setFocusedCartIndex(-1); setTimeout(() => searchRef.current?.focus(), 50) }}
                    className="w-7 h-7 flex items-center justify-center flex-shrink-0 text-[var(--text3)] hover:text-[var(--danger)] transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <X size={13} />
                  </button>
                </div>
              )
            })
          )}
        </div>

        {/* Footer carrito */}
        {step === 'cart' && (
          <div className="border-t border-[var(--border)] p-4 space-y-3 flex-shrink-0">
            {/* Cliente */}
            <div className="relative">
              {selectedCustomer ? (
                <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--accent-subtle)] border border-[var(--accent)] rounded-[var(--radius-md)]">
                  <div>
                    <p className="text-xs font-semibold text-[var(--accent)]">{selectedCustomer.full_name}</p>
                    <p className="text-xs text-[var(--text3)]">
                      Saldo: {formatCurrency(selectedCustomer.current_balance)}
                      {selectedCustomer.credit_limit > 0 && ` · Límite: ${formatCurrency(selectedCustomer.credit_limit)}`}
                    </p>
                  </div>
                  <button onClick={() => { setSelectedCustomer(null); setCustomerQuery('') }}
                    className="text-xs text-[var(--text3)] hover:text-[var(--danger)] transition-colors">✕</button>
                </div>
              ) : (
                <div className="relative">
                  <Users size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                  {searchingCustomer && <div className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />}
                  <input value={customerQuery} onChange={e => setCustomerQuery(e.target.value)}
                    placeholder="Cliente (opcional)..."
                    className="w-full pl-7 pr-3 py-1.5 text-xs rounded-[var(--radius-md)] bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)]"
                  />
                  {customerQuery.length >= 2 && (
                    <div className="absolute bottom-full left-0 right-0 mb-1 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-lg z-10 overflow-hidden">
                      {customerResults.length > 0 ? (
                        <>
                          {customerResults.map(c => (
                            <button key={c.id}
                              onClick={() => { setSelectedCustomer(c); setCustomerQuery(''); setCustomerResults([]) }}
                              className="w-full flex items-center justify-between px-3 py-2 hover:bg-[var(--surface2)] transition-colors text-left border-b border-[var(--border)] last:border-0">
                              <div>
                                <p className="text-xs font-medium text-[var(--text)]">{c.full_name}</p>
                                {c.document && <p className="text-xs text-[var(--text3)]">{c.document}</p>}
                              </div>
                              {Number(c.current_balance) > 0 && <span className="text-xs mono text-[var(--danger)]">{formatCurrency(c.current_balance)}</span>}
                            </button>
                          ))}
                          <button onClick={() => setQuickCustomerModal(true)}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--accent-subtle)] transition-colors text-left border-t border-[var(--border)]">
                            <Plus size={12} className="text-[var(--accent)]" />
                            <span className="text-xs text-[var(--accent)] font-medium">Crear "{customerQuery}"</span>
                          </button>
                        </>
                      ) : (
                        <button onClick={() => setQuickCustomerModal(true)}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--accent-subtle)] transition-colors text-left">
                          <Plus size={12} className="text-[var(--accent)]" />
                          <span className="text-xs text-[var(--accent)] font-medium">Crear cliente "{customerQuery}"</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Descuento % */}
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-[var(--text3)]">Descuento venta</span>
              <div className="flex items-center gap-2">
                {saleDiscountPct > 0 && (
                  <span className="text-xs mono text-[var(--text3)]">= {formatCurrency(saleDiscountAmount)}</span>
                )}
                <div className="flex items-center gap-1">
                  <input
                    type="number" min="0" max="100" step="0.5"
                    value={saleDiscountPct || ''}
                    placeholder="0"
                    onChange={e => setSaleDiscountPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                    className="w-16 text-sm mono text-right bg-[var(--surface2)] border border-[var(--border)] rounded px-2 py-1.5 focus:outline-none focus:border-[var(--accent)]"
                  />
                  <span className="text-sm text-[var(--text3)]">%</span>
                </div>
              </div>
            </div>

            {/* Envío */}
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => setShippingEnabled(v => !v)}
                className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${shippingEnabled ? 'text-[var(--accent)]' : 'text-[var(--text3)]'}`}
              >
                <Truck size={14} />
                Envío
              </button>
              {shippingEnabled && (
                <div className="flex items-center gap-1">
                  <span className="text-sm text-[var(--text3)]">$</span>
                  <MoneyInput unstyled value={shippingAmount || ''} placeholder="0"
                    onChange={v => setShippingAmount(Math.max(0, Number(v) || 0))}
                    onFocus={e => e.target.select()}
                    className="w-24 text-sm mono text-right bg-[var(--surface2)] border border-[var(--accent)] rounded px-2 py-1.5 focus:outline-none focus:border-[var(--accent)]" />
                </div>
              )}
            </div>

            {/* Desglose */}
            {(saleDiscountPct > 0 || shippingEnabled) && (
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--text3)]">Subtotal</span>
                  <span className="mono text-[var(--text2)]">{formatCurrency(subtotal)}</span>
                </div>
                {saleDiscountPct > 0 && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text3)]">Descuento ({saleDiscountPct}%)</span>
                    <span className="mono text-[var(--text2)]">-{formatCurrency(saleDiscountAmount)}</span>
                  </div>
                )}
                {shippingEnabled && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text3)]">Envío</span>
                    <span className="mono text-[var(--text2)]">+{formatCurrency(shippingAmount)}</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-between items-center py-2 border-t border-[var(--border)]">
              <span className="text-base font-semibold text-[var(--text)]">Total</span>
              <span className="text-2xl font-bold mono text-[var(--accent)]">{formatCurrency(total)}</span>
            </div>
            {hasMissingCustomPrice && (
              <p className="text-xs text-[var(--warning)] text-center">
                Ingresá el precio de los productos marcados como "precio libre"
              </p>
            )}
            {hasPendingItems && (
              <p className="text-xs text-[var(--text3)] text-center">Resolviendo productos...</p>
            )}
            {hasErrorItems && (
              <p className="text-xs text-[var(--danger)] text-center">Quitá los productos sin identificar (¿?) para poder cobrar</p>
            )}
            <button
              onClick={() => { setApplied([]); setDraft({ method: 'efectivo', amount: total, installments: 1 }); setSelectedApplied(null); setPaymentModalOpen(true) }}
              disabled={cart.length === 0 || hasMissingCustomPrice || hasUnresolvedItems}
              className="w-full py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold rounded-[var(--radius-md)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
            >
              Cobrar {cart.length > 0 ? formatCurrency(total) : ''}
              <kbd className="ml-2 text-[10px] bg-white/20 border border-white/20 px-1.5 py-0.5 rounded font-sans">F5</kbd>
            </button>
          </div>
        )}

      </div>

      {/* ── Drawer de cobro (panel lateral derecho) ──
          En modo simple es angosto; al dividir el pago se ensancha para mostrar
          una columna por medio sin necesidad de scrollear. */}
      <Drawer open={paymentModalOpen} onClose={() => setPaymentModalOpen(false)} title="Cobrar"
        width={
          !splitActive            ? 'sm:max-w-[520px]'
          : applied.length <= 2   ? 'sm:max-w-[820px]'
          : applied.length === 3  ? 'sm:max-w-[1080px]'
          :                         'sm:max-w-[94vw]'
        }
        footer={
          <div className="space-y-2">
            <p className="text-[11px] text-center text-[var(--text3)] leading-snug">
              {canMainAction
                ? 'Ya está todo cubierto. Tocá para terminar la venta.'
                : splitActive
                  ? (totalApplied > total + 0.01
                      ? 'Te pasaste del total. Ajustá algún monto.'
                      : applied.some(s => (s.amount || 0) <= 0)
                        ? 'Cada medio tiene que tener un monto mayor a 0.'
                        : `Repartí todo el total entre los medios. Faltan ${formatCurrency(remaining)}.`)
                  : 'Elegí cómo paga el cliente para confirmar la venta.'}
            </p>
            <button onClick={handleMainAction}
              disabled={processing || !canMainAction}
              className="w-full py-3.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold text-base rounded-[var(--radius-md)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99] flex items-center justify-center gap-3">
              {processing
                ? <><span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Procesando...</>
                : <>Confirmar venta <kbd className="text-xs font-mono bg-white/20 border border-white/30 px-2 py-0.5 rounded">↵ Enter</kbd></>
              }
            </button>
          </div>
        }
      >
        <div className="space-y-3">

          {/* Ayuda introductoria */}
          <p className="flex items-start gap-1.5 text-[11px] text-[var(--text3)] leading-snug bg-[var(--surface2)] rounded-[var(--radius-md)] px-3 py-2">
            <Info size={14} className="flex-shrink-0 mt-px text-[var(--accent)]" />
            <span>Elegí el <strong className="text-[var(--text2)]">medio de pago</strong> y <strong className="text-[var(--text2)]">confirmá</strong>. ¿El cliente paga con dos medios (una parte en efectivo y otra con tarjeta)? Tocá <strong className="text-[var(--text2)]">«¿Paga con varios medios?»</strong> y dividís el cobro.</span>
          </p>

          {/* ── PaymentSummary ── */}
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface2)] px-4 py-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text3)]">Total a cobrar</p>
                <p className="text-2xl sm:text-3xl font-bold mono text-[var(--text)] leading-tight">{formatCurrency(total)}</p>
                <p className="text-[10px] text-[var(--text3)] leading-snug">Lo que tiene que pagar el cliente</p>
              </div>
              <div className="text-right">
                {draftChange > 0 ? (
                  <>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--accent)]">Vuelto</p>
                    <p className="text-2xl sm:text-3xl font-bold mono text-[var(--accent)] leading-tight">{formatCurrency(draftChange)}</p>
                    <p className="text-[10px] text-[var(--text3)] leading-snug">Lo que tenés que devolver</p>
                  </>
                ) : applied.length > 0 && remaining > 0.01 ? (
                  <>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--warning)]">Falta cobrar</p>
                    <p className="text-2xl sm:text-3xl font-bold mono text-[var(--warning)] leading-tight">{formatCurrency(remaining)}</p>
                    <p className="text-[10px] text-[var(--text3)] leading-snug">Todavía sin pagar</p>
                  </>
                ) : fullyApplied ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent)]">
                    <Check size={16} /> Pago completo
                  </span>
                ) : null}
              </div>
            </div>
            {applied.length > 0 && (
              <div className="mt-2 pt-2 border-t border-[var(--border)] flex justify-between text-xs text-[var(--text3)]">
                <span>Recibido</span>
                <span className="mono font-medium text-[var(--text2)]">{formatCurrency(totalApplied)} de {formatCurrency(total)}</span>
              </div>
            )}
          </div>

          {/* ── Editor de columnas (modo "varios medios") ── */}
          {splitActive && (
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-[var(--text)]">¿Cómo se reparte el pago?</p>
                  <p className="text-[11px] text-[var(--text3)] leading-snug mt-0.5">Una columna por medio. Poné cuánto entra en cada uno hasta cubrir el total.</p>
                </div>
                <button onClick={() => { setSplitMode(false); setApplied([]) }}
                  className="flex-shrink-0 text-[11px] font-medium text-[var(--text3)] hover:text-[var(--accent)] hover:underline">
                  Un solo medio
                </button>
              </div>

              <div className="flex gap-3 overflow-x-auto pb-1">
                {applied.map((col, i) => {
                  const restForCol = Math.round((total - (totalApplied - (col.amount || 0))) * 100) / 100
                  const colChange  = col.method === 'efectivo' && (col.received ?? 0) > col.amount ? Math.ceil((col.received ?? 0) - col.amount) : 0
                  const colRecvBad = col.method === 'efectivo' && (col.received ?? 0) > 0 && (col.received ?? 0) < col.amount
                  return (
                    <div key={i} className="flex-shrink-0 w-[244px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface2)] p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text3)]">Medio {i + 1}</span>
                        <button onClick={() => removeSplitColumn(i)} title="Quitar este medio"
                          className="p-1 rounded text-[var(--text3)] hover:text-[var(--danger)] hover:bg-[var(--surface3)] transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>

                      <select value={col.method}
                        onChange={e => setSplitColumn(i, { method: e.target.value, received: undefined })}
                        className="w-full px-2.5 py-2 text-sm font-medium rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] cursor-pointer">
                        {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>

                      <MoneyInput unstyled value={col.amount || ''}
                        onFocus={e => e.target.select()}
                        onChange={v => setSplitColumn(i, { amount: Math.max(0, Number(v) || 0) })}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (!processing && canMainAction) handleMainAction() } }}
                        placeholder="0"
                        className="w-full px-2.5 py-2 text-xl mono font-bold rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />

                      {restForCol > 0.01 && Math.abs(restForCol - (col.amount || 0)) > 0.01 && (
                        <button onClick={() => setSplitColumn(i, { amount: restForCol })}
                          className="w-full px-2 py-1 text-[11px] mono font-medium rounded border border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)] hover:opacity-80 transition-all active:scale-95">
                          Completar resto · {formatCurrency(restForCol)}
                        </button>
                      )}

                      {/* Efectivo: recibido + vuelto */}
                      {col.method === 'efectivo' && (col.amount || 0) > 0 && (
                        <div className="space-y-1.5 pt-1.5 border-t border-[var(--border)]">
                          <label className="text-[10px] font-medium text-[var(--text3)]">Paga con (para el vuelto)</label>
                          <MoneyInput unstyled value={col.received || ''}
                            onChange={v => setSplitColumn(i, { received: Number(v) || 0 })}
                            placeholder={String(Math.ceil(col.amount))}
                            className={`w-full px-2.5 py-1.5 text-sm mono rounded-[var(--radius-md)] bg-[var(--surface)] border text-[var(--text)] focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${colRecvBad ? 'border-[var(--danger)]' : 'border-[var(--border)] focus:border-[var(--accent)]'}`} />
                          {colChange > 0 && <p className="text-[11px] font-medium text-[var(--accent)]">Vuelto {formatCurrency(colChange)}</p>}
                          {colRecvBad && <p className="text-[10px] text-[var(--danger)] leading-snug">Es menos que el monto de este medio.</p>}
                        </div>
                      )}

                      {/* Crédito: cuotas */}
                      {col.method === 'credito' && (
                        <div className="pt-1.5 border-t border-[var(--border)] space-y-1">
                          <label className="text-[10px] font-medium text-[var(--text3)]">Cuotas</label>
                          <div className="flex flex-wrap gap-1">
                            {[1, 3, 6, 12, 18, 24].map(n => (
                              <button key={n} onClick={() => setSplitColumn(i, { installments: n })}
                                className={`px-2 py-0.5 text-[11px] rounded font-medium transition-colors ${(col.installments ?? 1) === n ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface)] text-[var(--text2)] hover:bg-[var(--surface3)]'}`}>
                                {n}x
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Cuenta corriente */}
                      {col.method === 'cuenta_corriente' && (
                        <p className="flex items-start gap-1 text-[10px] text-[var(--text2)] leading-snug pt-1">
                          <BookOpen size={12} className="flex-shrink-0 mt-px text-[var(--accent)]" />
                          Queda fiado en la cuenta del cliente.
                        </p>
                      )}
                    </div>
                  )
                })}

                {/* Agregar otra columna */}
                {applied.length < PAYMENT_METHODS.length && (
                  <button onClick={addSplitColumn}
                    className="flex-shrink-0 w-[120px] rounded-[var(--radius-md)] border border-dashed border-[var(--border)] text-xs font-medium text-[var(--text3)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors flex flex-col items-center justify-center gap-1.5 py-6">
                    <Plus size={18} />
                    Agregar medio
                  </button>
                )}
              </div>

              {totalApplied > total + 0.01 && (
                <p className="text-[11px] text-[var(--danger)] leading-snug">Te pasaste: la suma de los medios ({formatCurrency(totalApplied)}) supera el total ({formatCurrency(total)}). Ajustá algún monto.</p>
              )}
            </div>
          )}

          {/* ── Formulario de un solo medio (modo simple) ── */}
          {!splitActive && (() => {
            const KEY_HINT: Record<string, string> = {
              efectivo: 'E', debito: 'D', credito: 'C',
              transferencia: 'T', qr: 'Q', cuenta_corriente: 'A',
            }
            const pendingAfterDraft = Math.round((remaining - draftAmount) * 100) / 100
            const exceedsRemaining  = draftAmount > remaining + 0.01
            return (
              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--text)]">
                    {applied.length > 0 ? 'Agregar otro pago' : '¿Cómo paga el cliente?'}
                  </p>
                  <p className="text-[11px] text-[var(--text3)] leading-snug mt-0.5">
                    {applied.length > 0
                      ? 'Elegí el medio para cubrir lo que falta. Se suma a la lista de arriba.'
                      : 'Elegí cómo paga. Si abona todo con un solo medio, ya podés confirmar la venta.'}
                  </p>
                </div>

                {/* Selector de método — ancho completo */}
                <div className="space-y-1.5">
                  {splitActive && <label className="text-xs font-semibold text-[var(--text2)]">1 · Medio de pago</label>}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {PAYMENT_METHODS.map(m => {
                      const sel = draft.method === m.value
                      return (
                        <button key={m.value}
                          onClick={() => { setDraftMethod(m.value); if (splitActive) setTimeout(() => draftAmountRef.current?.focus(), 30) }}
                          className={`relative flex items-center gap-1.5 px-2 py-2.5 rounded-[var(--radius-md)] border text-xs font-medium transition-all active:scale-95
                            ${sel
                              ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]'
                              : 'border-[var(--border)] bg-[var(--surface2)] text-[var(--text2)] hover:border-[var(--text3)]'}`}>
                          <kbd className={`absolute top-1 right-1 text-[8px] font-mono leading-none ${sel ? 'text-[var(--accent)]' : 'text-[var(--text3)]'}`}>{KEY_HINT[m.value]}</kbd>
                          <m.Icon size={15} className="flex-shrink-0" />
                          <span className="truncate">{m.label}</span>
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-[10px] text-[var(--text3)] leading-snug">
                    Tip: podés apretar la letra que aparece en cada botón (E = efectivo, D = débito…) en vez de tocarlo.
                  </p>
                </div>

                {/* Monto: solo en modo "varios medios". En modo simple paga el total con este medio. */}
                {splitActive ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-[var(--text2)]">2 · ¿Cuánto paga con este medio?</label>
                      {applied.length === 0 && (
                        <button onClick={() => setSplitMode(false)}
                          className="text-[11px] font-medium text-[var(--text3)] hover:text-[var(--accent)] hover:underline">
                          Paga con un solo medio
                        </button>
                      )}
                    </div>
                    <MoneyInput
                      unstyled
                      ref={draftAmountRef}
                      value={draft.amount || ''}
                      onFocus={() => setSelectedApplied(null)}
                      onChange={v => setDraftAmount(v)}
                      onKeyDown={handleDraftAmountKeyDown}
                      className={`w-full px-3 py-2.5 text-2xl mono font-bold rounded-[var(--radius-md)] bg-[var(--surface2)] border text-[var(--text)] focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
                        ${exceedsRemaining ? 'border-[var(--danger)] focus:border-[var(--danger)]' : 'border-[var(--border)] focus:border-[var(--accent)]'}`}
                    />
                    {/* Montos parciales sugeridos + atajo para usar el saldo completo */}
                    <div className="flex gap-1.5 flex-wrap">
                      {suggestPartialAmounts(remaining).map(v => (
                        <button key={v} onClick={() => setDraft(d => ({ ...d, amount: v }))}
                          className="px-2 py-1 text-xs mono font-medium rounded border border-[var(--border)] bg-[var(--surface2)] text-[var(--text2)] hover:border-[var(--accent)] transition-all active:scale-95">
                          {formatCurrency(v)}
                        </button>
                      ))}
                      {remaining > 0.01 && draftAmount < remaining - 0.01 && (
                        <button onClick={() => setDraft(d => ({ ...d, amount: remaining }))}
                          className="px-2 py-1 text-xs mono font-medium rounded border border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)] hover:opacity-80 transition-all active:scale-95">
                          Resto {formatCurrency(remaining)}
                        </button>
                      )}
                    </div>
                    {exceedsRemaining ? (
                      <p className="text-[11px] text-[var(--danger)] leading-snug">Ese monto es más de lo que falta. Lo máximo con este medio es {formatCurrency(remaining)}.</p>
                    ) : pendingAfterDraft > 0.01 ? (
                      <p className="text-[11px] text-[var(--warning)] leading-snug">Con este medio cobrás {formatCurrency(draftAmount)}. Después tendrás que cobrar {formatCurrency(pendingAfterDraft)} más con otro medio.</p>
                    ) : (
                      <p className="text-[10px] text-[var(--text3)] leading-snug">Poné cuánto paga con este medio y después agregás el resto con otro.</p>
                    )}
                  </div>
                ) : (
                  <button onClick={enableSplit}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] text-xs font-medium text-[var(--text3)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">
                    <Layers size={14} />
                    ¿Paga con varios medios? Dividir el cobro
                  </button>
                )}

                {/* Crédito: cuotas */}
                {draft.method === 'credito' && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-[var(--text2)] flex-shrink-0">Cuotas</span>
                    {[1, 3, 6, 12, 18, 24].map(n => (
                      <button key={n} onClick={() => setDraftInstallments(n)}
                        className={`px-2.5 py-1 text-xs rounded font-medium transition-colors
                          ${(draft.installments ?? 1) === n ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface2)] text-[var(--text2)] hover:bg-[var(--surface3)]'}`}>
                        {n}x
                      </button>
                    ))}
                  </div>
                )}

                {/* Efectivo: recibido y vuelto */}
                {draft.method === 'efectivo' && draftAmount > 0 && (
                  <div className="space-y-2 pt-3 border-t border-[var(--border)]">
                    <div>
                      <p className="text-xs font-semibold text-[var(--text2)]">{splitActive ? '3 · ' : ''}Calcular el vuelto <span className="font-normal text-[var(--text3)]">(opcional)</span></p>
                      <p className="text-[10px] text-[var(--text3)] leading-snug">¿Te paga con un billete más grande? Anotá con cuánto paga y te decimos el vuelto solo. Si paga justo, dejalo vacío.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {suggestReceived(draftAmount).map(v => (
                        <button key={v} onClick={() => setDraftReceived(v)}
                          className={`px-2.5 py-1 text-xs mono font-medium rounded border transition-all active:scale-95
                            ${draft.received === v
                              ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]'
                              : 'border-[var(--border)] bg-[var(--surface2)] text-[var(--text2)] hover:border-[var(--accent)]'}`}>
                          {formatCurrency(v)}
                        </button>
                      ))}
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3 items-end">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-[var(--text3)]">Paga con</label>
                          <kbd className="text-[9px] font-mono bg-[var(--surface3)] border border-[var(--border)] px-1 py-0.5 rounded text-[var(--text3)]">V</kbd>
                        </div>
                        <MoneyInput
                          unstyled
                          ref={draftReceivedRef}
                          value={draft.received || ''}
                          onChange={v => setDraftReceived(Number(v))}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (!processing) handleMainAction() } }}
                          placeholder={String(Math.ceil(draftAmount))}
                          className={`w-full px-3 py-2 text-base mono rounded-[var(--radius-md)] bg-[var(--surface2)] border text-[var(--text)] focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
                            ${draftReceivedInvalid ? 'border-[var(--danger)] focus:border-[var(--danger)]' : 'border-[var(--border)] focus:border-[var(--accent)]'}`}
                        />
                      </div>
                      {draftChange > 0 && (
                        <div className="flex items-center justify-between px-3 py-2 bg-[var(--accent-subtle)] rounded-[var(--radius-md)]">
                          <div className="leading-tight">
                            <span className="block text-sm font-semibold text-[var(--text2)]">Vuelto</span>
                            <span className="block text-[10px] text-[var(--text3)]">Devolvé esto</span>
                          </div>
                          <span className="text-2xl font-bold mono text-[var(--accent)]">{formatCurrency(draftChange)}</span>
                        </div>
                      )}
                    </div>
                    {draftReceivedInvalid && (
                      <p className="text-[11px] text-[var(--danger)] leading-snug">El cliente no puede pagar menos que el monto. Poné cuánto te entrega (igual o más).</p>
                    )}
                  </div>
                )}

                {/* Cuenta corriente: aclaración */}
                {draft.method === 'cuenta_corriente' && (
                  <div className="flex items-start gap-1.5 text-xs text-[var(--text2)] bg-[var(--surface2)] rounded-[var(--radius-md)] px-3 py-2 leading-snug">
                    <BookOpen size={14} className="flex-shrink-0 mt-px text-[var(--accent)]" />
                    <span>El cliente se lo lleva <strong>fiado</strong>: el monto queda anotado como deuda en su cuenta. Elegí el cliente abajo o apretá <kbd className="text-[9px] font-mono bg-[var(--surface3)] border border-[var(--border)] px-1 py-0.5 rounded">F</kbd> para ir directo.</span>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Búsqueda de cliente para Cta. Cte. */}
          {ccInPlay && (
            <div className="space-y-1.5">
              <div className="px-0.5">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text2)]">
                  Cliente de la cuenta corriente
                  {!selectedCustomer && <kbd className="text-[9px] font-mono bg-[var(--surface3)] border border-[var(--border)] px-1 py-0.5 rounded text-[var(--text3)]">F</kbd>}
                </p>
                <p className="text-[10px] text-[var(--text3)] leading-snug">Buscalo por nombre o documento. La deuda se anota en esta cuenta. Si es nuevo, podés crearlo acá mismo.</p>
              </div>
              {selectedCustomer ? (
                <div className="flex items-center justify-between px-3 py-2 bg-[var(--accent-subtle)] border border-[var(--accent)] rounded-[var(--radius-md)]">
                  <div>
                    <p className="text-sm font-semibold text-[var(--accent)]">{selectedCustomer.full_name}</p>
                    <p className="text-xs text-[var(--text3)]">
                      Saldo: {formatCurrency(selectedCustomer.current_balance)}
                      {selectedCustomer.credit_limit > 0 && ` · Límite: ${formatCurrency(selectedCustomer.credit_limit)}`}
                    </p>
                  </div>
                  <button onClick={() => { setSelectedCustomer(null); setCustomerQuery('') }}
                    className="text-sm text-[var(--text3)] hover:text-[var(--danger)] transition-colors">✕</button>
                </div>
              ) : (
                <div className="relative">
                  <Users size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                  {searchingCustomer && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />}
                  <input ref={customerSearchRef} value={customerQuery} onChange={e => setCustomerQuery(e.target.value)}
                    onKeyDown={handleCustomerKeyDown}
                    placeholder="Buscar cliente por nombre o documento..."
                    className="w-full pl-9 pr-3 py-2.5 text-sm rounded-[var(--radius-md)] bg-[var(--surface2)] border border-[var(--warning)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)]"
                  />
                  {customerQuery.length >= 2 && (
                    <div className="absolute bottom-full left-0 right-0 mb-1 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-lg z-10 overflow-hidden max-h-60 overflow-y-auto">
                      {customerResults.map((c, idx) => {
                        const active = customerActiveIndex === idx
                        return (
                          <button key={c.id}
                            onMouseEnter={() => setCustomerActiveIndex(idx)}
                            onClick={() => { setSelectedCustomer(c); setCustomerQuery(''); setCustomerResults([]) }}
                            className={`w-full flex items-center justify-between px-3 py-2.5 transition-colors text-left border-b border-[var(--border)] last:border-0 ${active ? 'bg-[var(--accent-subtle)]' : 'hover:bg-[var(--surface2)]'}`}>
                            <div>
                              <p className={`text-sm font-medium ${active ? 'text-[var(--accent)]' : 'text-[var(--text)]'}`}>{c.full_name}</p>
                              {c.document && <p className="text-xs text-[var(--text3)]">{c.document}</p>}
                            </div>
                            {Number(c.current_balance) > 0 && <span className="text-xs mono text-[var(--danger)]">{formatCurrency(c.current_balance)}</span>}
                          </button>
                        )
                      })}
                      {(() => {
                        const createActive = customerActiveIndex === customerResults.length
                        return (
                          <button onMouseEnter={() => setCustomerActiveIndex(customerResults.length)}
                            onClick={() => setQuickCustomerModal(true)}
                            className={`w-full flex items-center gap-2 px-3 py-2.5 transition-colors text-left ${customerResults.length > 0 ? 'border-t border-[var(--border)]' : ''} ${createActive ? 'bg-[var(--accent-subtle)]' : 'hover:bg-[var(--accent-subtle)]'}`}>
                            <Plus size={13} className="text-[var(--accent)]" />
                            <span className="text-sm text-[var(--accent)] font-medium">Crear {customerResults.length > 0 ? `"${customerQuery}"` : `cliente "${customerQuery}"`}</span>
                          </button>
                        )
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>
      </Drawer>

      {/* Tabs mobile */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 flex border-t border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-md">
        <button
          onClick={() => setMobileView('search')}
          className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors ${mobileView === 'search' ? 'text-[var(--accent)]' : 'text-[var(--text3)]'}`}
        >
          <Search size={20} strokeWidth={mobileView === 'search' ? 2.5 : 1.8} />
          Buscar
        </button>
        <button
          onClick={() => setMobileView('cart')}
          className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors relative ${mobileView === 'cart' ? 'text-[var(--accent)]' : 'text-[var(--text3)]'}`}
        >
          <ShoppingCart size={20} strokeWidth={mobileView === 'cart' ? 2.5 : 1.8} />
          Carrito
          {cartItemCount > 0 && (
            <span className="absolute top-1.5 right-1/4 min-w-[18px] h-[18px] bg-[var(--accent)] text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
              {cartItemCount}
            </span>
          )}
        </button>
      </div>

      {/* Modal factura */}
      {invoiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setInvoiceModal(false)}>
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-6 max-w-sm w-full">
            <h3 className="text-base font-semibold text-[var(--text)] mb-4">Emitir factura</h3>
            <p className="text-sm text-[var(--text3)] mb-4">Integración ARCA en configuración. Próximamente disponible.</p>
            <button onClick={() => setInvoiceModal(false)} className="w-full py-2 bg-[var(--surface2)] border border-[var(--border)] rounded-[var(--radius-md)] text-sm text-[var(--text2)]">Cerrar</button>
          </div>
        </div>
      )}

      {/* Modal selección de puesto */}
      <Modal
        open={selectingWorkstation}
        onClose={() => setSelectingWorkstation(false)}
        title={workstation ? 'Cambiar caja' : '¿En qué caja vas a trabajar?'}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-xs text-[var(--text3)]">
            Seleccioná tu puesto para que las ventas y el cierre de caja queden registrados correctamente.
          </p>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[var(--text2)]">Sucursal</label>
            <div className="relative">
              <select
                value={tempBranchId}
                onChange={e => {
                  const branchId = e.target.value
                  setTempBranchId(branchId)
                  setTempRegisterId('')
                  const branch = branches.find(b => b.id === branchId)
                  if (branch?.warehouse_id) {
                    const wh = warehouses.find(w => w.id === branch.warehouse_id)
                    if (wh) setSelectedWarehouse(wh)
                  }
                }}
                disabled={loadingBranches}
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-50"
              >
                <option value="">{loadingBranches ? 'Cargando...' : 'Seleccionar...'}</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              {loadingBranches && <span className="absolute right-8 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[var(--text2)]">Caja</label>
            <div className="relative">
              <select
                value={tempRegisterId}
                onChange={e => setTempRegisterId(e.target.value)}
                disabled={loadingBranches || !tempBranchId}
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-50"
              >
                <option value="">{loadingBranches ? 'Cargando...' : tempBranchId ? 'Seleccionar...' : 'Primero elegí la sucursal'}</option>
                {branches.find(b => b.id === tempBranchId)?.registers.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              {loadingBranches && <span className="absolute right-8 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />}
            </div>
          </div>
          <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-4 border-t border-[var(--border)]">
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setSelectingWorkstation(false)}
                className="text-xs text-[var(--text3)] hover:text-[var(--text)]"
              >
                Continuar sin seleccionar
              </button>
              <Button
                onClick={() => {
                  if (!tempBranchId || !tempRegisterId) { toast.error('Seleccioná sucursal y caja'); return }
                  const branch = branches.find(b => b.id === tempBranchId)
                  const register = branch?.registers.find(r => r.id === tempRegisterId)
                  if (!branch || !register) return
                  setWorkstation({
                    branch_id:     branch.id,
                    branch_name:   branch.name,
                    register_id:   register.id,
                    register_name: register.name,
                    warehouse_id:  branch.warehouse_id,
                  })
                  const wh = branch.warehouse_id
                    ? warehouses.find(w => w.id === branch.warehouse_id)
                    : warehouses.find(w => w.is_default) ?? warehouses[0]
                  if (wh) setSelectedWarehouse(wh)
                  setSelectingWorkstation(false)
                }}
              >
                Confirmar
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Picker F3 — productos precio libre */}
      {f3PickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setF3PickerOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <h3 className="text-sm font-semibold text-[var(--text)]">Precio libre</h3>
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--text3)] font-mono">
                <kbd className="px-1.5 py-0.5 bg-[var(--surface2)] border border-[var(--border)] rounded">↑↓</kbd>
                <kbd className="px-1.5 py-0.5 bg-[var(--surface2)] border border-[var(--border)] rounded">↵</kbd>
                <kbd className="px-1.5 py-0.5 bg-[var(--surface2)] border border-[var(--border)] rounded">Esc</kbd>
              </div>
            </div>
            {variableProducts.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[var(--text3)]">
                No hay productos de precio libre.<br />
                <span className="text-xs">Activá "Precio libre por venta" en el catálogo.</span>
              </div>
            ) : (
              <div className="p-2 flex flex-col gap-1 max-h-72 overflow-y-auto">
                {variableProducts.map((product, idx) => (
                  <button
                    key={product.id}
                    onClick={() => {
                      setF3PickerOpen(false)
                      addToCart(product, pendingQtyRef.current)
                    }}
                    onMouseEnter={() => setF3ActiveIndex(idx)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-[var(--radius-md)] text-left transition-colors ${
                      idx === f3ActiveIndex
                        ? 'bg-[var(--accent)] text-white'
                        : 'hover:bg-[var(--accent-subtle)]'
                    }`}
                  >
                    <span className={`text-sm font-medium ${idx === f3ActiveIndex ? 'text-white' : 'text-[var(--text)]'}`}>{product.name}</span>
                    <span className={`text-xs ${idx === f3ActiveIndex ? 'text-white/70' : 'text-[var(--text3)]'}`}>precio libre</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <POSTicket
        open={step === 'ticket' && !!completedSale}
        sale={completedSale ?? { id: '', total: 0, subtotal: 0, discount: 0, payment_method: 'efectivo', installments: 1, items: [], created_at: new Date().toISOString() }}
        invoiceId={completedSale?.invoice_id}
        onNewSale={handleNewSale}
        onClose={() => leavePOS('/sales')}
        customerPhone={selectedCustomer?.phone}
        customerName={selectedCustomer?.full_name}
        business={user?.business ?? undefined}
        branchName={workstation?.branch_name}
        registerName={workstation?.register_name}
        sellerName={user?.full_name}
        printSettings={printSettings}
      />

      <PrintSettingsModal open={showPrintSettings} onClose={() => setShowPrintSettings(false)} />

    </div>
  )
}
