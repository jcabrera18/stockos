'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Search, ShoppingCart, Plus, Minus, Trash2, Copy, X, Store, Tag, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { evaluatePromo, findApplicablePromo, staticPromoLabel, type Promotion } from '@/lib/promoUtils'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

interface Product {
  id: string
  name: string
  unit: string | null
  category_id: string | null
  brand_id: string | null
  supplier_id: string | null
  price: number
}
interface Category { id: string; name: string; product_count: number }
interface CatalogData {
  business: { name: string; logo: string | null; phone: string | null }
  catalog: { name: string }
  categories: Category[]
  products: Product[]
  promotions: Promotion[]
}

const money = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

const cartKey = (slug: string) => `stockos_catalog_cart_${slug}`

export default function PublicCatalogPage() {
  const params = useParams<{ slug: string }>()
  const slug = params.slug

  const [data, setData] = useState<CatalogData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const [search, setSearch] = useState('')
  // null = pantalla de categorías (tiles); '__all__' = todos; o un category_id.
  const [category, setCategory] = useState<string | null>(null)
  const [cart, setCart] = useState<Record<string, number>>({})
  const [cartOpen, setCartOpen] = useState(false)
  const [buyerName, setBuyerName] = useState('')

  // ── Carga del catálogo ──────────────────────────────────────────────────
  useEffect(() => {
    if (!slug) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${API_URL}/api/public/catalog/${slug}`)
        if (!res.ok) throw new Error('not found')
        const json: CatalogData = await res.json()
        if (!cancelled) setData(json)
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [slug])

  // ── Carrito persistido en localStorage ──────────────────────────────────
  useEffect(() => {
    if (!slug) return
    try {
      const saved = localStorage.getItem(cartKey(slug))
      if (saved) setCart(JSON.parse(saved))
    } catch { /* ignore */ }
  }, [slug])

  useEffect(() => {
    if (!slug) return
    try { localStorage.setItem(cartKey(slug), JSON.stringify(cart)) } catch { /* ignore */ }
  }, [cart, slug])

  const setQty = useCallback((id: string, qty: number) => {
    setCart(prev => {
      const next = { ...prev }
      if (qty <= 0) delete next[id]
      else next[id] = qty
      return next
    })
  }, [])

  // ── Derivados ────────────────────────────────────────────────────────────
  const term = search.trim().toLowerCase()

  // Mostramos productos cuando hay una categoría elegida o cuando se está
  // buscando (la búsqueda atraviesa todas las categorías). Si no, se ve la
  // pantalla de tiles de categorías.
  const showingProducts = category !== null || term !== ''

  const filtered = useMemo(() => {
    if (!data) return []
    const t = search.trim().toLowerCase()
    return data.products.filter(p => {
      // Filtrar por categoría solo si hay una específica seleccionada (no en
      // "todos" ni cuando se busca desde la pantalla de categorías).
      if (category && category !== '__all__' && p.category_id !== category) return false
      if (t && !p.name.toLowerCase().includes(t)) return false
      return true
    })
  }, [data, search, category])

  const currentCategoryName = category && category !== '__all__'
    ? (data?.categories.find(c => c.id === category)?.name ?? '')
    : category === '__all__' ? 'Todos los productos' : ''

  const productById = useMemo(() => {
    const m = new Map<string, Product>()
    data?.products.forEach(p => m.set(p.id, p))
    return m
  }, [data])

  const promotions = data?.promotions ?? []

  const cartLines = useMemo(() =>
    Object.entries(cart)
      .map(([id, qty]) => {
        const product = productById.get(id)
        if (!product) return null
        const { discount, promo_label } = evaluatePromo(product, qty, product.price, promotions)
        const gross = product.price * qty
        return { product, qty, discount, promo_label, net: gross - discount }
      })
      .filter((l): l is { product: Product; qty: number; discount: number; promo_label: string; net: number } => !!l),
    [cart, productById, promotions])

  const cartCount = cartLines.reduce((a, l) => a + l.qty, 0)
  const cartTotal = cartLines.reduce((a, l) => a + l.net, 0)
  const cartDiscount = cartLines.reduce((a, l) => a + l.discount, 0)

  // ── Copiar pedido como texto ─────────────────────────────────────────────
  const buildOrderText = useCallback(() => {
    const lines = cartLines.map(l => {
      const promo = l.discount > 0 ? ` (${l.promo_label})` : ''
      return `${l.qty}x ${l.product.name}${promo} — $${money(l.net)}`
    })
    const header = buyerName.trim()
      ? `🛒 Pedido — ${buyerName.trim()}`
      : '🛒 Pedido'
    const date = new Date().toLocaleDateString('es-AR')
    return [
      header,
      '',
      ...lines,
      '',
      ...(cartDiscount > 0 ? [`Descuento promociones: -$${money(cartDiscount)}`] : []),
      `TOTAL: $${money(cartTotal)}`,
      '',
      `📅 ${date}`,
    ].join('\n')
  }, [cartLines, cartTotal, cartDiscount, buyerName])

  const copyOrder = useCallback(() => {
    if (cartLines.length === 0) { toast.error('Tu carrito está vacío'); return }
    navigator.clipboard.writeText(buildOrderText())
      .then(() => toast.success('¡Pedido copiado! Pegáselo al vendedor por WhatsApp'))
      .catch(() => toast.error('No se pudo copiar'))
  }, [buildOrderText, cartLines.length])

  // ── Estados de carga / error ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] text-[var(--text2)]">
        <div className="animate-pulse text-sm">Cargando catálogo…</div>
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-2 bg-[var(--bg)] px-6 text-center">
        <Store size={40} className="text-[var(--text3)]" />
        <h1 className="text-lg font-semibold text-[var(--text)]">Catálogo no disponible</h1>
        <p className="text-sm text-[var(--text2)]">El link no existe o fue pausado por el comercio.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] pb-28">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-[var(--surface)] border-b border-[var(--border)]">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            {data.business.logo
              ? <img src={data.business.logo} alt="" className="h-9 w-9 rounded-lg object-cover" />
              : <div className="h-9 w-9 rounded-lg bg-[var(--accent)] flex items-center justify-center text-white"><Store size={18} /></div>}
            <div className="min-w-0">
              <h1 className="font-bold text-[var(--text)] leading-tight truncate">{data.business.name}</h1>
              <p className="text-xs text-[var(--text2)] truncate">{data.catalog.name}</p>
            </div>
          </div>

          {/* Buscador */}
          <div className="relative mt-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar producto…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-md bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          {/* Volver a categorías (solo dentro de una categoría, sin buscar) */}
          {category !== null && term === '' && (
            <button
              onClick={() => setCategory(null)}
              className="flex items-center gap-1 mt-3 text-sm font-medium text-[var(--accent)]"
            >
              <ChevronLeft size={16} /> Categorías
              {currentCategoryName && (
                <span className="text-[var(--text2)] font-normal">· {currentCategoryName}</span>
              )}
            </button>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4">
        {/* Pantalla de categorías (tiles) */}
        {!showingProducts && data.categories.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <CategoryTile
              name="Todos los productos"
              count={data.products.length}
              onClick={() => setCategory('__all__')}
            />
            {data.categories.map(c => (
              <CategoryTile
                key={c.id}
                name={c.name}
                count={c.product_count}
                onClick={() => setCategory(c.id)}
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-[var(--text2)] py-12">No hay productos que coincidan.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filtered.map(p => {
              const qty = cart[p.id] ?? 0
              const promo = findApplicablePromo(p, promotions)
              // Descuento por unidad (a qty=1) para mostrar el precio ya afectado
              // en la tarjeta. En promos por cantidad (3x2, 2do al 50%) el
              // descuento recién aparece al llegar al umbral, así que ahí solo
              // se muestra el badge y el impacto se ve en el carrito.
              const unitDiscount = promo ? evaluatePromo(p, 1, p.price, promotions).discount : 0
              return (
                <div key={p.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 flex flex-col">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[var(--text)] leading-snug line-clamp-2">{p.name}</p>
                    {p.unit && <p className="text-[11px] text-[var(--text3)] mt-0.5">{p.unit}</p>}
                  </div>
                  {promo && (
                    <span className="inline-flex items-center gap-1 self-start mt-2 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--accent-subtle)] text-[var(--accent)]">
                      <Tag size={10} /> Promoción · {staticPromoLabel(promo)}
                    </span>
                  )}
                  {unitDiscount > 0 ? (
                    <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
                      <span className="text-base font-bold text-[var(--accent)]">${money(p.price - unitDiscount)}</span>
                      <span className="text-xs text-[var(--text3)] line-through">${money(p.price)}</span>
                    </div>
                  ) : (
                    <p className="text-base font-bold text-[var(--text)] mt-1">${money(p.price)}</p>
                  )}
                  {qty === 0 ? (
                    <button
                      onClick={() => setQty(p.id, 1)}
                      className="mt-2 flex items-center justify-center gap-1 py-1.5 rounded-md bg-[var(--accent)] text-white text-sm font-medium active:scale-95 transition"
                    >
                      <Plus size={15} /> Agregar
                    </button>
                  ) : (
                    <div className="mt-2 flex items-center justify-between rounded-md bg-[var(--surface2)] p-1">
                      <button onClick={() => setQty(p.id, qty - 1)} className="h-7 w-7 flex items-center justify-center rounded text-[var(--text)] active:scale-90"><Minus size={15} /></button>
                      <span className="text-sm font-semibold text-[var(--text)]">{qty}</span>
                      <button onClick={() => setQty(p.id, qty + 1)} className="h-7 w-7 flex items-center justify-center rounded text-[var(--text)] active:scale-90"><Plus size={15} /></button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Barra flotante del carrito */}
      {cartCount > 0 && !cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-5 py-3 rounded-full bg-[var(--accent)] text-white shadow-lg active:scale-95 transition"
        >
          <ShoppingCart size={18} />
          <span className="text-sm font-semibold">{cartCount} {cartCount === 1 ? 'ítem' : 'ítems'}</span>
          <span className="text-sm font-bold">${money(cartTotal)}</span>
        </button>
      )}

      {/* Drawer del carrito */}
      {cartOpen && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end sm:justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setCartOpen(false)} />
          <div className="relative bg-[var(--surface)] w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <h2 className="font-semibold text-[var(--text)]">Tu pedido</h2>
              <button onClick={() => setCartOpen(false)} className="text-[var(--text2)]"><X size={20} /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {cartLines.length === 0 ? (
                <p className="text-center text-sm text-[var(--text2)] py-8">Tu carrito está vacío.</p>
              ) : cartLines.map(l => (
                <div key={l.product.id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text)] truncate">{l.product.name}</p>
                    <p className="text-xs text-[var(--text2)]">
                      ${money(l.product.price)} c/u
                      {l.discount > 0 && <span className="text-[var(--accent)] font-medium"> · {l.promo_label}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 rounded-md bg-[var(--surface2)] p-0.5">
                    <button onClick={() => setQty(l.product.id, l.qty - 1)} className="h-7 w-7 flex items-center justify-center rounded text-[var(--text)]"><Minus size={14} /></button>
                    <span className="text-sm font-semibold text-[var(--text)] w-6 text-center">{l.qty}</span>
                    <button onClick={() => setQty(l.product.id, l.qty + 1)} className="h-7 w-7 flex items-center justify-center rounded text-[var(--text)]"><Plus size={14} /></button>
                  </div>
                  <div className="w-20 text-right">
                    {l.discount > 0 && (
                      <div className="text-[11px] text-[var(--text3)] line-through">${money(l.product.price * l.qty)}</div>
                    )}
                    <span className="text-sm font-semibold text-[var(--text)]">${money(l.net)}</span>
                  </div>
                  <button onClick={() => setQty(l.product.id, 0)} className="text-[var(--danger)]"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>

            <div className="border-t border-[var(--border)] px-4 py-3 space-y-3">
              <input
                value={buyerName}
                onChange={e => setBuyerName(e.target.value)}
                placeholder="Tu nombre (opcional)"
                className="w-full px-3 py-2 text-sm rounded-md bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              />
              {cartDiscount > 0 && (
                <div className="flex items-center justify-between text-sm text-[var(--accent)]">
                  <span>Descuento promociones</span>
                  <span className="font-medium">-${money(cartDiscount)}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--text2)]">Total</span>
                <span className="text-lg font-bold text-[var(--text)]">${money(cartTotal)}</span>
              </div>
              <button
                onClick={copyOrder}
                disabled={cartLines.length === 0}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-[var(--accent)] text-white font-semibold active:scale-95 transition disabled:opacity-50"
              >
                <Copy size={17} /> Copiar pedido
              </button>
              <p className="text-[11px] text-center text-[var(--text3)]">
                Copiá el texto y pegáselo al comercio por WhatsApp.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CategoryTile({ name, count, onClick }: { name: string; count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col justify-between h-24 sm:h-28 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left active:scale-95 transition hover:border-[var(--accent)]"
    >
      <div className="flex items-start justify-between gap-1">
        <span className="text-sm font-semibold text-[var(--text)] leading-snug line-clamp-2">{name}</span>
        <ChevronRight size={16} className="shrink-0 text-[var(--text3)] group-hover:text-[var(--accent)]" />
      </div>
      <span className="text-xs text-[var(--text2)]">
        {count} {count === 1 ? 'producto' : 'productos'}
      </span>
    </button>
  )
}
