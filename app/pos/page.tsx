'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import type { Product } from '@/types'
import type { CustomerSummary } from '@/app/customers/page'
import type { PriceList } from '@/app/price-lists/page'
import { Search, Plus, Minus, X, ShoppingCart, Zap, ChevronLeft, Users, AlertTriangle, RefreshCw, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { POSTicket } from '@/components/modules/POSTicket'
import { QuickCustomerModal } from '@/components/modules/QuickCustomerModal'
import { useWorkstation } from '@/hooks/useWorkstation'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { evaluatePromo, type Promotion } from '@/lib/promoUtils'
import { Modal } from '@/components/ui/Modal'
import { usePOSSync } from '@/hooks/usePOSSync'
import {
  resolveBarcode,
  computeLocalPrice,
  searchProductsLocal,
  cacheProductFromScan,
  syncPromotions,
  getLocalPromotions,
  getLastSyncTime,
  type PricingResult,
  type ScanResult,
} from '@/lib/pos-cache'

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
}

interface CompletedSale {
  id: string
  total: number
  subtotal: number
  discount: number
  shipping_amount: number
  payment_method: string
  installments: number
  items: CartItem[]
  created_at: string
  invoice_id?: string
}

const PAYMENT_METHODS = [
  { value: 'efectivo', label: 'Efectivo', icon: '💵' },
  { value: 'debito', label: 'Débito', icon: '💳' },
  { value: 'credito', label: 'Crédito', icon: '💳' },
  { value: 'transferencia', label: 'Transferencia', icon: '🏦' },
  { value: 'qr', label: 'QR', icon: '📱' },
  { value: 'cuenta_corriente', label: 'Cta. Cte.', icon: '📒' },
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

  const [step, setStep] = useState<'cart' | 'payment' | 'ticket'>('cart')
  const [paymentMethod, setPaymentMethod] = useState('efectivo')
  const [installments, setInstallments] = useState(1)
  const [processing, setProcessing] = useState(false)
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null)

  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState<CustomerSummary[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSummary | null>(null)
  const [searchingCustomer, setSearchingCustomer] = useState(false)
  const [quickCustomerModal, setQuickCustomerModal] = useState(false)

  const [priceLists, setPriceLists] = useState<PriceList[]>([])
  const [selectedList, setSelectedList] = useState<PriceList | null>(null)

  const [warehouses, setWarehouses] = useState<{ id: string; name: string; is_default: boolean }[]>([])
  const [selectedWarehouse, setSelectedWarehouse] = useState<{ id: string; name: string } | null>(null)

  const [shippingEnabled, setShippingEnabled] = useState(false)
  const [shippingAmount, setShippingAmount] = useState(0)

  const [cajaWarning, setCajaWarning] = useState(false)
  const [invoiceModal, setInvoiceModal] = useState(false)
  const [mobileView, setMobileView] = useState<'search' | 'cart'>('search')

  const [branches, setBranches] = useState<{ id: string; name: string; warehouse_id?: string; registers: { id: string; name: string }[] }[]>([])
  const [selectingWorkstation, setSelectingWorkstation] = useState(false)
  const [tempBranchId, setTempBranchId] = useState('')
  const [tempRegisterId, setTempRegisterId] = useState('')

  const { workstation, setWorkstation, loaded } = useWorkstation()
  const { user } = useAuth()
  const { cacheReady, syncing: cacheSyncing, forceSync } = usePOSSync(selectedWarehouse?.id)

  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)

  // Leer timestamp de última sync desde IndexedDB cuando el cache esté listo
  useEffect(() => {
    if (!cacheReady) return
    getLastSyncTime().then(t => setLastSyncedAt(t)).catch(() => {})
  }, [cacheReady])

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
    api.get<{ id: string; name: string; registers: { id: string; name: string }[] }[]>('/api/branches')
      .then(setBranches)
      .catch(() => { })
  }, [])

  useEffect(() => {
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
      const active = document.activeElement
      const inSearch = active === searchRef.current
      const inInput = active?.tagName === 'INPUT' || active?.tagName === 'SELECT' || active?.tagName === 'TEXTAREA'

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
    if (!query.trim()) { setResults([]); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const trimmed   = query.trim()
    const isBarcode = /^\d{8,14}$/.test(trimmed)

    debounceRef.current = setTimeout(async () => {
      if (isBarcode) {
        const knownProductId = barcodeMapRef.current.get(trimmed)
        if (knownProductId) {
          const existingItem = cartRef.current.find(i => i.product.id === knownProductId)
          if (existingItem) {
            const qty    = pendingQtyRef.current
            const newQty = existingItem.quantity + qty
            setCart(prev => prev.map(i => i.product.id === knownProductId ? { ...i, quantity: newQty } : i))
            setPendingQty(1); pendingQtyRef.current = 1
            setQuery(''); setResults([])
            setTimeout(() => searchRef.current?.focus(), 50)
            if (existingItem.product.price_mode !== 'custom') {
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
          if (localResult.product.price_mode !== 'custom' && (localResult.product.stock_current ?? 0) <= 0) {
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
            const promo = evaluatePromo(localResult.product as Parameters<typeof evaluatePromo>[0], newQty, localResult.pricing.price, promotionsRef.current)
            setCart(prev => prev.map(i =>
              i.product.id === localResult.product.id
                ? { ...i, quantity: newQty, unit_price: localResult.pricing.price, applied_list: localResult.pricing.list_name, applied_margin: localResult.pricing.margin_pct, discount: promo.discount, promo_label: promo.promo_label, promotion_id: promo.promotion_id }
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
          if (result.product.price_mode !== 'custom' && (result.product.stock_current ?? 0) <= 0) {
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
            const promo = evaluatePromo(result.product as Parameters<typeof evaluatePromo>[0], qty, result.pricing.price, promotionsRef.current)
            return prev.map(i => i.product.id === tempId ? {
              ...i,
              product: result.product,
              unit_price: result.pricing.price,
              applied_list: result.pricing.list_name,
              applied_margin: result.pricing.margin_pct,
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

      const localResults = await searchProductsLocal(trimmed)
      if (localResults.length > 0) {
        setResults(localResults)
        setActiveResultIndex(0)
      } else {
        setSearching(true)
        try {
          const res = await api.get<{ data: Product[] }>('/api/products', {
            search: trimmed, limit: 8,
            ...(selectedWarehouse?.id ? { warehouse_id: selectedWarehouse.id } : {}),
          })
          setResults(res.data)
          setActiveResultIndex(res.data.length > 0 ? 0 : -1)
        } catch { setResults([]); setActiveResultIndex(-1) }
        finally { setSearching(false) }
      }
    }, isBarcode ? 0 : 300)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!customerQuery.trim() || customerQuery.length < 2) { setCustomerResults([]); return }
    const timer = setTimeout(async () => {
      setSearchingCustomer(true)
      try {
        const data = await api.get<CustomerSummary[]>(`/api/customers/search?q=${encodeURIComponent(customerQuery)}`)
        setCustomerResults(data)
      } catch { setCustomerResults([]) }
      finally { setSearchingCustomer(false) }
    }, 300)
    return () => clearTimeout(timer)
  }, [customerQuery])

  useEffect(() => {
    if (workstation === null && loaded) setSelectingWorkstation(true)
  }, [workstation, loaded])

  const addToCart = useCallback(async (product: Product, qty?: number, prefetchedPricing?: PricingResult) => {
    if (isAddingRef.current) return
    isAddingRef.current = true

    const quantity       = qty ?? pendingQtyRef.current
    const isCustomPrice  = product.price_mode === 'custom'
    const stockAvailable = product.stock_current ?? 0

    if (!isCustomPrice && stockAvailable <= 0) {
      toast.error(`${product.name} sin stock`)
      isAddingRef.current = false
      return
    }

    const existing = cartRef.current.find(i => i.product.id === product.id)
    const newQty   = existing ? existing.quantity + quantity : quantity

    if (!isCustomPrice && newQty > stockAvailable) {
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
              unit_price:     resolvedPricing.price,
              applied_list:   resolvedPricing.list_name,
              applied_margin: resolvedPricing.margin_pct,
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
    if (item.product.price_mode === 'custom') return
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
    setCart(prev => prev.map(i => i.product.id === id ? { ...i, unit_price: Math.max(0, Number(v) || 0) } : i)), [])

  const removeItem = useCallback((id: string) =>
    setCart(prev => prev.filter(i => i.product.id !== id)), [])

  const handleSync = useCallback(async () => {
    await Promise.all([loadPromotions(), forceSync()])
    getLastSyncTime().then(t => setLastSyncedAt(t)).catch(() => {})
  }, [loadPromotions, forceSync])

  const relativeTime = (date: Date): string => {
    const min = Math.floor((Date.now() - date.getTime()) / 60_000)
    if (min < 1) return 'Justo ahora'
    if (min < 60) return `hace ${min} min`
    return `hace ${Math.floor(min / 60)} hs`
  }

  const subtotal           = cart.reduce((a, i) => a + i.unit_price * i.quantity - i.discount, 0)
  const saleDiscountAmount = Math.round(subtotal * saleDiscountPct / 100 * 100) / 100
  const shipping           = shippingEnabled ? shippingAmount : 0
  const total              = Math.max(0, subtotal - saleDiscountAmount) + shipping
  const hasMissingCustomPrice = cart.some(i => i.product.price_mode === 'custom' && i.unit_price === 0)
  const hasPendingItems       = cart.some(i => i.status === 'pending')

  const handleConfirm = async () => {
    if (cart.length === 0) return
    setProcessing(true)
    try {
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
        payment_method:   paymentMethod,
        installments:     paymentMethod === 'credito' ? installments : 1,
        price_list_id:    selectedList?.id ?? null,
        warehouse_id:     selectedWarehouse?.id ?? null,
        branch_id:        workstation?.branch_id ?? null,
        register_id:      workstation?.register_id ?? null,
        customer_id:      selectedCustomer?.id ?? null,
      }
      let sale: CompletedSale
      if (paymentMethod === 'cuenta_corriente') {
        if (!selectedCustomer) throw new Error('Seleccioná un cliente para cuenta corriente')
        const freshCustomer = await api.get<CustomerSummary & { is_active?: boolean }>(`/api/customers/${selectedCustomer.id}`)
        if (freshCustomer.is_active === false) throw new Error('El cliente está desactivado')
        if (freshCustomer.credit_limit > 0) {
          const available = freshCustomer.available_credit ?? (freshCustomer.credit_limit - freshCustomer.current_balance)
          if (available < total) {
            throw new Error(
              `Límite de cuenta corriente insuficiente. Disponible: ${formatCurrency(available)} — Total: ${formatCurrency(total)}`
            )
          }
        }
        sale = await api.post<CompletedSale>('/api/sales', { ...payload, payment_method: 'cuenta_corriente', installments: 1 })
        await api.post(`/api/customers/${selectedCustomer.id}/charge`, { sale_id: sale.id, amount: total })
        toast.success('Venta registrada y cargada a cuenta corriente')
      } else {
        sale = await api.post<CompletedSale>('/api/sales', payload)
        toast.success('Venta registrada')
      }
      const saleId     = sale.id
      const customerId = selectedCustomer?.id ?? null
      setCompletedSale({ ...sale, items: cart, shipping_amount: shipping })
      localStorage.removeItem(POS_CART_KEY)
      setCart([]); setSaleDiscountPct(0); setShippingEnabled(false); setSelectedCustomer(null); setCustomerQuery('')
      setStep('ticket')
      api.post<{ id: string }>('/api/invoices', { sale_id: saleId, customer_id: customerId })
        .then(inv => { setCompletedSale(prev => prev?.id === saleId ? { ...prev, invoice_id: inv.id } : prev) })
        .catch(() => {})
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al procesar la venta')
    } finally { setProcessing(false) }
  }

  const handleNewSale = () => {
    localStorage.removeItem(POS_CART_KEY)
    setCart([]); setSaleDiscountPct(0); setShippingEnabled(false); setPaymentMethod('efectivo'); setInstallments(1)
    setCompletedSale(null); setSelectedCustomer(null); setCustomerQuery('')
    setStep('cart')
    setTimeout(() => searchRef.current?.focus(), 100)
  }

  if (step === 'ticket' && completedSale) {
    return (
      <POSTicket
        sale={completedSale}
        invoiceId={completedSale.invoice_id}
        onNewSale={handleNewSale}
        onClose={() => router.push('/sales')}
        customerPhone={selectedCustomer?.phone}
        customerName={selectedCustomer?.full_name}
        business={user?.business ?? undefined}
        branchName={workstation?.branch_name}
        registerName={workstation?.register_name}
        sellerName={user?.full_name}
      />
    )
  }

  const cartItemCount = cart.reduce((a, i) => a + i.quantity, 0)

  return (
    <div className="flex flex-col sm:flex-row h-screen bg-[var(--bg)] overflow-hidden">

      {/* ── Panel izquierdo — búsqueda ── */}
      <div className={`sm:w-[380px] flex-shrink-0 flex flex-col min-w-0 border-r border-[var(--border)] pb-14 sm:pb-0 ${mobileView === 'cart' ? 'hidden sm:flex' : 'flex'}`}>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] bg-[var(--surface)]">
          <button onClick={() => router.push('/sales')}
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
          </div>
        </div>

        {/* Banner caja cerrada */}
        {cajaWarning && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-[var(--danger-subtle)] border-b border-[var(--danger)]">
            <div className="flex items-center gap-2 text-xs text-[var(--danger)]">
              <AlertTriangle size={14} className="flex-shrink-0" />
              <span className="font-medium">La caja no está abierta.</span>
            </div>
            <button onClick={() => router.push('/cash-register')}
              className="text-xs font-semibold text-[var(--danger)] underline flex-shrink-0">
              Abrir caja →
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
                          if (localResultEnter.product.price_mode !== 'custom' && (localResultEnter.product.stock_current ?? 0) <= 0) {
                            toast.error(`${localResultEnter.product.name} sin stock`)
                            setPendingQty(1); pendingQtyRef.current = 1; setQuery('')
                            return
                          }
                          barcodeMapRef.current.set(trimmedQ, localResultEnter.product.id)
                          const existingLocalEnter = cartRef.current.find(i => i.product.id === localResultEnter.product.id)
                          const qtyLocal = pendingQtyRef.current
                          if (existingLocalEnter) {
                            const newQtyLocal = existingLocalEnter.quantity + qtyLocal
                            const promoLocal = evaluatePromo(localResultEnter.product as Parameters<typeof evaluatePromo>[0], newQtyLocal, localResultEnter.pricing.price, promotionsRef.current)
                            setCart(prev => prev.map(i =>
                              i.product.id === localResultEnter.product.id
                                ? { ...i, quantity: newQtyLocal, unit_price: localResultEnter.pricing.price, applied_list: localResultEnter.pricing.list_name, applied_margin: localResultEnter.pricing.margin_pct, discount: promoLocal.discount, promo_label: promoLocal.promo_label, promotion_id: promoLocal.promotion_id }
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
                            if (result.product.price_mode !== 'custom' && (result.product.stock_current ?? 0) <= 0) {
                              toast.error(`${result.product.name} sin stock`)
                              setCart(prev => prev.filter(i => i.product.id !== tempIdEnter))
                              return
                            }
                            setCart(prev => {
                              const alreadyExists = prev.find(i => i.product.id === result.product.id)
                              if (alreadyExists) return prev.filter(i => i.product.id !== tempIdEnter).map(i => i.product.id === result.product.id ? { ...i, quantity: i.quantity + qtyEnter } : i)
                              const promo = evaluatePromo(result.product as Parameters<typeof evaluatePromo>[0], qtyEnter, result.pricing.price, promotionsRef.current)
                              return prev.map(i => i.product.id === tempIdEnter ? { ...i, product: result.product, unit_price: result.pricing.price, applied_list: result.pricing.list_name, applied_margin: result.pricing.margin_pct, discount: promo.discount, promo_label: promo.promo_label, promotion_id: promo.promotion_id, status: 'resolved' } : i)
                            })
                          })
                          .catch(() => { pendingBarcodesRef.current.delete(trimmedQ); setCart(prev => prev.map(i => i.product.id === tempIdEnter ? { ...i, status: 'error' } : i)) })
                        return
                      }
                      const localSearchResults = await searchProductsLocal(trimmedQ)
                      if (localSearchResults.length > 0) {
                        setResults(localSearchResults)
                        if (localSearchResults.length === 1) addToCart(localSearchResults[0], pendingQtyRef.current)
                      } else {
                        setSearching(true)
                        try {
                          const res = await api.get<{ data: Product[] }>('/api/products', { search: trimmedQ, limit: 8, ...(selectedWarehouse?.id ? { warehouse_id: selectedWarehouse.id } : {}) })
                          setResults(res.data)
                          if (res.data.length === 1) addToCart(res.data[0], pendingQtyRef.current)
                        } catch { setResults([]) } finally { setSearching(false) }
                      }
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
              <kbd className="px-1 py-0.5 bg-[var(--surface2)] border border-[var(--border)] rounded text-[10px] font-mono">F2</kbd> carrito
            </p>
          )}
        </div>

        {/* Resultados */}
        <div className="flex-1 overflow-y-auto p-4">
          {results.length > 0 ? (
            <div className="space-y-1">
              {results.map((product, index) => (
                <button key={product.id}
                  onClick={() => { addToCart(product, pendingQtyRef.current); setActiveResultIndex(-1) }}
                  disabled={product.stock_current <= 0}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-[var(--radius-md)] bg-[var(--surface)] border transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed group ${index === activeResultIndex ? 'ring-2 ring-[var(--accent)] border-[var(--accent)]' : 'border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--accent-subtle)]'}`}>
                  <div>
                    <p className="text-sm font-medium text-[var(--text)] group-hover:text-[var(--accent)]">{product.name}</p>
                    <p className="text-xs text-[var(--text3)]">
                      {product.barcode && <span className="mono mr-2">{product.barcode}</span>}
                      Stock: <span className={product.stock_current <= 0 ? 'text-[var(--danger)]' : 'text-[var(--accent)]'}>{product.stock_current}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold mono text-[var(--text)]">{formatCurrency(product.sell_price)}</p>
                    <p className="text-xs text-[var(--text3)]">{product.unit}</p>
                  </div>
                </button>
              ))}
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
                      onClick={() => { setSelectedList(list); setCart(prev => prev.map(item => ({ ...item, unit_price: Math.round(item.product.cost_price * (1 + list.margin_pct / 100) * 100) / 100, applied_list: list.name, applied_margin: list.margin_pct }))) }}
                      className={`px-3 py-1 text-xs rounded-full font-medium flex-shrink-0 transition-colors ${selectedList?.id === list.id ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface2)] border border-[var(--border)] text-[var(--text2)]'}`}>
                      {list.name} (+{list.margin_pct}%)
                    </button>
                  ))}
                </>
              ) : (
                <span className="text-xs text-[var(--text3)]">
                  {selectedList ? selectedList.name : 'Precio general'}
                </span>
              )}
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
            <button onClick={() => { setCart([]); setFocusedCartIndex(-1) }}
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
                    <input
                      ref={el => { priceInputRefs.current[item.product.id] = el }}
                      type="number" min="0" step="0.01" value={item.unit_price}
                      onChange={e => updateItemPrice(item.product.id, e.target.value)}
                      onFocus={e => { e.target.select(); setFocusedCartIndex(index) }}
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
                    onClick={e => { e.stopPropagation(); removeItem(item.product.id) }}
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
                  <input type="number" min="0" step="0.01" value={shippingAmount || ''} placeholder="0"
                    onChange={e => setShippingAmount(Math.max(0, Number(e.target.value) || 0))}
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
            <button
              onClick={() => setStep('payment')}
              disabled={cart.length === 0 || hasMissingCustomPrice || hasPendingItems}
              className="w-full py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold rounded-[var(--radius-md)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
            >
              Cobrar {cart.length > 0 ? formatCurrency(total) : ''}
            </button>
          </div>
        )}

        {/* Paso de pago */}
        {step === 'payment' && (
          <div className="border-t border-[var(--border)] p-4 space-y-4 flex-shrink-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--text)]">Método de pago</h3>
              <button onClick={() => setStep('cart')} className="text-xs text-[var(--text3)] hover:text-[var(--text)]">← Volver</button>
            </div>
            <div className="text-center py-2">
              <p className="text-3xl font-bold mono text-[var(--accent)]">{formatCurrency(total)}</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_METHODS.map(m => (
                <button key={m.value} onClick={() => setPaymentMethod(m.value)}
                  className={`flex flex-col items-center gap-1 py-3 rounded-[var(--radius-md)] border text-xs font-medium transition-all ${paymentMethod === m.value ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]' : 'border-[var(--border)] bg-[var(--surface2)] text-[var(--text2)] hover:border-[var(--accent)]'}`}>
                  <span className="text-lg">{m.icon}</span>
                  {m.label}
                </button>
              ))}
            </div>
            {paymentMethod === 'cuenta_corriente' && (
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
                      autoFocus
                      placeholder="Buscar cliente para Cta. Cte. ..."
                      className="w-full pl-7 pr-3 py-1.5 text-xs rounded-[var(--radius-md)] bg-[var(--surface2)] border border-[var(--warning)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)]"
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
            )}
            {paymentMethod === 'credito' && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-[var(--text2)]">Cuotas</span>
                <div className="flex gap-1">
                  {[1, 3, 6, 12, 18, 24].map(n => (
                    <button key={n} onClick={() => setInstallments(n)}
                      className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${installments === n ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface2)] text-[var(--text2)] hover:bg-[var(--surface3)]'}`}>
                      {n}x
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button onClick={handleConfirm}
              disabled={processing || (paymentMethod === 'cuenta_corriente' && !selectedCustomer)}
              className="w-full py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold rounded-[var(--radius-md)] transition-colors disabled:opacity-60 active:scale-95 flex items-center justify-center gap-2">
              {processing ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Procesando...</> : 'Confirmar venta'}
            </button>
          </div>
        )}
      </div>

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
            <p className="text-sm text-[var(--text3)] mb-4">Integración AFIP en configuración. Próximamente disponible.</p>
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
              className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
            >
              <option value="">Seleccionar...</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[var(--text2)]">Caja</label>
            <select
              value={tempRegisterId}
              onChange={e => setTempRegisterId(e.target.value)}
              disabled={!tempBranchId}
              className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-50"
            >
              <option value="">{tempBranchId ? 'Seleccionar...' : 'Primero elegí la sucursal'}</option>
              {branches.find(b => b.id === tempBranchId)?.registers.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
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

    </div>
  )
}
