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

// ─── Tipos internos del POS ───────────────────────────────
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
  { value: 'cuenta_corriente', label: 'Cuenta corriente', icon: '📒' },
]


// ─── Componente principal ─────────────────────────────────
export default function POSPage() {
  const router = useRouter()

  // Búsqueda
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [searching, setSearching] = useState(false)
  const [activeResultIndex, setActiveResultIndex] = useState(-1)
  const searchRef = useRef<HTMLInputElement>(null)
  const isAddingRef = useRef(false)

  // Carrito
  const [cart, setCart] = useState<CartItem[]>([])
  const [saleDiscount, setSaleDiscount] = useState(0)

  // Checkout
  const [step, setStep] = useState<'cart' | 'payment' | 'ticket'>('cart')
  const [paymentMethod, setPaymentMethod] = useState('efectivo')
  const [installments, setInstallments] = useState(1)
  const [processing, setProcessing] = useState(false)
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null)

  // Clientes para cuenta corriente en POS
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState<CustomerSummary[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSummary | null>(null)
  const [searchingCustomer, setSearchingCustomer] = useState(false)
  const [quickCustomerModal, setQuickCustomerModal] = useState(false)


  // Listas de precio
  const [priceLists, setPriceLists] = useState<PriceList[]>([])
  const [selectedList, setSelectedList] = useState<PriceList | null>(null)

  const [invoiceModal, setInvoiceModal] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Focus automático en el buscador
  useEffect(() => { searchRef.current?.focus() }, [])

  // Cargar listas de precio
  useEffect(() => {
    api.get<PriceList[]>('/api/price-lists').then(lists => {
      setPriceLists(lists)
      // Seleccionar la lista por defecto automáticamente
      const def = lists.find(l => l.is_default)
      if (def) setSelectedList(def)
    }).catch(() => { })
  }, [])

  // Búsqueda con debounce
  useEffect(() => {
    if (!query.trim()) { setResults([]); return }

    // Cancelar debounce anterior
    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        // Buscar por código de barras exacto primero
        if (/^\d{8,14}$/.test(query.trim())) {
          try {
            const p = await api.get<Product>(`/api/products/barcode/${query.trim()}`)
            addToCart(p)
            setQuery('')
            setResults([])
            return
          } catch { }
        }
        // Búsqueda por nombre
        const res = await api.get<{ data: Product[] }>('/api/products', {
          search: query.trim(),
          limit: 8,
        })
        setResults(res.data)
        setActiveResultIndex(res.data.length > 0 ? 0 : -1)
      } catch {
        setResults([])
        setActiveResultIndex(-1)
      } finally { setSearching(false) }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query]) // eslint-disable-line react-hooks/exhaustive-deps

  // Búsqueda de cliente con debounce (para cuenta corriente)
  useEffect(() => {
    if (!customerQuery.trim() || customerQuery.length < 2) {
      setCustomerResults([])
      return
    }
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

  // 3. Búsqueda de clientes con debounce
  useEffect(() => {
    if (!customerQuery.trim() || customerQuery.length < 2) {
      setCustomerResults([])
      return
    }
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

  // Función para calcular precio según lista seleccionada
  async function getPriceForQuantity(productId: string, quantity: number): Promise<{
    price: number
    list_name: string
    margin_pct: number
    rule_source: string
  }> {
    const data = await api.get<{
      price: number
      list_name: string
      margin_pct: number
      rule_source: string
    }>('/api/products/price', { product_id: productId, quantity })
    return data
  }

  // ─── Carrito ───────────────────────────────────────────
  const addToCart = useCallback(async (product: Product) => {

    if (isAddingRef.current) return  // ← bloquear si ya está procesando
    isAddingRef.current = true        // ← marcar como procesando

    if (product.stock_current <= 0) {
      toast.error(`${product.name} sin stock`)
      return
    }

    const existing = cart.find(i => i.product.id === product.id)

    if (existing) {
      if (existing.quantity >= product.stock_current) {
        toast.error(`Stock máximo disponible: ${product.stock_current}`)
        return
      }
      const newQty = existing.quantity + 1
      const pricing = await getPriceForQuantity(product.id, newQty)
      setCart(prev => prev.map(i =>
        i.product.id === product.id
          ? { ...i, quantity: newQty, unit_price: pricing.price, applied_list: pricing.list_name }
          : i
      ))
    } else {
      const pricing = await getPriceForQuantity(product.id, 1)
      setCart(prev => [...prev, {
        product,
        quantity: 1,
        unit_price: pricing.price,
        discount: 0,
        applied_list: pricing.list_name,
        applied_margin: pricing.margin_pct,
      }])
    }

    setResults([])
    setQuery('')
    searchRef.current?.focus()
    isAddingRef.current = false
  }, [cart, getPriceForQuantity]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateQty = async (id: string, delta: number) => {
    const item = cart.find(i => i.product.id === id)
    if (!item) return
    const newQty = Math.max(1, item.quantity + delta)
    const pricing = await getPriceForQuantity(id, newQty)
    setCart(prev => prev.map(i =>
      i.product.id === id
        ? { ...i, quantity: newQty, unit_price: pricing.price, applied_list: pricing.list_name }
        : i
    ))
  }

  const updateItemDiscount = (id: string, value: string) => {
    const d = Math.max(0, Number(value) || 0)
    setCart(prev => prev.map(i => i.product.id === id ? { ...i, discount: d } : i))
  }

  const updateItemPrice = (id: string, value: string) => {
    const p = Math.max(0, Number(value) || 0)
    setCart(prev => prev.map(i => i.product.id === id ? { ...i, unit_price: p } : i))
  }

  const removeItem = (id: string) => {
    setCart(prev => prev.filter(i => i.product.id !== id))
  }

  // ─── Totales ───────────────────────────────────────────
  const subtotal = cart.reduce((a, i) => a + i.unit_price * i.quantity - i.discount, 0)
  const totalDiscount = saleDiscount
  const total = Math.max(0, subtotal - totalDiscount)

  // ─── Confirmar venta ───────────────────────────────────
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
        if (!selectedCustomer) throw new Error('Seleccione un cliente para cuenta corriente')

        sale = await api.post<CompletedSale>('/api/sales', {
          ...payload,
          payment_method: 'transferencia',
          installments: 1,
        })

        await api.post(`/api/customers/${selectedCustomer.id}/charge`, {
          sale_id: sale.id,
          amount: total,
        })

        toast.success('Venta registrada y cargada a cuenta corriente')
      } else {
        sale = await api.post<CompletedSale>('/api/sales', payload)
        toast.success('Venta registrada')
      }

      setCompletedSale({
        ...sale,
        items: cart,
      })
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
    setStep('cart')
    setTimeout(() => searchRef.current?.focus(), 100)
  }

  // ─── TICKET ────────────────────────────────────────────
  if (step === 'ticket' && completedSale) {
    return (
      <POSTicket
        sale={completedSale}
        onNewSale={handleNewSale}
        onClose={() => router.push('/sales')}
      />
    )
  }

  // ─── LAYOUT PRINCIPAL ──────────────────────────────────
  return (
    <div className="flex h-screen bg-[var(--bg)] overflow-hidden">

      {/* ── Panel izquierdo: buscador + resultados ── */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-[var(--border)]">

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] bg-[var(--surface)]">
          <button
            onClick={() => router.push('/sales')}
            className="p-1.5 rounded-[var(--radius-md)] hover:bg-[var(--surface2)] text-[var(--text3)] hover:text-[var(--text)] transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="w-6 h-6 rounded-md bg-[var(--accent)] flex items-center justify-center flex-shrink-0">
            <Zap size={13} className="text-white" />
          </div>
          <span className="text-sm font-bold text-[var(--text)]">StockOS POS</span>
        </div>

        {/* Selector de lista de precios */}
        {priceLists.length > 1 && (
          <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--surface2)]">
            <div className="flex items-center gap-2 overflow-x-auto">
              <span className="text-xs text-[var(--text3)] flex-shrink-0">Lista:</span>
              {priceLists.map(list => (
                <button
                  key={list.id}
                  onClick={() => {
                    setSelectedList(list)
                    // Recalcular precios del carrito existente
                    setCart(prev => prev.map(item => ({
                      ...item,
                      unit_price: Math.round(
                        item.product.cost_price * (1 + list.margin_pct / 100) * 100
                      ) / 100
                    })))
                  }}
                  className={`px-3 py-1 text-xs rounded-full font-medium flex-shrink-0 transition-colors ${selectedList?.id === list.id
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text2)]'
                    }`}
                >
                  {list.name} (+{list.margin_pct}%)
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Buscador */}
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
            {searching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
            )}
            <input
              ref={searchRef}
              value={query}
              onChange={e => {
                setQuery(e.target.value)
                setActiveResultIndex(-1)
              }}
              onKeyDown={async e => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setActiveResultIndex(prev => Math.min(prev + 1, results.length - 1))
                  return
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setActiveResultIndex(prev => Math.max(prev - 1, -1))
                  return
                }
                if (e.key === 'Enter') {
                  e.preventDefault()

                  // Cancelar el debounce para que no se ejecute después
                  if (debounceRef.current) {
                    clearTimeout(debounceRef.current)
                    debounceRef.current = null
                  }

                  // Caso 1: hay un resultado seleccionado con las flechas → agregar ese
                  if (activeResultIndex >= 0 && results[activeResultIndex]) {
                    addToCart(results[activeResultIndex])
                    setActiveResultIndex(-1)
                    return
                  }

                  // Caso 2: hay un solo resultado → agregarlo directamente
                  if (results.length === 1) {
                    addToCart(results[0])
                    setActiveResultIndex(-1)
                    return
                  }

                  // Caso 3: lector de código de barras — buscar inmediatamente sin debounce
                  // El lector envía el código completo + Enter casi instantáneo
                  if (query.trim()) {
                    setSearching(true)
                    try {
                      // Intentar primero por código de barras exacto
                      if (/^\d{8,14}$/.test(query.trim())) {
                        const product = await api.get<Product>(`/api/products/barcode/${query.trim()}`)
                        addToCart(product)
                        return
                      }
                      // Si no es código de barras, buscar por nombre
                      const res = await api.get<{ data: Product[] }>('/api/products', {
                        search: query.trim(),
                        limit: 8,
                      })
                      setResults(res.data)
                      if (res.data.length === 1) {
                        addToCart(res.data[0])
                      }
                    } catch {
                      setResults([])
                    } finally {
                      setSearching(false)
                    }
                  }
                }
              }}
              placeholder="Buscar producto o escanear código de barras..."
              className="w-full pl-10 pr-4 py-3 text-sm rounded-[var(--radius-lg)] bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)] focus:bg-[var(--surface)] transition-all"
            />
          </div>
        </div>

        {/* Resultados de búsqueda */}
        <div className="flex-1 overflow-y-auto p-4">
          {results.length > 0 ? (
            <div className="space-y-1">
              {results.map((product, index) => (
                <button
                  key={product.id}
                  onClick={() => {
                    addToCart(product)
                    setActiveResultIndex(-1)
                  }}
                  disabled={product.stock_current <= 0}
                  className={"w-full flex items-center justify-between px-4 py-3 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed group " + (index === activeResultIndex ? 'ring-2 ring-[var(--accent)]' : 'hover:border-[var(--accent)] hover:bg-[var(--accent-subtle)]')}
                >
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

      {/* ── Panel derecho: carrito ── */}
      <div className="w-96 flex flex-col bg-[var(--surface)] flex-shrink-0">

        {/* Selector de cliente */}
        <div className="px-3 py-3 border-b border-[var(--border)]">
          {selectedCustomer ? (
            // Cliente seleccionado
            <div className="flex items-center justify-between px-3 py-2 bg-[var(--accent-subtle)] border border-[var(--accent)] rounded-[var(--radius-md)]">
              <div>
                <p className="text-xs font-semibold text-[var(--accent)]">{selectedCustomer.full_name}</p>
                <p className="text-xs text-[var(--text3)]">
                  Saldo: {formatCurrency(selectedCustomer.current_balance)}
                  {selectedCustomer.credit_limit > 0 && ` · Límite: ${formatCurrency(selectedCustomer.credit_limit)}`}
                </p>
              </div>
              <button
                onClick={() => { setSelectedCustomer(null); setCustomerQuery('') }}
                className="text-xs text-[var(--text3)] hover:text-[var(--danger)] transition-colors"
              >
                ✕
              </button>
            </div>
          ) : (
            // Buscador de clientes
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

              {/* Resultados de búsqueda */}
              {customerQuery.length >= 2 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-lg z-10 overflow-hidden">
                  {customerResults.length > 0 ? (
                    <>
                      {customerResults.map(c => (
                        <button
                          key={c.id}
                          onClick={() => {
                            setSelectedCustomer(c)
                            setCustomerQuery('')
                            setCustomerResults([])
                          }}
                          className="w-full flex items-center justify-between px-3 py-2 hover:bg-[var(--surface2)] transition-colors text-left border-b border-[var(--border)] last:border-0"
                        >
                          <div>
                            <p className="text-xs font-medium text-[var(--text)]">{c.full_name}</p>
                            {c.document && <p className="text-xs text-[var(--text3)]">{c.document}</p>}
                          </div>
                          {Number(c.current_balance) > 0 && (
                            <span className="text-xs mono text-[var(--danger)]">
                              {formatCurrency(c.current_balance)}
                            </span>
                          )}
                        </button>
                      ))}
                      {/* Siempre mostrar opción de crear */}
                      <button
                        onClick={() => setQuickCustomerModal(true)}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--accent-subtle)] transition-colors text-left border-t border-[var(--border)]"
                      >
                        <Plus size={12} className="text-[var(--accent)]" />
                        <span className="text-xs text-[var(--accent)] font-medium">
                          Crear "{customerQuery}"
                        </span>
                      </button>
                    </>
                  ) : (
                    // Sin resultados → directo a crear
                    <button
                      onClick={() => setQuickCustomerModal(true)}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--accent-subtle)] transition-colors text-left"
                    >
                      <Plus size={12} className="text-[var(--accent)]" />
                      <span className="text-xs text-[var(--accent)] font-medium">
                        Crear cliente "{customerQuery}"
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal crear cliente rápido */}
        <QuickCustomerModal
          open={quickCustomerModal}
          onClose={() => setQuickCustomerModal(false)}
          onCreated={(customer) => {
            setSelectedCustomer(customer)
            setCustomerQuery('')
            setCustomerResults([])
          }}
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
            <button
              onClick={() => setCart([])}
              className="text-xs text-[var(--text3)] hover:text-[var(--danger)] transition-colors"
            >
              Limpiar
            </button>
          )}
        </div>

        {/* Items del carrito */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text3)] pb-10">
              <ShoppingCart size={32} className="mb-2 opacity-20" />
              <p className="text-xs">El carrito está vacío</p>
            </div>
          ) : cart.map(item => (
            <div
              key={item.product.id}
              className="bg-[var(--surface2)] rounded-[var(--radius-md)] p-3 space-y-2"
            >
              {/* Nombre + eliminar */}
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

              {/* Cantidad + precio + descuento */}
              <div className="flex items-center gap-2">
                {/* Qty */}
                <div className="flex items-center gap-1 bg-[var(--surface)] rounded-[var(--radius-md)] border border-[var(--border)] px-1">
                  <button onClick={() => updateQty(item.product.id, -1)} className="p-1 hover:text-[var(--accent)]">
                    <Minus size={12} />
                  </button>
                  <span className="text-sm mono font-semibold w-6 text-center">{item.quantity}</span>
                  <button onClick={() => updateQty(item.product.id, 1)} className="p-1 hover:text-[var(--accent)]">
                    <Plus size={12} />
                  </button>
                </div>

                {/* Precio unit editable */}
                <div className="flex items-center gap-1 flex-1">
                  <span className="text-xs text-[var(--text3)]">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unit_price}
                    onChange={e => updateItemPrice(item.product.id, e.target.value)}
                    className="w-full text-sm mono text-right bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                {/* Descuento ítem */}
                <div className="flex items-center gap-1">
                  <span className="text-xs text-[var(--text3)]">-$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.discount || ''}
                    onChange={e => updateItemDiscount(item.product.id, e.target.value)}
                    placeholder="0"
                    className="w-16 text-sm mono text-right bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
              </div>

              {/* Subtotal ítem */}
              <div className="text-right">
                <span className="text-sm mono font-bold text-[var(--text)]">
                  {formatCurrency(item.unit_price * item.quantity - item.discount)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer: totales + pago */}
        {step === 'cart' && (
          <div className="border-t border-[var(--border)] p-4 space-y-3">

            {/* Descuento total */}
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-[var(--text3)]">Descuento venta</span>
              <div className="flex items-center gap-1">
                <span className="text-sm text-[var(--text3)]">-$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={saleDiscount || ''}
                  onChange={e => setSaleDiscount(Math.max(0, Number(e.target.value) || 0))}
                  placeholder="0"
                  className="w-24 text-sm mono text-right bg-[var(--surface2)] border border-[var(--border)] rounded px-2 py-1.5 focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>

            {/* Subtotal */}
            {saleDiscount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text3)]">Subtotal</span>
                <span className="mono text-[var(--text2)]">{formatCurrency(subtotal)}</span>
              </div>
            )}

            {/* Total */}
            <div className="flex justify-between items-center py-2 border-t border-[var(--border)]">
              <span className="text-base font-semibold text-[var(--text)]">Total</span>
              <span className="text-2xl font-bold mono text-[var(--accent)]">{formatCurrency(total)}</span>
            </div>

            <button
              onClick={() => setStep('payment')}
              disabled={cart.length === 0}
              className="w-full py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold rounded-[var(--radius-md)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
            >
              Cobrar {cart.length > 0 ? formatCurrency(total) : ''}
            </button>
          </div>
        )}

        {/* ── Paso 2: método de pago ── */}
        {step === 'payment' && (
          <div className="border-t border-[var(--border)] p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--text)]">Método de pago</h3>
              <button onClick={() => setStep('cart')} className="text-xs text-[var(--text3)] hover:text-[var(--text)]">
                ← Volver
              </button>
            </div>

            {/* Total grande */}
            <div className="text-center py-2">
              <p className="text-3xl font-bold mono text-[var(--accent)]">{formatCurrency(total)}</p>
            </div>

            {/* Métodos */}
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_METHODS.map(m => (
                <button
                  key={m.value}
                  onClick={() => {
                    setPaymentMethod(m.value)
                    if (m.value !== 'cuenta_corriente') {
                      setSelectedCustomer(null)
                      setCustomerQuery('')
                      setCustomerResults([])
                    }
                  }}
                  className={`flex flex-col items-center gap-1 py-3 rounded-[var(--radius-md)] border text-xs font-medium transition-all ${paymentMethod === m.value
                    ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]'
                    : 'border-[var(--border)] bg-[var(--surface2)] text-[var(--text2)] hover:border-[var(--accent)]'
                    }`}
                >
                  <span className="text-lg">{m.icon}</span>
                  {m.label}
                </button>
              ))}
            </div>

            {/* Cuotas para crédito */}
            {paymentMethod === 'credito' && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-[var(--text2)]">Cuotas</span>
                <div className="flex gap-1">
                  {[1, 3, 6, 12, 18, 24].map(n => (
                    <button
                      key={n}
                      onClick={() => setInstallments(n)}
                      className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${installments === n
                        ? 'bg-[var(--accent)] text-white'
                        : 'bg-[var(--surface2)] text-[var(--text2)] hover:bg-[var(--surface3)]'
                        }`}
                    >
                      {n}x
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={handleConfirm}
              disabled={processing || (paymentMethod === 'cuenta_corriente' && !selectedCustomer)}
              className="w-full py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold rounded-[var(--radius-md)] transition-colors disabled:opacity-60 active:scale-95 flex items-center justify-center gap-2"
            >
              {processing ? (
                <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Procesando...</>
              ) : (
                <>Confirmar venta</>
              )}
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
