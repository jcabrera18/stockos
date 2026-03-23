'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import type { Product } from '@/types'
import type { CustomerSummary } from '@/app/customers/page'
import { Search, Plus, Minus, Trash2, X, ShoppingCart, Zap, ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'
import { POSTicket } from '@/components/modules/POSTicket'

// ─── Tipos internos del POS ───────────────────────────────
interface CartItem {
  product:   Product
  quantity:  number
  unit_price: number
  discount:  number  // descuento por ítem en $
}

interface CompletedSale {
  id:             string
  total:          number
  subtotal:       number
  discount:       number
  payment_method: string
  installments:   number
  items:          CartItem[]
  created_at:     string
}

const PAYMENT_METHODS = [
  { value: 'efectivo',      label: 'Efectivo',       icon: '💵' },
  { value: 'debito',        label: 'Débito',          icon: '💳' },
  { value: 'credito',       label: 'Crédito',         icon: '💳' },
  { value: 'transferencia', label: 'Transferencia',   icon: '🏦' },
  { value: 'qr',            label: 'QR',              icon: '📱' },
  { value: 'cuenta_corriente', label: 'Cuenta corriente', icon: '📒' },
]


// ─── Componente principal ─────────────────────────────────
export default function POSPage() {
  const router = useRouter()

  // Búsqueda
  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState<Product[]>([])
  const [searching, setSearching] = useState(false)
  const [activeResultIndex, setActiveResultIndex] = useState(-1)
  const searchRef = useRef<HTMLInputElement>(null)

  // Carrito
  const [cart, setCart]           = useState<CartItem[]>([])
  const [saleDiscount, setSaleDiscount] = useState(0)

  // Checkout
  const [step, setStep]           = useState<'cart' | 'payment' | 'ticket'>('cart')
  const [paymentMethod, setPaymentMethod] = useState('efectivo')
  const [installments, setInstallments]   = useState(1)
  const [processing, setProcessing]       = useState(false)
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null)

  // Clientes para cuenta corriente en POS
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSummary | null>(null)
  const [customerQuery, setCustomerQuery]       = useState('')
  const [customerResults, setCustomerResults]   = useState<CustomerSummary[]>([])
  const [searchingCustomer, setSearchingCustomer] = useState(false)

  // Focus automático en el buscador
  useEffect(() => { searchRef.current?.focus() }, [])

  // Búsqueda con debounce
  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const timer = setTimeout(async () => {
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
          } catch {}
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
    return () => clearTimeout(timer)
  }, [query]) // eslint-disable-line react-hooks/exhaustive-deps

  // Búsqueda de cliente con debounce (para cuenta corriente)
  useEffect(() => {
    if (!customerQuery.trim() || customerQuery.trim().length < 2) {
      setCustomerResults([])
      return
    }

    const timer = setTimeout(async () => {
      setSearchingCustomer(true)
      try {
        const customers = await api.get<CustomerSummary[]>('/api/customers/search', { q: customerQuery.trim() })
        setCustomerResults(customers)
      } catch {
        setCustomerResults([])
      } finally {
        setSearchingCustomer(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [customerQuery])

  // ─── Carrito ───────────────────────────────────────────
  const addToCart = useCallback((product: Product) => {
    if (product.stock_current <= 0) {
      toast.error(`${product.name} sin stock`)
      return
    }
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id)
      if (existing) {
        if (existing.quantity >= product.stock_current) {
          toast.error(`Stock máximo disponible: ${product.stock_current}`)
          return prev
        }
        return prev.map(i =>
          i.product.id === product.id
            ? { ...i, quantity: i.quantity + 1 }
            : i
        )
      }
      return [...prev, {
        product,
        quantity:   1,
        unit_price: product.sell_price,
        discount:   0,
      }]
    })
    setResults([])
    setQuery('')
    searchRef.current?.focus()
  }, [])

  const updateQty = (id: string, delta: number) => {
    setCart(prev => prev
      .map(i => i.product.id === id ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i)
      .filter(i => i.quantity > 0)
    )
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
  const subtotal     = cart.reduce((a, i) => a + i.unit_price * i.quantity - i.discount, 0)
  const totalDiscount = saleDiscount
  const total        = Math.max(0, subtotal - totalDiscount)

  // ─── Confirmar venta ───────────────────────────────────
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
        })),
        discount:       saleDiscount,
        payment_method: paymentMethod,
        installments:   paymentMethod === 'credito' ? installments : 1,
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
          amount:  total,
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
              onKeyDown={e => {
                if (results.length === 0) return
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setActiveResultIndex(prev => Math.min(prev + 1, results.length - 1))
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setActiveResultIndex(prev => Math.max(prev - 1, -1))
                }
                if (e.key === 'Enter') {
                  if (activeResultIndex >= 0 && activeResultIndex < results.length) {
                    e.preventDefault()
                    addToCart(results[activeResultIndex])
                    setActiveResultIndex(-1)
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
                  className={`flex flex-col items-center gap-1 py-3 rounded-[var(--radius-md)] border text-xs font-medium transition-all ${
                    paymentMethod === m.value
                      ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]'
                      : 'border-[var(--border)] bg-[var(--surface2)] text-[var(--text2)] hover:border-[var(--accent)]'
                  }`}
                >
                  <span className="text-lg">{m.icon}</span>
                  {m.label}
                </button>
              ))}
            </div>

            {paymentMethod === 'cuenta_corriente' && (
              <div className="space-y-1">
                <label className="text-xs text-[var(--text3)] font-medium">Seleccionar cliente</label>
                <div className="relative">
                  <input
                    value={customerQuery}
                    onChange={e => { setCustomerQuery(e.target.value); setSelectedCustomer(null) }}
                    placeholder="Buscar cliente..."
                    className="w-full text-sm bg-[var(--surface)] border border-[var(--border)] rounded px-3 py-2 focus:outline-none focus:border-[var(--accent)]"
                  />
                  {customerResults.length > 0 && (
                    <div className="absolute z-20 w-full mt-1 max-h-44 overflow-y-auto rounded border border-[var(--border)] bg-[var(--surface)] shadow-[0_2px_10px_rgba(0,0,0,0.08)]">
                      {customerResults.map(customer => (
                        <button
                          key={customer.id}
                          onClick={() => {
                            setSelectedCustomer(customer)
                            setCustomerResults([])
                            setCustomerQuery(customer.full_name)
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--surface2)] transition-colors"
                        >
                          <span className="font-medium">{customer.full_name}</span>
                          <span className="ml-2 text-xs text-[var(--text3)]">{formatCurrency(customer.current_balance)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {searchingCustomer && <p className="text-xs text-[var(--text3)]">Buscando...</p>}

                {selectedCustomer && (
                  <div className="flex items-center justify-between rounded border border-[var(--accent)] bg-[var(--accent-subtle)] p-2">
                    <div>
                      <p className="text-xs font-medium">{selectedCustomer.full_name}</p>
                      <p className="text-xs text-[var(--text3)]">Saldo: {formatCurrency(selectedCustomer.current_balance)}</p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedCustomer(null)
                        setCustomerQuery('')
                        setCustomerResults([])
                      }}
                      className="text-xs text-[var(--danger)] hover:text-[var(--danger)]"
                    >
                      Quitar
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Cuotas para crédito */}
            {paymentMethod === 'credito' && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-[var(--text2)]">Cuotas</span>
                <div className="flex gap-1">
                  {[1, 3, 6, 12, 18, 24].map(n => (
                    <button
                      key={n}
                      onClick={() => setInstallments(n)}
                      className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                        installments === n
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
