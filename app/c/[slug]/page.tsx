'use client'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import { Search, ShoppingCart, Plus, Minus, Trash2, Copy, X, Store, Tag, ChevronLeft, ChevronRight, Truck, CheckCircle2, MapPin, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { evaluatePromo, findApplicablePromo, staticPromoLabel, type Promotion } from '@/lib/promoUtils'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

interface PriceTier { min_qty: number; unit_price: number }
interface Product {
  id: string
  name: string
  unit: string | null
  category_id: string | null
  brand_id: string | null
  supplier_id: string | null
  price: number
  // Presente solo en catálogos "por cantidad": escalera de precios (desde N u.).
  price_tiers?: PriceTier[]
}

// Precio unitario según la cantidad, replicando la escalera del POS: se toma el
// tramo de mayor min_qty que no supere la cantidad. Sin escalera → precio base.
function unitPriceFor(p: Product, qty: number): number {
  if (!p.price_tiers || p.price_tiers.length === 0) return p.price
  let price = p.price_tiers[0].unit_price
  for (const t of p.price_tiers) {
    if (qty >= t.min_qty) price = t.unit_price
    else break
  }
  return price
}
interface Category {
  id: string; name: string; product_count: number
  root_id: string; root_name: string
  // Ancestro nivel 2 (subcategoría). null si la categoría es de nivel 1.
  l2_id: string | null; l2_name: string | null
}
// Sección genérica (nivel 1 en la home, nivel 2 dentro de "Ver todos").
interface RootSection { id: string; name: string; count: number }
interface CatalogData {
  business: { name: string; logo: string | null; phone: string | null }
  catalog: { name: string; accept_orders?: boolean }
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
  // null = home con secciones nivel 1; '__all__' = todos; o un root_id (sección).
  const [category, setCategory] = useState<string | null>(null)
  const [cart, setCart] = useState<Record<string, number>>({})
  const [cartOpen, setCartOpen] = useState(false)
  const [buyerName, setBuyerName] = useState('')
  const [buyerPhone, setBuyerPhone] = useState('')
  const [deliveryMethod, setDeliveryMethod] = useState<'pickup' | 'delivery'>('pickup')
  const [address, setAddress] = useState('')
  const [preferredDate, setPreferredDate] = useState('')
  const [preferredTime, setPreferredTime] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [receipt, setReceipt] = useState<{
    code: string
    date: string
    name: string
    phone: string
    method: 'pickup' | 'delivery'
    address: string
    when: string
    lines: { name: string; qty: number; net: number }[]
    total: number
  } | null>(null)

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

  // Mapa categoría hoja → raíz nivel 1 (el backend ya resuelve el ancestro).
  const leafToRoot = useMemo(() => {
    const m = new Map<string, string>()
    data?.categories.forEach(c => m.set(c.id, c.root_id))
    return m
  }, [data])

  const rootOfProduct = useCallback(
    (p: Product) => (p.category_id ? leafToRoot.get(p.category_id) : undefined) ?? '__none__',
    [leafToRoot],
  )

  // Mapa categoría hoja → subcategoría nivel 2 (o null si cuelga directo del nivel 1).
  const leafToL2 = useMemo(() => {
    const m = new Map<string, { id: string; name: string } | null>()
    data?.categories.forEach(c => m.set(c.id, c.l2_id ? { id: c.l2_id, name: c.l2_name ?? '' } : null))
    return m
  }, [data])

  // Secciones nivel 1 (raíces), con el total de productos de todas sus hojas.
  const roots = useMemo<RootSection[]>(() => {
    const m = new Map<string, RootSection>()
    data?.categories.forEach(c => {
      const ex = m.get(c.root_id)
      if (ex) ex.count += c.product_count
      else m.set(c.root_id, { id: c.root_id, name: c.root_name, count: c.product_count })
    })
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [data])

  // Productos agrupados por raíz, para los rails de la home. data.products ya
  // viene ordenado alfabéticamente desde el backend, así que cada rail hereda
  // ese orden.
  const productsByRoot = useMemo(() => {
    const m = new Map<string, Product[]>()
    data?.products.forEach(p => {
      const key = rootOfProduct(p)
      const arr = m.get(key)
      if (arr) arr.push(p)
      else m.set(key, [p])
    })
    return m
  }, [data, rootOfProduct])

  const filtered = useMemo(() => {
    if (!data) return []
    const t = search.trim().toLowerCase()
    return data.products.filter(p => {
      // Al elegir "Ver todos" de una sección, category es un root_id: incluimos
      // los productos de todas las subcategorías de esa raíz. En "todos" o al
      // buscar no se filtra por categoría.
      if (category && category !== '__all__' && rootOfProduct(p) !== category) return false
      if (t && !p.name.toLowerCase().includes(t)) return false
      return true
    })
  }, [data, search, category, rootOfProduct])

  // "Ver todos" de un nivel 1: sus productos agrupados por subcategoría nivel 2.
  // Los productos que cuelgan directo del nivel 1 (sin nivel 2) van a "General",
  // primero. Solo se usa cuando category es un root_id real (no __all__/__none__).
  const l2Sections = useMemo(() => {
    if (!data || category === null || category === '__all__' || category === '__none__') return []
    const groups = new Map<string, { id: string; name: string; products: Product[] }>()
    for (const p of data.products) {
      if (rootOfProduct(p) !== category) continue
      const l2 = p.category_id ? leafToL2.get(p.category_id) : null
      const id = l2?.id ?? '__general__'
      const name = l2?.name || 'General'
      const g = groups.get(id)
      if (g) g.products.push(p)
      else groups.set(id, { id, name, products: [p] })
    }
    return Array.from(groups.values()).sort((a, b) => {
      if (a.id === '__general__') return -1
      if (b.id === '__general__') return 1
      return a.name.localeCompare(b.name)
    })
  }, [data, category, rootOfProduct, leafToL2])

  // ¿Hay subcategorías reales? Si el nivel 1 no tiene nivel 2, "Ver todos" cae a
  // la grilla plana en vez de una única sección "General".
  const hasRealL2 = l2Sections.some(s => s.id !== '__general__')
  const isRootView = category !== null && category !== '__all__' && category !== '__none__' && term === ''

  const currentCategoryName = category && category !== '__all__'
    ? (roots.find(r => r.id === category)?.name ?? (category === '__none__' ? 'Otros' : ''))
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
        // Precio unitario ya escalado por cantidad, y sobre él la promo (mismo orden que el POS).
        const unit = unitPriceFor(product, qty)
        const { discount, promo_label } = evaluatePromo(product, qty, unit, promotions)
        const gross = unit * qty
        return { product, qty, unit, discount, promo_label, net: gross - discount }
      })
      .filter((l): l is { product: Product; qty: number; unit: number; discount: number; promo_label: string; net: number } => !!l),
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

  // ── Enviar pedido al comercio (crea un pedido pendiente en /orders) ──────
  const acceptOrders = data?.catalog.accept_orders ?? false

  const sendOrder = useCallback(async () => {
    if (cartLines.length === 0) { toast.error('Tu carrito está vacío'); return }
    if (!buyerName.trim()) { toast.error('Ingresá tu nombre'); return }
    if (buyerPhone.trim().length < 4) { toast.error('Ingresá un teléfono de contacto'); return }
    if (deliveryMethod === 'delivery' && !address.trim()) { toast.error('Ingresá la dirección de envío'); return }
    setSubmitting(true)
    try {
      const res = await fetch(`${API_URL}/api/public/catalog/${slug}/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name:   buyerName.trim(),
          customer_phone:  buyerPhone.trim(),
          delivery_method: deliveryMethod,
          address:         deliveryMethod === 'delivery' ? address.trim() : null,
          preferred_date:  preferredDate || null,
          preferred_time:  preferredTime || null,
          items: cartLines.map(l => ({ product_id: l.product.id, quantity: l.qty })),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error ?? 'No se pudo enviar')
      }
      const data = await res.json().catch(() => ({} as { order_code?: string }))
      const whenLabel = [
        preferredDate ? preferredDate.split('-').reverse().join('/') : '',
        preferredTime,
      ].filter(Boolean).join(' ')
      // Snapshot para el comprobante (el carrito se vacía a continuación).
      setReceipt({
        code:    data.order_code ?? '—',
        date:    new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }),
        name:    buyerName.trim(),
        phone:   buyerPhone.trim(),
        method:  deliveryMethod,
        address: address.trim(),
        when:    whenLabel,
        lines:   cartLines.map(l => ({ name: l.product.name, qty: l.qty, net: l.net })),
        total:   cartTotal,
      })
      setSubmitted(true)
      setCart({})
      try { localStorage.removeItem(cartKey(slug)) } catch { /* ignore */ }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo enviar el pedido')
    } finally {
      setSubmitting(false)
    }
  }, [cartLines, buyerName, buyerPhone, deliveryMethod, address, preferredDate, preferredTime, cartTotal, slug])

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
  if (submitted) {
    return (
      <div className="min-h-screen bg-[var(--bg)] px-4 py-8 flex flex-col items-center">
        <div className="w-full max-w-md flex flex-col items-center gap-3">
          <div className="h-14 w-14 rounded-full bg-[var(--accent)] flex items-center justify-center text-white">
            <CheckCircle2 size={28} />
          </div>
          <h1 className="text-lg font-semibold text-[var(--text)]">¡Pedido enviado!</h1>
          <p className="text-sm text-[var(--text2)] text-center max-w-xs">
            {data.business.name} recibió tu pedido y te va a contactar para coordinar el pago y la entrega.
          </p>

          {receipt && (
            <div className="w-full mt-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
              {/* Encabezado del comprobante */}
              <div className="px-4 py-3 border-b border-dashed border-[var(--border)] flex items-center justify-between">
                <div className="min-w-0">
                  <p className="font-bold text-[var(--text)] truncate">{data.business.name}</p>
                  <p className="text-xs text-[var(--text3)]">{receipt.date}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] uppercase tracking-wide text-[var(--text3)]">Pedido</p>
                  <p className="font-mono font-bold text-[var(--text)]">#{receipt.code}</p>
                </div>
              </div>

              {/* Datos del comprador + entrega */}
              <div className="px-4 py-3 border-b border-dashed border-[var(--border)] space-y-1 text-sm">
                <p className="text-[var(--text)]"><span className="text-[var(--text3)]">Cliente:</span> {receipt.name}</p>
                <p className="text-[var(--text)]"><span className="text-[var(--text3)]">Tel:</span> {receipt.phone}</p>
                <p className="flex items-center gap-1.5 text-[var(--text)]">
                  {receipt.method === 'delivery'
                    ? <><Truck size={14} className="text-[var(--accent)]" /> Envío a domicilio</>
                    : <><Store size={14} className="text-[var(--accent)]" /> Retira en el local</>}
                </p>
                {receipt.method === 'delivery' && receipt.address && (
                  <p className="flex items-start gap-1.5 text-[var(--text2)] text-xs">
                    <MapPin size={13} className="mt-0.5 shrink-0" /> {receipt.address}
                  </p>
                )}
                {receipt.when && (
                  <p className="flex items-center gap-1.5 text-[var(--text2)] text-xs">
                    <Clock size={13} className="shrink-0" /> {receipt.method === 'delivery' ? 'Entregar' : 'Retirar'}: {receipt.when}
                  </p>
                )}
              </div>

              {/* Detalle de ítems */}
              <div className="px-4 py-3 space-y-2">
                {receipt.lines.map((l, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 text-sm">
                    <span className="text-[var(--text)] flex-1 min-w-0">
                      <span className="text-[var(--text3)] mr-1">{l.qty}×</span>{l.name}
                    </span>
                    <span className="font-medium text-[var(--text)] whitespace-nowrap">${money(l.net)}</span>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="px-4 py-3 border-t border-dashed border-[var(--border)] flex items-center justify-between">
                <span className="text-sm font-medium text-[var(--text2)]">Total</span>
                <span className="text-lg font-bold text-[var(--text)]">${money(receipt.total)}</span>
              </div>
            </div>
          )}

          <p className="text-[11px] text-center text-[var(--text3)] mt-1 max-w-xs">
            Guardá el número de pedido. El total es a confirmar por el comercio.
          </p>

          <button
            onClick={() => {
              setSubmitted(false); setReceipt(null); setCartOpen(false)
              setBuyerName(''); setBuyerPhone(''); setAddress(''); setDeliveryMethod('pickup')
              setPreferredDate(''); setPreferredTime('')
            }}
            className="mt-1 px-5 py-2.5 rounded-lg bg-[var(--accent)] text-white text-sm font-semibold active:scale-95 transition"
          >
            Hacer otro pedido
          </button>
        </div>
      </div>
    )
  }

  // ── Contenido del carrito, reutilizado en el drawer (mobile) y en el panel
  //    lateral fijo "Mi pedido" (desktop) ────────────────────────────────────
  const cartRows = cartLines.map(l => (
    <div key={l.product.id} className="flex flex-col gap-2">
      {/* Título + precio unitario en su propia línea, para que se lea completo */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--text)] leading-snug line-clamp-2">{l.product.name}</p>
          <p className="text-xs text-[var(--text2)] mt-0.5">
            ${money(l.unit)} c/u
            {l.unit < l.product.price && <span className="text-[var(--accent)] font-medium"> · por cantidad</span>}
            {l.discount > 0 && <span className="text-[var(--accent)] font-medium"> · {l.promo_label}</span>}
          </p>
        </div>
        <button onClick={() => setQty(l.product.id, 0)} className="shrink-0 text-[var(--danger)]"><Trash2 size={16} /></button>
      </div>
      {/* Cantidad + subtotal debajo */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 rounded-md bg-[var(--surface2)] p-0.5">
          <button onClick={() => setQty(l.product.id, l.qty - 1)} className="h-7 w-7 flex items-center justify-center rounded text-[var(--text)]"><Minus size={14} /></button>
          <span className="text-sm font-semibold text-[var(--text)] w-6 text-center">{l.qty}</span>
          <button onClick={() => setQty(l.product.id, l.qty + 1)} className="h-7 w-7 flex items-center justify-center rounded text-[var(--text)]"><Plus size={14} /></button>
        </div>
        <div className="text-right">
          {l.net < l.product.price * l.qty && (
            <div className="text-[11px] text-[var(--text3)] line-through">${money(l.product.price * l.qty)}</div>
          )}
          <span className="text-sm font-semibold text-[var(--text)]">${money(l.net)}</span>
        </div>
      </div>
    </div>
  ))

  const cartForm = (
    <>
      <input
        value={buyerName}
        onChange={e => setBuyerName(e.target.value)}
        placeholder={acceptOrders ? 'Tu nombre' : 'Tu nombre (opcional)'}
        className="w-full px-3 py-2 text-sm rounded-md bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
      />
      {acceptOrders && (
        <input
          value={buyerPhone}
          onChange={e => setBuyerPhone(e.target.value)}
          inputMode="tel"
          placeholder="Tu teléfono (para que te contacten)"
          className="w-full px-3 py-2 text-sm rounded-md bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
        />
      )}
      {acceptOrders && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDeliveryMethod('pickup')}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium border transition ${deliveryMethod === 'pickup' ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]' : 'border-[var(--border)] bg-[var(--surface2)] text-[var(--text2)]'}`}
            >
              <Store size={15} /> Retiro
            </button>
            <button
              type="button"
              onClick={() => setDeliveryMethod('delivery')}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium border transition ${deliveryMethod === 'delivery' ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]' : 'border-[var(--border)] bg-[var(--surface2)] text-[var(--text2)]'}`}
            >
              <Truck size={15} /> Envío
            </button>
          </div>
          {deliveryMethod === 'delivery' && (
            <input
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Dirección de envío (calle, número, localidad)"
              className="w-full px-3 py-2 text-sm rounded-md bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
            />
          )}
          <div>
            <p className="text-xs text-[var(--text3)] mb-1.5">
              ¿Cuándo querés {deliveryMethod === 'delivery' ? 'recibirlo' : 'retirarlo'}? (opcional)
            </p>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={preferredDate}
                onChange={e => setPreferredDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2 text-sm rounded-md bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              />
              <select
                value={preferredTime}
                onChange={e => setPreferredTime(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="">Horario…</option>
                <option value="Mañana (8 a 12)">Mañana (8 a 12)</option>
                <option value="Mediodía (12 a 14)">Mediodía (12 a 14)</option>
                <option value="Tarde (14 a 18)">Tarde (14 a 18)</option>
                <option value="Noche (18 a 21)">Noche (18 a 21)</option>
                <option value="A convenir">A convenir</option>
              </select>
            </div>
          </div>
        </>
      )}
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
      {acceptOrders ? (
        <>
          <button
            onClick={sendOrder}
            disabled={cartLines.length === 0 || submitting}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-[var(--accent)] text-white font-semibold active:scale-95 transition disabled:opacity-50"
          >
            <ShoppingCart size={17} /> {submitting ? 'Enviando…' : 'Enviar pedido'}
          </button>
          <button
            onClick={copyOrder}
            disabled={cartLines.length === 0}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-[var(--border)] text-[var(--text2)] text-sm font-medium active:scale-95 transition disabled:opacity-50"
          >
            <Copy size={15} /> Copiar como texto
          </button>
          <p className="text-[11px] text-center text-[var(--text3)]">
            Al enviar, el comercio recibe tu pedido y te contacta para coordinar pago y entrega.
          </p>
        </>
      ) : (
        <>
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
        </>
      )}
    </>
  )

  const cartEmpty = (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 px-4 py-14 text-center">
      <ShoppingCart size={30} className="text-[var(--text3)]" />
      <p className="text-sm font-medium text-[var(--text2)]">Tu pedido está vacío</p>
      <p className="text-xs text-[var(--text3)]">Agregá productos y aparecerán acá.</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-[var(--bg)] pb-28 lg:pb-0">
      {/* Header — el borde inferior ocupa el 100% y corre por debajo del sidebar */}
      <header className="sticky top-0 z-20 bg-[var(--bg)] border-b border-[var(--border)]">
        <div className="px-4 sm:px-6 py-3 lg:pr-[22rem]">
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

      <main className="px-4 sm:px-6 py-4 lg:pr-[22rem]">
        {/* Home: feed de secciones nivel 1 (tipo PedidosYa) */}
        {!showingProducts && roots.length > 0 ? (
          <div className="space-y-7">
            {/* Chips de acceso rápido a cada sección. En mobile scrollean en una
                fila; en desktop hacen wrap para no cortarse contra el carrito. */}
            <div className={`-mx-4 px-4 flex gap-2 overflow-x-auto pb-1 lg:mx-0 lg:px-0 lg:flex-wrap lg:overflow-visible ${RAIL_SCROLL}`}>
              <button
                onClick={() => setCategory('__all__')}
                className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border border-[var(--border)] bg-[var(--surface)] text-[var(--text2)] active:scale-95 transition"
              >
                Todos
              </button>
              {roots.map(r => (
                <button
                  key={r.id}
                  onClick={() => document.getElementById(`sec-${r.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border border-[var(--border)] bg-[var(--surface)] text-[var(--text2)] active:scale-95 transition"
                >
                  {r.name}
                </button>
              ))}
            </div>

            {roots.map(r => (
              <CategorySection
                key={r.id}
                root={r}
                products={productsByRoot.get(r.id) ?? []}
                cart={cart}
                promotions={promotions}
                setQty={setQty}
                onSeeAll={() => setCategory(r.id)}
              />
            ))}

            {/* Productos sin categoría, al final */}
            {(productsByRoot.get('__none__')?.length ?? 0) > 0 && (
              <CategorySection
                root={{ id: '__none__', name: 'Otros', count: productsByRoot.get('__none__')!.length }}
                products={productsByRoot.get('__none__') ?? []}
                cart={cart}
                promotions={promotions}
                setQty={setQty}
                onSeeAll={() => setCategory('__none__')}
              />
            )}
          </div>
        ) : isRootView && hasRealL2 ? (
          /* "Ver todos" de un nivel 1: secciones nivel 2, cada una con TODOS sus productos */
          <div className="space-y-7">
            {/* Chips de acceso rápido a cada subcategoría nivel 2 */}
            <div className={`-mx-4 px-4 flex gap-2 overflow-x-auto pb-1 lg:mx-0 lg:px-0 lg:flex-wrap lg:overflow-visible ${RAIL_SCROLL}`}>
              {l2Sections.map(s => (
                <button
                  key={s.id}
                  onClick={() => document.getElementById(`sec-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border border-[var(--border)] bg-[var(--surface)] text-[var(--text2)] active:scale-95 transition"
                >
                  {s.name}
                </button>
              ))}
            </div>

            {l2Sections.map(s => (
              <CategorySection
                key={s.id}
                root={{ id: s.id, name: s.name, count: s.products.length }}
                products={s.products}
                cart={cart}
                promotions={promotions}
                setQty={setQty}
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-[var(--text2)] py-12">No hay productos que coincidan.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3">
            {filtered.map(p => (
              <ProductCard key={p.id} p={p} qty={cart[p.id] ?? 0} promotions={promotions} setQty={setQty} />
            ))}
          </div>
        )}
      </main>

      {/* Footer de marca: convierte cada catálogo compartido en un anuncio de
          StockOS. El comprador lo ignora; el comerciante que lo ve es un lead.
          Respeta el padding del sidebar "Mi pedido" en desktop (lg:pr-[22rem]). */}
      <StockOSFooter />

      {/* Sidebar "Mi pedido" fijo al borde derecho, altura completa (solo desktop) */}
      <aside className="hidden lg:flex fixed top-0 right-0 bottom-0 w-80 flex-col border-l border-[var(--border)] bg-[var(--surface)] z-40">
        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between shrink-0">
          <h2 className="font-semibold text-[var(--text)]">Mi pedido</h2>
          {cartCount > 0 && (
            <span className="text-xs font-medium text-[var(--text2)]">{cartCount} {cartCount === 1 ? 'ítem' : 'ítems'}</span>
          )}
        </div>
        {cartLines.length === 0 ? cartEmpty : (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">{cartRows}</div>
            <div className="border-t border-[var(--border)] px-4 py-3 space-y-3 shrink-0">{cartForm}</div>
          </>
        )}
      </aside>

      {/* Barra flotante del carrito (solo mobile/tablet) */}
      {cartCount > 0 && !cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          className="lg:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-5 py-3 rounded-full bg-[var(--accent)] text-white shadow-lg active:scale-95 transition"
        >
          <ShoppingCart size={18} />
          <span className="text-sm font-semibold">{cartCount} {cartCount === 1 ? 'ítem' : 'ítems'}</span>
          <span className="text-sm font-bold">${money(cartTotal)}</span>
        </button>
      )}

      {/* Drawer del carrito (solo mobile/tablet) */}
      {cartOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex flex-col justify-end sm:justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setCartOpen(false)} />
          <div className="relative bg-[var(--surface)] w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <h2 className="font-semibold text-[var(--text)]">Tu pedido</h2>
              <button onClick={() => setCartOpen(false)} className="text-[var(--text2)]"><X size={20} /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {cartLines.length === 0 ? (
                <p className="text-center text-sm text-[var(--text2)] py-8">Tu carrito está vacío.</p>
              ) : cartRows}
            </div>

            <div className="border-t border-[var(--border)] px-4 py-3 space-y-3">{cartForm}</div>
          </div>
        </div>
      )}
    </div>
  )
}

// Footer de marca al pie del catálogo, discreto tipo pie de comprobante. Cada
// comercio que comparte su catálogo expone StockOS a sus compradores; una
// fracción tiene un negocio y es un lead. Sobrio a propósito. Siempre visible.
function StockOSFooter() {
  return (
    <footer className="mt-2 border-t border-[var(--border)] px-4 sm:px-6 py-6 lg:pr-[22rem]">
      <a
        href="https://stockos.digital"
        target="_blank"
        rel="noopener noreferrer"
        className="mx-auto flex w-fit items-center gap-1.5 text-xs text-[var(--text3)] transition hover:text-[var(--text2)]"
      >
        Generado con
        {/* Mismo isotipo que la home: rayo blanco sobre cuadrado verde. */}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="14" height="14" aria-hidden>
          <rect width="32" height="32" rx="8" fill="#16a34a" />
          <path d="M18 4 L10 18 L15 18 L14 28 L22 14 L17 14 Z" fill="white" />
        </svg>
        <span className="font-semibold text-[var(--text2)]">StockOS</span>
      </a>
    </footer>
  )
}

// Oculta la barra de scroll de los rails horizontales (Firefox + WebKit).
const RAIL_SCROLL = '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden'

// Cuántos productos se muestran en el rail de cada sección antes de "Ver todos".
const RAIL_LIMIT = 12

// Sección de la home: título de la categoría nivel 1 + rail horizontal de sus
// primeros productos + "Ver todos". El rail se monta perezosamente (cuando la
// sección se acerca al viewport) para que un catálogo con muchas categorías no
// renderice cientos de cards de golpe. En desktop, las flechas de scroll van en
// el header (junto a "Ver todos") para no tapar el contenido de las cards; en
// touch se arrastra con el dedo.
// Si onSeeAll está definido → modo "preview": muestra hasta RAIL_LIMIT y ofrece
// "Ver todos". Si es undefined → modo "completo": el rail contiene TODOS los
// productos y no hay "Ver todos" (se usa para las subcategorías nivel 2, que ya
// son el último nivel de drill-down).
function CategorySection({ root, products, cart, promotions, setQty, onSeeAll }: {
  root: RootSection
  products: Product[]
  cart: Record<string, number>
  promotions: Promotion[]
  setQty: (id: string, qty: number) => void
  onSeeAll?: () => void
}) {
  const sectionRef = useRef<HTMLElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)
  // ¿El rail realmente desborda su ancho? Solo entonces tiene sentido el scroll.
  const [overflow, setOverflow] = useState(false)

  // Montaje perezoso del rail.
  useEffect(() => {
    const el = sectionRef.current
    if (!el || visible) return
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); io.disconnect() }
    }, { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [visible])

  // Estado de las flechas (deshabilitadas en cada extremo) una vez montado.
  const updateArrows = useCallback(() => {
    const el = scroller.current
    if (!el) return
    setOverflow(el.scrollWidth > el.clientWidth + 1)
    setAtStart(el.scrollLeft <= 1)
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1)
  }, [])

  useEffect(() => {
    if (!visible) return
    updateArrows()
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(updateArrows)
    ro.observe(el)
    return () => ro.disconnect()
  }, [visible, updateArrows])

  const nudge = (dir: 1 | -1) => {
    const el = scroller.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' })
  }

  if (products.length === 0) return null
  // Modo completo (sin onSeeAll): el rail lleva todos los productos.
  const rail = onSeeAll ? products.slice(0, RAIL_LIMIT) : products
  const hasMore = !!onSeeAll && products.length > RAIL_LIMIT
  const navBtn = 'hidden md:flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)] active:scale-90 transition disabled:opacity-30 disabled:pointer-events-none'

  return (
    <section id={`sec-${root.id}`} ref={sectionRef} className="scroll-mt-36">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h2 className="text-base font-bold text-[var(--text)] truncate">{root.name}</h2>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Flechas: solo cuando el rail desborda de verdad. */}
          {overflow && (
            <>
              <button aria-label="Anterior" onClick={() => nudge(-1)} disabled={atStart} className={navBtn}>
                <ChevronLeft size={16} />
              </button>
              <button aria-label="Siguiente" onClick={() => nudge(1)} disabled={atEnd} className={navBtn}>
                <ChevronRight size={16} />
              </button>
            </>
          )}
          {/* "Ver todos": solo si hay más productos de los que muestra el rail. */}
          {hasMore && onSeeAll && (
            <button
              onClick={onSeeAll}
              className="flex items-center gap-0.5 text-sm font-medium text-[var(--accent)] active:scale-95 transition"
            >
              Ver todos <ChevronRight size={15} />
            </button>
          )}
        </div>
      </div>
      {visible ? (
        <div
          ref={scroller}
          onScroll={updateArrows}
          className={`flex gap-3 overflow-x-auto snap-x pb-1 ${RAIL_SCROLL}`}
        >
          {rail.map(p => (
            <div key={p.id} className="shrink-0 w-40 snap-start">
              <ProductCard p={p} qty={cart[p.id] ?? 0} promotions={promotions} setQty={setQty} />
            </div>
          ))}
          {hasMore && onSeeAll && (
            <button
              onClick={onSeeAll}
              className="shrink-0 w-28 snap-start rounded-xl border border-dashed border-[var(--border)] flex flex-col items-center justify-center gap-1.5 text-[var(--accent)] active:scale-95 transition"
            >
              <ChevronRight size={22} />
              <span className="text-xs font-medium text-center leading-tight">Ver todos<br />({root.count})</span>
            </button>
          )}
        </div>
      ) : (
        <div className="h-56" />
      )}
    </section>
  )
}

// Card de producto: nombre, unidad, promo/escalera de precios y control de
// cantidad. Se usa tanto en los rails de la home como en la grilla de "Ver
// todos" y en la búsqueda.
function ProductCard({ p, qty, promotions, setQty }: {
  p: Product
  qty: number
  promotions: Promotion[]
  setQty: (id: string, qty: number) => void
}) {
  const promo = findApplicablePromo(p, promotions)
  // Descuento por unidad (a qty=1) para mostrar el precio ya afectado en la
  // tarjeta. En promos por cantidad (3x2, 2do al 50%) el descuento recién
  // aparece al llegar al umbral, así que ahí solo se muestra el badge y el
  // impacto se ve en el carrito.
  const unitDiscount = promo ? evaluatePromo(p, 1, p.price, promotions).discount : 0
  // Todos los escalones por cantidad que bajan el precio respecto al de 1u.
  const discountTiers = (p.price_tiers ?? []).filter(t => t.min_qty > 1 && t.unit_price < p.price)

  return (
    // Alturas fijas en nombre y unidad para que el precio y el botón queden
    // siempre a la misma altura entre cards de una misma fila. Lo variable
    // (promo/escalera) va entre el precio y el botón, que se ancla abajo.
    <div className="h-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 flex flex-col">
      <p className="text-sm font-medium text-[var(--text)] leading-snug line-clamp-2 min-h-[2.5rem]">{p.name}</p>
      <p className="text-[11px] text-[var(--text3)] mt-0.5 h-4 truncate">{p.unit ?? ''}</p>
      {unitDiscount > 0 ? (
        <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
          <span className="text-base font-bold text-[var(--accent)]">${money(p.price - unitDiscount)}</span>
          <span className="text-xs text-[var(--text3)] line-through">${money(p.price)}</span>
        </div>
      ) : (
        <p className="text-base font-bold text-[var(--text)] mt-1">${money(p.price)}</p>
      )}
      {promo && (
        <span className="inline-flex items-center gap-1 self-start mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--accent-subtle)] text-[var(--accent)]">
          <Tag size={10} /> Promoción · {staticPromoLabel(promo)}
        </span>
      )}
      {discountTiers.length > 0 && (
        <div className="mt-0.5 space-y-0.5">
          {discountTiers.map(t => (
            <p key={t.min_qty} className="text-[11px] text-[var(--accent)] leading-tight">
              desde {t.min_qty}u ${money(t.unit_price)} c/u
            </p>
          ))}
        </div>
      )}
      <div className="mt-auto pt-2">
        {qty === 0 ? (
          <button
            onClick={() => setQty(p.id, 1)}
            className="w-full flex items-center justify-center gap-1 py-1.5 rounded-md bg-[var(--accent)] text-white text-sm font-medium active:scale-95 transition"
          >
            <Plus size={15} /> Agregar
          </button>
        ) : (
          <div className="flex items-center justify-between rounded-md bg-[var(--surface2)] p-1">
            <button onClick={() => setQty(p.id, qty - 1)} className="h-7 w-7 flex items-center justify-center rounded text-[var(--text)] active:scale-90"><Minus size={15} /></button>
            <span className="text-sm font-semibold text-[var(--text)]">{qty}</span>
            <button onClick={() => setQty(p.id, qty + 1)} className="h-7 w-7 flex items-center justify-center rounded text-[var(--text)] active:scale-90"><Plus size={15} /></button>
          </div>
        )}
      </div>
    </div>
  )
}
