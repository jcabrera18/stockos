'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import type { Product } from '@/types'
import type { CustomerSummary } from '@/app/customers/page'
import type { PriceList } from '@/app/price-lists/page'
import { Search, Plus, Minus, Trash2, X, ShoppingCart, Zap, ChevronLeft, Users } from 'lucide-react'
import { toast } from 'sonner'
import { POSTicket } from '@/components/modules/POSTicket'
import { QuickCustomerModal } from '@/components/modules/QuickCustomerModal'

interface CartItem {
  product: Product
  quantity: number
  unit_price: number
  discount: number
  applied_list?: string
  applied_margin?: number
}

interface CompletedSale {
  id: string
  total: number
  subtotal: number
  discount: number
  payment_method: string
  installments: number
  items: CartItem[]
  created_at: string
}

const PAYMENT_METHODS = [
  { value: 'efectivo', label: 'Efectivo', icon: '💵' },
  { value: 'debito', label: 'Débito', icon: '💳' },
  { value: 'credito', label: 'Crédito', icon: '💳' },
  { value: 'transferencia', label: 'Transferencia', icon: '🏦' },
  { value: 'qr', label: 'QR', icon: '📱' },
  { value: 'cuenta_corriente', label: 'Cta. Cte.', icon: '📒' },
]

// Fuera del componente — sin closure stale
async function getPriceForQuantity(productId: string, quantity: number): Promise<{
  price: number
  list_name: string
  margin_pct: number
  rule_source: string
}> {
  return api.get('/api/products/price', { product_id: productId, quantity })
}

export default function POSPage() {
  const router = useRouter()

  // Búsqueda
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [searching, setSearching] = useState(false)
  const [activeResultIndex, setActiveResultIndex] = useState(-1)
  const searchRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isAddingRef = useRef(false)

  // Cantidad pendiente — estado para el UI, ref para los callbacks
  const [pendingQty, setPendingQty] = useState(1)
  const pendingQtyRef = useRef(1)
  const qtyRef = useRef<HTMLInputElement>(null)

  // Carrito
  const [cart, setCart] = useState<CartItem[]>([])
  const [saleDiscount, setSaleDiscount] = useState(0)

  // Checkout
  const [step, setStep] = useState<'cart' | 'payment' | 'ticket'>('cart')
  const [paymentMethod, setPaymentMethod] = useState('efectivo')
  const [installments, setInstallments] = useState(1)
  const [processing, setProcessing] = useState(false)
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null)

  // Clientes
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState<CustomerSummary[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSummary | null>(null)
  const [searchingCustomer, setSearchingCustomer] = useState(false)
  const [quickCustomerModal, setQuickCustomerModal] = useState(false)

  // Listas de precio
  const [priceLists, setPriceLists] = useState<PriceList[]>([])
  const [selectedList, setSelectedList] = useState<PriceList | null>(null)

  // Factura
  const [invoiceModal, setInvoiceModal] = useState(false)

  // Focus inicial en cantidad
  useEffect(() => { searchRef.current?.focus() }, [])

  // Cargar listas de precio
  useEffect(() => {
    api.get<PriceList[]>('/api/price-lists').then(lists => {
      setPriceLists(lists)
      const def = lists.find(l => l.is_default)
      if (def) setSelectedList(def)
    }).catch(() => { })
  }, [])

  // Búsqueda de productos con debounce
  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        if (/^\d{8,14}$/.test(query.trim())) {
          try {
            const p = await api.get<Product>(`/api/products/barcode/${query.trim()}`)
            addToCart(p)
            setQuery('')
            setResults([])
            return
          } catch { }
        }
        const res = await api.get<{ data: Product[] }>('/api/products', {
          search: query.trim(), limit: 8,
        })
        setResults(res.data)
        setActiveResultIndex(res.data.length > 0 ? 0 : -1)
      } catch {
        setResults([])
        setActiveResultIndex(-1)
      } finally {
        setSearching(false)
      }
    }, 300)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query]) // eslint-disable-line react-hooks/exhaustive-deps

  // Búsqueda de clientes con debounce
  useEffect(() => {
    if (!customerQuery.trim() || customerQuery.length < 2) { setCustomerResults([]); return }
    const timer = setTimeout(async () => {
      setSearchingCustomer(true)
      try {
        const data = await api.get<CustomerSummary[]>(
          `/api/customers/search?q=${encodeURIComponent(customerQuery)}`
        )
        setCustomerResults(data)
      } catch { setCustomerResults([]) }
      finally { setSearchingCustomer(false) }
    }, 300)
    return () => clearTimeout(timer)
  }, [customerQuery])

  // addToCart — lee qty del ref para evitar closure stale
  const addToCart = useCallback(async (product: Product, qty?: number) => {
    if (isAddingRef.current) return
    isAddingRef.current = true

    const quantity = qty ?? pendingQtyRef.current

    if (product.stock_current <= 0) {
      toast.error(`${product.name} sin stock`)
      isAddingRef.current = false
      return
    }

    try {
      const existing = cart.find(i => i.product.id === product.id)

      if (existing) {
        const newQty = existing.quantity + quantity
        if (newQty > product.stock_current) {
          toast.error(`Stock máximo disponible: ${product.stock_current}`)
          return
        }
        const pricing = await getPriceForQuantity(product.id, newQty)
        setCart(prev => prev.map(i =>
          i.product.id === product.id
            ? { ...i, quantity: newQty, unit_price: pricing.price, applied_list: pricing.list_name, applied_margin: pricing.margin_pct }
            : i
        ))
      } else {
        if (quantity > product.stock_current) {
          toast.error(`Stock máximo disponible: ${product.stock_current}`)
          return
        }
        const pricing = await getPriceForQuantity(product.id, quantity)
        setCart(prev => [...prev, {
          product,
          quantity,
          unit_price: pricing.price,
          discount: 0,
          applied_list: pricing.list_name,
          applied_margin: pricing.margin_pct,
        }])
      }

      // Resetear cantidad y volver foco a qty input
      setPendingQty(1)
      pendingQtyRef.current = 1
      setResults([])
      setQuery('')
      setTimeout(() => searchRef.current?.focus(), 50)
    } finally {
      isAddingRef.current = false
    }
  }, [cart])

  const updateQty = async (id: string, delta: number) => {
    const item = cart.find(i => i.product.id === id)
    if (!item) return
    const newQty = Math.max(1, item.quantity + delta)
    const pricing = await getPriceForQuantity(id, newQty)
    setCart(prev => prev.map(i =>
      i.product.id === id
        ? { ...i, quantity: newQty, unit_price: pricing.price, applied_list: pricing.list_name, applied_margin: pricing.margin_pct }
        : i
    ))
  }

  const updateItemDiscount = (id: string, value: string) =>
    setCart(prev => prev.map(i => i.product.id === id ? { ...i, discount: Math.max(0, Number(value) || 0) } : i))

  const updateItemPrice = (id: string, value: string) =>
    setCart(prev => prev.map(i => i.product.id === id ? { ...i, unit_price: Math.max(0, Number(value) || 0) } : i))

  const removeItem = (id: string) =>
    setCart(prev => prev.filter(i => i.product.id !== id))

  const subtotal = cart.reduce((a, i) => a + i.unit_price * i.quantity - i.discount, 0)
  const total = Math.max(0, subtotal - saleDiscount)

  const handleConfirm = async () => {
    if (cart.length === 0) return
    setProcessing(true)
    try {
      const payload = {
        items: cart.map(i => ({
          product_id: i.product.id,
          quantity: i.quantity,
          unit_price: i.unit_price,
          discount: i.discount,
        })),
        discount: saleDiscount,
        payment_method: paymentMethod,
        installments: paymentMethod === 'credito' ? installments : 1,
        price_list_id: selectedList?.id ?? null,
      }

      let sale: CompletedSale

      if (paymentMethod === 'cuenta_corriente') {
        if (!selectedCustomer) throw new Error('Seleccioná un cliente para cuenta corriente')
        sale = await api.post<CompletedSale>('/api/sales', { ...payload, payment_method: 'transferencia', installments: 1 })
        await api.post(`/api/customers/${selectedCustomer.id}/charge`, { sale_id: sale.id, amount: total })
        toast.success('Venta registrada y cargada a cuenta corriente')
      } else {
        sale = await api.post<CompletedSale>('/api/sales', payload)
        toast.success('Venta registrada')
      }

      setCompletedSale({ ...sale, items: cart })
      setStep('ticket')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al procesar la venta')
    } finally {
      setProcessing(false)
    }
  }

  const handleNewSale = () => {
    setCart([])
    setSaleDiscount(0)
    setPaymentMethod('efectivo')
    setInstallments(1)
    setCompletedSale(null)
    setSelectedCustomer(null)
    setCustomerQuery('')
    setStep('cart')
    setTimeout(() => qtyRef.current?.focus(), 100)
  }

  if (step === 'ticket' && completedSale) {
    return (
      <POSTicket
        sale={completedSale}
        onNewSale={handleNewSale}
        onClose={() => router.push('/sales')}
      />
    )
  }

  return (
    <div className="flex h-screen bg-[var(--bg)] overflow-hidden">

      {/* Panel izquierdo */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-[var(--border)]">

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
        </div>

        {/* Selector de lista */}
        {priceLists.length > 1 && (
          <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--surface2)]">
            <div className="flex items-center gap-2 overflow-x-auto">
              <span className="text-xs text-[var(--text3)] flex-shrink-0">Lista:</span>
              {priceLists.map(list => (
                <button key={list.id}
                  onClick={() => {
                    setSelectedList(list)
                    setCart(prev => prev.map(item => ({
                      ...item,
                      unit_price: Math.round(item.product.cost_price * (1 + list.margin_pct / 100) * 100) / 100,
                      applied_list: list.name,
                      applied_margin: list.margin_pct,
                    })))
                  }}
                  className={`px-3 py-1 text-xs rounded-full font-medium flex-shrink-0 transition-colors ${selectedList?.id === list.id
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text2)]'
                    }`}>
                  {list.name} (+{list.margin_pct}%)
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Cantidad + Buscador */}
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <div className="flex gap-2">

            {/* Input cantidad */}
            <div className="relative flex-shrink-0">
              <input
                ref={qtyRef}
                type="number"
                min="1"
                max="999"
                value={pendingQty}
                onChange={e => {
                  const val = Math.max(1, Number(e.target.value) || 1)
                  setPendingQty(val)
                  pendingQtyRef.current = val
                }}
                onFocus={e => e.target.select()}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault()
                    searchRef.current?.focus()
                    return
                  }
                  // Solo dígitos y teclas de control
                  if (!/^\d$/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                    e.preventDefault()
                  }
                }}
                className="w-16 text-center text-sm font-bold mono py-3 rounded-[var(--radius-lg)] bg-[var(--surface2)] border-2 border-[var(--accent)] text-[var(--accent)] focus:outline-none"
              />
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[10px] text-[var(--text3)] bg-[var(--bg)] px-1 whitespace-nowrap">
                cant.
              </span>
            </div>

            {/* Buscador */}
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
              {searching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
              )}
              <input
                ref={searchRef}
                value={query}
                onChange={e => {
                  // SOLO actualizar query — NO tocar pendingQty
                  setQuery(e.target.value)
                  setActiveResultIndex(-1)
                }}
                onKeyDown={async e => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setActiveResultIndex(prev => Math.min(prev + 1, results.length - 1)); return }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setActiveResultIndex(prev => Math.max(prev - 1, -1)); return }
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }

                    if (activeResultIndex >= 0 && results[activeResultIndex]) {
                      addToCart(results[activeResultIndex], pendingQtyRef.current)
                      setActiveResultIndex(-1)
                      return
                    }
                    if (results.length === 1) {
                      addToCart(results[0], pendingQtyRef.current)
                      setActiveResultIndex(-1)
                      return
                    }
                    if (query.trim()) {
                      setSearching(true)
                      try {
                        if (/^\d{8,14}$/.test(query.trim())) {
                          const p = await api.get<Product>(`/api/products/barcode/${query.trim()}`)
                          addToCart(p, pendingQtyRef.current)
                          return
                        }
                        const res = await api.get<{ data: Product[] }>('/api/products', { search: query.trim(), limit: 8 })
                        setResults(res.data)
                        if (res.data.length === 1) addToCart(res.data[0], pendingQtyRef.current)
                      } catch { setResults([]) }
                      finally { setSearching(false) }
                    }
                  }
                }}
                placeholder="Buscar producto o escanear código de barras..."
                className="w-full pl-10 pr-4 py-3 text-sm rounded-[var(--radius-lg)] bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)] focus:bg-[var(--surface)] transition-all"
              />
            </div>
          </div>
        </div>

        {/* Resultados */}
        <div className="flex-1 overflow-y-auto p-4">
          {results.length > 0 ? (
            <div className="space-y-1">
              {results.map((product, index) => (
                <button key={product.id}
                  onClick={() => { addToCart(product, pendingQtyRef.current); setActiveResultIndex(-1) }}
                  disabled={product.stock_current <= 0}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-[var(--radius-md)] bg-[var(--surface)] border transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed group ${index === activeResultIndex
                    ? 'ring-2 ring-[var(--accent)] border-[var(--accent)]'
                    : 'border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--accent-subtle)]'
                    }`}>
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

      {/* Panel derecho: carrito */}
      <div className="w-96 flex flex-col bg-[var(--surface)] flex-shrink-0">

        {/* Selector de cliente */}
        <div className="px-3 py-3 border-b border-[var(--border)]">
          {selectedCustomer ? (
            <div className="flex items-center justify-between px-3 py-2 bg-[var(--accent-subtle)] border border-[var(--accent)] rounded-[var(--radius-md)]">
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
              {searchingCustomer && (
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
              )}
              <input
                value={customerQuery}
                onChange={e => setCustomerQuery(e.target.value)}
                placeholder="Cliente (opcional)..."
                className="w-full pl-7 pr-3 py-2 text-xs rounded-[var(--radius-md)] bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)]"
              />
              {customerQuery.length >= 2 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-lg z-10 overflow-hidden">
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
                          {Number(c.current_balance) > 0 && (
                            <span className="text-xs mono text-[var(--danger)]">{formatCurrency(c.current_balance)}</span>
                          )}
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

        <QuickCustomerModal
          open={quickCustomerModal}
          onClose={() => setQuickCustomerModal(false)}
          onCreated={(customer) => { setSelectedCustomer(customer); setCustomerQuery(''); setCustomerResults([]) }}
          initialName={customerQuery}
        />

        {/* Header carrito */}
        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--text)]">
            Carrito
            {cart.length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 text-xs bg-[var(--accent)] text-white rounded-full">
                {cart.reduce((a, i) => a + i.quantity, 0)}
              </span>
            )}
          </h2>
          {cart.length > 0 && (
            <button onClick={() => setCart([])} className="text-xs text-[var(--text3)] hover:text-[var(--danger)] transition-colors">
              Limpiar
            </button>
          )}
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text3)] pb-10">
              <ShoppingCart size={32} className="mb-2 opacity-20" />
              <p className="text-xs">El carrito está vacío</p>
            </div>
          ) : cart.map(item => (
            <div key={item.product.id} className="bg-[var(--surface2)] rounded-[var(--radius-md)] p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-[var(--text)] leading-tight">{item.product.name}</p>
                <button onClick={() => removeItem(item.product.id)} className="text-[var(--text3)] hover:text-[var(--danger)] flex-shrink-0 mt-0.5">
                  <X size={13} />
                </button>
              </div>
              {item.applied_list && (
                <span className="text-xs text-[var(--text3)]">
                  Lista: <span className="text-[var(--accent)]">{item.applied_list}</span>
                  {item.applied_margin !== undefined && ` (+${item.applied_margin}%)`}
                </span>
              )}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-[var(--surface)] rounded-[var(--radius-md)] border border-[var(--border)] px-1">
                  <button onClick={() => updateQty(item.product.id, -1)} className="p-1 hover:text-[var(--accent)]"><Minus size={12} /></button>
                  <span className="text-sm mono font-semibold w-6 text-center">{item.quantity}</span>
                  <button onClick={() => updateQty(item.product.id, 1)} className="p-1 hover:text-[var(--accent)]"><Plus size={12} /></button>
                </div>
                <div className="flex items-center gap-1 flex-1">
                  <span className="text-xs text-[var(--text3)]">$</span>
                  <input type="number" min="0" step="0.01" value={item.unit_price}
                    onChange={e => updateItemPrice(item.product.id, e.target.value)}
                    className="w-full text-sm mono text-right bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 focus:outline-none focus:border-[var(--accent)]" />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-[var(--text3)]">-$</span>
                  <input type="number" min="0" step="0.01" value={item.discount || ''} placeholder="0"
                    onChange={e => updateItemDiscount(item.product.id, e.target.value)}
                    className="w-16 text-sm mono text-right bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 focus:outline-none focus:border-[var(--accent)]" />
                </div>
              </div>
              <div className="text-right">
                <span className="text-sm mono font-bold text-[var(--text)]">
                  {formatCurrency(item.unit_price * item.quantity - item.discount)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer carrito */}
        {step === 'cart' && (
          <div className="border-t border-[var(--border)] p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-[var(--text3)]">Descuento venta</span>
              <div className="flex items-center gap-1">
                <span className="text-sm text-[var(--text3)]">-$</span>
                <input type="number" min="0" step="0.01" value={saleDiscount || ''} placeholder="0"
                  onChange={e => setSaleDiscount(Math.max(0, Number(e.target.value) || 0))}
                  className="w-24 text-sm mono text-right bg-[var(--surface2)] border border-[var(--border)] rounded px-2 py-1.5 focus:outline-none focus:border-[var(--accent)]" />
              </div>
            </div>
            {saleDiscount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text3)]">Subtotal</span>
                <span className="mono text-[var(--text2)]">{formatCurrency(subtotal)}</span>
              </div>
            )}
            <div className="flex justify-between items-center py-2 border-t border-[var(--border)]">
              <span className="text-base font-semibold text-[var(--text)]">Total</span>
              <span className="text-2xl font-bold mono text-[var(--accent)]">{formatCurrency(total)}</span>
            </div>
            <button onClick={() => setStep('payment')} disabled={cart.length === 0}
              className="w-full py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold rounded-[var(--radius-md)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed active:scale-95">
              Cobrar {cart.length > 0 ? formatCurrency(total) : ''}
            </button>
          </div>
        )}

        {/* Paso de pago */}
        {step === 'payment' && (
          <div className="border-t border-[var(--border)] p-4 space-y-4">
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
                  className={`flex flex-col items-center gap-1 py-3 rounded-[var(--radius-md)] border text-xs font-medium transition-all ${paymentMethod === m.value
                    ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]'
                    : 'border-[var(--border)] bg-[var(--surface2)] text-[var(--text2)] hover:border-[var(--accent)]'
                    }`}>
                  <span className="text-lg">{m.icon}</span>
                  {m.label}
                </button>
              ))}
            </div>
            {paymentMethod === 'cuenta_corriente' && !selectedCustomer && (
              <p className="text-xs text-[var(--warning)] text-center">
                Seleccioná un cliente en el panel derecho
              </p>
            )}
            {paymentMethod === 'credito' && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-[var(--text2)]">Cuotas</span>
                <div className="flex gap-1">
                  {[1, 3, 6, 12, 18, 24].map(n => (
                    <button key={n} onClick={() => setInstallments(n)}
                      className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${installments === n ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface2)] text-[var(--text2)] hover:bg-[var(--surface3)]'
                        }`}>
                      {n}x
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button onClick={handleConfirm}
              disabled={processing || (paymentMethod === 'cuenta_corriente' && !selectedCustomer)}
              className="w-full py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold rounded-[var(--radius-md)] transition-colors disabled:opacity-60 active:scale-95 flex items-center justify-center gap-2">
              {processing
                ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Procesando...</>
                : 'Confirmar venta'
              }
            </button>
          </div>
        )}
      </div>

      {/* Modal factura */}
      {invoiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setInvoiceModal(false)}>
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-6 max-w-sm w-full">
            <h3 className="text-base font-semibold text-[var(--text)] mb-4">Emitir factura</h3>
            <p className="text-sm text-[var(--text3)] mb-4">Integración AFIP en configuración. Próximamente disponible.</p>
            <button onClick={() => setInvoiceModal(false)}
              className="w-full py-2 bg-[var(--surface2)] border border-[var(--border)] rounded-[var(--radius-md)] text-sm text-[var(--text2)]">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
